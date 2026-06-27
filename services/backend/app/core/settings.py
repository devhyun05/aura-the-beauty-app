from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  app_name: str = "AI AR Makeup Backend"
  environment: str = "local"
  debug: bool = False
  api_prefix: str = "/api"

  database_url: str | None = None

  auth_required: bool = False
  dev_user_sub: str = "local-dev-user"
  dev_user_email: str = "dev@example.com"
  dev_user_name: str = "Local Dev"

  aws_region: str = "ap-northeast-2"
  aws_access_key_id: str | None = None
  aws_secret_access_key: str | None = None
  aws_use_iam_role: bool = False

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
  openai_image_size: str = "1024x1024"

  cors_enabled: bool = False
  cors_allow_origins: str = ""

  model_config = SettingsConfigDict(extra="ignore")

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
  def cors_origins(self) -> list[str]:
    return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]

  def public_config_status(self) -> dict[str, object]:
    items = {
      "databaseUrl": {
        "configured": bool(self.database_url),
        "requiredWhen": "DB-backed APIs or schema/seed commands are used.",
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
      "openAIApiKey": {
        "configured": bool(self.openai_api_key),
        "requiredWhen": "Official OpenAI analysis or image generation is used.",
      },
      "openAIAnalysisModelId": {
        "configured": bool(self.openai_analysis_model_id),
        "requiredWhen": "Official OpenAI image analysis is used.",
      },
      "openAIImageModelId": {
        "configured": bool(self.openai_image_model_id),
        "requiredWhen": "Official OpenAI recommendation image generation is used.",
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
      "aiProvider": "openai",
      "items": items,
      "missing": missing,
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
  return Settings(_env_file=".env", _env_file_encoding="utf-8")
