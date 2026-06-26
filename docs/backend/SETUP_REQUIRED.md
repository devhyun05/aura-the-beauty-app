# Backend Setup Required

This document lists values that must be created or confirmed outside the code.
Do not commit real secrets.

For AWS wiring order, use docs/backend/AWS_DEPLOYMENT_CHECKLIST.md.
For current implementation status, use docs/backend/BACKEND_STATUS.md.


## Local First Setup Order

1. Create `services/backend/.env` from `services/backend/.env.example`.
2. Fill `DATABASE_URL` first.
3. Check local readiness with `python -m app.ops.setup_status --profile local`.
4. Run local Postgres with `services/backend/docker-compose.yml` or use RDS.
5. Apply `docs/backend/schema.sql` with `python -m app.db.init_db`.
6. Apply `docs/backend/seed.sql` with `python -m app.db.seed_db`.
7. Verify DB readiness with `python -m app.db.check_schema --require-seed`.
8. Fill Cognito values before enabling `AUTH_REQUIRED=true`.
9. Fill S3 and Bedrock values before testing uploads or analysis execution.
10. Use `python -m app.ops.setup_status --profile aws` before AWS deployment.
11. Use GET /api/health/config to confirm which setup categories are still missing. The endpoint returns booleans only, not secret values.
12. After the API server is running, use `python -m app.ops.smoke_api --base-url <url> --require-db` for local or CloudFront smoke verification.

## Required Values

- Name: `AUTH_REQUIRED`
- Why it is needed: Switch between local dev auth injection and real Cognito JWT verification.
- Where to get it: Decide per environment. Local can usually stay `false`; deployed API should be `true`.
- Example format: `false` for local, `true` for deployed dev/staging/prod.
- Connected code/env name: `AUTH_REQUIRED`
- Current behavior when missing: Defaults to `false`, so the API uses a local development Google-like user.

- Name: `CORS_ENABLED`
- Why it is needed: Decide whether FastAPI should emit CORS headers directly. If API Gateway owns CORS, keep this off to avoid duplicated policy.
- Where to get it: Team deployment decision for API Gateway/ALB/CloudFront wiring.
- Example format: `false` or `true`
- Connected code/env name: `CORS_ENABLED`
- Current behavior when missing: Defaults to `false`; FastAPI does not add CORS middleware.

- Name: `CORS_ALLOW_ORIGINS`
- Why it is needed: Allow browser-based requests when FastAPI owns CORS.
- Where to get it: Mobile/web frontend origin list, Expo web URL, or deployed frontend domain.
- Example format: `http://localhost:8081,https://example.com`
- Connected code/env name: `CORS_ALLOW_ORIGINS`
- Current behavior when missing: Empty; if `CORS_ENABLED=true`, the API falls back to allowing all origins for development.

- Name: `EXPO_PUBLIC_API_BASE_URL`
- Why it is needed: Let the mobile app call the deployed or local backend instead of mock services.
- Where to get it: Local server URL, API Gateway URL, ALB DNS, or CloudFront API domain.
- Example format: `http://192.168.0.10:8000/api` for LAN local dev or `https://<cloudfront-domain>/api` for AWS.
- Connected code/env name: mobile app environment value, not a backend server env value.
- Current behavior when missing: Mobile app can continue using mock service or fail to reach the real backend depending on the client switch.

- Name: `DATABASE_URL`
- Why it is needed: Connect FastAPI to RDS/PostgreSQL.
- Where to get it: AWS RDS console or Secrets Manager.
- Example format: `postgresql://user:password@host:5432/dbname`
- Connected code/env name: `DATABASE_URL`
- Current behavior when missing: API starts, but DB-backed endpoints return `DATABASE_NOT_CONFIGURED`.

- Name: `AWS_REGION`
- Why it is needed: Build Cognito, S3, and Bedrock clients in the correct region.
- Where to get it: AWS console region selector.
- Example format: `ap-northeast-2`
- Connected code/env name: `AWS_REGION`
- Current behavior when missing: Defaults to `ap-northeast-2`.

- Name: `COGNITO_USER_POOL_ID`
- Why it is needed: Verify Cognito JWT issuer and JWKS.
- Where to get it: Cognito user pool overview.
- Example format: `ap-northeast-2_xxxxxxxxx`
- Connected code/env name: `COGNITO_USER_POOL_ID`
- Current behavior when missing: Auth works only in local dev mode when `AUTH_REQUIRED=false`.

