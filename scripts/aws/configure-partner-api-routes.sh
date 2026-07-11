#!/usr/bin/env bash
set -euo pipefail

: "${API_ID:?Set API_ID to the API Gateway HTTP API id.}"

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
STAGE_NAME="${STAGE_NAME:-\$default}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

aws apigatewayv2 get-routes \
  --api-id "$API_ID" \
  --max-results 100 \
  --region "$AWS_REGION" \
  --output json > "$tmp_dir/routes.json"

integration_id="${INTEGRATION_ID:-}"
if [[ -z "$integration_id" ]]; then
  proxy_target="$(jq -r '.Items[] | select(.RouteKey == "ANY /{proxy+}") | .Target // empty' "$tmp_dir/routes.json" | head -n 1)"
  integration_id="${proxy_target#integrations/}"
fi
if [[ -z "$integration_id" ]]; then
  printf 'Could not infer INTEGRATION_ID from ANY /{proxy+}. Set INTEGRATION_ID explicitly.\n' >&2
  exit 1
fi

route_keys=(
  'POST /api/consulting/partner/login'
  'POST /api/consulting/partner/applications'
  'ANY /api/consulting/partner/{proxy+}'
)

for route_key in "${route_keys[@]}"; do
  route_id="$(jq -r --arg key "$route_key" '.Items[] | select(.RouteKey == $key) | .RouteId' "$tmp_dir/routes.json" | head -n 1)"
  if [[ -n "$route_id" ]]; then
    aws apigatewayv2 update-route \
      --api-id "$API_ID" \
      --route-id "$route_id" \
      --target "integrations/$integration_id" \
      --authorization-type NONE \
      --region "$AWS_REGION" >/dev/null
  else
    aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$route_key" \
      --target "integrations/$integration_id" \
      --authorization-type NONE \
      --region "$AWS_REGION" >/dev/null
  fi
done

aws apigatewayv2 get-stage \
  --api-id "$API_ID" \
  --stage-name "$STAGE_NAME" \
  --region "$AWS_REGION" \
  --output json > "$tmp_dir/stage.json"

jq '.RouteSettings // {}' "$tmp_dir/stage.json" > "$tmp_dir/current-route-settings.json"
jq -n '{
  "POST /api/consulting/partner/login": {
    "ThrottlingBurstLimit": 10,
    "ThrottlingRateLimit": 5
  },
  "POST /api/consulting/partner/applications": {
    "ThrottlingBurstLimit": 5,
    "ThrottlingRateLimit": 2
  }
}' > "$tmp_dir/partner-route-settings.json"
jq -s '.[0] * .[1]' \
  "$tmp_dir/current-route-settings.json" \
  "$tmp_dir/partner-route-settings.json" > "$tmp_dir/merged-route-settings.json"

aws apigatewayv2 update-stage \
  --api-id "$API_ID" \
  --stage-name "$STAGE_NAME" \
  --route-settings "file://$tmp_dir/merged-route-settings.json" \
  --region "$AWS_REGION" >/dev/null

if [[ "$(jq -r '.AutoDeploy // false' "$tmp_dir/stage.json")" != "true" ]]; then
  deployment_id="$(aws apigatewayv2 create-deployment \
    --api-id "$API_ID" \
    --region "$AWS_REGION" \
    --query DeploymentId \
    --output text)"
  aws apigatewayv2 update-stage \
    --api-id "$API_ID" \
    --stage-name "$STAGE_NAME" \
    --deployment-id "$deployment_id" \
    --region "$AWS_REGION" >/dev/null
fi

printf 'Configured partner session routes on API %s (%s).\n' "$API_ID" "$STAGE_NAME"
