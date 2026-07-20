# 2D 지표 검증 오버레이 (Plan 2/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 개발·QA 전용 화면에서 촬영 얼굴 위에 측정에 쓰인 랜드마크 점·축(debugAnchors)과 지표값을 그려, ⚠ 후보 인덱스·roll 부호를 실기기에서 눈으로 검증한다.

**Architecture:** Plan 1의 `FaceGeometryResult.debugAnchors`(로컬 전용)를 소비. 전용 화면이 `analyzeFaceGeometry2d`를 신선한 캡처 이미지로 재실행해 결과를 얻고, `VerticalThirdsOverlay`의 full-face PhotoStage 패턴으로 렌더. `__DEV__` 게이트.

**Tech Stack:** React Native, react-native-svg, TypeScript. 기존 nav(@react-navigation/native-stack).

## Global Constraints

- **UI 태스크 게이트 = `cd apps/mobile && npm run typecheck` 0 에러 + 실기기 육안 확인**(이 코드베이스는 RN 컴포넌트를 유닛테스트하지 않음 — VerticalThirdsOverlay 등 선례). 자동 유닛테스트 없음이 정상.
- **`__DEV__` 게이트 필수**: 진입 버튼·화면은 릴리즈 빌드에 절대 노출 금지(`{__DEV__ ? ... : null}`).
- feature-local: `features/face-geometry/*`, nav 등록만. `shared/theme` 미변경.
- `debugAnchors`는 로컬 전용(Plan 1) — 서버로 안 나감. 이 Plan은 그걸 화면에서만 소비.
- 각 태스크 끝 커밋(트레일러 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).

---

## File Structure

- `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts` — anchors를 원본 pixelMap에서 수집(정렬 정확성).
- `apps/mobile/src/features/face-geometry/components/FaceGeometryDebugOverlay.tsx` — (신규) SVG 오버레이.
- `apps/mobile/src/features/face-geometry/screens/FaceGeometryDebugScreen.tsx` — (신규) 재분석 + 렌더 화면.
- `apps/mobile/src/app/navigation/routeTypes.ts` — 라우트 param + rootStackRoutes 배열.
- `apps/mobile/src/app/navigation/RootNavigator.tsx` — Stack.Screen + lazy loader.
- `apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx` — RouteScreen export.
- `apps/mobile/src/features/face-report/ReportScreenScaffold.tsx` — __DEV__ 진입 버튼.

---

## Task 1: 앵커를 원본(pixelMap) 좌표에서 수집

**Files:** Modify `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts`

**Interfaces:** Produces: 없음(런타임 좌표 정합만 변경). `debugAnchors`가 원본(비회전) 이미지 좌표로 정규화됨.

**Why:** Plan 1은 `collectFaceGeometryDebugAnchors(correctedMap, ...)`로 roll-보정 좌표를 원본 이미지 치수로 정규화 → roll 보정 적용 시 앵커가 실제 사진과 어긋난다. 검증 목적("인덱스가 이 사진의 눈꼬리에 실제로 찍히나")엔 **원본 좌표**가 정답. 지표값 계산은 계속 correctedMap 사용(불변).

- [ ] **Step 1: 서비스 수집 인자 변경** — `faceGeometryService.ts`에서 `collectFaceGeometryDebugAnchors(correctedMap, ...)` 호출을 `pixelMap`(비회전 원본)으로 변경하고 한 줄 주석 추가:

```typescript
  // 오버레이 정합: 앵커는 원본(비회전) 좌표로 수집해 촬영 사진 위에 정확히 얹는다.
  // (지표값은 correctedMap 기준으로 이미 계산됨 — 앵커는 위치 검증용, 값은 라벨로 표시)
  const debugAnchors = collectFaceGeometryDebugAnchors(
    pixelMap,
    detected.imageWidth,
    detected.imageHeight,
  );
```

- [ ] **Step 2: 회귀 확인** — 기존 계약/타입 무손상 확인:

Run: `cd apps/mobile && npm run test:face-geometry && npm run typecheck`
Expected: 둘 다 PASS/0 에러. (§15는 buildBaseMap(비회전)을 직접 호출하므로 영향 없음.)

