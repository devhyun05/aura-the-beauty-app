#!/usr/bin/env bash
set -euo pipefail

: "${S3_BUCKET_NAME:?Set S3_BUCKET_NAME to the private media bucket.}"

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

if aws s3api get-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET_NAME" \
  --region "$AWS_REGION" \
  --output json > "$tmp_dir/current.json" 2> "$tmp_dir/read-error.txt"; then
  jq '{Rules: (.Rules // [])}' "$tmp_dir/current.json" > "$tmp_dir/base.json"
elif grep -q 'NoSuchLifecycleConfiguration' "$tmp_dir/read-error.txt"; then
  printf '{"Rules":[]}\n' > "$tmp_dir/base.json"
else
  cat "$tmp_dir/read-error.txt" >&2
  exit 1
fi

jq '.Rules |= map(select((((.ID // "") | startswith("aura-hair-")) | not)))' \
  "$tmp_dir/base.json" > "$tmp_dir/without-hair-rules.json"

jq '.Rules += [
  {
    "ID": "aura-hair-analysis-source-expiry",
    "Status": "Enabled",
    "Filter": {"Prefix": "uploads/hair-analysis-source/"},
    "Expiration": {"Days": 2},
    "NoncurrentVersionExpiration": {"NoncurrentDays": 2},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
  },
  {
    "ID": "aura-hair-analysis-mask-expiry",
    "Status": "Enabled",
    "Filter": {"Prefix": "uploads/hair-analysis-mask/"},
    "Expiration": {"Days": 2},
    "NoncurrentVersionExpiration": {"NoncurrentDays": 2},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
  },
  {
    "ID": "aura-hair-unsaved-result-safety-expiry",
    "Status": "Enabled",
    "Filter": {
      "And": {
        "Prefix": "uploads/hair-simulation-result/",
        "Tags": [{"Key": "aura-retention", "Value": "ephemeral"}]
      }
    },
    "Expiration": {"Days": 2}
  },
  {
    "ID": "aura-hair-result-noncurrent-safety-expiry",
    "Status": "Enabled",
    "Filter": {"Prefix": "uploads/hair-simulation-result/"},
    "NoncurrentVersionExpiration": {"NoncurrentDays": 2},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
  }
]' "$tmp_dir/without-hair-rules.json" > "$tmp_dir/merged.json"

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET_NAME" \
  --lifecycle-configuration "file://$tmp_dir/merged.json" \
  --region "$AWS_REGION"

printf 'Configured backup lifecycle rules on s3://%s.\n' "$S3_BUCKET_NAME"
