from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import signal
import time
from uuid import UUID, uuid4

from app.core.errors import AppError
from app.core.settings import Settings, get_settings
from app.db.session import Database, database
from app.services.hair_catalog import get_hair_style
from app.services.hair_jobs import HairJobQueue, decode_hair_job
from app.services.hair_observability import emit_hair_metric
from app.services.hair_processing import HairProcessingService
from app.services.hair_schema import ensure_hair_schema
from app.services.s3 import S3Service


logger = logging.getLogger(__name__)
MAX_HAIR_SOURCE_BYTES = 25 * 1024 * 1024
MAX_HAIR_MASK_BYTES = 10 * 1024 * 1024
MAX_HAIR_STYLE_ASSET_BYTES = 10 * 1024 * 1024
MAX_HAIR_STYLE_MANIFEST_BYTES = 1024 * 1024


async def _delete_private_object_best_effort(
  s3: S3Service,
  *,
  bucket: str,
  object_key: str,
) -> None:
  try:
    await asyncio.to_thread(
      s3.delete_object_permanently,
      bucket=bucket,
      object_key=object_key,
    )
  except Exception:  # noqa: BLE001 - lifecycle remains the final orphan safety net.
    logger.warning("[aura:hair-worker] orphan-object-delete-failed", exc_info=True)


async def _mark_failed(
  db: Database,
  *,
  table: str,
  job_id: UUID,
  code: str,
  message: str,
) -> None:
  if table not in {"hair_analyses", "hair_simulations"}:
    raise ValueError("Unsupported hair job table.")
  await db.execute(
    f"""
    update {table}
    set status = 'failed', error_code = $2, error_message = $3, updated_at = now()
    where id = $1 and status not in ('completed', 'expired')
    """,
    job_id,
    code,
    message[:500],
  )


async def process_analysis_job(db: Database, settings: Settings, job_id: UUID) -> bool:
  row = await db.fetchrow(
    """
    update hair_analyses
    set status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
    where id = $1 and expires_at > now()
      and (
        status = 'queued'
        or (status = 'processing' and updated_at < now() - make_interval(secs => $2))
      )
    returning *
    """,
    job_id,
    settings.hair_worker_visibility_timeout_seconds,
  )
  if row is None:
    return False
  started_at = time.monotonic()

  media = await db.fetchrow(
    """
    select
      source.bucket as source_bucket,
      source.object_key as source_object_key,
      source.content_type as source_content_type,
      mask.id as mask_media_id,
      mask.bucket as mask_bucket,
      mask.object_key as mask_object_key
    from hair_analyses analysis
    join media_assets source on source.id = analysis.source_media_id and source.deleted_at is null
    left join media_assets mask on mask.id = analysis.mask_media_id and mask.deleted_at is null
    where analysis.id = $1
    """,
    job_id,
  )
  if media is None:
    raise AppError(404, "HAIR_SOURCE_NOT_FOUND", "Hair analysis source media was not found.")

  s3 = S3Service(settings)
  source_bytes, _ = await asyncio.to_thread(
    s3.get_object_bytes,
    bucket=media["source_bucket"],
    object_key=media["source_object_key"],
    max_bytes=MAX_HAIR_SOURCE_BYTES,
  )
  processing = HairProcessingService(settings)
  mask_media_id = media.get("mask_media_id")
  mask_quality: dict = {}

  if media.get("mask_bucket") and media.get("mask_object_key"):
    mask_bytes, _ = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=media["mask_bucket"],
      object_key=media["mask_object_key"],
      max_bytes=MAX_HAIR_MASK_BYTES,
    )
    mask_quality = await asyncio.to_thread(
      processing.validate_hair_mask,
      source_bytes,
      mask_bytes,
    )
    mask_provider = "apple_semantic_matte" if mask_quality.get("passed") else ""
  else:
    mask_bytes = b""
    mask_provider = ""

  if not mask_provider:
    mask_bytes = await asyncio.to_thread(processing.segment_hair, source_bytes)
    mask_provider = "mediapipe_hair_segmenter"
    mask_quality = await asyncio.to_thread(
      processing.validate_hair_mask,
      source_bytes,
      mask_bytes,
    )
    if not mask_quality.get("passed"):
      raise AppError(422, "HAIR_MASK_LOW_CONFIDENCE", "Hair could not be isolated reliably.")
    bucket = settings.s3_bucket_name
    if not bucket:
      raise AppError(503, "S3_NOT_CONFIGURED", "S3_BUCKET_NAME is required.")
    mask_key = f"uploads/hair-analysis-mask/{uuid4()}.png"
    await asyncio.to_thread(
      s3.put_private_object,
      bucket=bucket,
      object_key=mask_key,
      body=mask_bytes,
      content_type="image/png",
    )
    try:
      mask_row = await db.fetchrow(
        """
        insert into media_assets (
          owner_user_id, media_kind, source, bucket, object_key, content_type,
          byte_size, original_filename, is_original, status
        )
        values ($1, 'hair-analysis-mask', 'generated', $2, $3, 'image/png', $4, 'hair-mask.png', false, 'active')
        returning id
        """,
        row["user_id"],
        bucket,
        mask_key,
        len(mask_bytes),
      )
    except Exception:
      await _delete_private_object_best_effort(s3, bucket=bucket, object_key=mask_key)
      raise
    if mask_row is None:
      await _delete_private_object_best_effort(s3, bucket=bucket, object_key=mask_key)
      raise AppError(500, "HAIR_MASK_MEDIA_FAILED", "Generated hair mask could not be recorded.")
    mask_media_id = mask_row["id"]

  analysis = await asyncio.to_thread(
    processing.analyze_hair,
    source_bytes,
    device_payload=row.get("analysis_payload") or {},
    end_user_id=row["user_id"],
  )
  analysis["maskProvider"] = mask_provider
  analysis["maskQuality"] = mask_quality
  style_ids = [item["styleId"] for item in analysis["recommendations"]]
  await db.execute(
    """
    update hair_analyses
    set status = 'completed', mask_media_id = coalesce($2, mask_media_id),
        analysis_payload = $3::jsonb, recommended_style_ids = $4,
        completed_at = now(), updated_at = now(), error_code = null, error_message = null
    where id = $1
    """,
    job_id,
    mask_media_id,
    json.dumps(analysis),
    style_ids,
  )
  logger.info("[aura:hair-worker] analysis-completed jobId=%s maskProvider=%s", job_id, mask_provider)
  emit_hair_metric("worker", "HairJobCompleted", 1, properties={"jobType": "analysis"})
  emit_hair_metric(
    "worker",
    "HairProcessingLatency",
    round((time.monotonic() - started_at) * 1000),
    unit="Milliseconds",
    properties={"jobType": "analysis"},
  )
  return True


