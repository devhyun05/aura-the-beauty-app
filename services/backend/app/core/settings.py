import logging
from functools import lru_cache
from ipaddress import ip_address
from pathlib import Path
import re
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _resolve_repo_root(backend_root: Path) -> Path:
  for candidate in (backend_root, *backend_root.parents):
    if (candidate / "docs" / "backend" / "schema.sql").exists():
      return candidate

    if (candidate / "services" / "backend" / "app").exists():
      return candidate

  return backend_root


REPO_ROOT = _resolve_repo_root(BACKEND_ROOT)
ENV_FILES = (REPO_ROOT / ".env", BACKEND_ROOT / ".env")
DOMAIN_PATTERN = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
PUBLIC_SUFFIX_ONLY = {"com", "net", "org", "kr", "co.kr", "or.kr", "ne.kr", "go.kr"}


class Settings(BaseSettings):
  app_name: str = "AI AR Makeup Backend"
  environment: str = "local"
  debug: bool = False
  api_prefix: str = "/api"

  database_url: str | None = None
  database_secret_id: str | None = None
  db_host: str | None = None
  db_port: int = 5432
  db_name: str | None = None
  db_sslmode: str | None = None

  auth_required: bool = False
  dev_user_sub: str = "local-dev-user"
  dev_user_email: str = "dev@example.com"
  dev_user_name: str = "Local Dev"

  aws_region: str = "ap-northeast-2"
  aws_profile_name: str | None = None
  aws_access_key_id: str | None = None
  aws_secret_access_key: str | None = None
  aws_use_iam_role: bool = False

  ai_provider: str = "bedrock"
  image_generation_provider: str = "openai"
  ai_job_execution_mode: str = "inline"
  sqs_ai_job_queue_url: str | None = None
  makeup_journey_enabled: bool = True
  makeup_recommendation_v2_enabled: bool = True
  makeup_trend_keywords_enabled: bool = True
  makeup_personalized_image_enabled: bool = True
  makeup_recommendation_v1_compat_enabled: bool = True
  face_analysis_v2_enabled: bool = False
  # perceive는 영문에서도 ~40s(상한 45s에 근접)라 마진이 없었고, 한국어 출력으로
  # 더 길어져 타임아웃했다 → 스테이지별 여유를 준다(멈춘 잡은 상위 폴링 타임아웃이 방어).
  face_analysis_stage_timeout_seconds: float = Field(default=100.0, ge=5.0, le=180.0)
  face_analysis_stage_max_attempts: int = Field(default=2, ge=1, le=3)
  # Phase 4 population norms remain fail-closed. Turning the flag on is not
  # sufficient: the resolver also verifies an approved registry bundle and the
  # configured approval artifact SHA before returning an internal model.
  face_length_norm_enabled: bool = False
  face_length_norm_registry_path: str | None = None
  face_length_norm_approval_artifact_sha256: str | None = Field(
    default=None,
    pattern=r"^[0-9a-f]{64}$",
  )

  # Phase 2 calibration remains fail-closed until Gate 6B evidence is promoted.
  # Enabling requires all three values below plus a committed approval artifact.
  face3d_calibration_promotion_enabled: bool = False
  face3d_calibration_approval_artifact_sha256: str | None = None
  face3d_calibration_receipt_signing_key_id: str | None = None
  face3d_calibration_receipt_hmac_secret: str | None = None
  openai_enabled: bool = True
  bedrock_model_id: str | None = "anthropic.claude-3-5-sonnet-20241022-v2:0"
  bedrock_analysis_model_id: str | None = None
  bedrock_analysis_inference_id: str | None = None
  bedrock_scenario_model_id: str | None = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
  bedrock_question_model_id: str | None = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
  bedrock_recommendation_model_id: str | None = "global.anthropic.claude-sonnet-4-6"
  bedrock_analysis_region: str | None = None
  # analyze_text 단일 호출의 출력 상한. 하드 검증(FACE_ANALYSIS_AI_INCOMPLETE)이
  # 누락 필드를 실패로 돌리므로, 상한이 낮으면 절단→검증 실패가 사용자 재촬영
  # 요구로 이어진다. 요구 출력(~90값)의 한국어 문장 기준 여유치로 4000.
  bedrock_analysis_max_tokens: int = Field(default=4000, ge=1200, le=8192)
  # 단일 호출(analyze_text)의 Bedrock 출력을 강제 tool use로 스키마 강제한다.
  # 프롬프트 부탁만으로는 claude-3-5-sonnet이 무거운 필드를 생략해 FACE_ANALYSIS_
  # AI_INCOMPLETE로 실패하던 문제의 근본 대응. tool_use 블록이 없으면 기존 텍스트
  # 파싱으로 폴백. 실DB/실Bedrock 검증 전 끌 수 있도록 플래그(기본 ON).
  bedrock_analysis_tool_enforcement: bool = True
  # 팬아웃(Phase 4): 단일 Bedrock 콜을 앵커→A(인식/인상)∥B(처방/스타일링) 3콜로 쪼개
  # 출력 decode를 병렬화(서버 ~42s→~24s). 앵커가 공유값(faceShape/skinType/
  # recommendedMood)을 단독 저작해 A/B 정합성 보장. 실Bedrock 검증 전 기본 off.
  bedrock_analysis_fanout_enabled: bool = False
  # 최적화 실험용 지표 sink. 경로가 설정되면 분석 호출/결과 지표를 JSONL로 append
  # (로그 레벨과 무관). 미설정(None)이면 수집 off. scripts/analysis_metrics_report.py로 집계.
  analysis_metrics_path: str | None = None
  bedrock_guardrail_id: str | None = None
  bedrock_guardrail_version: str | None = None
  bedrock_guardrail_region: str | None = None
  bedrock_guardrail_required: bool = False
  bedrock_guardrail_trace: bool = False
  bedrock_embedding_model_id: str | None = "amazon.titan-embed-text-v2:0"
  bedrock_embedding_region: str | None = None
  embedding_dimension: int = 1024

  auradin_retrieval_backend: str = "auto"
  # Immutable data snapshot selection. Production always follows
  # data/auradin/active_snapshot.json; this override is reserved for local
  # golden/verification processes.
  auradin_snapshot_manifest: str | None = None
  auradin_snapshot_dev_regeneration: bool = False
  auradin_vector_index_path: str | None = None
  auradin_vector_index_autobuild: bool = False
  auradin_session_store: str = "postgres"
  auradin_session_ttl_seconds: int = 15 * 60
  # A9 create 멱등성 retention — 세션 TTL과 별개로 (owner, clientRequestId) 귀속을 유지하는 기간.
  auradin_idempotency_retention_seconds: int = 86400
  # §5 랭킹 튜너블 노브 (얇은 슬라이스에서 캘리브레이션한 시작값)
  # B8/R3는 골든 baseline 사람 재승인 전까지 비활성으로 배포한다.
  auradin_score_weights_v2: bool = False
  auradin_mmr_lambda: float = 0.7  # MMR 다양성: λ↑ anchor 유사, λ↓ 다양성 (§7 refine 다이얼)
  auradin_floor_semantic: float = 0.5  # floor 게이트 semantic 문턱
  # 점수갭 즉답 종료 임계 (하드 조건 + raw #1-#2 갭≥θ → 질문 스킵).
  # 근거 완비 카탈로그는 상위가 뭉쳐 갭이 작다(관측 0.000~0.046) — θ=0.04는
  # 동점 상위(≤0.011)와 확연히 앞선 질의(≥0.041)를 가르는 자연 경계. 데이터 기준 캘리브레이션.
  auradin_score_gap_threshold: float = 0.04
  # §7 refine 다이얼: more_similar → λ+step, more_diverse → λ−step (세션별 λ에 누적).
  auradin_refine_lambda_step: float = 0.15
  # §11 6/7단계 비동기 enrich — 자격증명 있으면 자동 ON, 없으면 graceful fallback (턴키).
  auradin_copy_enabled: bool = True  # Bedrock reasonCopy (구조화 근거 → 자연 카피, 가산 필드)
  # §11 3-2단계: 되묻기 질문의 표시 텍스트(제목·선택지 라벨)를 실시간 LLM으로 다듬는다.
  # 구조(id/filterDelta)는 불변 — 충실성 게이트 실패·비활성·드리프트면 결정론적 텍스트 유지(가산 폴리시).
  auradin_question_copy_enabled: bool = True
  auradin_live_discovery_enabled: bool = True  # 발견 슬롯 = Tier2 라이브 주력 (§5, 큐레이션은 폴백)
  auradin_enrich_timeout_seconds: float = 12.0  # enrich 전체 상한 — 초과 시 fallback으로 서빙
  # A5 (§7.2) 이벤트 로깅 — write feature flag. 기본 OFF: 익명식별 RFC 승인·Release Manifest 준비 전
  # 수집 시작 금지(D8). 기록 실패는 어떤 경우에도 추천 응답을 막지 않는다(fail-open).
  auradin_events_enabled: bool = False
  # Release Manifest 귀속 정본 — 배포 파이프라인이 앱 커밋 SHA(또는 release manifest id)를 주입.
  # 미설정이면 이벤트는 귀속 불가로 drop된다 — "unknown" 영속 금지(교차 리뷰 A5-2).
  # auradin_events_enabled=True와 함께 미설정이면 Settings 검증이 경고를 남긴다.
  auradin_release_manifest_id: str | None = None
  # 익명식별 RFC §2.1 — 클라이언트 anon token을 HMAC해 anon:v1:<digest> owner를 만들 서버 비밀키.
  # 미설정이면 anon owner를 만들 수 없어 익명 이벤트는 fail-open으로 건너뛴다.
  auradin_anon_token_secret: str | None = None
  # B7 (§7.3) 최소 개인화 루프 — 기본 새도 모드: False면 profileScore를 계산·로깅만 하고
  # 순위 무영향(wouldBeAnchor 세션 로그), True면 anchor-only 스왑 실행. diverse/discovery·floor 미적용.
  auradin_profile_score_enabled: bool = False
  # 배치 산출 user_taste_profile jsonl 경로 (scripts/build_auradin_taste_profiles.py 출력).
  # 미설정이면 프로필 조회 자체가 없다 — 테이블 생성은 B7 비범위.
  auradin_taste_profiles_path: str | None = None

  cognito_user_pool_id: str | None = None
  cognito_app_client_id: str | None = None
  google_oauth_client_id: str | None = None

  s3_bucket_name: str | None = None
  cdn_base_url: str | None = None
  cloudfront_domain: str | None = None
  openai_api_key: str | None = None
  openai_analysis_model_id: str = "gpt-5.5"
  openai_image_model_id: str = "gpt-image-2"
  openai_image_quality: Literal["low", "medium", "high", "auto"] = "low"
  openai_image_size: str = "768x1024"
  openai_image_output_format: Literal["jpeg", "jpg", "png", "webp"] = "jpeg"
  openai_image_output_compression: int = Field(default=80, ge=0, le=100)
  openai_image_input_max_edge: int = Field(default=1024, ge=256, le=4096)
  openai_image_input_quality: int = Field(default=82, ge=40, le=100)
  openai_image_output_max_edge: int = Field(default=1024, ge=256, le=4096)
  makeup_recommendation_source_hosts: str = "d3t1pbvtir1lj.cloudfront.net"
  makeup_private_asset_prefix: str = "private/generated-makeup-recommendations"
  makeup_private_url_ttl_seconds: int = Field(default=900, ge=60, le=3600)

  push_notifications_enabled: bool = True
  expo_push_endpoint: str = "https://exp.host/--/api/v2/push/send"
  expo_push_access_token: str | None = None

  hair_jobs_queue_url: str | None = None
  hair_style_asset_bucket: str | None = None
  hair_style_asset_prefix: str = "catalog/hair-styles/v1"
  hair_style_assets_require_approval: bool = True
  hair_source_retention_hours: int = Field(default=24, ge=1, le=168)
  hair_simulations_per_analysis: int = Field(default=3, ge=1, le=12)
  hair_simulations_per_day: int = Field(default=6, ge=1, le=100)
  hair_worker_wait_time_seconds: int = Field(default=20, ge=0, le=20)
  hair_worker_visibility_timeout_seconds: int = Field(default=360, ge=30, le=43200)
  hair_worker_request_timeout_seconds: int = Field(default=180, ge=30, le=600)
  hair_generation_quality: Literal["low", "medium", "high", "auto"] = "medium"
  hair_segmenter_model_path: str = "/app/models/hair_segmenter.tflite"
  face_landmarker_model_path: str = "/app/models/face_landmarker.task"

  naver_shopping_client_id: str | None = None
  naver_shopping_client_secret: str | None = None
  naver_api_hub_client_id: str | None = None
  naver_api_hub_client_secret: str | None = None

  # Product recommendation V2 rollout.  Data-dependent sections still enforce
  # catalog rights, consent and minimum cohort size even when their flag is on.
  product_hub_v2: bool = True
  seasonal_recommendations_v1: bool = True
  ar_recipe_persistence_v1: bool = True
  ar_product_recommendations_v1: bool = True
  engagement_personalization_v1: bool = False
  cohort_recommendations_v1: bool = False
  legacy_naver_product_search: bool = False
  naver_shopping_insight_enabled: bool = False
  naver_shopping_insight_endpoint: str | None = None
  naver_search_trend_endpoint: str | None = None
  naver_trend_content_enabled: bool = False
  naver_trend_news_endpoint: str | None = None
  naver_trend_blog_endpoint: str | None = None
  naver_trend_cafe_endpoint: str | None = None
  naver_trend_content_interval_hours: int = Field(default=6, ge=1, le=24)
  naver_trend_validation_interval_hours: int = Field(default=12, ge=1, le=48)
  # Four seeds keep 6-hour news/blog/cafe collection plus retry reservations
  # below the default 3,000-call monthly ceiling.
  naver_trend_content_max_seed_queries: int = Field(default=4, ge=1, le=10)
  naver_trend_monthly_call_limit: int = Field(default=3000, ge=1, le=100000)
  naver_trend_http_timeout_seconds: float = Field(default=5.0, ge=1.0, le=30.0)
  naver_trend_http_max_attempts: int = Field(default=2, ge=1, le=4)
  product_trend_burst_min_documents: int = Field(default=5, ge=2, le=100)
  product_trend_burst_min_sources: int = Field(default=2, ge=1, le=3)
  product_trend_burst_min_z_score: float = Field(default=2.5, ge=0.5, le=20.0)
  kma_weather_enabled: bool = False
  kma_weather_endpoint: str | None = None
  kma_weather_service_key: str | None = None
  kma_weather_interval_hours: int = Field(default=3, ge=1, le=12)
  # 17 regions * 8 daily releases * 31 days plus retry headroom.
  kma_weather_monthly_call_limit: int = Field(default=10000, ge=1, le=100000)
  kma_weather_http_timeout_seconds: float = Field(default=5.0, ge=1.0, le=30.0)
  product_trend_bedrock_enabled: bool = False
  product_trend_bedrock_model_id: str | None = None
  product_trend_bedrock_daily_call_limit: int = Field(default=1, ge=0, le=1)
  product_trend_bedrock_monthly_call_limit: int = Field(default=31, ge=0, le=31)
  product_trend_bedrock_input_token_limit: int = Field(default=8000, ge=256, le=8000)
  product_trend_bedrock_output_token_limit: int = Field(default=800, ge=128, le=800)
  product_trend_bedrock_timeout_seconds: float = Field(default=12.0, ge=1.0, le=30.0)
  trend_now_recommendations_v2: bool = False
  product_trend_auto_publish_enabled: bool = False
  product_trend_shadow_mode: bool = True
  product_trend_auto_publish_policy_version: str = "trend-now-autopublish-v1"
  product_trend_target_items: int = Field(default=18, ge=12, le=30)
  product_trend_min_items: int = Field(default=12, ge=1, le=18)
  product_trend_pipeline_max_runtime_seconds: int = Field(default=900, ge=60, le=3600)
  product_trend_service_principal_key: str = "trend-now-orchestrator"
  product_trend_task_role_arn: str | None = None
  product_trend_health_min_eligible_items: int = Field(default=12, ge=12, le=30)
  product_trend_health_max_fallback_ratio: float = Field(default=0.10, ge=0.0, le=1.0)
  product_trend_health_min_requests: int = Field(default=20, ge=1, le=10000)
  product_trend_health_bucket_retention_days: int = Field(default=8, ge=1, le=90)
  product_live_seasonal_cache_seconds: int = Field(default=300, ge=60, le=3600)
  product_trend_mcp_url: str | None = None
  product_trend_mcp_tool: str = "collect_beauty_trends"
  product_trend_mcp_bearer_token: str | None = None
  product_trend_mcp_allowed_hosts: str = ""
  product_trend_mcp_timeout_seconds: float = Field(default=8.0, ge=1.0, le=30.0)
  product_catalog_allowed_seller_domains: str = ""
  product_catalog_allowed_image_domains: str = ""
  product_event_signing_secret: str | None = None
  product_catalog_manifest_signing_secret: str | None = None
  product_seasonal_manifest_signing_secret: str | None = None
  product_event_batch_limit: int = Field(default=50, ge=1, le=100)
  product_event_clock_skew_hours: int = Field(default=24, ge=1, le=168)
  product_exposure_token_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
  product_ar_max_delta_e: float = Field(default=18.0, gt=0, le=100)
  product_offer_max_age_hours: int = Field(default=168, ge=1, le=2160)
  product_seasonal_source_max_age_days: int = Field(default=30, ge=1, le=180)
  product_event_retention_days: int = Field(default=90, ge=1, le=365)
  product_profile_retention_days: int = Field(default=180, ge=1, le=730)
  product_run_retention_days: int = Field(default=30, ge=1, le=180)
  product_raw_search_retention_days: int = Field(default=30, ge=1, le=90)
  product_cohort_min_size: int = Field(default=100, ge=2, le=10000)
  product_cohort_min_item_support: int = Field(default=5, ge=1, le=1000)
  product_personalization_experiment_percent: int = Field(default=50, ge=0, le=100)
  product_cohort_experiment_percent: int = Field(default=50, ge=0, le=100)
  product_personalization_require_age_14: bool = True
  product_recommendation_rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
  product_search_rate_limit_per_minute: int = Field(default=60, ge=1, le=10000)
  product_write_rate_limit_per_minute: int = Field(default=120, ge=1, le=10000)
  product_event_rate_limit_per_minute: int = Field(default=60, ge=1, le=10000)
  product_outbound_rate_limit_per_minute: int = Field(default=30, ge=1, le=10000)

  chime_enabled: bool = False
  chime_control_region: str | None = None
  chime_region: str | None = None
  chime_media_region: str | None = None
  consulting_call_enforce_early_window: bool = True
  consulting_call_join_early_minutes: int = 15
  consulting_call_join_late_minutes: int = 30
  consulting_call_allow_outside_window: bool = False

  cors_enabled: bool = False
  cors_allow_origins: str = ""

  model_config = SettingsConfigDict(extra="ignore")

  @field_validator("debug", mode="before")
  @classmethod
  def normalize_debug(cls, value: object) -> object:
    if isinstance(value, str) and value.strip().lower() in {"release", "prod", "production"}:
      return False

    return value

  @field_validator("makeup_private_asset_prefix")
  @classmethod
  def validate_makeup_private_asset_prefix(cls, value: str) -> str:
    prefix = str(value or "").strip().strip("/")
    segments = prefix.split("/")
    if (
      not prefix
      or prefix.startswith("uploads/")
      or any(segment in {"", ".", ".."} for segment in segments)
    ):
      raise ValueError("makeup private assets require a dedicated non-public S3 prefix")
    return prefix

  @model_validator(mode="after")
  def warn_events_enabled_without_release_manifest(self) -> "Settings":
    # A5 교차 리뷰: events flag ON + release manifest 미설정이면 모든 이벤트가 귀속 불가로
    # drop된다("unknown" 영속 금지). 배포 설정 실수를 부팅 시점에 명확히 드러낸다.
    if self.auradin_events_enabled and not str(self.auradin_release_manifest_id or "").strip():
      logging.getLogger(__name__).warning(
        "[aura:auradin-events] auradin_events_enabled=True but auradin_release_manifest_id "
        "is unset — every event will be dropped (no 'unknown' attribution is persisted)",
      )
    return self

  @model_validator(mode="after")
  def validate_face_length_norm_activation_configuration(self) -> "Settings":
    if not self.face_length_norm_enabled:
      return self
    if not str(self.face_length_norm_registry_path or "").strip():
      raise ValueError(
        "FACE_LENGTH_NORM_ENABLED requires FACE_LENGTH_NORM_REGISTRY_PATH",
      )
    if not str(self.face_length_norm_approval_artifact_sha256 or "").strip():
      raise ValueError(
        "FACE_LENGTH_NORM_ENABLED requires FACE_LENGTH_NORM_APPROVAL_ARTIFACT_SHA256",
      )
    return self

  @field_validator(
    "product_catalog_allowed_seller_domains",
    "product_catalog_allowed_image_domains",
  )
  @classmethod
  def validate_product_domain_allowlist(cls, value: str) -> str:
    domains = [domain.strip().lower() for domain in str(value or "").split(",") if domain.strip()]
    for domain in domains:
      try:
        ip_address(domain)
      except ValueError:
        address = None
      else:
        address = domain
      if (
        address is not None
        or domain in PUBLIC_SUFFIX_ONLY
        or not DOMAIN_PATTERN.fullmatch(domain)
      ):
        raise ValueError("product catalog allowlists require exact registrable DNS domains")
    return ",".join(dict.fromkeys(domains))

  @model_validator(mode="after")
  def validate_product_privacy_thresholds(self) -> "Settings":
    environment = self.environment.strip().lower()
    if environment in {"staging", "stage", "production", "prod"} and self.legacy_naver_product_search:
      raise ValueError("legacy product-search fixtures cannot be enabled outside local/test")
    if (
      environment in {"staging", "stage", "production", "prod"}
      and self.cohort_recommendations_v1
      and self.product_cohort_min_size < 100
    ):
      raise ValueError("enabled color cohort recommendations require k >= 100 outside local/test")
    if (
      environment in {"staging", "stage", "production", "prod"}
      and self.cohort_recommendations_v1
      and self.product_cohort_min_item_support < 5
    ):
      raise ValueError("enabled color cohort recommendations require at least 5 item supporters outside local/test")
    if self.product_trend_min_items > self.product_trend_target_items:
      raise ValueError("product_trend_min_items cannot exceed product_trend_target_items")
    if not self.product_trend_auto_publish_policy_version.strip():
      raise ValueError("product_trend_auto_publish_policy_version must not be empty")
    if not self.product_trend_service_principal_key.strip():
      raise ValueError("product_trend_service_principal_key must not be empty")
    return self

  @model_validator(mode="after")
  def validate_makeup_model_boundaries(self) -> "Settings":
    environment = self.environment.strip().lower()
    if (
      self.makeup_recommendation_v2_enabled
      and environment in {"staging", "stage", "production", "prod"}
      and not self.makeup_model_boundaries_configured
    ):
      raise ValueError(
        "makeup recommendation V2 requires Claude on Bedrock for text analysis "
        "and OpenAI gpt-image-2 for image generation",
      )
    return self

  @property
  def makeup_model_boundaries_configured(self) -> bool:
    claude_models = (
      self.effective_scenario_model_id,
      self.effective_question_model_id,
      self.effective_recommendation_model_id,
    )
    return (
      self.analysis_provider == "bedrock"
      and all("anthropic.claude" in model_id.lower() for model_id in claude_models)
      and self.image_generation_provider_normalized == "openai"
      and self.openai_image_model_id.strip().lower().startswith("gpt-image-2")
    )

  @property
  def analysis_provider(self) -> str:
    return (self.ai_provider or "bedrock").strip().lower()

  @property
  def image_generation_provider_normalized(self) -> str:
    return (self.image_generation_provider or "openai").strip().lower()

  @property
  def ai_job_execution_mode_normalized(self) -> str:
    return (self.ai_job_execution_mode or "inline").strip().lower()

  @property
  def ai_job_execution_mode_configured(self) -> bool:
    return self.ai_job_execution_mode_normalized in {"inline", "sqs"}

  @property
  def sqs_ai_job_queue_configured(self) -> bool:
    if self.ai_job_execution_mode_normalized != "sqs":
      return True

    return bool((self.sqs_ai_job_queue_url or "").strip())

  @property
  def effective_bedrock_analysis_region(self) -> str:
    return (self.bedrock_analysis_region or self.aws_region).strip()

  @property
  def effective_bedrock_embedding_region(self) -> str:
    return (self.bedrock_embedding_region or self.aws_region).strip()

  @property
  def effective_bedrock_guardrail_region(self) -> str:
    return (self.bedrock_guardrail_region or self.effective_bedrock_analysis_region).strip()

  @property
  def bedrock_guardrail_configured(self) -> bool:
    return bool((self.bedrock_guardrail_id or "").strip() and (self.bedrock_guardrail_version or "").strip())

  @property
  def effective_analysis_model_id(self) -> str:
    if self.analysis_provider == "bedrock":
      return (
        self.bedrock_analysis_inference_id
        or self.bedrock_analysis_model_id
        or self.bedrock_model_id
        or ""
      ).strip()

    return (self.openai_analysis_model_id or "").strip()

  @property
  def effective_scenario_model_id(self) -> str:
    return (self.bedrock_scenario_model_id or self.effective_analysis_model_id).strip()

  @property
  def effective_question_model_id(self) -> str:
    return (self.bedrock_question_model_id or self.effective_scenario_model_id).strip()

  @property
  def effective_recommendation_model_id(self) -> str:
    return (self.bedrock_recommendation_model_id or self.effective_analysis_model_id).strip()

  @property
  def effective_embedding_model_id(self) -> str:
    return (self.bedrock_embedding_model_id or "").strip()

  @property
  def cognito_issuer(self) -> str | None:
    if not self.cognito_user_pool_id:
      return None

    return f"https://cognito-idp.{self.aws_region}.amazonaws.com/{self.cognito_user_pool_id}"

  @property
  def cognito_jwks_url(self) -> str | None:
    issuer = self.cognito_issuer

    if not issuer:
      return None

    return f"{issuer}/.well-known/jwks.json"

  @property
  def effective_cdn_base_url(self) -> str | None:
    if self.cdn_base_url:
      return self.cdn_base_url.rstrip("/")

    if self.cloudfront_domain:
      domain = self.cloudfront_domain.rstrip("/")
      return domain if domain.startswith("http") else f"https://{domain}"

    return None

  @property
  def aws_credentials_configured(self) -> bool:
    return bool(
      self.aws_profile_name
      or (self.aws_access_key_id and self.aws_secret_access_key)
      or self.aws_use_iam_role
    )

  @property
  def aws_credential_source(self) -> str:
    if self.aws_profile_name:
      return "profile"

    if self.aws_use_iam_role:
      return "iam_role"

    if self.aws_access_key_id and self.aws_secret_access_key:
      return "access_key"

    return "missing"

  @property
  def effective_chime_region(self) -> str:
    return (self.chime_control_region or self.chime_region or self.aws_region).strip()

  @property
  def effective_chime_media_region(self) -> str:
    return (self.chime_media_region or self.effective_chime_region).strip()

  @property
  def database_configured(self) -> bool:
    return bool(self.database_url or self.database_secret_id)

  @property
  def database_credential_source(self) -> str:
    if self.database_url:
      return "database_url"

    if self.database_secret_id:
      return "secrets_manager"

    return "missing"

  @property
  def cors_origins(self) -> list[str]:
    return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]

  @property
  def product_allowed_seller_domains(self) -> tuple[str, ...]:
    return tuple(
      domain.strip().lower()
      for domain in self.product_catalog_allowed_seller_domains.split(",")
      if domain.strip()
    )

  @property
  def product_allowed_image_domains(self) -> tuple[str, ...]:
    return tuple(
      domain.strip().lower()
      for domain in self.product_catalog_allowed_image_domains.split(",")
      if domain.strip()
    )

  @property
  def product_trend_mcp_hosts(self) -> tuple[str, ...]:
    return tuple(
      host.strip().lower()
      for host in self.product_trend_mcp_allowed_hosts.split(",")
      if host.strip()
    )

  def public_config_status(self) -> dict[str, object]:
    analysis_provider = self.analysis_provider
    image_generation_provider = self.image_generation_provider_normalized
    ai_job_execution_mode = self.ai_job_execution_mode_normalized
    items = {
      "databaseUrl": {
        "configured": self.database_configured,
        "requiredWhen": "DB-backed APIs or schema/seed commands are used. Use DATABASE_URL or DATABASE_SECRET_ID.",
        "source": self.database_credential_source,
      },
      "cognitoUserPoolId": {
        "configured": bool(self.cognito_user_pool_id),
        "requiredWhen": "AUTH_REQUIRED=true.",
      },
      "cognitoAppClientId": {
        "configured": bool(self.cognito_app_client_id),
        "requiredWhen": "AUTH_REQUIRED=true.",
      },
      "googleOauthClientId": {
        "configured": bool(self.google_oauth_client_id),
        "requiredWhen": "Operational setup tracking for Google Cognito federation.",
      },
      "s3BucketName": {
        "configured": bool(self.s3_bucket_name),
        "requiredWhen": "S3 presigned upload APIs are used.",
      },
      "cdnBaseUrl": {
        "configured": bool(self.effective_cdn_base_url),
        "requiredWhen": "CDN URLs should be returned for uploaded media.",
      },
      "analysisProvider": {
        "configured": analysis_provider in {"bedrock", "openai"},
        "requiredWhen": "AI analysis jobs are run.",
        "value": analysis_provider,
      },
      "bedrockAnalysisModelId": {
        "configured": bool(self.effective_analysis_model_id) if analysis_provider == "bedrock" else True,
        "requiredWhen": "AI_PROVIDER=bedrock.",
        "value": self.effective_analysis_model_id if analysis_provider == "bedrock" else None,
      },
      "bedrockScenarioModelId": {
        "configured": bool(self.effective_scenario_model_id) if analysis_provider == "bedrock" else True,
        "requiredWhen": "AI_PROVIDER=bedrock and makeup scenario generation is enabled.",
        "value": self.effective_scenario_model_id if analysis_provider == "bedrock" else None,
      },
      "bedrockQuestionModelId": {
        "configured": bool(self.effective_question_model_id) if analysis_provider == "bedrock" else True,
        "requiredWhen": "AI_PROVIDER=bedrock and makeup question generation is enabled.",
        "value": self.effective_question_model_id if analysis_provider == "bedrock" else None,
      },
      "bedrockRecommendationModelId": {
        "configured": bool(self.effective_recommendation_model_id) if analysis_provider == "bedrock" else True,
        "requiredWhen": "AI_PROVIDER=bedrock and makeup recommendation generation is enabled.",
        "value": self.effective_recommendation_model_id if analysis_provider == "bedrock" else None,
      },
      "bedrockEmbeddingModelId": {
        "configured": bool(self.effective_embedding_model_id),
        "requiredWhen": "Embedding-backed recommendations or semantic search are used.",
        "value": self.effective_embedding_model_id,
      },
      "bedrockGuardrail": {
        "configured": self.bedrock_guardrail_configured or not self.bedrock_guardrail_required,
        "requiredWhen": "BEDROCK_GUARDRAIL_REQUIRED=true or production feedback safety enforcement.",
        "value": self.bedrock_guardrail_id if self.bedrock_guardrail_configured else None,
      },
      "embeddingDimension": {
        "configured": self.embedding_dimension > 0,
        "requiredWhen": "BEDROCK_EMBEDDING_MODEL_ID is used.",
        "value": self.embedding_dimension,
      },
      "openAIApiKey": {
        "configured": bool(self.openai_api_key),
        "requiredWhen": "IMAGE_GENERATION_PROVIDER=openai or AI_PROVIDER=openai.",
      },
      "openAIAnalysisModelId": {
        "configured": bool(self.openai_analysis_model_id) if analysis_provider == "openai" else True,
        "requiredWhen": "AI_PROVIDER=openai.",
      },
      "openAIImageModelId": {
        "configured": bool(self.openai_image_model_id) if image_generation_provider == "openai" else True,
        "requiredWhen": "IMAGE_GENERATION_PROVIDER=openai.",
      },
      "makeupRecommendationModelBoundary": {
        "configured": self.makeup_model_boundaries_configured,
        "requiredWhen": "MAKEUP_RECOMMENDATION_V2_ENABLED=true.",
        "value": "bedrock:claude-text/openai:gpt-image-2",
      },
      "imageGenerationProvider": {
        "configured": image_generation_provider == "openai",
        "requiredWhen": "Recommendation images should be generated.",
        "value": image_generation_provider,
      },
      "aiJobExecutionMode": {
        "configured": self.ai_job_execution_mode_configured,
        "requiredWhen": "AI analysis jobs are created. Use inline for local development and sqs for worker-backed deployments.",
        "value": ai_job_execution_mode,
      },
      "sqsAiJobQueueUrl": {
        "configured": self.sqs_ai_job_queue_configured,
        "requiredWhen": "AI_JOB_EXECUTION_MODE=sqs.",
      },
      "naverShoppingApi": {
        "configured": bool(self.naver_shopping_client_id and self.naver_shopping_client_secret),
        "requiredWhen": "Korean cosmetic product recommendations should include live purchasable shopping links.",
      },
      "naverTrendAutomation": {
        "configured": (
          not self.trend_now_recommendations_v2
          or bool(
            self.naver_trend_content_enabled
            and self.naver_shopping_insight_enabled
            and (
              (self.naver_api_hub_client_id and self.naver_api_hub_client_secret)
              or (self.naver_shopping_client_id and self.naver_shopping_client_secret)
            )
            and self.naver_trend_news_endpoint
            and self.naver_trend_blog_endpoint
            and self.naver_trend_cafe_endpoint
            and self.naver_search_trend_endpoint
            and self.naver_shopping_insight_endpoint
          )
        ),
        "requiredWhen": "TREND_NOW_RECOMMENDATIONS_V2=true.",
      },
      "kmaTrendWeather": {
        "configured": (
          not self.trend_now_recommendations_v2
          or bool(self.kma_weather_enabled and self.kma_weather_endpoint and self.kma_weather_service_key)
        ),
        "requiredWhen": "TREND_NOW_RECOMMENDATIONS_V2=true for regional weather ranking.",
      },
      "trendBedrockClassifier": {
        "configured": (
          not self.product_trend_bedrock_enabled
          or bool(self.product_trend_bedrock_model_id and self.aws_credentials_configured)
        ),
        "requiredWhen": "PRODUCT_TREND_BEDROCK_ENABLED=true; this classifier is optional and cost-capped.",
        "value": self.product_trend_bedrock_model_id if self.product_trend_bedrock_enabled else None,
      },
      "productTrendMcp": {
        "configured": True,
        "requiredWhen": "Legacy optional adapter only; Trend Now V2 calls approved APIs directly from batch jobs.",
        "value": self.product_trend_mcp_tool if self.product_trend_mcp_url else None,
      },
      "awsCredentialsOrRole": {
        "configured": self.aws_credentials_configured,
        "source": self.aws_credential_source,
        "requiredWhen": "Local AWS SDK calls use AWS_PROFILE_NAME or access keys. ECS should set AWS_USE_IAM_ROLE=true and use a task role.",
      },
      "auradinSessionStore": {
        "configured": self.auradin_session_store in {"memory", "postgres"},
        "requiredWhen": "Auradin search sessions are used.",
        "value": self.auradin_session_store,
      },
      "auradinRetrievalBackend": {
        "configured": self.auradin_retrieval_backend in {"auto", "lexical", "embedding"},
        "requiredWhen": "Auradin search sessions are used.",
        "value": self.auradin_retrieval_backend,
      },
    }
    missing = [name for name, item in items.items() if not item["configured"]]

    return {
      "environment": self.environment,
      "authRequired": self.auth_required,
      "awsRegion": self.aws_region,
      "aiProvider": analysis_provider,
      "analysisModel": self.effective_analysis_model_id,
      "makeupScenarioModel": self.effective_scenario_model_id,
      "makeupQuestionModel": self.effective_question_model_id,
      "makeupRecommendationModel": self.effective_recommendation_model_id,
      "makeupRecommendationV2Enabled": self.makeup_recommendation_v2_enabled,
      "makeupTrendKeywordsEnabled": self.makeup_trend_keywords_enabled,
      "makeupPersonalizedImageEnabled": self.makeup_personalized_image_enabled,
      "makeupRecommendationV1CompatEnabled": self.makeup_recommendation_v1_compat_enabled,
      "bedrockGuardrailConfigured": self.bedrock_guardrail_configured,
      "embeddingProvider": "bedrock",
      "embeddingModel": self.effective_embedding_model_id,
      "auradinRetrievalBackend": self.auradin_retrieval_backend,
      "auradinSessionStore": self.auradin_session_store,
      "imageGenerationProvider": image_generation_provider,
      "imageGenerationModel": self.openai_image_model_id if image_generation_provider == "openai" else None,
      "aiJobExecutionMode": ai_job_execution_mode,
      "items": items,
      "missing": missing,
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
  return Settings(_env_file=ENV_FILES, _env_file_encoding="utf-8")
