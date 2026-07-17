# 얼굴 보고서 P4 — 인상 좌표 맵 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가짜 "시선이 머무는 순서"(고정 좌표 2점) 제거하고, **2D 인상 좌표 맵**으로 대체 — LLM이 판단한 인상을 2축 위 한 점으로 보여주고, 사용자가 목표 점을 **드래그**하며 탐색하는 도움+즐거운 인터랙션(발견 3.1).

**Architecture:** Bedrock `analyze_text`의 `impressionNotes`에 `axes`(2축 {key,leftLabel,rightLabel,value −1..1}) 출력을 추가(P2와 동일 Path A). 파서·타입·어댑터가 축을 나른다(구버전/부재는 중립 기본축으로 폴백). S6은 `GazeReplay`(gaze 다이어그램) 대신 새 `ImpressionMap`(2D 드래그 패드)을 렌더한다. keywords·paragraph는 유지.

**Tech Stack:** Python/pytest(백엔드), RN+TS(모바일), reanimated/gesture로 드래그. 백엔드 테스트 `cd services/backend && python3 -m pytest tests/<file> -q`; 모바일 `npm run typecheck`.

## Global Constraints

- **정직성:** 맵의 현재 위치·축 값은 **AI 판단**(라벨 "AI가 본 인상"). 측정으로 위장 금지. 드래그로 이동하는 "목표" 점과 힌트는 사용자 탐색·AI 제안이지 측정이 아님. 숫자(축 value −1..1)는 화면에 노출하지 않고 위치로만 표현.
- **하위호환/부재=숨김:** 백엔드는 항상 axes 2개 반환(부재/모델 누락 시 value 0 중립 + 기본 라벨). 파서·어댑터도 축 부재 시 기본 중립축으로 폴백해 맵이 깨지지 않게. gaze 관련 필드(rings/markers/…)는 완전 제거.
- **범위:** P4는 인상(S6)만. regionNotes/stylingLooks/S3 크롭 등은 변경 없음.
- **커밋:** 서브에이전트 코드+테스트만, git 금지. 컨트롤러 경로 지정 커밋, **푸시 없음**.
- **디자인 토큰:** ImpressionMap은 reportTokens color/font/radius만.
- **검증:** 백엔드 pytest; 모바일 typecheck. 맵 인터랙션 시각은 실기기.

---

## File Structure

- **Modify** `services/backend/app/services/openai_analysis.py` — `_ensure_impression_notes`(axes 정규화) + prompt + `ANALYSIS_OUTPUT_FIELD_GUIDE`.
- **Create** `services/backend/tests/test_impression_axes.py` — 정규화 pytest.
- **Modify** `apps/mobile/src/shared/types/faceAnalysis.ts` — `FaceAnalysisImpressionNotes.axes`.
- **Modify** `apps/mobile/src/shared/services/faceAnalysisService.ts` — `BackendImpressionNotes.axes` + `parseImpressionNotes` axes 파싱.
- **Modify** `apps/mobile/src/features/face-report/reportTypes.ts` — `S6Data`: gaze 필드 제거, `axes` 추가.
- **Modify** `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS6` axes emit(gaze 제거).
- **Create** `apps/mobile/src/features/face-report/visuals/ImpressionMap.tsx` — 2D 드래그 맵.
- **Modify** `apps/mobile/src/features/face-report/sections/S6Impression.tsx` — GazeReplay → ImpressionMap.
- **Delete (사용처 제거 후)** `apps/mobile/src/features/face-report/visuals/GazeReplay.tsx` — (FACE_PATH/FACE_W/FACE_H 타 사용처 grep 확인 후).

---

## Task 1: 백엔드 — impression axes 출력 + 정규화 (Python TDD)

**Files:**
- Create: `services/backend/tests/test_impression_axes.py`
- Modify: `services/backend/app/services/openai_analysis.py` — `_ensure_impression_notes`(~:1678), `ANALYSIS_OUTPUT_FIELD_GUIDE`(~:742), `_build_analysis_prompt` impressionNotes 지시(~:1362)

