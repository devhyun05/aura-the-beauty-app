#!/bin/bash
# 수염 제거 시뮬 — scale-to-zero 서버리스 스택 배포 (재실행 안전/idempotent).
# S3 + IAM(인스턴스 프로파일·Lambda 역할) + Lambda 2종 + Function URL + 유휴 점검 스케줄.
# GPU 인스턴스는 stopped 유지 → 이 배포 자체엔 GPU 과금 없음.
# 사용: bash deploy.sh
set -uo pipefail
# 관리자 프로파일로 실행: AWS_PROFILE=<admin> bash deploy.sh  (미지정 시 flux)
export AWS_PROFILE="${AWS_PROFILE:-flux}"
export AWS_DEFAULT_REGION=us-west-2
REGION=us-west-2
INSTANCE_ID=i-03c5bb72127da5642
IDLE_MINUTES=15
HERE="$(cd "$(dirname "$0")" && pwd)"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="flux-kontext-beard-${ACCOUNT}"
INSTANCE_ROLE=flux-kontext-instance-role
INSTANCE_PROFILE=flux-kontext-instance-profile
LAMBDA_ROLE=flux-kontext-lambda-role
CONTROL_FN=beard-sim-control
IDLE_FN=beard-sim-idle-stop
RULE=beard-sim-idle-check

echo "== 계정 $ACCOUNT / 리전 $REGION / 버킷 $BUCKET =="

# 1) S3 버킷 -----------------------------------------------------------------
aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null || \
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
echo "[1/7] S3 버킷 준비: $BUCKET"

# 2) 스크립트 업로드 (인스턴스가 실행 시점에 S3에서 fetch) -------------------
aws s3 cp "$HERE/run_on_instance.sh" "s3://$BUCKET/scripts/run_on_instance.sh" >/dev/null
aws s3 cp "$HERE/../ec2/run_kontext.py" "s3://$BUCKET/scripts/run_kontext.py" >/dev/null
echo "[2/7] 스크립트 업로드: scripts/run_on_instance.sh, scripts/run_kontext.py"

# 3) 인스턴스 IAM 역할 + 프로파일 (SSM 코어 + S3) ----------------------------
aws iam get-role --role-name "$INSTANCE_ROLE" >/dev/null 2>&1 || \
  aws iam create-role --role-name "$INSTANCE_ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
aws iam attach-role-policy --role-name "$INSTANCE_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore >/dev/null 2>&1 || true
sed "s/__BUCKET__/$BUCKET/g" "$HERE/iam/instance-policy.json" > /tmp/inst-pol.json
aws iam put-role-policy --role-name "$INSTANCE_ROLE" --policy-name s3-images \
  --policy-document file:///tmp/inst-pol.json >/dev/null
aws iam get-instance-profile --instance-profile-name "$INSTANCE_PROFILE" >/dev/null 2>&1 || \
  aws iam create-instance-profile --instance-profile-name "$INSTANCE_PROFILE" >/dev/null
aws iam add-role-to-instance-profile --instance-profile-name "$INSTANCE_PROFILE" \
  --role-name "$INSTANCE_ROLE" >/dev/null 2>&1 || true
echo "[3/7] 인스턴스 역할/프로파일 준비 (프로파일 전파 대기...)"
sleep 8

# 3b) 인스턴스에 프로파일 부착 (미부착 시에만) --------------------------------
ASSOC=$(aws ec2 describe-iam-instance-profile-associations \
  --filters "Name=instance-id,Values=$INSTANCE_ID" \
  --query 'IamInstanceProfileAssociations[?State==`associated` || State==`associating`].AssociationId' \
  --output text)
if [ -z "$ASSOC" ]; then
  aws ec2 associate-iam-instance-profile --instance-id "$INSTANCE_ID" \
    --iam-instance-profile Name="$INSTANCE_PROFILE" >/dev/null && echo "      → 인스턴스에 프로파일 부착 완료"
else
  echo "      → 인스턴스에 이미 프로파일 부착됨"
fi

# 4) Lambda 실행 역할 --------------------------------------------------------
aws iam get-role --role-name "$LAMBDA_ROLE" >/dev/null 2>&1 || \
  aws iam create-role --role-name "$LAMBDA_ROLE" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
aws iam attach-role-policy --role-name "$LAMBDA_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null 2>&1 || true
sed -e "s/__BUCKET__/$BUCKET/g" -e "s/__ACCOUNT__/$ACCOUNT/g" \
    -e "s/__REGION__/$REGION/g" -e "s/__INSTANCE_ID__/$INSTANCE_ID/g" \
  "$HERE/iam/lambda-policy.json" > /tmp/lam-pol.json