async def process_simulation_job(db: Database, settings: Settings, job_id: UUID) -> bool:
  row = await db.fetchrow(
    """
    update hair_simulations
    set status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
    where id = $1 and (expires_at is null or expires_at > now())
      and (
        status = 'queued'
        or (status = 'processing' and updated_at < now() - make_interval(secs => $2))
      )
    returning *
    """,
    job_id,
    settings.hair_worker_visibility_timeout_seconds,
  )
  if row is None:
    return False
  started_at = time.monotonic()

  style = get_hair_style(row["style_id"])
  if style is None:
    raise AppError(422, "HAIR_STYLE_NOT_FOUND", "The requested hair style does not exist.")

  media = await db.fetchrow(
    """
    select
      analysis.status as analysis_status,
      source.bucket as source_bucket,
      source.object_key as source_object_key,
      mask.bucket as mask_bucket,
      mask.object_key as mask_object_key
    from hair_simulations simulation
    join hair_analyses analysis on analysis.id = simulation.analysis_id
    join media_assets source on source.id = analysis.source_media_id and source.deleted_at is null
    join media_assets mask on mask.id = analysis.mask_media_id and mask.deleted_at is null
    where simulation.id = $1
    """,
    job_id,
  )
  if media is None or media["analysis_status"] != "completed":
    raise AppError(409, "HAIR_ANALYSIS_NOT_READY", "Hair analysis is not ready for simulation.")

  bucket = settings.s3_bucket_name
  asset_bucket = settings.hair_style_asset_bucket or bucket
  if not bucket or not asset_bucket:
    raise AppError(503, "S3_NOT_CONFIGURED", "Hair simulation storage is not configured.")

  s3 = S3Service(settings)
  source_bytes, _ = await asyncio.to_thread(
    s3.get_object_bytes,
    bucket=media["source_bucket"],
    object_key=media["source_object_key"],
    max_bytes=MAX_HAIR_SOURCE_BYTES,
  )
  mask_bytes, _ = await asyncio.to_thread(
    s3.get_object_bytes,
    bucket=media["mask_bucket"],
    object_key=media["mask_object_key"],
    max_bytes=MAX_HAIR_MASK_BYTES,
  )
  if settings.hair_style_assets_require_approval:
    manifest_key = f"{settings.hair_style_asset_prefix.rstrip('/')}/manifest.json"
    try:
      manifest_bytes, _ = await asyncio.to_thread(
        s3.get_object_bytes,
        bucket=asset_bucket,
        object_key=manifest_key,
        max_bytes=MAX_HAIR_STYLE_MANIFEST_BYTES,
      )
      manifest = json.loads(manifest_bytes)
    except Exception as error:  # noqa: BLE001 - normalize S3 and manifest failures.
      raise AppError(503, "HAIR_STYLE_MANIFEST_MISSING", "The style review manifest is unavailable.") from error
    reviewed_style = next(
      (
        entry
        for entry in manifest.get("styles", [])
        if isinstance(entry, dict) and entry.get("styleId") == style.style_id
      ),
      None,
    )
    if not reviewed_style or reviewed_style.get("reviewStatus") != "approved":
      raise AppError(503, "HAIR_STYLE_NOT_APPROVED", "The selected style has not passed review.")

  reference_key = f"{settings.hair_style_asset_prefix.rstrip('/')}/{style.style_id}-reference.webp"
  try:
    reference_bytes, _ = await asyncio.to_thread(
      s3.get_object_bytes,
      bucket=asset_bucket,
      object_key=reference_key,
      max_bytes=MAX_HAIR_STYLE_ASSET_BYTES,
    )
  except Exception as error:  # noqa: BLE001 - normalize provider-specific S3 errors.
    raise AppError(503, "HAIR_STYLE_REFERENCE_MISSING", "The style reference asset is unavailable.") from error
  if settings.hair_style_assets_require_approval:
    expected_reference_hash = str(reviewed_style.get("referenceSha256") or "")
    actual_reference_hash = hashlib.sha256(reference_bytes).hexdigest()
    if not expected_reference_hash or actual_reference_hash != expected_reference_hash:
      raise AppError(
        503,
        "HAIR_STYLE_REFERENCE_UNVERIFIED",
        "The style reference does not match the approved manifest.",
      )

  try:
    output_bytes, quality = await asyncio.to_thread(
      HairProcessingService(settings).generate_simulation,
      source_bytes=source_bytes,
      hair_mask_bytes=mask_bytes,
      reference_bytes=reference_bytes,
      style=style,
      end_user_id=row["user_id"],
    )
  except AppError as error:
    if error.code == "HAIR_SIMULATION_QUALITY_FAILED" and error.details.get("qualityAttempt") == 2:
      emit_hair_metric("worker", "HairQualityRegenerated", 1)
    raise
  if int(quality.get("qualityAttempt", 1)) > 1:
    emit_hair_metric("worker", "HairQualityRegenerated", 1)
  result_key = f"uploads/hair-simulation-result/{uuid4()}.jpg"
  await asyncio.to_thread(
    s3.put_private_object,
    bucket=bucket,
    object_key=result_key,
    body=output_bytes,
    content_type="image/jpeg",
    tags={"aura-retention": "ephemeral"},
  )
  try:
    result_media = await db.fetchrow(
      """
      insert into media_assets (
        owner_user_id, media_kind, source, bucket, object_key, content_type,
        byte_size, original_filename, is_original, status
      )
      values ($1, 'hair-simulation-result', 'generated', $2, $3, 'image/jpeg', $4, 'hair-simulation.jpg', false, 'active')
      returning id
      """,
      row["user_id"],
      bucket,
      result_key,
      len(output_bytes),
    )
  except Exception:
    await _delete_private_object_best_effort(s3, bucket=bucket, object_key=result_key)
    raise
  if result_media is None:
    await _delete_private_object_best_effort(s3, bucket=bucket, object_key=result_key)
    raise AppError(500, "HAIR_RESULT_MEDIA_FAILED", "Generated hair media could not be recorded.")

  await db.execute(
    """
    update hair_simulations
    set status = 'completed', result_media_id = $2, provider = 'openai', model = $3,
        quality_attempt_count = $4, quality_payload = $5::jsonb,
        completed_at = now(), updated_at = now(), error_code = null, error_message = null
    where id = $1
    """,
    job_id,
    result_media["id"],
    settings.openai_image_model_id,
    quality.get("qualityAttempt", 1),
    json.dumps(quality),
  )
  logger.info(
    "[aura:hair-worker] simulation-completed jobId=%s styleId=%s qualityAttempt=%s",
    job_id,
    style.style_id,
    quality.get("qualityAttempt", 1),
  )
  emit_hair_metric("worker", "HairJobCompleted", 1, properties={"jobType": "simulation"})
  emit_hair_metric(
    "worker",
    "HairProcessingLatency",
    round((time.monotonic() - started_at) * 1000),
    unit="Milliseconds",
    properties={"jobType": "simulation"},
  )
  return True