**Interfaces:**
- Produces: `_ensure_impression_notes(result)`가 `axes: [{key,leftLabel,rightLabel,value}]` 2개 포함(value는 −1..1 clamp). 부재/불량 시 기본 중립 2축.

- [ ] **Step 1: 실패 테스트**

Create `services/backend/tests/test_impression_axes.py`:

```python
from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService


def _service():
    return OpenAIAnalysisService(Settings())


def test_axes_passthrough_and_clamp():
    service = _service()
    out = service._ensure_impression_notes(
        {
            "impressionNotes": {
                "overallMood": "청량한 젠틀",
                "keywords": ["청량", "단정"],
                "paragraph": "전체적으로 부드럽고 단정한 인상.",
                "axes": [
                    {"key": "softness", "leftLabel": "부드러움", "rightLabel": "또렷함", "value": 1.9},
                    {"key": "vividness", "leftLabel": "차분함", "rightLabel": "화사함", "value": -0.3},
                ],
            }
        }
    )
    assert len(out["axes"]) == 2
    assert out["axes"][0]["value"] == 1.0  # clamp
    assert out["axes"][0]["leftLabel"] == "부드러움"
    assert out["axes"][1]["value"] == -0.3


def test_axes_default_when_missing():
    service = _service()
    out = service._ensure_impression_notes({"recommendedMood": "은은한 무드"})
    assert len(out["axes"]) == 2
    for ax in out["axes"]:
        assert set(ax.keys()) == {"key", "leftLabel", "rightLabel", "value"}
        assert ax["value"] == 0.0
        assert ax["leftLabel"] and ax["rightLabel"]
    # 기존 필드 유지
    assert out["overallMood"] and out["keywords"] and out["paragraph"]
```

- [ ] **Step 2: 실패 확인**

Run: `cd services/backend && python3 -m pytest tests/test_impression_axes.py -q`
Expected: FAIL — `out["axes"]` KeyError(현재 반환에 axes 없음).

- [ ] **Step 3: 구현 — 정규화 헬퍼 + _ensure_impression_notes 확장**

Modify `services/backend/app/services/openai_analysis.py`:

(a) 모듈 상수 추가(`ANALYSIS_OUTPUT_FIELD_GUIDE` 근처):
```python
DEFAULT_IMPRESSION_AXES = (
  {"key": "softness", "leftLabel": "부드러움", "rightLabel": "또렷함", "value": 0.0},
  {"key": "vividness", "leftLabel": "차분함", "rightLabel": "화사함", "value": 0.0},
)
```

(b) `_ensure_impression_notes`의 `return {...}`에 axes 추가(기존 overallMood/keywords/paragraph 유지):
```python
    raw_axes = normalized_notes.get("axes")
    axes = []
    for i, default in enumerate(DEFAULT_IMPRESSION_AXES):
      raw = raw_axes[i] if isinstance(raw_axes, list) and i < len(raw_axes) and isinstance(raw_axes[i], dict) else {}
      value = raw.get("value")
      value = float(value) if isinstance(value, (int, float)) else 0.0
      axes.append({
        "key": self._first_normalized_text(raw.get("key"), default["key"]),
        "leftLabel": self._first_normalized_text(raw.get("leftLabel"), default["leftLabel"]),
        "rightLabel": self._first_normalized_text(raw.get("rightLabel"), default["rightLabel"]),
        "value": max(-1.0, min(1.0, value)),
      })
```
그리고 return dict에 `"axes": axes,` 추가.

(c) 필드 가이드(:742-743 impressionNotes 줄)에 axes 추가 설명; 프롬프트(:1362-1363 impressionNotes 지시)에 "axes는 인상을 2개 축으로 배치: 각 {key, leftLabel, rightLabel, value(-1..1)}. 예: 부드러움↔또렷함, 차분함↔화사함. 숫자는 사용자에게 노출되지 않으니 인상 위치만 정직하게." 추가.

