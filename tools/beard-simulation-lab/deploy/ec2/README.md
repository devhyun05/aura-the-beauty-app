# FLUX.1 Kontext dev — EC2 배포 (수염 제거 시뮬)

주력 모델 **FLUX.1 Kontext [dev]**(12B, 비상업 라이선스)를 온디바이스가 아닌 서버(EC2 GPU)에 올려 제로샷 추론하는 발사 키트.

## 파일
- `launch.sh` — GPU 인스턴스 발사(run-instances → 공인 IP 출력). 쿼터 승인 후 실행.
- `setup_ec2.sh` — 인스턴스 접속 후: diffusers 설치 + `huggingface-cli login`(hf_ 토큰) + 모델 다운로드(~50GB).
- `run_kontext.py` — 추론. 확정 프롬프트(v2) 하드코딩 + 출력물을 원본 크기로 되돌리는 보정 포함.

## 사전 세팅 (완료됨, 2026-07-18)
- AWS 접속: SSO 프로필 `flux`(계정 779035456338, 역할 GPUDeveloper). `export AWS_PROFILE=flux`, 만료 시 `aws sso login --profile flux`. SSO 리전은 **us-east-1**(인스턴스 리전 us-west-2와 별개).
- 키페어 `flux-kontext` → `~/.ssh/flux-kontext.pem`. 보안그룹 `sg-04b4b4ae28eef670a`(SSH 22 ← 내 IP만; IP 바뀌면 재허용 필요).
- AMI `ami-064e93d32f5f2d5d1`(Deep Learning OSS Nvidia PyTorch 2.11, Ubuntu 24.04, us-west-2). 인스턴스 g6e.xlarge(L40S 48GB), 루트 gp3 200GB.
- **GPU 쿼터**: 신규 계정 기본 0 → us-west-2 On-Demand G/VT 8 vCPU 증설 신청(2026-07-18, PENDING). 승인 전엔 발사 불가.

## 순서 (쿼터 승인 후)
```bash
export AWS_PROFILE=flux
bash launch.sh                                   # → 인스턴스ID·공인IP 출력
ssh -i ~/.ssh/flux-kontext.pem ubuntu@<IP>
bash setup_ec2.sh                                # 토큰 입력 + 모델 다운로드
python run_kontext.py 셀피.jpg 결과.png
```
비용: g6e.xlarge는 켠 시간만 과금(≈$1.8+/hr) → 유휴 시 `stop`(디스크·모델 보존), `terminate`는 전부 삭제.