- Name: `COGNITO_APP_CLIENT_ID`
- Why it is needed: Verify that Cognito JWTs were issued for this app client.
- Where to get it: Cognito app client detail.
- Example format: `4l7lgnscgj2ekujekc19np28sm`
- Connected code/env name: `COGNITO_APP_CLIENT_ID`
- Current behavior when missing: Real JWT audience/client validation cannot be completed.

- Name: `GOOGLE_OAUTH_CLIENT_ID`
- Why it is needed: Operational reference for the Google OAuth client connected to Cognito.
- Where to get it: Google Cloud Console OAuth client.
- Example format: `xxxx.apps.googleusercontent.com`
- Connected code/env name: `GOOGLE_OAUTH_CLIENT_ID`
- Current behavior when missing: Backend still verifies Cognito JWTs, but setup documentation is incomplete.

- Name: `S3_BUCKET_NAME`
- Why it is needed: Generate presigned upload URLs and store media metadata.
- Where to get it: AWS S3 bucket console.
- Example format: `aura-mobile-media-dev`
- Connected code/env name: `S3_BUCKET_NAME`
- Current behavior when missing: `/api/media/presigned-upload` returns `S3_NOT_CONFIGURED`.

- Name: `CLOUDFRONT_DOMAIN` or `CDN_BASE_URL`
- Why it is needed: Convert uploaded S3 object keys into CDN URLs.
- Where to get it: CloudFront distribution domain or custom domain.
- Example format: `dxxxxx.cloudfront.net` or `https://cdn.example.com`
- Connected code/env name: `CLOUDFRONT_DOMAIN`, `CDN_BASE_URL`
- Current behavior when missing: Upload flow still works, but `cdnUrl` is blank until configured.

- Name: `BEDROCK_MODEL_ID`
- Why it is needed: Invoke the chosen Bedrock model for image/face analysis.
- Where to get it: AWS Bedrock model access/model catalog.
- Example format: `anthropic.claude-3-5-sonnet-20240620-v1:0`
- Connected code/env name: `BEDROCK_MODEL_ID`
- Current behavior when missing: Analysis jobs can be created as `pending`; immediate Bedrock execution returns `BEDROCK_NOT_CONFIGURED`.

- Name: `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or `AWS_USE_IAM_ROLE`
- Why it is needed: Allow AWS SDK calls for S3 and Bedrock. Local dev can use access keys; ECS should prefer task roles.
- Where to get it: IAM user access key for local dev, or ECS task role from the ECS task definition.
- Example format: access key pair, or `AWS_USE_IAM_ROLE=true` when the ECS task role is attached.
- Connected code/env name: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_USE_IAM_ROLE`, ECS task role.
- Current behavior when missing: `/api/health/config` reports `awsCredentialsOrRole` as missing; S3/Bedrock SDK calls fail unless another AWS credential provider exists.

- Name: `API_GATEWAY_URL` or `ALB_DNS`
- Why it is needed: CloudFront `/api/*` origin target.
- Where to get it: API Gateway stage URL or ALB DNS name.
- Example format: `https://abc.execute-api.ap-northeast-2.amazonaws.com` or `xxx.ap-northeast-2.elb.amazonaws.com`
- Connected code/env name: deployment/CloudFront config, mobile API base URL.
- Current behavior when missing: Local backend can run, but deployed API origin cannot be wired.

- Name: `ECS_CLUSTER_NAME`, `ECS_SERVICE_NAME`, `ECS_TASK_DEFINITION`
- Why it is needed: Deploy FastAPI container to ECS.
- Where to get it: ECS console or IaC output.
- Example format: `aura-backend-dev`, `aura-backend-api`, `aura-backend-api:1`
- Connected code/env name: deployment pipeline.
- Current behavior when missing: Docker image can be built locally, but ECS deployment is not configured.

- Name: `SECRETS_MANAGER_SECRET_NAME`
- Why it is needed: Store production secrets such as `DATABASE_URL`.
- Where to get it: AWS Secrets Manager.
- Example format: `aura/backend/dev`
- Connected code/env name: ECS task environment/secrets mapping.
- Current behavior when missing: Production secrets must be injected by another mechanism.

- Name: `CLOUDWATCH_LOG_GROUP_NAME`
- Why it is needed: Collect backend container logs and operational events.
- Where to get it: CloudWatch Logs console or ECS task logging config.
- Example format: `/ecs/aura-backend-api`
- Connected code/env name: ECS task log configuration.
- Current behavior when missing: Local logs still print to stdout, but deployed log collection is not documented.