aws iam put-role-policy --role-name "$LAMBDA_ROLE" --policy-name control-policy \
  --policy-document file:///tmp/lam-pol.json >/dev/null
LAMBDA_ROLE_ARN=$(aws iam get-role --role-name "$LAMBDA_ROLE" --query Role.Arn --output text)
echo "[4/7] Lambda 역할 준비: $LAMBDA_ROLE_ARN (역할 전파 대기...)"
sleep 10

# 5) 패키징 + Lambda 생성/갱신 -----------------------------------------------
cd "$HERE"
zip -j /tmp/control.zip lambda_control.py >/dev/null
zip -j /tmp/idle.zip lambda_idle_stop.py >/dev/null

create_or_update_fn() {
  local NAME="$1" HANDLER="$2" ZIP="$3" ENVVARS="$4" TIMEOUT="$5"
  if aws lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$NAME" --zip-file "fileb://$ZIP" >/dev/null
    aws lambda wait function-updated --function-name "$NAME" 2>/dev/null || true
    aws lambda update-function-configuration --function-name "$NAME" \
      --handler "$HANDLER" --timeout "$TIMEOUT" --environment "$ENVVARS" >/dev/null
  else
    local n=0
    until aws lambda create-function --function-name "$NAME" \
        --runtime python3.12 --role "$LAMBDA_ROLE_ARN" --handler "$HANDLER" \
        --zip-file "fileb://$ZIP" --timeout "$TIMEOUT" --environment "$ENVVARS" >/dev/null 2>&1; do
      n=$((n+1)); [ $n -ge 6 ] && { echo "      create-function $NAME 실패"; return 1; }
      echo "      ...역할 전파 대기 재시도 $n"; sleep 5
    done
  fi
  aws lambda wait function-active-v2 --function-name "$NAME" 2>/dev/null || true
  echo "      → Lambda 준비: $NAME"
}

echo "[5/7] Lambda 패키징 + 배포"
create_or_update_fn "$CONTROL_FN" lambda_control.handler /tmp/control.zip \
  "Variables={REGION=$REGION,INSTANCE_ID=$INSTANCE_ID,BUCKET=$BUCKET}" 30
create_or_update_fn "$IDLE_FN" lambda_idle_stop.handler /tmp/idle.zip \
  "Variables={REGION=$REGION,INSTANCE_ID=$INSTANCE_ID,IDLE_MINUTES=$IDLE_MINUTES}" 30

# 6) Function URL (control) — AWS_IAM 인증 (백엔드에서 SigV4로 호출) ----------
aws lambda get-function-url-config --function-name "$CONTROL_FN" >/dev/null 2>&1 || \
  aws lambda create-function-url-config --function-name "$CONTROL_FN" --auth-type AWS_IAM >/dev/null
FN_URL=$(aws lambda get-function-url-config --function-name "$CONTROL_FN" --query FunctionUrl --output text)
echo "[6/7] Control Function URL: $FN_URL"

# 7) EventBridge 스케줄 → 유휴 점검 Lambda (5분마다) --------------------------
aws events put-rule --name "$RULE" --schedule-expression "rate(5 minutes)" >/dev/null
IDLE_ARN=$(aws lambda get-function --function-name "$IDLE_FN" --query Configuration.FunctionArn --output text)
aws lambda add-permission --function-name "$IDLE_FN" --statement-id events-invoke \
  --action lambda:InvokeFunction --principal events.amazonaws.com \
  --source-arn "arn:aws:events:$REGION:$ACCOUNT:rule/$RULE" >/dev/null 2>&1 || true
aws events put-targets --rule "$RULE" --targets "Id=idle,Arn=$IDLE_ARN" >/dev/null
echo "[7/7] 유휴 점검 스케줄 준비: $RULE (5분마다, 유휴 ${IDLE_MINUTES}분 시 stop)"

echo ""
echo "========== 배포 완료 =========="
echo "Function URL : $FN_URL"
echo "  (AWS_IAM 인증 — services/backend에서 SigV4로 호출, 또는 테스트는 aws lambda invoke)"
echo "버킷         : s3://$BUCKET"
echo "유휴 종료     : ${IDLE_MINUTES}분  (idle_stop 5분 주기 점검)"
echo "인스턴스      : $INSTANCE_ID (stopped 유지 중 — 요청 시 자동 start)"
