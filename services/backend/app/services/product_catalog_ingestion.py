"""Signed, admin-only ingestion boundary for licensed product data.

This module is intentionally not exposed through the consumer FastAPI router.
Operations invoke it from an authenticated internal CLI after placing secrets in
the environment or secret manager.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.product_catalog import validate_external_https_url
from app.services.product_operators import CATALOG_ADMIN, require_product_operator
from app.services.product_color import normalize_hex_color, srgb_hex_to_lab


REQUIRED_USES = {"mobile_display", "recommendation"}
DISALLOWED_PRODUCT_SOURCES = {"naver", "naver-shopping-search", "naver_shopping_search"}
PRODUCT_ATTRIBUTE_KEYS = {
  "finish",
  "texture",
  "coverage",
  "lightweight",
  "hydrating",
  "moisturizing",
  "oil_control",
  "waterproof",
  "longwear",
  "transfer_resistant",
  "skin_type_tags",
}
PRODUCT_ATTRIBUTE_SOURCE_TYPES = {
  "licensed_catalog",
  "brand_official",
  "manual_review",
  "validated_inference",
}


def canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
  return json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def verify_manifest_signature(manifest: dict[str, Any], signature: str, secret: str | None) -> str:
  if not secret:
    raise AppError(503, "CATALOG_SIGNING_SECRET_MISSING", "Catalog signing secret is not configured.")
  digest = hmac.new(secret.encode(), canonical_manifest_bytes(manifest), hashlib.sha256).hexdigest()
  supplied = signature.removeprefix("sha256=").strip().lower()
  if not hmac.compare_digest(digest, supplied):
    raise AppError(403, "INVALID_CATALOG_SIGNATURE", "Catalog manifest signature is invalid.")
  return digest


def _uuid(value: Any, field: str) -> UUID:
  try:
    return UUID(str(value))
  except ValueError as error:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be a UUID.") from error


def _time(value: Any, field: str) -> datetime | None:
  if value in (None, ""):
    return None
  try:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
  except ValueError as error:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be ISO-8601.") from error
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _uses(value: Any, field: str, *, require_recommendation: bool = True) -> list[str]:
  uses = {str(item).strip() for item in value} if isinstance(value, list) else set()
  required = REQUIRED_USES if require_recommendation else {"mobile_display"}
  if not required.issubset(uses):
    raise AppError(422, "CATALOG_RIGHTS_MISSING", f"{field} must allow {sorted(required)}.")
  return sorted(uses)


def _product_tags(value: Any, field: str) -> list[str]:
  if value in (None, ""):
    return []
  if not isinstance(value, list):
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be a list of strings.")
  normalized: list[str] = []
  seen: set[str] = set()
  for item in value:
    if not isinstance(item, str):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be a list of strings.")
    tag = item.strip()
    if not tag:
      continue
    if len(tag) > 80:
      raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} entries must be at most 80 characters.")
    folded = tag.casefold()
    if folded not in seen:
      normalized.append(tag)
      seen.add(folded)
  if len(normalized) > 64:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} supports at most 64 entries.")
  return normalized


def _product_payload(value: Any, field: str) -> dict[str, Any]:
  if value in (None, ""):
    return {}
  if not isinstance(value, dict):
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be an object.")
  try:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
  except (TypeError, ValueError) as error:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be valid JSON.") from error
  if len(encoded.encode("utf-8")) > 32_768:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be at most 32 KiB.")
  return value


def _price_krw(value: Any, field: str) -> int:
  if value in (None, ""):
    return 0
  if isinstance(value, bool) or not isinstance(value, int) or value < 0:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be a non-negative integer.")
  return value


def _attribute_evidence(value: Any, field: str) -> list[dict[str, Any]]:
  if value in (None, ""):
    return []
  if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} must be a list of objects.")
  if len(value) > 64:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field} supports at most 64 entries.")
  normalized: list[dict[str, Any]] = []
  seen: set[str] = set()
  for index, item in enumerate(value[:64]):
    key = str(item.get("attributeKey") or "").strip().casefold()
    source_type = str(item.get("sourceType") or "").strip().casefold()
    source_reference = str(item.get("sourceReference") or "").strip()
    attribute_value = item.get("attributeValue")
    observed_at = _time(item.get("observedAt"), f"{field}[{index}].observedAt")
    reviewed_at = _time(item.get("reviewedAt"), f"{field}[{index}].reviewedAt")
    expires_at = _time(item.get("expiresAt"), f"{field}[{index}].expiresAt")
    try:
      confidence = float(item.get("confidenceScore"))
      encoded_value = json.dumps(attribute_value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError) as error:
      raise AppError(422, "INVALID_CATALOG_MANIFEST", f"{field}[{index}] value/confidence is invalid.") from error
    if (
      key not in PRODUCT_ATTRIBUTE_KEYS
      or source_type not in PRODUCT_ATTRIBUTE_SOURCE_TYPES
      or not source_reference
      or attribute_value is None
      or not observed_at
      or not reviewed_at
      or observed_at > datetime.now(timezone.utc) + timedelta(minutes=5)
      or reviewed_at > datetime.now(timezone.utc) + timedelta(minutes=5)
      or not 0 <= confidence <= 1
      or (expires_at is not None and expires_at <= datetime.now(timezone.utc))
    ):
      raise AppError(
        422,
        "INVALID_CATALOG_ATTRIBUTE_EVIDENCE",
        f"{field}[{index}] needs an approved key, provenance, review, confidence and valid expiry.",
      )
    fingerprint = hashlib.sha256(
      f"{key}\0{encoded_value}\0{source_type}\0{source_reference}".encode()
    ).hexdigest()
    if fingerprint in seen:
      continue
    seen.add(fingerprint)
    normalized.append({
      "attributeKey": key,
      "attributeValue": attribute_value,
      "sourceType": source_type,
      "sourceReference": source_reference,
      "evidenceFingerprint": fingerprint,
      "confidenceScore": confidence,
      "observedAt": observed_at,
      "reviewedAt": reviewed_at,
      "expiresAt": expires_at,
    })
  return normalized


async def _expire_omitted_attribute_evidence(
  connection: Any,
  *,
  product_id: UUID,
  active_fingerprints: list[str],
) -> None:
  """Expire verified evidence omitted from an explicit authoritative snapshot.

  An absent ``attributeEvidence`` field remains patch-like and changes nothing;
  an explicitly supplied list (including ``[]``) is a full snapshot for the
  product. This boundary is signed and restricted to a catalog administrator.
  """

  await connection.execute(
    """
    update product_attribute_evidence set
      status='expired',expires_at=least(coalesce(expires_at,now()),now()),updated_at=now()
    where product_id=$1 and status='verified' and source_type='licensed_catalog'
      and not (evidence_fingerprint=any($2::text[]))
    """,
    product_id,
    active_fingerprints,
  )


def validate_catalog_manifest(manifest: dict[str, Any], settings: Settings) -> dict[str, Any]:
  if manifest.get("schemaVersion") != "product_catalog_manifest_v1":
    raise AppError(422, "INVALID_CATALOG_MANIFEST", "product_catalog_manifest_v1 is required.")
  manifest_id = _uuid(manifest.get("manifestId"), "manifestId")
  source_provider = str(manifest.get("sourceProvider") or "").strip()
  catalog_version = str(manifest.get("catalogVersion") or "").strip()
  products = manifest.get("products")
  if not source_provider or not catalog_version or not isinstance(products, list) or not products:
    raise AppError(422, "INVALID_CATALOG_MANIFEST", "Provider, version and at least one product are required.")
  if source_provider.lower() in DISALLOWED_PRODUCT_SOURCES:
    raise AppError(422, "UNTRUSTED_CATALOG_SOURCE", "Naver Shopping Search cannot be used as the licensed product catalog.")

  normalized_products = []
  seen_product_ids: set[UUID] = set()
  seen_external_keys: set[str] = set()
  seen_shade_ids: set[UUID] = set()
  seen_asset_ids: set[UUID] = set()
  seen_offer_ids: set[UUID] = set()
  for index, raw_product in enumerate(products):
    if not isinstance(raw_product, dict):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", f"products[{index}] must be an object.")
    product_id = _uuid(raw_product.get("id"), f"products[{index}].id")
    external_key = str(raw_product.get("externalKey") or "").strip()
    brand_name = str(raw_product.get("brandName") or "").strip()
    product_name = str(raw_product.get("productName") or "").strip()
    category = str(raw_product.get("category") or "").strip()
    license_type = str(raw_product.get("licenseType") or "").strip()
    source_reference = str(raw_product.get("sourceReference") or "").strip()
    if (
      product_id in seen_product_ids
      or not external_key
      or external_key in seen_external_keys
      or not brand_name
      or not product_name
      or not license_type
      or not source_reference
      or category not in {"lip", "cheek", "shadow", "liner", "base", "brow"}
    ):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", f"products[{index}] identity/category is invalid.")
    seen_product_ids.add(product_id)
    seen_external_keys.add(external_key)
    license_status = str(raw_product.get("licenseStatus") or "")
    catalog_status = str(raw_product.get("catalogStatus") or "")
    allowed_uses = _uses(raw_product.get("allowedUses"), f"products[{index}].allowedUses")
    tags = _product_tags(raw_product.get("tags"), f"products[{index}].tags")
    product_payload = _product_payload(
      raw_product.get("productPayload"),
      f"products[{index}].productPayload",
    )
    price_krw = _price_krw(raw_product.get("priceKrw"), f"products[{index}].priceKrw")
    attribute_evidence = _attribute_evidence(
      raw_product.get("attributeEvidence"),
      f"products[{index}].attributeEvidence",
    )
    attribute_evidence_authoritative = isinstance(raw_product.get("attributeEvidence"), list)
    if license_status != "valid" or catalog_status not in {"reviewed", "published"}:
      raise AppError(422, "CATALOG_RIGHTS_MISSING", "Only reviewed, rights-valid catalog data can be imported.")
    valid_from = _time(raw_product.get("licenseValidFrom"), "licenseValidFrom")
    valid_until = _time(raw_product.get("licenseValidUntil"), "licenseValidUntil")
    if not valid_until or valid_until <= datetime.now(timezone.utc) or (valid_from and valid_until <= valid_from):
      raise AppError(422, "CATALOG_RIGHTS_EXPIRED", "Product rights need a valid future expiry window.")

    normalized_shades = []
    shade_ids: set[UUID] = set()
    shade_keys: set[str] = set()
    raw_shades = raw_product.get("shades") or []
    if not isinstance(raw_shades, list) or any(not isinstance(item, dict) for item in raw_shades):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", "Product shades must be a list of objects.")
    for shade_index, raw_shade in enumerate(raw_shades):
      shade_id = _uuid(raw_shade.get("id"), f"products[{index}].shades[{shade_index}].id")
      shade_key = str(raw_shade.get("externalShadeKey") or "").strip()
      shade_name = str(raw_shade.get("shadeName") or "").strip()
      product_region = str(raw_shade.get("productRegion") or "").strip()
      if (
        shade_id in seen_shade_ids
        or not shade_key
        or shade_key in shade_keys
        or not shade_name
        or product_region not in {"lip", "cheek", "shadow", "liner", "base", "brow"}
      ):
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Shade identity/region must be unique and valid.")
      shade_ids.add(shade_id)
      seen_shade_ids.add(shade_id)
      shade_keys.add(shade_key)
      try:
        hex_color = normalize_hex_color(str(raw_shade.get("srgbHex") or ""))
      except ValueError as error:
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Shade sRGB color must use #RRGGBB.") from error
      lab = srgb_hex_to_lab(hex_color)
      provided_lab = raw_shade.get("lab")
      if isinstance(provided_lab, dict):
        try:
          compared = (float(provided_lab["l"]), float(provided_lab["a"]), float(provided_lab["b"]))
        except (KeyError, TypeError, ValueError) as error:
          raise AppError(422, "INVALID_CATALOG_MANIFEST", "Shade Lab must contain numeric l/a/b values.") from error
        if max(abs(compared[i] - lab[i]) for i in range(3)) > 1.0:
          raise AppError(422, "SHADE_LAB_MISMATCH", "Provided Lab differs from deterministic sRGB conversion.")
      evidence_type = str(raw_shade.get("evidenceType") or "")
      if evidence_type not in {"measured_swatch", "licensed_partner_feed", "brand_official_swatch", "manual_review"}:
        raise AppError(422, "SHADE_EVIDENCE_REQUIRED", "AR-eligible shades require reviewed evidence.")
      evidence_reference = str(raw_shade.get("evidenceReference") or "").strip()
      finish = str(raw_shade.get("finish") or "").strip()
      shade_valid_from = _time(raw_shade.get("licenseValidFrom"), "shade.licenseValidFrom")
      shade_valid_until = _time(raw_shade.get("licenseValidUntil"), "shade.licenseValidUntil")
      reviewed_at = _time(raw_shade.get("reviewedAt"), "shade.reviewedAt")
      measured_at = _time(raw_shade.get("measuredAt"), "shade.measuredAt")
      try:
        evidence_confidence = float(raw_shade.get("evidenceConfidence"))
      except (TypeError, ValueError) as error:
        raise AppError(422, "SHADE_EVIDENCE_REQUIRED", "Shade evidence confidence must be numeric.") from error
      if (
        not evidence_reference
        or not finish
        or not reviewed_at
        or not shade_valid_until
        or shade_valid_until <= datetime.now(timezone.utc)
        or (shade_valid_from and shade_valid_until <= shade_valid_from)
        or not 0 <= evidence_confidence <= 1
        or (evidence_type == "measured_swatch" and not measured_at)
      ):
        raise AppError(422, "SHADE_EVIDENCE_REQUIRED", "Shade evidence, finish, review and future rights window are required.")
      normalized_shades.append(
        {
          **raw_shade,
          "id": shade_id,
          "srgbHex": hex_color,
          "lab": {"l": lab[0], "a": lab[1], "b": lab[2]},
          "externalShadeKey": shade_key,
          "shadeName": shade_name,
          "productRegion": product_region,
          "evidenceReference": evidence_reference,
          "evidenceConfidence": evidence_confidence,
          "finish": finish,
          "licenseValidFrom": shade_valid_from,
          "licenseValidUntil": shade_valid_until,
          "reviewedAt": reviewed_at,
          "measuredAt": measured_at,
          "allowedUses": _uses(raw_shade.get("allowedUses"), "shade.allowedUses"),
        }
      )

    normalized_assets = []
    raw_assets = raw_product.get("assets") or []
    if not isinstance(raw_assets, list) or any(not isinstance(item, dict) for item in raw_assets):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", "Product assets must be a list of objects.")
    for raw_asset in raw_assets:
      asset_id = _uuid(raw_asset.get("id"), "asset.id")
      if asset_id in seen_asset_ids:
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Asset IDs must be unique within a manifest.")
      seen_asset_ids.add(asset_id)
      shade_id = _uuid(raw_asset["shadeId"], "asset.shadeId") if raw_asset.get("shadeId") else None
      if shade_id and shade_id not in shade_ids:
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Asset shadeId must belong to its product.")
      asset_url = validate_external_https_url(
        str(raw_asset.get("url") or ""),
        settings.product_allowed_image_domains,
        kind="Image",
      )
      asset_type = str(raw_asset.get("assetType") or "").strip()
      asset_reference = str(raw_asset.get("sourceReference") or "").strip()
      asset_license = str(raw_asset.get("licenseType") or "").strip()
      asset_valid_from = _time(raw_asset.get("validFrom"), "asset.validFrom")
      asset_valid_until = _time(raw_asset.get("validUntil"), "asset.validUntil")
      asset_reviewed_at = _time(raw_asset.get("reviewedAt"), "asset.reviewedAt")
      if (
        asset_type not in {"packshot", "swatch", "thumbnail"}
        or not asset_reference
        or not asset_license
        or not asset_reviewed_at
        or not asset_valid_until
        or asset_valid_until <= datetime.now(timezone.utc)
        or (asset_valid_from and asset_valid_until <= asset_valid_from)
      ):
        raise AppError(422, "CATALOG_RIGHTS_MISSING", "Asset type, provenance, review and future rights window are required.")
      normalized_assets.append(
        {**raw_asset, "id": asset_id, "shadeId": shade_id, "url": asset_url, "assetType": asset_type, "sourceReference": asset_reference, "licenseType": asset_license, "validFrom": asset_valid_from, "validUntil": asset_valid_until, "reviewedAt": asset_reviewed_at, "allowedUses": _uses(raw_asset.get("allowedUses"), "asset.allowedUses")}
      )

    normalized_offers = []
    raw_offers = raw_product.get("offers") or []
    if not isinstance(raw_offers, list) or any(not isinstance(item, dict) for item in raw_offers):
      raise AppError(422, "INVALID_CATALOG_MANIFEST", "Product offers must be a list of objects.")
    for raw_offer in raw_offers:
      offer_id = _uuid(raw_offer.get("id"), "offer.id")
      if offer_id in seen_offer_ids:
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Offer IDs must be unique within a manifest.")
      seen_offer_ids.add(offer_id)
      shade_id = _uuid(raw_offer["shadeId"], "offer.shadeId") if raw_offer.get("shadeId") else None
      if shade_id and shade_id not in shade_ids:
        raise AppError(422, "INVALID_CATALOG_MANIFEST", "Offer shadeId must belong to its product.")
      purchase_url = validate_external_https_url(
        str(raw_offer.get("purchaseUrl") or ""),
        settings.product_allowed_seller_domains,
        kind="Seller",
      )
      seller_name = str(raw_offer.get("sellerName") or "").strip()
      seller_domain = str(raw_offer.get("sellerDomain") or "").strip().lower().rstrip(".")
      purchase_domain = (urlparse(purchase_url).hostname or "").lower().rstrip(".")
      source_reference = str(raw_offer.get("sourceReference") or "").strip()
      availability = str(raw_offer.get("availabilityStatus") or "").strip()
      affiliate_type = str(raw_offer.get("affiliateType") or "none").strip()
      disclosure = str(raw_offer.get("disclosureLabel") or "").strip() or None
      offer_valid_until = _time(raw_offer.get("validUntil"), "offer.validUntil")
      availability_checked_at = _time(raw_offer.get("availabilityCheckedAt"), "offer.availabilityCheckedAt")
      price_updated_at = _time(raw_offer.get("priceUpdatedAt"), "offer.priceUpdatedAt")
      price = raw_offer.get("priceAmount")
      offer_now = datetime.now(timezone.utc)
      freshness_cutoff = offer_now - timedelta(hours=settings.product_offer_max_age_hours)
      if (
        not seller_name
        or seller_domain != purchase_domain
        or not source_reference
        or availability not in {"in_stock", "limited", "out_of_stock", "discontinued", "unknown"}
        or affiliate_type not in {"none", "affiliate", "sponsored"}
        or (affiliate_type != "none" and not disclosure)
        or not offer_valid_until
        or offer_valid_until <= offer_now
        or not availability_checked_at
        or not price_updated_at
        or availability_checked_at < freshness_cutoff
        or price_updated_at < freshness_cutoff
        or availability_checked_at > offer_now
        or price_updated_at > offer_now
        or isinstance(price, bool)
        or not isinstance(price, int)
        or price < 0
      ):
        raise AppError(422, "INVALID_CATALOG_OFFER", "Offer seller, freshness, disclosure, provenance and validity are required.")
      normalized_offers.append(
        {**raw_offer, "id": offer_id, "shadeId": shade_id, "purchaseUrl": purchase_url, "sellerName": seller_name, "sellerDomain": seller_domain, "sourceReference": source_reference, "availabilityStatus": availability, "affiliateType": affiliate_type, "disclosureLabel": disclosure, "validUntil": offer_valid_until, "availabilityCheckedAt": availability_checked_at, "priceUpdatedAt": price_updated_at, "allowedUses": _uses(raw_offer.get("allowedUses"), "offer.allowedUses", require_recommendation=False)}
      )
    packshots = [asset for asset in normalized_assets if asset["assetType"] == "packshot"]
    display_offers = [
      offer
      for offer in normalized_offers
      if catalog_status != "published"
      or offer["availabilityStatus"] in {"in_stock", "limited"}
    ]
    has_compatible_display_pair = any(
      asset.get("shadeId") is None
      or offer.get("shadeId") is None
      or asset.get("shadeId") == offer.get("shadeId")
      for asset in packshots
      for offer in display_offers
    )
    if not has_compatible_display_pair:
      raise AppError(
        422,
        "CATALOG_DISPLAY_DATA_MISSING",
        "Every published product needs a compatible licensed packshot and available offer.",
      )
    normalized_products.append(
      {
        **raw_product,
        "id": product_id,
        "priceKrw": price_krw,
        "tags": tags,
        "productPayload": product_payload,
        "attributeEvidence": attribute_evidence,
        "_attributeEvidenceAuthoritative": attribute_evidence_authoritative,
        "allowedUses": allowed_uses,
        "licenseValidFrom": valid_from,
        "licenseValidUntil": valid_until,
        "shades": normalized_shades,
        "assets": normalized_assets,
        "offers": normalized_offers,
      }
    )
  return {
    **manifest,
    "manifestId": manifest_id,
    "sourceProvider": source_provider,
    "catalogVersion": catalog_version,
    "products": normalized_products,
  }


async def apply_catalog_manifest(
  db: Database,
  settings: Settings,
  *,
  manifest: dict[str, Any],
  signature: str,
  actor_user_id: UUID,
) -> dict[str, int]:
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Catalog import requires a database.")
  digest = verify_manifest_signature(manifest, signature, settings.product_catalog_manifest_signing_secret)
  normalized = validate_catalog_manifest(manifest, settings)
  counts = {"products": 0, "shades": 0, "assets": 0, "offers": 0}
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      await require_product_operator(
        connection,
        user_id=actor_user_id,
        roles={CATALOG_ADMIN},
        error_code="INVALID_CATALOG_ACTOR",
        message="Catalog import requires an active catalog administrator.",
      )
      existing = await connection.fetchrow("select status from product_catalog_imports where manifest_id=$1", normalized["manifestId"])
      if existing:
        return counts
      for product in normalized["products"]:
        row = await connection.fetchrow(
          """
          insert into products (id,external_key,brand_name,product_name,category,price_krw,tags,
            product_payload,source_provider,
            source_license_type,source_reference,license_status,license_valid_from,license_valid_until,
            allowed_uses,catalog_status,catalog_version,is_active)
          values ($1,$2,$3,$4,$5::product_category,$6,$7,$8::jsonb,$9,$10,$11,'valid',$12,$13,$14,$15,$16,true)
          on conflict (id) do update set external_key=excluded.external_key,
            brand_name=excluded.brand_name,product_name=excluded.product_name,
            category=excluded.category,price_krw=excluded.price_krw,tags=excluded.tags,
            product_payload=excluded.product_payload,source_license_type=excluded.source_license_type,
            source_reference=excluded.source_reference,license_status=excluded.license_status,
            license_valid_from=excluded.license_valid_from,
            license_valid_until=excluded.license_valid_until,allowed_uses=excluded.allowed_uses,
            catalog_status=excluded.catalog_status,catalog_version=excluded.catalog_version,
            is_active=true,updated_at=now()
          where products.source_provider=excluded.source_provider
          returning id
          """,
          product["id"], product.get("externalKey"), product["brandName"], product["productName"],
          product["category"], product["priceKrw"], product["tags"],
          json.dumps(product["productPayload"], ensure_ascii=False), normalized["sourceProvider"],
          product.get("licenseType"), product.get("sourceReference"), product["licenseValidFrom"],
          product["licenseValidUntil"], product["allowedUses"], product["catalogStatus"],
          normalized["catalogVersion"],
        )
        if not row:
          raise AppError(409, "CATALOG_SOURCE_CONFLICT", "A product is owned by another catalog provider.")
        counts["products"] += 1
        for evidence in product["attributeEvidence"]:
          await connection.execute(
            """
            insert into product_attribute_evidence (
              product_id,attribute_key,attribute_value,source_type,source_reference,
              evidence_fingerprint,confidence_score,status,observed_at,reviewed_at,expires_at
            ) values ($1,$2,$3::jsonb,$4,$5,$6,$7,'verified',$8,$9,$10)
            on conflict (product_id,attribute_key,evidence_fingerprint) do update set
              attribute_value=excluded.attribute_value,source_type=excluded.source_type,
              source_reference=excluded.source_reference,confidence_score=excluded.confidence_score,
              status='verified',observed_at=excluded.observed_at,reviewed_at=excluded.reviewed_at,
              expires_at=excluded.expires_at,updated_at=now()
            """,
            product["id"],
            evidence["attributeKey"],
            json.dumps(evidence["attributeValue"], ensure_ascii=False),
            evidence["sourceType"],
            evidence["sourceReference"],
            evidence["evidenceFingerprint"],
            evidence["confidenceScore"],
            evidence["observedAt"],
            evidence["reviewedAt"],
            evidence["expiresAt"],
          )
        if product["_attributeEvidenceAuthoritative"]:
          await _expire_omitted_attribute_evidence(
            connection,
            product_id=product["id"],
            active_fingerprints=[
              evidence["evidenceFingerprint"]
              for evidence in product["attributeEvidence"]
            ],
          )
        for shade in product["shades"]:
          shade_row = await connection.fetchrow(
            """
            insert into product_shades (id,product_id,external_shade_key,shade_name,product_region,srgb_hex,
              lab_l,lab_a,lab_b,color_family,finish,coverage,opacity,evidence_type,evidence_reference,
              evidence_confidence,license_status,license_valid_from,license_valid_until,allowed_uses,
              measured_at,reviewed_at,is_active)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'valid',$17,$18,$19,$20,$21,true)
            on conflict (product_id,external_shade_key) do update set shade_name=excluded.shade_name,
              product_region=excluded.product_region,
              srgb_hex=excluded.srgb_hex,lab_l=excluded.lab_l,lab_a=excluded.lab_a,lab_b=excluded.lab_b,
              color_family=excluded.color_family,finish=excluded.finish,coverage=excluded.coverage,
              opacity=excluded.opacity,evidence_type=excluded.evidence_type,
              evidence_reference=excluded.evidence_reference,evidence_confidence=excluded.evidence_confidence,
              license_status=excluded.license_status,license_valid_from=excluded.license_valid_from,
              license_valid_until=excluded.license_valid_until,allowed_uses=excluded.allowed_uses,
              measured_at=excluded.measured_at,reviewed_at=excluded.reviewed_at,is_active=true,updated_at=now()
            returning id
            """,
            shade["id"],product["id"],shade["externalShadeKey"],shade["shadeName"],shade["productRegion"],
            shade["srgbHex"],shade["lab"]["l"],shade["lab"]["a"],shade["lab"]["b"],shade.get("colorFamily"),
            shade.get("finish"),shade.get("coverage"),shade.get("opacity"),shade["evidenceType"],
            shade.get("evidenceReference"),float(shade.get("evidenceConfidence") or 0),
            _time(shade.get("licenseValidFrom"),"shade.licenseValidFrom"),
            _time(shade.get("licenseValidUntil"),"shade.licenseValidUntil"),shade["allowedUses"],
            _time(shade.get("measuredAt"),"shade.measuredAt"),_time(shade.get("reviewedAt"),"shade.reviewedAt"),
          )
          if not shade_row:
            raise AppError(409, "CATALOG_SOURCE_CONFLICT", "A shade could not be updated safely.")
          counts["shades"] += 1
        for asset in product["assets"]:
          asset_row = await connection.fetchrow(
            """insert into product_assets (id,product_id,shade_id,asset_type,asset_url,checksum_sha256,
              source_provider,source_reference,license_type,license_status,allowed_uses,valid_from,valid_until,reviewed_at,is_active)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'valid',$10,$11,$12,$13,true)
              on conflict (id) do update set asset_url=excluded.asset_url,allowed_uses=excluded.allowed_uses,
                checksum_sha256=excluded.checksum_sha256,source_reference=excluded.source_reference,
                license_type=excluded.license_type,license_status=excluded.license_status,
                valid_from=excluded.valid_from,valid_until=excluded.valid_until,
                reviewed_at=excluded.reviewed_at,is_active=true,updated_at=now()
              where product_assets.source_provider=excluded.source_provider
              returning id""",
            asset["id"],product["id"],asset.get("shadeId"),
            asset["assetType"],asset["url"],asset.get("checksumSha256"),normalized["sourceProvider"],
            asset.get("sourceReference"),asset.get("licenseType"),asset["allowedUses"],
            _time(asset.get("validFrom"),"asset.validFrom"),_time(asset.get("validUntil"),"asset.validUntil"),
            _time(asset.get("reviewedAt"),"asset.reviewedAt"),
          )
          if not asset_row:
            raise AppError(409, "CATALOG_SOURCE_CONFLICT", "An asset is owned by another catalog provider.")
          counts["assets"] += 1
        for offer in product["offers"]:
          offer_row = await connection.fetchrow(
            """insert into product_offers (id,product_id,shade_id,seller_name,seller_domain,purchase_url,
              currency,price_amount,availability_status,availability_checked_at,price_updated_at,
              affiliate_type,disclosure_label,source_provider,source_reference,license_status,allowed_uses,valid_until,is_active)
              values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'valid',$16,$17,true)
              on conflict (id) do update set purchase_url=excluded.purchase_url,price_amount=excluded.price_amount,
                shade_id=excluded.shade_id,seller_name=excluded.seller_name,
                seller_domain=excluded.seller_domain,currency=excluded.currency,
                availability_status=excluded.availability_status,
                availability_checked_at=excluded.availability_checked_at,
                price_updated_at=excluded.price_updated_at,affiliate_type=excluded.affiliate_type,
                disclosure_label=excluded.disclosure_label,source_reference=excluded.source_reference,
                license_status=excluded.license_status,allowed_uses=excluded.allowed_uses,
                valid_until=excluded.valid_until,is_active=true,updated_at=now()
              where product_offers.source_provider=excluded.source_provider
              returning id""",
            offer["id"],product["id"],offer.get("shadeId"),
            offer["sellerName"],offer["sellerDomain"],offer["purchaseUrl"],offer.get("currency","KRW"),
            offer.get("priceAmount"),offer.get("availabilityStatus","unknown"),
            _time(offer.get("availabilityCheckedAt"),"offer.availabilityCheckedAt"),
            _time(offer.get("priceUpdatedAt"),"offer.priceUpdatedAt"),offer.get("affiliateType","none"),
            offer.get("disclosureLabel"),normalized["sourceProvider"],offer.get("sourceReference"),
            offer["allowedUses"],_time(offer.get("validUntil"),"offer.validUntil"),
          )
          if not offer_row:
            raise AppError(409, "CATALOG_SOURCE_CONFLICT", "An offer is owned by another catalog provider.")
          counts["offers"] += 1
      await connection.execute(
        """insert into product_catalog_imports (manifest_id,manifest_sha256,source_provider,catalog_version,
          actor_user_id,status,summary) values ($1,$2,$3,$4,$5,'applied',$6::jsonb)""",
        normalized["manifestId"],digest,normalized["sourceProvider"],normalized["catalogVersion"],
        actor_user_id,json.dumps({**counts, "productIds": [str(product["id"]) for product in normalized["products"]]}),
      )
      await connection.execute(
        """insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata)
          values ($1,'product_catalog.imported','product_catalog_import',$2,$3::jsonb)""",
        actor_user_id,normalized["manifestId"],json.dumps({"sha256":digest,**counts}),
      )
  return counts