- [ ] **Step 3: 커밋**

```bash
git add apps/mobile/src/features/face-geometry/services/faceGeometryService.ts
git commit -m "fix(face-geometry): collect debugAnchors in original (unrotated) space for overlay alignment"
```

---

## Task 2: FaceGeometryDebugOverlay 컴포넌트

**Files:** Create `apps/mobile/src/features/face-geometry/components/FaceGeometryDebugOverlay.tsx`

**Interfaces:** Produces: `FaceGeometryDebugOverlay({result: FaceGeometryResult})` — absoluteFill SVG. Consumes: `result.debugAnchors`, `result.sourceImage.{width,height}`.

- [ ] **Step 1: 컴포넌트 작성** — 아래 코드 그대로 생성:

```tsx
import React from 'react';
import {StyleSheet} from 'react-native';
import Svg, {Circle, G, Line, Polyline} from 'react-native-svg';

import type {FaceGeometryResult} from '../types';

// 지표 계열별 색 — 라벨 접두사로 매핑. (magenta=눈꼬리 수렴각, blue=tilt, green=개방도, cyan=눈썹)
const FAMILY_COLOR: ReadonlyArray<readonly [string, string]> = [
  ['canthalTilt', '#3b82f6'],
  ['canthalUpper', '#ff4d9d'],
  ['canthalLower', '#ff4d9d'],
  ['eyeOpenness', '#34d399'],
  ['browEdge', '#22d3ee'],
];

function colorFor(label: string): string {
  for (const [prefix, color] of FAMILY_COLOR) {
    if (label.startsWith(prefix)) {
      return color;
    }
  }
  return '#f59e0b';
}

export function FaceGeometryDebugOverlay({result}: {result: FaceGeometryResult}) {
  const width = result.sourceImage.width;
  const height = result.sourceImage.height;
  const anchors = result.debugAnchors ?? [];

  if (width <= 0 || height <= 0 || anchors.length === 0) {
    return null;
  }

  const stroke = Math.max(1.5, Math.min(5, height * 0.003));
  const dotRadius = stroke * 1.6;

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${width} ${height}`}
      width="100%">
      {/* 수평 0° 기준선(내안각 높이) — canthalTilt 를 무엇 대비 재는지 + roll 맥락 */}
      {anchors
        .filter(anchor => anchor.label.startsWith('canthalTilt'))
        .map((anchor, index) => (
          <Line
            key={`ref-${index}`}
            stroke="rgba(255,255,255,0.5)"
            strokeDasharray={`${stroke * 2} ${stroke * 2}`}
            strokeWidth={stroke * 0.6}
            x1={0}
            x2={width}
            y1={anchor.points[0].y * height}
            y2={anchor.points[0].y * height}
          />
        ))}

      {anchors.map((anchor, index) => {
        const color = colorFor(anchor.label);
        const points = anchor.points.map(point => ({
          x: point.x * width,
          y: point.y * height,
        }));

        return (
          <G key={`anchor-${index}`}>
            {anchor.kind === 'segment' && points.length >= 2 ? (
              <Line
                stroke={color}
                strokeLinecap="round"
                strokeWidth={stroke}
                x1={points[0].x}
                x2={points[1].x}
                y1={points[0].y}
                y2={points[1].y}
              />
            ) : (
              <Polyline
                fill="none"
                points={points.map(point => `${point.x},${point.y}`).join(' ')}
                stroke={color}
                strokeWidth={stroke}
              />
            )}
            {points.map((point, pointIndex) => (
              <Circle
                key={pointIndex}
                cx={point.x}
                cy={point.y}
                fill={color}
                r={dotRadius}
              />
            ))}
          </G>
        );
      })}
    </Svg>
  );
}
```

- [ ] **Step 2: typecheck** — `cd apps/mobile && npm run typecheck` → 0 에러.
- [ ] **Step 3: 커밋** — `git add ...FaceGeometryDebugOverlay.tsx && git commit -m "feat(face-geometry): add debug overlay drawing measured anchors on the face"` (+트레일러).

---

## Task 3: FaceGeometryDebugScreen 화면

**Files:** Create `apps/mobile/src/features/face-geometry/screens/FaceGeometryDebugScreen.tsx`

**Interfaces:** Produces: `FaceGeometryDebugScreen({imageUri, captureId, sessionId})` — Task 4가 nav route에서 이 값을 넘긴다. Consumes: `analyzeFaceGeometry2d` (Plan 1), `FaceGeometryDebugOverlay` (Task 2).

- [ ] **Step 1: 화면 작성** — 아래 골격대로 생성(캡처 이미지로 재분석 → PhotoStage + 오버레이 + 지표 라벨 목록):

```tsx
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, ScrollView, StyleSheet, Text, View} from 'react-native';

