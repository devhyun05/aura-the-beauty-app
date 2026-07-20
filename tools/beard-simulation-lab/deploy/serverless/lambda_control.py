"""수염 제거 시뮬 제어 Lambda (Function URL 뒤에 배치).

저빈도·띄엄띄엄 트래픽을 위한 scale-to-zero 오케스트레이터.
요청이 오면 정지된 GPU 인스턴스를 깨우고, SSM으로 추론을 실행하고,
결과를 S3 프리사인 URL로 돌려준다. 유휴 시 stop은 idle_stop Lambda가 담당.

액션(JSON body의 "action" 필드로 라우팅):
  upload_url : 앱이 셀피를 올릴 S3 프리사인 PUT URL 발급
  prewarm    : 인스턴스 start만 미리 발사(사용자가 설문 쓰는 동안 워밍)
  status     : 인스턴스 상태 + SSM 온라인 여부(앱이 준비됐는지 폴링용)
  simulate   : 준비됐으면 SSM으로 추론 명령 발사 → commandId 반환(비블로킹)
  result     : commandId로 추론 진행상태 조회, 완료 시 결과 프리사인 GET URL

환경변수: REGION, INSTANCE_ID, BUCKET, RUN_SCRIPT_KEY(기본 scripts/run_on_instance.sh)
"""
import json
import os
import time

import boto3

REGION = os.environ["REGION"]
INSTANCE_ID = os.environ["INSTANCE_ID"]
BUCKET = os.environ["BUCKET"]
RUN_SCRIPT_KEY = os.environ.get("RUN_SCRIPT_KEY", "scripts/run_on_instance.sh")
IDLE_TAG = "LastActivity"

ec2 = boto3.client("ec2", region_name=REGION)
ssm = boto3.client("ssm", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


def _state():
    r = ec2.describe_instances(InstanceIds=[INSTANCE_ID])
    return r["Reservations"][0]["Instances"][0]["State"]["Name"]


def _touch():
    """마지막 활동 시각을 인스턴스 태그에 기록(유휴 종료 판정 기준)."""
    ec2.create_tags(
        Resources=[INSTANCE_ID],
        Tags=[{"Key": IDLE_TAG, "Value": str(int(time.time()))}],
    )


def _ssm_online():
    r = ssm.describe_instance_information(
        Filters=[{"Key": "InstanceIds", "Values": [INSTANCE_ID]}]
    )
    infos = r.get("InstanceInformationList", [])
    return bool(infos) and infos[0].get("PingStatus") == "Online"


def _start_if_needed():
    st = _state()
    if st == "stopped":
        ec2.start_instances(InstanceIds=[INSTANCE_ID])
        return "starting"
    return st


def _resp(code, body):
    return {
        "statusCode": code,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }


def handler(event, context):
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except (ValueError, TypeError):
            body = {}
    qs = event.get("queryStringParameters") or {}
    action = body.get("action") or qs.get("action") or "status"

    if action == "status":
        return _resp(200, {"instanceState": _state(), "ssmOnline": _ssm_online()})

    if action == "upload_url":
        name = body.get("name", "selfie")
        key = f"inputs/{name}-{int(time.time())}.jpg"
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET, "Key": key, "ContentType": "image/jpeg"},
            ExpiresIn=900,
        )
        return _resp(200, {"uploadUrl": url, "inputKey": key})

    if action == "prewarm":
        _touch()
        st = _start_if_needed()
        ready = st == "running"
        return _resp(
            200,
            {"status": "ready" if ready else "warming", "instanceState": _state()},
        )

    if action == "simulate":
        input_key = body.get("inputKey")
        if not input_key:
            return _resp(400, {"error": "inputKey required (upload_url로 먼저 업로드)"})
        _touch()
        # 비블로킹: 준비 안 됐으면 start만 걸고 warming 반환. 앱이 status로 폴링 후 재시도.
        if not (_state() == "running" and _ssm_online()):
            _start_if_needed()
            return _resp(
                202,
                {
                    "status": "warming",
                    "instanceState": _state(),
                    "hint": "status가 ssmOnline=true가 되면 simulate 재호출",
                },
            )

        output_key = body.get("outputKey") or (
            input_key.replace("inputs/", "outputs/").rsplit(".", 1)[0] + "-out.png"
        )
        cmd = (
            "set -e; cd /home/ubuntu; "
            f"aws s3 cp s3://{BUCKET}/{RUN_SCRIPT_KEY} /home/ubuntu/run_on_instance.sh; "
            "chmod +x /home/ubuntu/run_on_instance.sh; "
            f"BUCKET={BUCKET} INPUT_KEY={input_key} OUTPUT_KEY={output_key} "
            "bash /home/ubuntu/run_on_instance.sh"
        )
        send = ssm.send_command(
            InstanceIds=[INSTANCE_ID],
            DocumentName="AWS-RunShellScript",
            Parameters={"commands": [cmd], "executionTimeout": ["1800"]},
            TimeoutSeconds=120,
        )
        return _resp(
            202,
            {
                "status": "processing",
                "commandId": send["Command"]["CommandId"],
                "outputKey": output_key,
            },
        )

    if action == "result":
        cmd_id = body.get("commandId")
        output_key = body.get("outputKey")
        if not cmd_id:
            return _resp(400, {"error": "commandId required"})
        _touch()  # 결과 폴링 중엔 유휴로 간주하지 않도록 활동 갱신
        try:
            inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=INSTANCE_ID)
        except ssm.exceptions.InvocationDoesNotExist:
            return _resp(200, {"status": "Pending"})
        status = inv["Status"]  # Pending|InProgress|Delayed|Success|Failed|Cancelled|TimedOut
        out = {"status": status}
        if status == "Success" and output_key:
            out["resultUrl"] = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": BUCKET, "Key": output_key},
                ExpiresIn=3600,
            )
        elif status in ("Failed", "Cancelled", "TimedOut"):
            out["stderr"] = (inv.get("StandardErrorContent", "") or "")[-1500:]
        return _resp(200, out)

    return _resp(400, {"error": f"unknown action: {action}"})