- [ ] **Step 4: 통과 확인**

Run: `cd services/backend && python3 -m pytest tests/test_impression_axes.py tests/test_region_notes_structured.py -q`
Expected: PASS(신규 + 기존 회귀).

---

## Task 2: 모바일 파서 + 타입 (axes)

**Files:**
- Modify: `apps/mobile/src/shared/types/faceAnalysis.ts` (`FaceAnalysisImpressionNotes`)
- Modify: `apps/mobile/src/shared/services/faceAnalysisService.ts` (`BackendImpressionNotes` :63-67, `parseImpressionNotes` :423-433)

**Interfaces:**
- Produces: `FaceAnalysisImpressionNotes.axes?: {key:string;leftLabel:string;rightLabel:string;value:number}[]`; parser가 축을 clamp·파싱(부재면 생략 — 어댑터가 기본축 폴백).

- [ ] **Step 1: 타입 + 파서**

Modify `apps/mobile/src/shared/types/faceAnalysis.ts` — `FaceAnalysisImpressionNotes`에 추가:
```ts
  axes?: {key: string; leftLabel: string; rightLabel: string; value: number}[];
```

Modify `apps/mobile/src/shared/services/faceAnalysisService.ts`:
- `BackendImpressionNotes`(:63-67)에 `axes?: unknown` 추가.
- `parseImpressionNotes`(:423-433)에서 axes 파싱 후 결과에 포함:
```ts
  const rawAxes = Array.isArray((value as {axes?: unknown})?.axes) ? (value as {axes: unknown[]}).axes : [];
  const axes = rawAxes
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .slice(0, 2)
    .map(a => ({
      key: firstText(typeof a.key === 'string' ? a.key : undefined) ?? '',
      leftLabel: firstText(typeof a.leftLabel === 'string' ? a.leftLabel : undefined) ?? '',
      rightLabel: firstText(typeof a.rightLabel === 'string' ? a.rightLabel : undefined) ?? '',
      value: typeof a.value === 'number' && Number.isFinite(a.value) ? Math.max(-1, Math.min(1, a.value)) : 0,
    }))
    .filter(a => a.leftLabel && a.rightLabel);
  return overallMood && paragraph && keywords.length > 0
    ? {overallMood, paragraph, keywords, ...(axes.length === 2 ? {axes} : {})}
    : undefined;
```

- [ ] **Step 2: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

---

## Task 3: reportTypes S6Data + 어댑터 buildS6 (gaze 제거, axes)

**Files:**
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (`S6Data` :134-149)
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (`buildS6` :414-463)

**Interfaces:**
- Produces: `S6Data = {eyebrow; title; axes: {key,leftLabel,rightLabel,value}[]; keywords; paragraph}`(gaze 필드 제거).

- [ ] **Step 1: S6Data 교체**

Modify `apps/mobile/src/features/face-report/reportTypes.ts` — `GazeRing`/`GazeMarker` 인터페이스와 `S6Data`의 gaze 필드(diagramTitle/playLabel/playingLabel/rings/markers/faceGuides/items/stepMs) 제거하고 `S6Data`를:
```ts
export interface ImpressionAxis { key: string; leftLabel: string; rightLabel: string; value: number }
export interface S6Data {
  eyebrow: string; title: string;
  axes: ImpressionAxis[];   // 2개 (없으면 어댑터가 중립 기본축)
  keywords: string[];
  paragraph: string;
}
```

- [ ] **Step 2: buildS6 교체**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS6`(:414-463)를 gaze 다이어그램 구성 없이 axes 기반으로:
```ts
const DEFAULT_S6_AXES = [
  {key: 'softness', leftLabel: '부드러움', rightLabel: '또렷함', value: 0},
  {key: 'vividness', leftLabel: '차분함', rightLabel: '화사함', value: 0},
];

