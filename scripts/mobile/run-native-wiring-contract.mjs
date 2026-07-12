// 네이티브·서비스 "기능 배선" 계약 가드.
//
// 도입 배경: 020cb33 이 CocoaPods MediaPipe 를 제거하면서 퍼스널컬러·얼굴비율
// 분석기를 "컴파일은 되지만 런타임에 무조건 reject 하는 껍데기"로 만들어 머지했고,
// CI 는 ObjC 를 컴파일하지 않아 이를 잡지 못했다. protected-paths-guard 의
// 불변식(대량삭제·pod 삭제·#if 금지)이 구조적 퇴화를 막고, 이 스크립트는 그
// 반대편 — "핵심 심볼과 배선이 존재하는가" — 를 심볼 수준에서 지킨다.
//
// 검사 원칙:
// - 존재해야 하는 것(export 모듈/메서드, 랜드마크 적재, 게이트·보정 배선)과
//   존재하면 안 되는 것(020cb33 스텁 마커)을 함께 본다.
// - import 만이 아니라 호출부까지 확인한다 — import 를 남긴 채 호출만 지우는
//   퇴화도 잡기 위함.
// - 새 기능이 머지되면 여기에 배선 검사를 함께 추가한다 (예: 조명 보정 포팅 시
//   illuminationCorrection import/호출 + 네이티브 sclera 심볼).

import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

let failures = 0;

function fail(message) {
  console.error(`[aura:native-wiring] FAIL ${message}`);
  failures += 1;
}

// 주석을 제거한다 — "배선을 주석 처리했는데 문자열이 주석에 남아 가드를
// 통과"하는 우회를 막는다(020cb33 류 조용한 무력화의 흔한 형태). 문자열
// 리터럴 안의 // 는 드물게 오탐할 수 있으나, 이 가드가 찾는 import/호출
// 패턴은 문자열 리터럴에 나타나지 않으므로 안전하다.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // 블록 주석 (ObjC/TS 공통)
    .replace(/^\s*\/\/.*$/gm, ' ') // 전체 줄 라인 주석
    .replace(/\/\/[^\n]*/g, ' '); // 줄 끝 라인 주석
}

function readSource(relativePath) {
  return stripComments(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

function assertContains(source, needle, label) {
  const found = needle instanceof RegExp ? needle.test(source) : source.includes(needle);
  if (!found) {
    fail(label);
  }
}

function assertNotContains(source, needle, label) {
  if (source.includes(needle)) {
    fail(label);
  }
}

// ── 1. 퍼스널컬러 정지영상 분석기 (ObjC) ────────────────────────────────
{
  const path = 'apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m';
  const src = readSource(path);
  assertContains(src, 'RCT_EXPORT_MODULE()', `${path}: RCT_EXPORT_MODULE 이 없다 — RN 모듈 등록이 사라짐`);
  assertContains(src, /RCT_EXPORT_METHOD\(analyze:/, `${path}: analyze 메서드 export 가 없다`);
  assertContains(src, 'AURAPCLandmarkSetFromJS', `${path}: homuler 랜드마크 적재 함수(AURAPCLandmarkSetFromJS 정의)가 없다`);
  // 정의 존재만이 아니라 실제 '적재 호출'을 검증한다 — 정의는 남기고 대입을
  // `= {0}` 등으로 바꾸면 모든 입력이 런타임 no_face 가 되는데(코덱스 재현),
  // 문자열 존재 검사만으로는 그 퇴화를 못 잡는다.
  assertContains(src, /=\s*AURAPCLandmarkSetFromJS\(/, `${path}: homuler 랜드마크 적재 호출(= AURAPCLandmarkSetFromJS(...))이 없다 — 얼굴 검출이 죽어 항상 no_face`);
  assertContains(src, /static AURAPCPoint AURAPCLandmark\(/, `${path}: 랜드마크 접근자(AURAPCLandmark)가 없다`);
  assertContains(src, /AURAPCLandmark\(landmarks/, `${path}: 적재된 랜드마크(landmarks)를 실제로 샘플링하는 호출이 없다`);
  assertNotContains(src, 'MEDIAPIPE_UNAVAILABLE', `${path}: 020cb33 스텁 마커(MEDIAPIPE_UNAVAILABLE)가 재유입됐다 — 분석기가 무조건 reject 하는 껍데기일 수 있음`);
}

// ── 2. 얼굴비율 정지영상 분석기 (ObjC) ─────────────────────────────────
{
  const path = 'apps/mobile/ios/AURA/AURAFaceRatioAnalyzer.m';
  const src = readSource(path);
  assertContains(src, 'RCT_EXPORT_MODULE()', `${path}: RCT_EXPORT_MODULE 이 없다 — RN 모듈 등록이 사라짐`);
  assertContains(src, /RCT_EXPORT_METHOD\(analyze:/, `${path}: analyze 메서드 export 가 없다`);
  // 실제 homuler 랜드마크 변환 호출 검증 — 정의만 남기고 호출을 끊는 퇴화 차단.
  assertContains(src, /=\s*AURAFaceRatioLandmarksFromJS\(/, `${path}: homuler 랜드마크 변환 호출(= AURAFaceRatioLandmarksFromJS(...))이 없다`);
  assertNotContains(src, 'MEDIAPIPE_UNAVAILABLE', `${path}: 020cb33 스텁 마커(MEDIAPIPE_UNAVAILABLE)가 재유입됐다`);
}

// ── 3. 얼굴 세로비율 서비스 배선 (TS) ──────────────────────────────────
// 롤 보정과 품질 게이트가 보고서 흐름에서 빠지면 "왜곡된 비율이 조용히 노출"된다.
{
  const path = 'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts';
  const src = readSource(path);
  assertContains(src, "from './faceVerticalThirdsQualityGate'", `${path}: 품질 게이트 import 가 없다`);
  assertContains(src, /evaluateFaceVerticalThirdsQuality\(/, `${path}: 품질 게이트 호출부가 없다`);
  assertContains(src, "from './faceVerticalThirdsRollCorrection'", `${path}: 롤 보정 import 가 없다`);
  assertContains(src, /applyRollCorrectionToKeypoints\(/, `${path}: 롤 보정 호출부가 없다`);
  assertContains(src, /requestFaceLandmarks\(/, `${path}: homuler 랜드마크 요청 호출부가 없다 — 얼굴 검출 없이 분석기가 no_face 로 죽는다`);
}

// ── 4. 퍼스널컬러 서비스 배선 (TS) ─────────────────────────────────────
{
  const path = 'apps/mobile/src/features/personal-color/services/personalColorService.ts';
  const src = readSource(path);
  assertContains(src, "from './personalColorQualityGate'", `${path}: 품질 게이트 import 가 없다`);
  assertContains(src, /evaluatePersonalColorQuality\(/, `${path}: 품질 게이트 호출부가 없다`);
  assertContains(src, "from './personalColorAnalyzerNative'", `${path}: 네이티브 분석기 import 가 없다`);
  assertContains(src, /analyzePersonalColorPhoto\(/, `${path}: 네이티브 분석기 호출부가 없다`);
  assertContains(src, /requestFaceLandmarks\(/, `${path}: homuler 랜드마크 요청 호출부가 없다`);
}

if (failures > 0) {
  console.error(`[aura:native-wiring] ${failures}건 실패 — 기능 배선이 끊겼습니다. 020cb33 류 회귀인지 확인하세요.`);
  process.exit(1);
}

console.log('[aura:native-wiring] PASS — 분석기 심볼·서비스 배선 전부 확인');
