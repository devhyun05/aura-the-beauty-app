"""유휴 자동 정지 Lambda (EventBridge 스케줄로 5분마다 호출).

인스턴스가 running이고 마지막 활동(LastActivity 태그) 후 IDLE_MINUTES가
지났으면 stop한다. 결과 폴링 중에는 control Lambda가 태그를 갱신하므로
처리 중 인스턴스는 정지되지 않는다.

환경변수: REGION, INSTANCE_ID, IDLE_MINUTES(기본 15)
"""
import os
import time

import boto3

REGION = os.environ["REGION"]
INSTANCE_ID = os.environ["INSTANCE_ID"]
IDLE_MINUTES = int(os.environ.get("IDLE_MINUTES", "15"))
IDLE_TAG = "LastActivity"

ec2 = boto3.client("ec2", region_name=REGION)


def handler(event, context):
    r = ec2.describe_instances(InstanceIds=[INSTANCE_ID])
    inst = r["Reservations"][0]["Instances"][0]
    state = inst["State"]["Name"]
    if state != "running":
        return {"action": "noop", "state": state}

    tags = {t["Key"]: t["Value"] for t in inst.get("Tags", [])}
    last = int(tags.get(IDLE_TAG, "0"))
    idle_s = time.time() - last

    if idle_s > IDLE_MINUTES * 60:
        ec2.stop_instances(InstanceIds=[INSTANCE_ID])
        return {"action": "stopped", "idleSeconds": int(idle_s)}
    return {"action": "keep", "idleSeconds": int(idle_s), "thresholdSeconds": IDLE_MINUTES * 60}
