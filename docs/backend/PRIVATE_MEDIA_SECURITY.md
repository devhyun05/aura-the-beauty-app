# Private user media deployment

Sensitive user images (`capture`, `face-analysis-source`, `makeup_feedback`,
and `filter-extraction`) must not share the CDN-backed public media bucket.
The backend uploads them to a staging key, validates and sanitizes the actual
image bytes, and writes the accepted image to a server-only final key in a
separate private bucket.

Before a sanitized final object is written, the backend persists a delayed
deletion guard in `media_deletion_outbox`. The media-asset claim and guard
completion occur in one PostgreSQL statement. If the process stops between S3
write and database claim, the scheduled stuck-job/media cleanup drains the due
guard and permanently removes the unreferenced object and all of its versions.

## Repository-managed provisioning

`infra/private-media.yaml` creates the isolated bucket, its lifecycle and
bucket policy, and least-privilege access for the existing API and AI worker
ECS task roles. Role parameters are IAM role **names**, not ARNs. If the API
and worker share one task role, pass the same name for both parameters; the
template attaches the policy only once.

```bash
aws cloudformation deploy \
  --template-file infra/private-media.yaml \
  --stack-name aura-private-media-dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName=aura \
    EnvironmentName=dev \
    ApiTaskRoleName=<api-task-role-name> \
    AiWorkerTaskRoleName=<ai-worker-task-role-name> \
    EnableLegacyMediaMigration=true \
    LegacyPublicMediaBucketName=<legacy-public-media-bucket> \
    LegacyCloudFrontDistributionId=<legacy-distribution-id>
```

`PrivateMediaBucketName` may be supplied when a specific globally unique name
is required. Otherwise CloudFormation generates one. Read the output and set
the GitHub repository variable before deploying the backend:

```bash
private_media_bucket="$(aws cloudformation describe-stacks \
  --stack-name aura-private-media-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`PrivateMediaBucketName`].OutputValue' \
  --output text)"

gh variable set PRIVATE_MEDIA_BUCKET_NAME --body "$private_media_bucket"
```

The template retains the bucket and TLS-only bucket policy if the stack is
deleted or the bucket is replaced. IAM access is removed with the stack. It
also rejects staging and final uploads that omit the explicit `AES256`
encryption header; migration commands must therefore request SSE-S3 as well.

## Required AWS configuration

1. Deploy `infra/private-media.yaml` in the backend AWS Region. Do not
   configure its bucket as a CloudFront origin.
2. Enable all four S3 Block Public Access settings and Object Ownership
   `BucketOwnerEnforced`.
3. Enable default SSE-S3 encryption (`AES256`) and bucket versioning. The
   current presigned-upload contract and bucket policy require the explicit
   `AES256` request header.
4. Add a lifecycle rule that permanently expires
   `uploads/staging/user-media/` objects after one day. The API also deletes
   staging objects after validation, but the lifecycle rule removes abandoned
   uploads that never reach completion.
5. Confirm the template gave the ECS task role only the following permissions
   in the private bucket:
   `s3:GetObject`, `s3:PutObject`, `s3:PutObjectTagging`, `s3:DeleteObject`,
   `s3:GetObjectVersion`, `s3:DeleteObjectVersion`, and
   `s3:GetBucketVersioning` for the staging and final prefixes, plus
   `s3:ListBucketVersions` on the private bucket itself so permanent deletion
   can remove old versions. Do not grant `s3:ListAllMyBuckets` or wildcard
   bucket access.
6. Set the `PrivateMediaBucketName` stack output as the repository variable
   `PRIVATE_MEDIA_BUCKET_NAME`. The ECS deployment workflow injects it into
   both the API and AI worker task definitions.
7. Keep `EnableLegacyMediaMigration=true` only while the historical migration
   is active. It adds exact legacy-prefix version deletion and CloudFront
   invalidation-read permissions. Update the stack back to `false` after the
   last batch has passed both invalidations and source verification.

