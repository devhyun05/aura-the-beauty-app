from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
  aws_access_key_id: str | None = None
  aws_secret_access_key: str | None = None
  aws_use_iam_role: bool = False

  ai_provider: str = "bedrock"
  image_generation_provider: str = "openai"
  openai_enabled: bool = True
  bedrock_model_id: str | None = "anthropic.claude-3-5-sonnet-20241022-v2:0"
  bedrock_analysis_model_id: str | None = None
  bedrock_analysis_inference_id: str | None = None
  bedrock_analysis_region: str | None = None
  bedrock_embedding_model_id: str | None = "amazon.titan-embed-text-v2:0"
  bedrock_embedding_region: str | None = None
  embedding_dimension: int = 1024

  cognito_user_pool_id: str | None = None
  cognito_app_client_id: str | None = None
  google_oauth_client_id: str | None = None

  s3_bucket_name: str | None = None
  cdn_base_url: str | None = None
  cloudfront_domain: str | None = None
  openai_api_key: str | None = None
  openai_analysis_model_id: str = "gpt-5.5"
  openai_image_model_id: str = "gpt-image-2"
  openai_image_quality: str = "medium"
  openai_image_size: str = "auto"
  openai_image_output_format: str = "jpeg"
  openai_image_output_compression: int = 80

  naver_shopping_client_id: str | None = None
  naver_shopping_client_secret: str | None = None

  cors_enabled: bool = False
  cors_allow_origins: str = ""

  model_config = SettingsConfigDict(extra="ignore")

  @property
  def analysis_provider(self) -> str:
    return (self.ai_provider or "bedrock").strip().lower()

  @property
  def image_generation_provider_normalized(self) -> str:
    return (self.image_generation_provider or "openai").strip().lower()

  @property
  def effective_bedrock_analysis_region(self) -> str:
    return (self.bedrock_analysis_region or self.aws_region).strip()

  @property
  def effective_bedrock_embedding_region(self) -> str:
    return (self.bedrock_embedding_region or self.aws_region).strip()

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
    return bool((self.aws_access_key_id and self.aws_secret_access_key) or self.aws_use_iam_role)

  @property
  def aws_credential_source(self) -> str:
    if self.aws_use_iam_role:
      return "iam_role"

    if self.aws_access_key_id and self.aws_secret_access_key:
      return "access_key"

    return "missing"

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
      "naverShoppingApi": {
        "configured": bool(self.naver_shopping_client_id and self.naver_shopping_client_secret),
        "requiredWhen": "Korean cosmetic product recommendations should include live purchasable shopping links.",
      },
      "awsCredentialsOrRole": {
        "configured": self.aws_credentials_configured,
        "source": self.aws_credential_source,
        "requiredWhen": "Local AWS SDK calls use access keys. ECS should set AWS_USE_IAM_ROLE=true and use a task role.",
      },
    }
    missing = [name for name, item in items.items() if not item["configured"]]

    return {
      "environment": self.environment,
      "authRequired": self.auth_required,
      "awsRegion": self.aws_region,
      "aiProvider": analysis_provider,
      "analysisModel": self.effective_analysis_model_id,
      "embeddingProvider": "bedrock",
      "embeddingModel": self.effective_embedding_model_id,
      "imageGenerationProvider": image_generation_provider,
      "imageGenerationModel": self.openai_image_model_id if image_generation_provider == "openai" else None,
      "items": items,
      "missing": missing,
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
  return Settings(_env_file=".env", _env_file_encoding="utf-8")
