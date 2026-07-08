# ND Facial Hair Annotations — 데이터셋 카드

출처: [kaganozturk/Effects-of-Facial-Hair-on-Face-Recognition](https://github.com/kaganozturk/Effects-of-Facial-Hair-on-Face-Recognition) (FG 2025, arXiv 2308.15740의 출판본)
로컬: `tools/beard-simulation-lab/external/facial_hair_annotations/` (gitignored)
로더: `engine/nd_annotations.py` (+ `tests/test_nd_annotations.py`, 데이터 없으면 skip)

## 내용

- **2,350개** CelebAMask-HQ 이미지 id 폴더, 1024×1024 labelme 마스크
- 클래스 분포: **beard 1,857 / mustache 1,649 / shadow 500**
  - 논문 서술(facial hair vs five o'clock shadow)보다 세분화 — beard/mustache 분리
- 폴더 구성: `<id>_label.png`(색 인덱스 마스크), `<id>_label_viz.png`(흑백 시각화), `label_names.txt`
- **디코딩 함정**: 색→클래스 매핑이 **폴더별 서수**(label_names.txt 순서 × VOC 팔레트). 전역 매핑 아님 — 반드시 로더 경유.
- 라벨 품질: 거친 영역 폴리곤 수준 (픽셀 정밀 아님) — 우리 confidence 채널 철학과 부합

## 우리 채널 매핑

```
hard   = beard ∪ mustache      (nd_annotations.to_engine_channels)
shadow = shadow
```

## 빠진 것 / 주의

1. **원본 RGB 이미지 미포함** — viz는 흑백이라 학습용 불가. 학습하려면 [CelebAMask-HQ](https://github.com/switchablenorms/CelebAMask-HQ)를 별도 다운로드해 id로 매칭 (약 2.7GB — 디스크 여유 확인 후. 필요한 2,350장만 추출하고 zip 삭제 권장).
2. **라이선스: 비상업 연구 전용** — repo에 LICENSE 없음 + CelebA 파생. 랩 실험·평가·프로토콜 참고까지만. **제품 모델 학습에 직접 사용 금지** — 제품용은 자체 동의 데이터로.
3. shadow는 500장뿐 — shadow 채널 학습엔 소량이므로 평가셋/사전학습 보조로 보는 게 현실적.

## 용도 (승인된 계획 기준)

- C1 개선판의 **외부 평가셋**: 우리 6장 외 최초의 제3자 정답 대비 IoU 측정
- 학습 스파이크(SegFormer-B0/BiSeNet) 시 fine-tune 데이터
- 자체 라벨링 시작 시 **라벨 가이드라인의 정답지** (beard/mustache/shadow 구분 기준)
