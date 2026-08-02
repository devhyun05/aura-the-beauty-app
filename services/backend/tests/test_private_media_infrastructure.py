from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE_PATH = PROJECT_ROOT / "infra/private-media.yaml"
DEPLOYMENT_DOC_PATH = PROJECT_ROOT / "docs/backend/PRIVATE_MEDIA_SECURITY.md"
DEPLOY_WORKFLOW_PATH = PROJECT_ROOT / ".github/workflows/deploy-backend-ecs.yml"


def _template() -> str:
  return TEMPLATE_PATH.read_text(encoding="utf-8")


def test_private_media_bucket_is_private_encrypted_versioned_and_retained() -> None:
  template = _template()

  assert "Type: AWS::S3::Bucket" in template
  assert template.count("DeletionPolicy: Retain") >= 2
  assert template.count("UpdateReplacePolicy: Retain") >= 2
  assert "SSEAlgorithm: AES256" in template
  assert "ObjectOwnership: BucketOwnerEnforced" in template
  for setting in (
    "BlockPublicAcls: true",
    "BlockPublicPolicy: true",
    "IgnorePublicAcls: true",
    "RestrictPublicBuckets: true",
    "Status: Enabled",
  ):
    assert setting in template
  assert "Sid: DenyInsecureTransport" in template
  assert 'aws:SecureTransport: "false"' in template
  assert "AWS::CloudFront" not in template
  assert "PublicRead" not in template


def test_private_media_staging_lifecycle_removes_abandoned_versions() -> None:
  template = _template()

  assert template.count("Prefix: uploads/staging/user-media/") == 2
  assert "ExpirationInDays: 1" in template
  assert "NoncurrentDays: 1" in template
  assert "DaysAfterInitiation: 1" in template
  assert "ExpiredObjectDeleteMarker: true" in template


def test_private_media_task_roles_have_prefix_scoped_minimum_permissions() -> None:
  template = _template()

  assert "PrivateMediaTaskPolicy:" in template
  assert "Type: AWS::IAM::ManagedPolicy" in template
  assert "HasDistinctAiWorkerTaskRole" in template
  assert "*PrivateMediaTaskPolicyDocument" not in template
  assert "&PrivateMediaTaskPolicyDocument" not in template
  for action in (
    "s3:GetObject",
    "s3:GetObjectVersion",
    "s3:PutObject",
    "s3:PutObjectTagging",
    "s3:DeleteObject",
    "s3:DeleteObjectVersion",
    "s3:GetBucketVersioning",
    "s3:ListBucketVersions",
  ):
    assert action in template
  assert "${PrivateMediaBucket.Arn}/uploads/staging/user-media/*" in template
  assert "${PrivateMediaBucket.Arn}/private/user-media/*" in template
  for prefix in (
    "hair-analysis-source",
    "hair-analysis-mask",
    "hair-simulation-result",
    "golden-mask",
  ):
    assert f"${{PrivateMediaBucket.Arn}}/uploads/{prefix}/*" in template
    assert f"- uploads/{prefix}/*" in template
  assert "${PrivateMediaBucket.Arn}/${MakeupPrivateAssetPrefix}/*" in template
  assert "arn:aws:s3:::*" not in template
  assert "s3:ListAllMyBuckets" not in template


def test_legacy_migration_permissions_are_temporary_and_scoped() -> None:
  template = _template()

  assert "EnableLegacyMediaMigration:" in template
  assert "Condition: LegacyMediaMigrationEnabled" in template
  assert "LegacyPublicMediaBucketName:" in template
  assert "LegacyCloudFrontDistributionId:" in template
  assert "RequireLegacyMigrationTargets:" in template
  assert "cloudfront:GetDistribution" in template
  assert "cloudfront:GetInvalidation" in template
  assert "cloudfront:CreateInvalidation" not in template
  assert "Sid: ReadLegacyMediaBucketVersioning" in template
  assert "Sid: ListExactLegacyMediaVersions" in template
  versioning_statement = template.split("Sid: ReadLegacyMediaBucketVersioning", 1)[1].split(
    "Sid: ListExactLegacyMediaVersions",
    1,
  )[0]
  assert "s3:GetBucketVersioning" in versioning_statement
  assert "Condition:" not in versioning_statement
  assert "${LegacyPublicMediaBucketName}/uploads/face-analysis-source/*" in template
  assert "${LegacyPublicMediaBucketName}/uploads/optimized/analysis-previews/*" in template
  for prefix in (
    "hair-analysis-source",
    "hair-analysis-mask",
    "hair-simulation-result",
    "golden-mask",
  ):
    assert f"${{LegacyPublicMediaBucketName}}/uploads/{prefix}/*" in template
    assert f"- uploads/{prefix}/*" in template
  assert "${LegacyPublicMediaBucketName}/${MakeupPrivateAssetPrefix}/*" in template
  assert "${LegacyPublicMediaBucketName}/uploads/analysis-preview/*" not in template
  assert "${PrivateMediaBucket.Arn}/uploads/profile-avatar/*" not in template
  assert "${PrivateMediaBucket.Arn}/uploads/community-thread/*" not in template


def test_private_media_stack_output_is_wired_into_backend_deployment() -> None:
  template = _template()
  docs = DEPLOYMENT_DOC_PATH.read_text(encoding="utf-8")
  workflow = DEPLOY_WORKFLOW_PATH.read_text(encoding="utf-8")

  assert "PrivateMediaBucketName:" in template
  assert "--template-file infra/private-media.yaml" in docs
  assert "CAPABILITY_NAMED_IAM" in docs
  assert "gh variable set PRIVATE_MEDIA_BUCKET_NAME" in docs
  assert "PRIVATE_MEDIA_BUCKET_NAME: ${{ vars.PRIVATE_MEDIA_BUCKET_NAME }}" in workflow
  assert workflow.count("PRIVATE_MEDIA_BUCKET_NAME=${{ env.PRIVATE_MEDIA_BUCKET_NAME }}") == 2