function buildS6(
  regionNotes: FaceAnalysisRegionNotes | undefined,
  impressionNotes: FaceAnalysisImpressionNotes | undefined,
): S6Data | null {
  if (!regionNotes || !impressionNotes) {
    return null;
  }
  const axes = impressionNotes.axes && impressionNotes.axes.length === 2
    ? impressionNotes.axes
    : DEFAULT_S6_AXES;
  return {
    eyebrow: 'IMPRESSION',
    title: '모아 보면 이런 인상이에요',
    axes,
    keywords: impressionNotes.keywords,
    paragraph: impressionNotes.paragraph,
  };
}
```
(regionNotes 인자는 더 이상 gaze 텍스트에 안 쓰이지만, 시그니처·호출부는 유지 — 부재 시 섹션 숨김 게이트로 계속 사용.)

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: FAIL — S6Impression이 아직 제거된 gaze 필드를 참조. (Task 4에서 해소 — 컨트롤러가 Task 3·4 함께 커밋.)

---

## Task 4: S6 UI — ImpressionMap(2D 드래그) + GazeReplay 제거

**Files:**
- Create: `apps/mobile/src/features/face-report/visuals/ImpressionMap.tsx`
- Modify: `apps/mobile/src/features/face-report/sections/S6Impression.tsx`
- Delete: `apps/mobile/src/features/face-report/visuals/GazeReplay.tsx` (grep 확인 후)

**Interfaces:**
- Consumes: `S6Data.axes`.
- Produces: `<ImpressionMap axes={data.axes} />` — 2D 패드에 현재 위치 점 + 드래그 탐색 점 + 축 라벨 + 캡션.

- [ ] **Step 1: ImpressionMap 작성**

Create `apps/mobile/src/features/face-report/visuals/ImpressionMap.tsx` (드래그는 reanimated `useSharedValue` + `react-native-gesture-handler` `Gesture.Pan`; 프로젝트에 이미 gesture-handler가 있으면 사용, 없으면 PanResponder 폴백):

```tsx
import React, { useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { color, font, radius } from '../reportTokens';
import type { ImpressionAxis } from '../reportTypes';

/** S6 인상 좌표 맵 — axes[0]=가로, axes[1]=세로. value −1..1 → 0..1 위치.
 *  현재 위치(AI 판단) 점 + 드래그 탐색 점. 정직성: 위치는 AI가 본 인상, 숫자 미노출. */
export function ImpressionMap({ axes }: { axes: ImpressionAxis[] }) {
  const ax = axes[0] ?? { leftLabel: '', rightLabel: '', value: 0, key: 'x' };
  const ay = axes[1] ?? { leftLabel: '', rightLabel: '', value: 0, key: 'y' };
  const [size, setSize] = useState(0);
  // 현재 위치(정규화 0..1): x = (value+1)/2, y = 위가 +1이므로 (1-value)/2
  const curX = (ax.value + 1) / 2;
  const curY = (1 - ay.value) / 2;
  const dragX = useSharedValue(curX);
  const dragY = useSharedValue(curY);
  const [zone, setZone] = useState<string>('');

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout.width);

  const pan = Gesture.Pan().onUpdate(e => {
    if (size <= 0) return;
    dragX.value = Math.max(0, Math.min(1, e.x / size));
    dragY.value = Math.max(0, Math.min(1, e.y / size));
  }).onEnd(() => {}); // 존 캡션은 onChange로 setState(간략화: 생략 가능)

  const dragStyle = useAnimatedStyle(() => ({
    left: `${dragX.value * 100}%`, top: `${dragY.value * 100}%`,
  }));

  return (
    <View style={{ gap: 8 }}>
      <Text style={[font(11.5, '700'), { color: color.muted }]}>AI가 본 인상 — 끌어서 둘러보세요</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[font(10.5, '700'), { color: color.faint, width: 48, textAlign: 'right' }]}>{ax.leftLabel}</Text>
        <GestureDetector gesture={pan}>
          <View onLayout={onLayout} style={{ flex: 1, aspectRatio: 1, borderRadius: radius.lg, backgroundColor: color.dial, borderWidth: 1, borderColor: color.outline8 }}>
            {/* 축 십자선 */}
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: color.outline8 }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: color.outline8 }} />
            {/* 현재 위치(고정) */}
            <View pointerEvents="none" style={{ position: 'absolute', left: `${curX * 100}%`, top: `${curY * 100}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, backgroundColor: color.accent, borderWidth: 2, borderColor: color.white }} />
            {/* 드래그 탐색 점 */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: 8, backgroundColor: color.magenta, opacity: 0.85 }, dragStyle]} />
          </View>
        </GestureDetector>
        <Text style={[font(10.5, '700'), { color: color.faint, width: 48 }]}>{ax.rightLabel}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 56 }}>
        <Text style={[font(10.5, '700'), { color: color.faint }]}>↑ {ay.rightLabel}</Text>
        <Text style={[font(10.5, '700'), { color: color.faint }]}>↓ {ay.leftLabel}</Text>
      </View>
    </View>
  );
}
```
(gesture-handler 미사용 프로젝트면 PanResponder로 동일 동작 구현. 실기기에서 드래그·라벨 배치 미세조정.)

- [ ] **Step 2: S6Impression 교체**

Modify `apps/mobile/src/features/face-report/sections/S6Impression.tsx` — `import { GazeReplay }`를 `import { ImpressionMap }`로, `<GazeReplay data={data} />`를 `<ImpressionMap axes={data.axes} />`로. keywords·paragraph 렌더는 유지.

- [ ] **Step 3: GazeReplay 제거 (grep 후)**

Run: `cd apps/mobile && grep -rn "GazeReplay\|FACE_PATH\|FACE_W\|FACE_H" src`
Expected: S6Impression 교체 후 남는 실사용 참조 0(주석/문서 제외). 0이면 `git rm .../GazeReplay.tsx`(컨트롤러). 만약 FACE_PATH가 남아 있으면 그 참조부터 정리하거나 GazeReplay 유지.

- [ ] **Step 4: 타입 검증(Task 3 포함 통과)**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: 실기기 확인** — S6에 시선 다이어그램 대신 2D 맵이 뜨고, 현재 위치 점(파랑)이 보이고, 자홍 점을 드래그해 탐색되며, 축 라벨(부드러움↔또렷함 / 차분함↔화사함)이 맞게 배치되는지.

---

## Task 5: P4 통합 검증

- [ ] **Step 1: 백엔드** — `cd services/backend && python3 -m pytest tests/test_impression_axes.py tests/test_region_notes_structured.py -q` → PASS.
- [ ] **Step 2: 모바일** — `cd apps/mobile && npm run typecheck && npm run test:face-report` → 0 errors + 계약 테스트 OK.
- [ ] **Step 3: 실기기 회귀** — 새 보고서에서 S6 맵 인터랙션 확인; 구버전/축 부재는 중립 기본축으로 맵이 뜨는지(폴백).

---

## Self-Review (작성자 체크)

- **Spec 커버리지:** 3.1 시선순서 대체=Task 3/4 · 인상 축 데이터=Task 1/2/3 · 2D 맵 인터랙션=Task 4.
- **Placeholder 스캔:** 각 스텝 실제 코드/명령. (ImpressionMap의 zone 캡션은 간략화 — 실기기 튜닝 명시.)
- **타입 일관성:** `ImpressionAxis`/axes가 backend·faceAnalysis 타입·parser·S6Data·buildS6·ImpressionMap에서 일치.
- **하위호환:** 백엔드 항상 2축; parser 부재 생략; buildS6 DEFAULT_S6_AXES 폴백; gaze 필드 제거로 S6Impression 반드시 함께 갱신.
- **정직성:** 위치=AI 판단(라벨), 숫자 미노출, 측정 위장 없음.

## 완료 후
모든 계획 단계(P1~P4 + 2.3) 구현 완료 → 사용자의 실기기 하나씩 확인·디버깅 패스로.
