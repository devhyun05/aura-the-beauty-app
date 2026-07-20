# beard-simulation-lab

수염 레이저 제모 시뮬레이션 — 로컬 실험/튜닝 랩. 결정론 경로(색 보정 + frequency
separation + 제한적 inpaint)만 구현하며, diffusion 계열은 defer 상태다.
계약의 원본은 `apps/mobile/src/features/beard-simulation/contracts/`
(Python 미러: `engine/contracts.py`, 공유 fixture로 양쪽 검증).

**사진 정책**: `samples/`, `outputs/`는 gitignore됨. 동의받은 사진만 사용 —
[docs/beard-simulation/DATA_POLICY_KO.md](../../docs/beard-simulation/DATA_POLICY_KO.md).

## 셋업

```bash
python3.12 -m venv .venv          # mediapipe wheel 때문에 3.12 고정
.venv/bin/pip install -r requirements.txt
# 선택(스파이크 C2/C3, identity guard): requirements-extras.txt 참고
```

## 실행 순서 (계획 게이트 순)

```bash
# 게이트 ①: segmentation 스파이크 — samples/에 실사진 넣고
.venv/bin/python spike/run_spike.py                # C1만 (결정론)
.venv/bin/python spike/run_spike.py --with-c2 --with-c3   # extras 필요
# → outputs/spike/spike_grid.png 를 눈으로 판정 (침범/커버리지/피부톤/속도)

# 단일 사진 파이프라인
.venv/bin/python cli.py samples/me.jpg
.venv/bin/python cli.py samples/me.jpg --stages strong --shaving-state clean

# 게이트 ②: 배치 + 튜닝 (HTML 그리드가 주력 튜닝 도구)
.venv/bin/python batch/run_batch.py
# → outputs/batch/<ts>/report.html + summary.json + review_sheet.csv

# 웹 UI (브라우저에서 직접 사진 넣고 확인 + 슬라이더 튜닝, localhost 전용)
.venv/bin/python app.py           # 127.0.0.1:7860 자동 열림
#   탭1 "3단계 미리보기": 실제 파이프라인 그대로 mild/medium/strong
#   탭2 "파라미터 튜닝": 슬라이더로 shadow/hair 강도 실시간 조절

# dev API (RN 연결용, localhost 전용)
.venv/bin/python server.py        # 127.0.0.1:8765

# 테스트 (실사진 불필요 — guard 합성 케이스 포함)
.venv/bin/python -m pytest -q
```

## 구조

```
engine/
  contracts.py             # TS 계약 미러 + 검증기
  detect_face.py           # FaceMesh + 품질 게이트
  lower_face_roi.py        # LowerFaceCrop — 보정 함수는 이 타입만 받음
                           #   (full-face img2img 구조적 금지)
  beard_segmentation.py    # C1: black-hat(hard) + 본인피부 GMM(shadow), C2 prior
  beard_shadow_corrector.py# frequency separation 보정
  blend.py                 # soft_blend 파생 + 재합성 (마스크 밖 = 원본 그대로)
  geometry_guard.py        # protect 교차(사전) / drift / jaw IoU / seam / identity
  pipeline.py              # 오케스트레이션 + §8.4 완화 사다리 + run 산출물
configs/                   # mild/medium/strong 프리셋 (튜닝 대상)
spike/run_spike.py         # 게이트 ① 판정 그리드
batch/run_batch.py         # 게이트 ② 튜닝 리포트
server.py                  # RN dev 연결용 FastAPI
```

## 튜닝 규율

1. shadow_strength 3단계를 먼저 수렴시킨다 (hair_attenuation 고정).
2. 그 다음 hair_attenuation. 두 축 동시 튜닝 금지.
3. strong이 "방금 면도한 얼굴"처럼 보이면 실패 — 잔여 질감이 남아야 한다
   (MAX_HIGH_ATTENUATION 0.85가 그 가드레일).

## 수용 기준 (게이트 ②, 30장)

- guard 통과율 ≥90% (사전 reject 제외) / identity 거리 임계 이하 100%
  (acceptance 런은 configs guard.identity_check: require + extras 설치)
- 블라인드 리뷰: "본인 맞음" ≥95%, "제모된 느낌" 과반
- 어두운 피부톤 서브셋에서 유의한 열화 없음
