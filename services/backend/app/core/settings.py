from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
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
  openai_enabled: bool = True
  bedrock_model_id: str | None = "anthropic.claude-3-5-sonnet-20241022-v2:0"
  bedrock_analysis_model_id: str | None = None
  bedrock_analysis_inference_id: str | None = None
  bedrock_analysis_region: str | None = None
  bedrock_guardrail_id: str | None = None
  bedrock_guardrail_version: str | None = None
  bedrock_guardrail_region: str | None = None
  bedrock_guardrail_required: bool = False
  bedrock_guardrail_trace: bool = False
  bedrock_embedding_model_id: str | None = "amazon.titan-embed-text-v2:0"
  bedrock_embedding_region: str | None = None
  embedding_dimension: int = 1024

  auradin_retrieval_backend: str = "auto"
  auradin_vector_index_path: str | None = None
  auradin_vector_index_autobuild: bool = False
  auradin_session_store: str = "postgres"
  auradin_session_ttl_seconds: int = 15 * 60
  # §5 랭킹 튜너블 노브 (얇은 슬라이스에서 캘리브레이션한 시작값)
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

  cognito_user_pool_id: str | None = None
  cognito_app_client_id: str | None = None
  google_oauth_client_id: str | None = None

  s3_bucket_name: str | None = None
  cdn_base_url: str | None = None
  cloudfront_domain: str | None = None
  openai_api_key: str | None = None
  openai_analysis_model_id: str = "gpt-5.5"
  openai_image_model_id: str = "gpt-image-2"
  openai_image_quality: str = "low"
  openai_image_size: str = "auto"
  openai_image_output_format: str = "jpeg"
  openai_image_output_compression: int = 80
  openai_image_input_max_edge: int = 1024
  openai_image_input_quality: int = 82
  openai_image_output_max_edge: int = 1024

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

  naver_shopping_client_id: str | None = None
  naver_shopping_client_secret: str | None = None

  chime_enabled: bool = False
  chime_control_region: str | None = None
  chime_region: str | None = None
  chime_media_region: str | None = None
  chime_transcription_enabled: bool = False
  chime_translate_enabled: bool = False
  chime_transcribe_supported_languages: str = "ko-KR,en-US"
  chime_transcribe_default_language: str = "ko-KR"
  chime_transcribe_preferred_language: str = "ko-KR"
  consulting_call_enforce_early_window: bool = True
  consulting_call_join_early_minutes: int = 15
  consulting_call_join_late_minutes: int = 30
  consulting_call_allow_outside_window: bool = False
  consulting_call_transcription_enabled: bool = False
  consulting_call_translation_enabled: bool = False
  consulting_transcript_retention_days: int = 0

  cors_enabled: bool = False
  cors_allow_origins: str = ""

  model_config = SettingsConfigDict(extra="ignore")

  @field_validator("debug", mode="before")
  @classmethod
  def normalize_debug(cls, value: object) -> object:
    if isinstance(value, str) and value.strip().lower() in {"release", "prod", "production"}:
      return False

    return value

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
  def effective_chime_transcribe_languages(self) -> tuple[str, ...]:
    languages = [
      value.strip()
      for value in (self.chime_transcribe_supported_languages or "").split(",")
      if value.strip()
    ]
    supported = tuple(value for value in languages if value in {"ko-KR", "en-US"})
    return supported or ("ko-KR", "en-US")

  @property
  def effective_chime_transcribe_default_language(self) -> str:
    language = (self.chime_transcribe_default_language or "ko-KR").strip()
    return language if language in self.effective_chime_transcribe_languages else "ko-KR"

  @property
  def effective_chime_transcribe_preferred_language(self) -> str:
    language = (self.chime_transcribe_preferred_language or self.effective_chime_transcribe_default_language).strip()
    return language if language in self.effective_chime_transcribe_languages else self.effective_chime_transcribe_default_language

  @property
  def effective_consulting_call_transcription_enabled(self) -> bool:
    return self.consulting_call_transcription_enabled or self.chime_transcription_enabled

  @property
  def effective_consulting_call_translation_enabled(self) -> bool:
    return self.consulting_call_translation_enabled or self.chime_translate_enabled

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