The bucket policy should also deny requests that do not use TLS:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::<private-media-bucket>",
        "arn:aws:s3:::<private-media-bucket>/*"
      ],
      "Condition": {"Bool": {"aws:SecureTransport": "false"}}
    }
  ]
}
```

## Release checks

- An anonymous request to the private bucket and to the public CDN using a
  private-media key must fail.
- A user can obtain a short-lived download URL only for their own active media.
- The database contains bucket/object-key references but never stores a
  presigned download URL.
- Reusing the original upload URL after completion can only change the
  unreferenced staging object, not the final media asset.
- Invalid, oversized, animated, or MIME-spoofed images never create an active
  `media_assets` row.
- A process interruption after final S3 write but before database claim leaves
  a pending deletion guard; the scheduled cleanup must later complete it.
- Deleting a face-analysis, makeup-feedback, or filter-extraction report queues
  any now-unreferenced private object for permanent version-aware deletion.
- While deletion is queued, the asset is `deletion_pending`; database triggers
  reject new references to non-active media and a newly discovered reference
  restores the object to `active` before delivery resumes.

## Existing CDN-backed objects

This release protects newly completed sensitive uploads and new analysis
previews. Historical `capture`, `face-analysis-source`, `filter-extraction`,
`makeup_feedback`, `analysis-preview`, and personalized recommendation assets
must be migrated before describing all historical media as private.

The migration is intentionally resumable and dry-run first. It keeps the
existing resource IDs so report foreign keys remain valid, sanitizes every
image to a metadata-free JPEG, writes a content-addressed private key, verifies
the copy, and only then switches the database row. Every phase is recorded in
`private_media_migration_items`; never edit that ledger manually.

Run all commands from `services/backend`. The first command only reads the
database and prints aggregate counts; it does not read or write S3.

Production database access is VPC-only. In production, run these module
commands as one-off ECS tasks based on the newly deployed API task definition,
using the same subnets and security group as the API service. Override only
the container command; do not copy database credentials to a developer
machine. Start with a 10-item canary batch, complete its two invalidations and
application checks, then increase to 100-500 items per batch.

```bash
python -m app.ops.migrate_private_media plan --limit 500
```

After reviewing the counts, choose and retain one batch UUID. Reuse that exact
ID for retries; a resource is never silently adopted by a different batch.

```bash
batch_id="$(python -c 'import uuid; print(uuid.uuid4())')"

python -m app.ops.migrate_private_media execute \
  --batch-id "$batch_id" \
  --limit 500 \
  --confirm-copy

python -m app.ops.migrate_private_media verify \
  --batch-id "$batch_id"
```

`verify` confirms the database location, private bucket/prefix, owner, absence
of durable CDN URLs, and target checksum. It also prints the exact legacy
CloudFront paths. Submit those paths to CloudFront and wait until the
invalidation status is `Completed`; recording a request ID is not enough.

Only after the invalidation is complete may the old S3 versions be removed:

```bash
python -m app.ops.migrate_private_media cleanup \
  --batch-id "$batch_id" \
  --cloudfront-distribution-id '<legacy-cdn-distribution-id>' \
  --cloudfront-invalidation-id '<completed-invalidation-id>' \
  --confirm-source-deletion
```

Cleanup removes every version and delete marker for the exact legacy source
and thumbnail keys. It never deletes by prefix. Failed copy, switch, verify, or
cleanup items retain their phase and error in the ledger and can be retried
with the same command and batch ID.

After cleanup, submit the same exact path manifest as a **second** CloudFront
invalidation and wait for `Completed`. This closes the race where an old URL
could have been re-cached after the first invalidation but before source
deletion. Confirm the legacy S3 keys have no versions or delete markers and
that representative old CDN URLs return `403` or `404`. Only then is the batch
operationally complete. When every batch is complete, update the stack with
`EnableLegacyMediaMigration=false` to remove the temporary legacy permissions.

Do not describe the historical migration as complete until the final dry-run
reports `candidateCount=0` and `skippedCount=0`, the ledger contains no
`failed` or `cleanup_pending` items, the second invalidation is `Completed`,
representative legacy CDN URLs return `403` or `404`, and anonymous access to
the private bucket is denied.

Before cleanup, a switched or verified batch can be restored to its original
database locations and the copied private objects can be deleted:

```bash
python -m app.ops.migrate_private_media rollback \
  --batch-id "$batch_id" \
  --confirm-rollback
```

Rollback is deliberately unavailable after cleanup because the source object
versions have been permanently deleted. Keep the migration ledger and database
backup according to the normal operational retention policy.