async def process_hair_job(db: Database, settings: Settings, job_type: str, job_id: UUID) -> bool:
  if job_type == "analysis":
    return await process_analysis_job(db, settings, job_id)
  if job_type == "simulation":
    return await process_simulation_job(db, settings, job_id)
  raise ValueError(f"Unsupported hair job type: {job_type}")


async def maintain_message_visibility(
  queue: HairJobQueue,
  db: Database,
  receipt_handle: str,
  stop_event: asyncio.Event,
  job_ref: dict[str, object],
) -> None:
  interval = max(30, min(120, queue.settings.hair_worker_visibility_timeout_seconds // 3))
  while not stop_event.is_set():
    try:
      await asyncio.wait_for(stop_event.wait(), timeout=interval)
    except TimeoutError:
      try:
        await asyncio.to_thread(queue.change_visibility, receipt_handle)
      except Exception:  # noqa: BLE001 - the original SQS timeout remains the fallback.
        logger.warning("[aura:hair-worker] visibility-heartbeat-failed", exc_info=True)
      job_type = job_ref.get("job_type")
      job_id = job_ref.get("job_id")
      if job_type in {"analysis", "simulation"} and isinstance(job_id, UUID):
        table = "hair_analyses" if job_type == "analysis" else "hair_simulations"
        try:
          await db.execute(
            f"update {table} set updated_at = now() where id = $1 and status = 'processing'",
            job_id,
          )
        except Exception:  # noqa: BLE001 - the main job owns terminal failure handling.
          logger.warning("[aura:hair-worker] database-heartbeat-failed", exc_info=True)


async def run_worker() -> None:
  logging.basicConfig(level=logging.INFO)
  settings = get_settings()
  queue = HairJobQueue(settings)
  stop_event = asyncio.Event()
  loop = asyncio.get_running_loop()

  for signal_name in (signal.SIGINT, signal.SIGTERM):
    loop.add_signal_handler(signal_name, stop_event.set)

  await database.connect()
  await ensure_hair_schema(database)
  logger.info("[aura:hair-worker] started")

  try:
    while not stop_event.is_set():
      messages = await asyncio.to_thread(queue.receive)
      for message in messages:
        receipt_handle = message.get("ReceiptHandle")
        receive_count = int((message.get("Attributes") or {}).get("ApproximateReceiveCount") or 1)
        job_type: str | None = None
        job_id: UUID | None = None
        job_ref: dict[str, object] = {}
        heartbeat_stop = asyncio.Event()
        heartbeat_task = (
          asyncio.create_task(
            maintain_message_visibility(queue, database, receipt_handle, heartbeat_stop, job_ref),
          )
          if receipt_handle
          else None
        )
        try:
          try:
            job_type, job_id = decode_hair_job(message)
            job_ref.update({"job_type": job_type, "job_id": job_id})
            await process_hair_job(database, settings, job_type, job_id)
          except ValueError:
            logger.warning("[aura:hair-worker] invalid-message", exc_info=True)
          except AppError as error:
            logger.warning(
              "[aura:hair-worker] job-error code=%s receiveCount=%s",
              error.code,
              receive_count,
            )
            is_permanent = error.status_code < 500
            is_exhausted = receive_count >= 3
            if job_type is not None and job_id is not None and (is_permanent or is_exhausted):
              table = "hair_analyses" if job_type == "analysis" else "hair_simulations"
              await _mark_failed(
                database,
                table=table,
                job_id=job_id,
                code=error.code,
                message=error.message,
              )
              emit_hair_metric(
                "worker",
                "HairJobFailed",
                1,
                properties={"jobType": job_type, "errorCode": error.code},
              )
            if not is_permanent:
              # Transient failures remain on the queue. After the third receive,
              # the queue redrive policy moves the message to the DLQ.
              continue
          except Exception:  # noqa: BLE001 - SQS redelivery owns transient retries.
            logger.exception("[aura:hair-worker] unhandled-job-error receiveCount=%s", receive_count)
            if job_type is not None and job_id is not None and receive_count >= 3:
              table = "hair_analyses" if job_type == "analysis" else "hair_simulations"
              await _mark_failed(
                database,
                table=table,
                job_id=job_id,
                code="HAIR_WORKER_UNHANDLED",
                message="Hair worker failed after repeated attempts.",
              )
              emit_hair_metric(
                "worker",
                "HairJobFailed",
                1,
                properties={"jobType": job_type, "errorCode": "HAIR_WORKER_UNHANDLED"},
              )
            continue
          if receipt_handle:
            try:
              await asyncio.to_thread(queue.delete, receipt_handle)
            except Exception:  # noqa: BLE001 - message redelivery is safe and idempotent.
              logger.warning("[aura:hair-worker] message-delete-failed", exc_info=True)
        finally:
          heartbeat_stop.set()
          if heartbeat_task is not None:
            await heartbeat_task
  finally:
    await database.close()
    logger.info("[aura:hair-worker] stopped")


if __name__ == "__main__":
  asyncio.run(run_worker())
