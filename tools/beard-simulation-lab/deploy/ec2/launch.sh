#!/bin/bash
# FLUX.1 Kontext dev — EC2 GPU 인스턴스 발사. 쿼터 승인(G/VT 8 vCPU) 후 실행.
# 사용: AWS_PROFILE=flux bash launch.sh
set -euo pipefail
export AWS_PROFILE=flux
REGION=us-west-2

AMI=ami-064e93d32f5f2d5d1          # Deep Learning OSS Nvidia PyTorch 2.11 (Ubuntu 24.04)
TYPE=g6e.xlarge                    # 1x L40S 48GB, 4 vCPU  (8 vCPU 쿼터면 g6e.2xlarge도 가능)
KEY=flux-kontext
SG=sg-04b4b4ae28eef670a
DISK=200                           # GB, gp3 (DLAMI 루트 ~100GB + 모델 ~50GB + 여유)

echo "런치 중: $TYPE / $AMI ..."
IID=$(aws ec2 run-instances --region $REGION --no-cli-pager \
  --image-id $AMI --instance-type $TYPE --key-name $KEY --security-group-ids $SG \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$DISK,VolumeType=gp3,DeleteOnTermination=true}" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=flux-kontext}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "인스턴스: $IID  (부팅 대기...)"
aws ec2 wait instance-running --instance-ids $IID --region $REGION
IP=$(aws ec2 describe-instances --instance-ids $IID --region $REGION --no-cli-pager \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo ""
echo "=== 준비 완료 ==="
echo "인스턴스ID: $IID"
echo "공인IP    : $IP"
echo "SSH       : ssh -i ~/.ssh/flux-kontext.pem ubuntu@$IP"
echo ""
echo "중지(과금정지): aws ec2 stop-instances --instance-ids $IID --region $REGION"
echo "완전삭제      : aws ec2 terminate-instances --instance-ids $IID --region $REGION"