import {analyzeFaceGeometry2d} from '../services/faceGeometryService';
import type {FaceGeometryResult} from '../types';
import {FaceGeometryDebugOverlay} from '../components/FaceGeometryDebugOverlay';

export function FaceGeometryDebugScreen({
  captureId,
  imageUri,
  sessionId,
}: {
  captureId: string;
  imageUri: string;
  sessionId: string;
}) {
  const [result, setResult] = useState<FaceGeometryResult | null>(null);

  useEffect(() => {
    let alive = true;
    analyzeFaceGeometry2d({
      captureId,
      createdAt: new Date().toISOString(),
      imageUri,
      sessionId,
    }).then(next => {
      if (alive) {
        setResult(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [captureId, imageUri, sessionId]);

  if (!result) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const aspect =
    result.sourceImage.width > 0 && result.sourceImage.height > 0
      ? result.sourceImage.width / result.sourceImage.height
      : 3 / 4;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.status}>
        status={result.status} · roll={result.rollCorrection.applied ? `보정 ${result.rollCorrection.rollCorrectionDeg}°` : `미적용(${result.rollCorrection.skippedReason ?? '-'})`}
      </Text>
      <View style={[styles.stage, {aspectRatio: aspect}]}>
        <Image resizeMode="cover" source={{uri: imageUri}} style={StyleSheet.absoluteFill} />
        <FaceGeometryDebugOverlay result={result} />
      </View>
      <View style={styles.metrics}>
        {Object.entries(result.metrics).map(([key, metric]) => (
          <Text key={key} style={styles.metricRow}>
            {key}: {metric.value === null ? `null (${metric.warnings.join(',') || '-'})` : `${metric.value}${metric.unit === 'deg' ? '°' : ''}`}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {alignItems: 'center', flex: 1, justifyContent: 'center'},
  content: {padding: 16},
  metricRow: {color: '#cbd5e1', fontFamily: 'Menlo', fontSize: 12, paddingVertical: 2},
  metrics: {marginTop: 16},
  stage: {borderRadius: 12, overflow: 'hidden', width: '100%'},
  status: {color: '#e2e8f0', fontSize: 13, marginBottom: 10},
});
```

- [ ] **Step 2: typecheck** — `cd apps/mobile && npm run typecheck` → 0 에러.
- [ ] **Step 3: 커밋** — `git add ...FaceGeometryDebugScreen.tsx && git commit -m "feat(face-geometry): add __DEV__ verification screen (reanalyze + overlay + metric readout)"` (+트레일러).

---

## Task 4: nav 등록 + __DEV__ 진입 버튼

**Files:** Modify `routeTypes.ts`, `RootNavigator.tsx`, `routes/faceAnalysisRoutes.tsx`, `ReportScreenScaffold.tsx`

**Interfaces:** Consumes: `FaceGeometryDebugScreen` (Task 3), flow `selectedFaceCapture` (has `.imageUri`, `.photoCaptureId`). Produces: route `FaceGeometryDebug` reachable via a __DEV__ button.

- [ ] **Step 1: route param + 배열** — `routeTypes.ts`:
  - `RootStackParamList`에 추가: `FaceGeometryDebug: {captureId: string; imageUri: string; sessionId: string};`
  - `rootStackRoutes` 배열에 `'FaceGeometryDebug',` 추가(둘 다 필요 — 배열은 `satisfies readonly RootStackRouteName[]`).

- [ ] **Step 2: RouteScreen export** — `routes/faceAnalysisRoutes.tsx`에 route param을 화면 props로 넘기는 얇은 wrapper 추가(기존 `*RouteScreen` 패턴·`useRoute`/props 방식을 그 파일에서 확인해 동일하게):

```tsx
export function FaceGeometryDebugRouteScreen({route}: any) {
  const {captureId, imageUri, sessionId} = route.params;
  return <FaceGeometryDebugScreen captureId={captureId} imageUri={imageUri} sessionId={sessionId} />;
}
```
(파일 상단에 `import {FaceGeometryDebugScreen} from '../../../features/face-geometry/screens/FaceGeometryDebugScreen';`. `route` 타이핑은 그 파일의 기존 RouteScreen들과 동일한 방식으로 — `any`가 아니라 기존처럼 `NativeStackScreenProps<RootStackParamList,'FaceGeometryDebug'>`가 있으면 그걸 사용.)

- [ ] **Step 3: Stack.Screen 등록** — `RootNavigator.tsx`에 다른 face 화면과 동일 패턴으로:

```tsx
      <Stack.Screen
        name="FaceGeometryDebug"
        getComponent={() => loadFaceAnalysisRoutes().FaceGeometryDebugRouteScreen}
      />
```

- [ ] **Step 4: __DEV__ 진입 버튼** — `ReportScreenScaffold.tsx`의 기존 `{__DEV__ ? (<MeasurementDebugPanel .../>) : null}` 근처에, flow의 `selectedFaceCapture`가 있으면 나타나는 버튼 추가. selectedFaceCapture 접근은 그 파일/부모가 이미 쓰는 flow 훅으로(없으면 상위에서 prop 주입). 버튼 onPress:

```tsx
navigation.navigate('FaceGeometryDebug', {
  captureId: selectedFaceCapture.photoCaptureId,
  imageUri: selectedFaceCapture.imageUri,
  sessionId: selectedFaceCapture.photoCaptureId,
});
```
(ReportScreenScaffold가 `navigation`/`selectedFaceCapture`를 직접 못 쥐면, 대신 `FaceAnalysisReportPreviewRouteScreen`(faceAnalysisRoutes.tsx:870, selectedFaceCapture 접근 가능)에 __DEV__ 버튼을 두는 것으로 대체 — 구현자가 신선한 imageUri가 있는 지점을 택한다.)

- [ ] **Step 5: typecheck + 커밋** — `cd apps/mobile && npm run typecheck` → 0 에러.
```bash
git add apps/mobile/src/app/navigation/routeTypes.ts apps/mobile/src/app/navigation/RootNavigator.tsx apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx apps/mobile/src/features/face-report/ReportScreenScaffold.tsx
git commit -m "feat(face-geometry): wire __DEV__ entry + route for the verification overlay screen"
```

---

## Manual acceptance (사용자 실기기 검증 — 이 Plan의 진짜 목적)

1. 얼굴 촬영 → 분석 → 리포트에서 __DEV__ 버튼 → 검증 화면 진입.
2. **인덱스 검증**: 눈꼬리 magenta 접선이 실제 눈꺼풀을 타는지, blue tilt 선이 내→외안각을 잇는지, cyan 눈썹선이 상연을 타는지 육안 확인. 어긋나면 landmarkIndices의 후보 인덱스 조정.
3. **roll 부호 검증**: 고개를 시계방향으로 기울여 촬영 → 흰 수평 기준선 대비 canthalTilt 선이 올바른 방향인지 + 라벨의 canthalTilt 값 부호 확인.

## Self-Review (spec 대비)
- 오버레이 데이터 경로(debugAnchors) = Plan 1 Task 5 ✓; 원본좌표 정합 = Task 1 ✓; full-face 렌더 = Task 2/3 ✓; __DEV__ 게이트·진입 = Task 4 ✓. 후보 인덱스·roll 실기기 검증 = Manual acceptance ✓.
- UI 태스크에 자동 유닛테스트 없음은 의도(코드베이스 관례) — 게이트는 typecheck + 육안.
- Placeholder 스캔: Task 2/3는 완전한 코드. Task 4는 기존 nav 패턴을 구현자가 그 파일에서 확인해 맞추는 통합 단계(정확한 타입/훅은 라이브 확인) — 값·route 이름·param 형태는 명시됨.
