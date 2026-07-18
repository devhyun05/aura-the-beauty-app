# 얼굴 보고서 P2 — 부위 근거·조언 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부위별 `regionNotes`를 한 문장 string에서 `{insight, evidence, recommendation}` 구조체로 확장해, "턱이 부각되는 편 → 근거 → 립은 약하게" 식의 근거·조언을 백엔드(Bedrock)→타입→어댑터→S3 화면까지 흘려보낸다.

**Architecture:** Bedrock `analyze_text` 호출의 출력 스키마만 넓힌다(Path A). 백엔드 `_ensure_region_notes` 정규화가 구조체를 강제하고 구버전 단문/부재를 안전 승격한다(pytest). 모바일 타입·어댑터가 구조체를 소비하되 어댑터 경계에서 구버전 문자열을 흡수한다. S3 카드가 insight/evidence/recommendation 3단으로 렌더한다. **인상 축·맵은 P2 범위 밖(P4)** — 단 regionNotes 형태 변경이 buildS6의 gaze 텍스트(`regionNotes.upper` 문자열 사용)를 깨므로 buildS6만 `.insight`로 최소 수정한다.

**Tech Stack:** Python 3.13 / pytest (백엔드 `services/backend`), React Native + TypeScript (모바일). 백엔드 테스트: `cd services/backend && python3 -m pytest tests/<file> -q`. 모바일: `cd apps/mobile && npm run typecheck`.

## Global Constraints

- **정직성:** insight=인상 결론, evidence=어떤 실측 지표에서 그렇게 보이는지(숫자 나열 금지, 해석), recommendation=그래서 어떤 메이크업을 어떻게. 근거는 정성 표현("~한 편"), **백분위·mm 금지**. evidence/recommendation는 AI 제안이므로 화면 라벨은 계속 "AI 제안"(기존 S3 evidence 규칙).
- **하위호환(부재=숨김):** 백엔드는 항상 구조체를 반환한다. **저장된 구버전 보고서의 문자열 regionNotes만** 어댑터가 `{insight:<문자열>, evidence:'', recommendation:''}`로 승격한다. regionNotes 자체가 없으면 S3 섹션은 기존대로 숨긴다(생성 금지).
- **측정 지표 신설 없음:** 기존 face3d/geometry2d/verticalThirds/personalColor 지표로 충분. `face_measurement_schema.py` 화이트리스트 변경 금지.
- **범위:** 인상 축/맵(impressionNotes.axes, S6 맵)은 이 플랜에 없다(P4). stylingLooks(내추럴/글램)도 변경 없음(P1에서 UI 완료).
- **커밋:** 서브에이전트는 코드+테스트만, git 금지. 컨트롤러가 경로 지정 커밋, **푸시 없음**.
- **디자인 토큰:** S3 렌더는 reportTokens color/font/radius만.

---

## File Structure

- **Modify** `services/backend/app/services/openai_analysis.py` — `_ensure_region_notes`(구조체화), `_build_analysis_prompt`(regionNotes 지시), `ANALYSIS_OUTPUT_FIELD_GUIDE`(구조 설명).
- **Create** `services/backend/tests/test_region_notes_structured.py` — 정규화 pytest.
- **Modify** `apps/mobile/src/shared/types/faceAnalysis.ts` — `FaceAnalysisRegionNote` 구조체 타입.
- **Modify** `apps/mobile/src/features/face-report/reportTypes.ts` — `RegionCardData`에 insight/evidence/recommendation.
- **Modify** `apps/mobile/src/shared/services/faceAnalysisService.ts` — `BackendRegionNotes` 타입 + `parseRegionNotes`(백엔드 JSON → FaceAnalysisReport 구조체 파싱). ⚠️ 이 파서가 구조체를 못 받으면 신규 응답에서 `.trim()` 런타임 크래시 + 타입 에러.
- **Modify** `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `normalizeRegionNote` + buildS3(3단) + buildS6(`.insight`).
- **Modify** `apps/mobile/src/features/face-report/sections/S3Features.tsx` — insight/evidence/recommendation 렌더.

---

## Task 1: 백엔드 — `_ensure_region_notes` 구조체화 + 하위호환 (Python TDD)

**Files:**
- Create: `services/backend/tests/test_region_notes_structured.py`
- Modify: `services/backend/app/services/openai_analysis.py:1660-1676`

**Interfaces:**
- Produces: `OpenAIAnalysisService._ensure_region_notes(result: dict) -> dict[str, dict[str, str]]` — 4 키(upper/mid/lower/jaw), 각 `{insight, evidence, recommendation}`.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `services/backend/tests/test_region_notes_structured.py`:

```python
from app.core.settings import Settings
from app.services.openai_analysis import OpenAIAnalysisService


def _service():
    return OpenAIAnalysisService(Settings())


def test_structured_region_notes_pass_through():
    service = _service()
    out = service._ensure_region_notes(
        {
            "regionNotes": {
                "upper": {
                    "insight": "눈매가 큰 편이에요",
                    "evidence": "눈 가로폭이 넉넉하고 눈꼬리가 살짝 올라간 편",
                    "recommendation": "아이라인은 얇게, 언더는 생략",
                },
                "mid": {"insight": "코가 입체적이에요"},
                "lower": {"insight": "입술이 도톰해요", "recommendation": "누드 톤"},
                "jaw": {"insight": "턱이 부각되는 편"},
            }
        }
    )
    assert out["upper"] == {
        "insight": "눈매가 큰 편이에요",
        "evidence": "눈 가로폭이 넉넉하고 눈꼬리가 살짝 올라간 편",
        "recommendation": "아이라인은 얇게, 언더는 생략",
    }
    # evidence/recommendation는 없으면 빈 문자열
    assert out["mid"] == {"insight": "코가 입체적이에요", "evidence": "", "recommendation": ""}
    assert out["lower"]["recommendation"] == "누드 톤"
    assert out["lower"]["evidence"] == ""


def test_legacy_string_region_notes_promoted_to_insight():
    service = _service()
    out = service._ensure_region_notes(
        {"regionNotes": {"upper": "눈썹 결이 자연스럽고 눈매가 부드러운 편입니다"}}
    )
    assert out["upper"]["insight"] == "눈썹 결이 자연스럽고 눈매가 부드러운 편입니다"
    assert out["upper"]["evidence"] == ""
    assert out["upper"]["recommendation"] == ""
    # 나머지 키는 기본 insight로 채워지고 구조는 항상 3필드
    for key in ("upper", "mid", "lower", "jaw"):
        assert set(out[key].keys()) == {"insight", "evidence", "recommendation"}
        assert isinstance(out[key]["insight"], str) and out[key]["insight"]


def test_missing_region_notes_get_defaults():
    service = _service()
    out = service._ensure_region_notes({"faceShape": "계란형", "recommendedMood": "청량한 무드"})
    assert set(out.keys()) == {"upper", "mid", "lower", "jaw"}
    for key in out:
        assert out[key]["insight"]  # 기본 insight 존재
        assert out[key]["evidence"] == ""
        assert out[key]["recommendation"] == ""
```

- [ ] **Step 2: 실패 확인**

Run: `cd services/backend && python3 -m pytest tests/test_region_notes_structured.py -q`
Expected: FAIL — `_ensure_region_notes`가 아직 `dict[str, str]`을 반환해 `out["upper"]`가 문자열이라 `== {...}` / `["insight"]` 접근에서 실패.

- [ ] **Step 3: 구현 교체**

Modify `services/backend/app/services/openai_analysis.py` — `_ensure_region_notes`(현재 :1660-1676) 전체를 교체:

```python
  def _ensure_region_notes(self, result: dict[str, Any]) -> dict[str, dict[str, str]]:
    notes = result.get("regionNotes")
    normalized_notes = notes if isinstance(notes, dict) else {}
    face_shape = self._first_normalized_text(result.get("faceShape"), "얼굴형")
    recommended_mood = self._first_normalized_text(result.get("recommendedMood"), "은은한 분위기")

    insight_defaults = {
      "upper": f"{face_shape} 인상 안에서 눈매와 눈썹이 표정의 시작점이 돼요.",
      "mid": "코와 볼의 흐름이 완만하게 이어지는 구획이에요.",
      "lower": f"{recommended_mood} 분위기를 입술이 자연스럽게 마무리해요.",
      "jaw": "광대에서 턱끝으로 내려오는 선이 전체 윤곽을 정리해요.",
    }

    normalized: dict[str, dict[str, str]] = {}
    for key, insight_fallback in insight_defaults.items():
      raw = normalized_notes.get(key)
      if isinstance(raw, dict):
        normalized[key] = {
          "insight": self._first_normalized_text(raw.get("insight"), insight_fallback),
          "evidence": self._first_normalized_text(raw.get("evidence")),
          "recommendation": self._first_normalized_text(raw.get("recommendation")),
        }
      else:
        # 구버전(단문 string)·부재 응답은 insight로 승격하고 근거·조언은 비운다.
        normalized[key] = {
          "insight": self._first_normalized_text(raw, insight_fallback),
          "evidence": "",
          "recommendation": "",
        }
    return normalized
```

- [ ] **Step 4: 통과 확인**

Run: `cd services/backend && python3 -m pytest tests/test_region_notes_structured.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: 회귀 확인 (기존 분석 테스트)**

Run: `cd services/backend && python3 -m pytest tests/test_analysis_measurements_payload.py tests/test_analysis_reports_api.py -q`
Expected: PASS — `_ensure_region_notes` 반환 형태가 바뀌었지만 백엔드 내부 다른 소비처가 없어(정찰 확인) 회귀 없음. 실패 시 그 테스트의 기대 형태를 신 구조체로 갱신.

(커밋은 컨트롤러가 수행 — 이 태스크는 코드+테스트만.)

---

## Task 2: 백엔드 — 프롬프트 + 필드 가이드 구조체 지시 (Python TDD)

**Files:**
- Modify: `services/backend/app/services/openai_analysis.py` — `ANALYSIS_OUTPUT_FIELD_GUIDE`(:740-741), `_build_analysis_prompt` regionNotes 지시(:1359-1361)
- Modify: `services/backend/tests/test_region_notes_structured.py` (assertion 추가)

**Interfaces:**
- Consumes: Task 1의 서비스.
- Produces: 프롬프트/필드가이드가 insight/evidence/recommendation 구조를 지시.

- [ ] **Step 1: 실패하는 테스트 추가**

Modify `services/backend/tests/test_region_notes_structured.py` — 파일 끝에 추가:

```python
def test_field_guide_declares_structured_region_notes():
    from app.services.openai_analysis import ANALYSIS_OUTPUT_FIELD_GUIDE

    guide = ANALYSIS_OUTPUT_FIELD_GUIDE
    assert "insight" in guide
    assert "evidence" in guide
    assert "recommendation" in guide


def test_prompt_instructs_structured_region_notes():
    service = _service()
    prompt = service._build_analysis_prompt({"task": "face_makeup_recommendation_report_v1"})
    assert "insight" in prompt
    assert "evidence" in prompt
    assert "recommendation" in prompt
```

- [ ] **Step 2: 실패 확인**

Run: `cd services/backend && python3 -m pytest tests/test_region_notes_structured.py -q`
Expected: FAIL — 새 두 테스트가 실패(현재 가이드/프롬프트에 insight/evidence/recommendation 없음).

- [ ] **Step 3: 필드 가이드 갱신**

Modify `services/backend/app/services/openai_analysis.py` — `ANALYSIS_OUTPUT_FIELD_GUIDE`의 regionNotes 줄(현재 :740-741)
```
  "regionNotes keys: upper, mid, lower, jaw — each a short Korean sentence "
  "describing that face region's impression. "
```
을 아래로 교체:
```
  "regionNotes keys: upper, mid, lower, jaw. Each value is an object with "
  "keys insight, evidence, recommendation (all short Korean sentences): "
  "insight = the impression conclusion for that region, evidence = which "
  "measured signals make it read that way (interpreted, never raw numbers), "
  "recommendation = the concrete makeup move that follows. "
```

- [ ] **Step 4: 프롬프트 지시 갱신**

Modify `services/backend/app/services/openai_analysis.py` — `_build_analysis_prompt`의 regionNotes 지시(현재 :1359-1361)
```
      "regionNotes는 top-level 필드로 상안부(upper: 이마·눈썹·눈)·중안부(mid: 코·인중·볼)·하안부(lower: 입술)·"
      "광대와 턱(jaw) 4개 부위 각각의 인상적 특징을 한 문장씩 설명해. 숫자를 나열하지 말고 위에서 설명한 실측 지표를 "
      "있으면 근거로 자연스럽게 풀어 쓰고, 없으면 사진 관찰로만 판단해. "
```
을 아래로 교체:
```
      "regionNotes는 top-level 필드로 상안부(upper: 이마·눈썹·눈)·중안부(mid: 코·인중·볼)·하안부(lower: 입술)·"
      "광대와 턱(jaw) 4개 부위 각각을 {insight, evidence, recommendation} 객체로 채워. "
      "insight는 그 부위의 인상 결론을 한 문장, evidence는 위에서 설명한 실측 지표 중 무엇 때문에 그렇게 보이는지를 "
      "숫자 없이 해석해서 한 문장(지표가 없으면 사진 관찰 근거), recommendation은 그래서 어떤 메이크업을 어떻게 하면 "
      "좋은지 한 문장으로 써. 세 문장 모두 숫자·mm·백분위를 노출하지 마. "
```

- [ ] **Step 5: 통과 확인**

Run: `cd services/backend && python3 -m pytest tests/test_region_notes_structured.py -q`
Expected: PASS (5 passed).

---

## Task 3: 모바일 — 타입 구조체화 (faceAnalysis.ts + reportTypes.ts)

**Files:**
- Modify: `apps/mobile/src/shared/types/faceAnalysis.ts:27-32`
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (`RegionCardData`, :88-101 부근)

**Interfaces:**
- Produces: `FaceAnalysisRegionNote = { insight: string; evidence: string; recommendation: string }`; `FaceAnalysisRegionNotes = { upper: FaceAnalysisRegionNote; mid: …; lower: …; jaw: … }`. `RegionCardData`에 `insight?: string; evidence?: string; recommendation?: string`.

- [ ] **Step 1: faceAnalysis.ts 타입 교체**

Modify `apps/mobile/src/shared/types/faceAnalysis.ts` — 현재(:27-32)
```ts
export interface FaceAnalysisRegionNotes {
  upper: string;
  mid: string;
  lower: string;
  jaw: string;
}
```
을 아래로 교체:
```ts
// 부위별 근거·인사이트·조언(정본 원칙 완화 2026-07-18: 수치 비노출은 유지하되
// 근거·조언 서술을 담는다). 구버전 보고서는 각 값이 string일 수 있어 어댑터
// 경계에서 {insight, evidence, recommendation}로 승격한다.
export interface FaceAnalysisRegionNote {
  insight: string;
  evidence: string;
  recommendation: string;
}

export interface FaceAnalysisRegionNotes {
  upper: FaceAnalysisRegionNote;
  mid: FaceAnalysisRegionNote;
  lower: FaceAnalysisRegionNote;
  jaw: FaceAnalysisRegionNote;
}
```

- [ ] **Step 2: reportTypes.ts RegionCardData 확장**

Modify `apps/mobile/src/features/face-report/reportTypes.ts` — `RegionCardData` 인터페이스의 `paragraph: string;` 줄 바로 위에 추가:
```ts
  // 부위 근거·인사이트·조언(P2). 값이 없으면 컴포넌트가 paragraph로 폴백.
  insight?: string;
  evidence?: string;
  recommendation?: string;
```

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: FAIL — `fromFaceAnalysisReport.ts`의 buildS3(`paragraph: regionNotes[key]`)와 buildS6(`${regionNotes.upper}`)가 이제 string이 아닌 객체를 참조해 타입 에러. (Task 4에서 해소 — 이 태스크는 타입 정의만이므로 컨트롤러가 Task 3·4를 함께 커밋한다.)

---

## Task 4: 모바일 — 백엔드 파서 + 어댑터 (parseRegionNotes + normalizeRegionNote + buildS3 + buildS6)

**Files:**
- Modify: `apps/mobile/src/shared/services/faceAnalysisService.ts` — `BackendRegionNotes`(:60), `parseRegionNotes`(:397-404)
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — buildS3(:383-409), buildS6(:414-463)

**Interfaces:**
- Consumes: Task 3 타입.
- Produces: `parseRegionNotes`가 구조체 `FaceAnalysisRegionNotes` 반환(문자열 legacy 흡수); `normalizeRegionNote(raw: unknown) → { insight; evidence; recommendation }`; buildS3 카드가 insight/evidence/recommendation을 담고; buildS6 gaze 텍스트가 `.insight` 사용.

- [ ] **Step 0: 백엔드 응답 파서 갱신 (faceAnalysisService.ts)**

Modify `apps/mobile/src/shared/services/faceAnalysisService.ts`:

`BackendRegionNotes` 타입(:60)
```ts
type BackendRegionNotes = Partial<Record<'upper' | 'mid' | 'lower' | 'jaw', string | null>>;
```
을 아래로 교체(구버전 문자열 + 신버전 객체 모두 허용):
```ts
type BackendRegionNote = {insight?: string | null; evidence?: string | null; recommendation?: string | null};
type BackendRegionNotes = Partial<Record<'upper' | 'mid' | 'lower' | 'jaw', BackendRegionNote | string | null>>;
```

`parseRegionNotes`(:397-404) 전체를 아래로 교체:
```ts
function toRegionNote(
  raw: BackendRegionNote | string | null | undefined,
): FaceAnalysisRegionNote | undefined {
  if (raw && typeof raw === 'object') {
    const insight = firstText(raw.insight);
    if (!insight) return undefined;
    return {
      insight,
      evidence: firstText(raw.evidence) ?? '',
      recommendation: firstText(raw.recommendation) ?? '',
    };
  }
  const insight = firstText(typeof raw === 'string' ? raw : undefined);
  return insight ? {insight, evidence: '', recommendation: ''} : undefined;
}

function parseRegionNotes(value: BackendRegionNotes | null | undefined): FaceAnalysisRegionNotes | undefined {
  const upper = toRegionNote(value?.upper);
  const mid = toRegionNote(value?.mid);
  const lower = toRegionNote(value?.lower);
  const jaw = toRegionNote(value?.jaw);
  return upper && mid && lower && jaw ? {upper, mid, lower, jaw} : undefined;
}
```

`FaceAnalysisRegionNote` 타입 import 추가 — 파일 상단의 `faceAnalysis` 타입 import에 `FaceAnalysisRegionNote`를 포함(기존 `FaceAnalysisRegionNotes` import 옆). 정확한 import 경로는 같은 파일에서 `FaceAnalysisRegionNotes`를 import하는 줄을 찾아 거기에 추가한다.

- [ ] **Step 1: normalizeRegionNote 헬퍼 추가**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS3` 함수 정의 바로 위에 추가:

```ts
// 구버전 보고서는 regionNotes 값이 string일 수 있고 신버전은
// {insight, evidence, recommendation} 객체다. 어댑터 경계에서 둘을 흡수한다.
function normalizeRegionNote(
  raw: unknown,
): {insight: string; evidence: string; recommendation: string} {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return {
      insight: typeof o.insight === 'string' ? o.insight : '',
      evidence: typeof o.evidence === 'string' ? o.evidence : '',
      recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
    };
  }
  if (typeof raw === 'string') {
    return {insight: raw, evidence: '', recommendation: ''};
  }
  return {insight: '', evidence: '', recommendation: ''};
}
```

- [ ] **Step 2: buildS3에서 소비**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS3`의 카드 map 내부(현재 `paragraph: regionNotes[key],`)를 교체. 현재:
```ts
      axes: [],
      paragraph: regionNotes[key],
    };
```
을 아래로:
```ts
      axes: [],
      ...(() => {
        const note = normalizeRegionNote((regionNotes as Record<string, unknown>)[key]);
        return {
          insight: note.insight,
          evidence: note.evidence,
          recommendation: note.recommendation,
          paragraph: note.insight, // 폴백/구컨슈머 호환
        };
      })(),
    };
```

- [ ] **Step 3: buildS6 gaze 텍스트를 .insight로**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS6`의 items(현재)
```ts
    items: [
      {n: 1, color: color.magenta, text: `눈가 — ${regionNotes.upper}`},
      {n: 2, color: color.accent, text: `입가 — ${regionNotes.lower}`},
    ],
```
을 아래로 교체:
```ts
    items: [
      {n: 1, color: color.magenta, text: `눈가 — ${normalizeRegionNote(regionNotes.upper).insight}`},
      {n: 2, color: color.accent, text: `입가 — ${normalizeRegionNote(regionNotes.lower).insight}`},
    ],
```

- [ ] **Step 4: 타입 검증 (Task 3 포함 통과)**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

---

## Task 5: 모바일 — S3 카드가 insight/evidence/recommendation 렌더

**Files:**
- Modify: `apps/mobile/src/features/face-report/sections/S3Features.tsx:14-35` (RegionCard)

**Interfaces:**
- Consumes: Task 4가 채운 `card.insight/evidence/recommendation`.

- [ ] **Step 1: RegionCard 렌더 교체**

Modify `apps/mobile/src/features/face-report/sections/S3Features.tsx` — `RegionCard`의 마지막 `<Text ...>{card.paragraph}</Text>` 줄을 아래로 교체:

```tsx
      {card.insight ? (
        <View style={{ gap: 6 }}>
          <Text style={[font(13.5, '700', 1.6), { color: color.ink }]}>{card.insight}</Text>
          {card.evidence ? (
            <Text style={[font(12.5, '400', 1.6), { color: color.muted }]}>
              근거 · {card.evidence}
            </Text>
          ) : null}
          {card.recommendation ? (
            <View style={{
              backgroundColor: color.accentWash, borderRadius: radius.md,
              paddingVertical: 9, paddingHorizontal: 12,
            }}>
              <Text style={[font(12.5, '600', 1.55), { color: color.accentInk }]}>
                메이크업 · {card.recommendation}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[font(13, '400', 1.7), { color: color.body }]}>{card.paragraph}</Text>
      )}
```

(`View`는 이미 import됨; `radius`·`color`도 파일 상단에서 import 중.)

- [ ] **Step 2: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: 실기기/시뮬 확인**

보고서 S3(이목구비) 카드에서 각 부위가 **insight(굵게) + "근거 · …" + "메이크업 · …"(강조 박스)** 로 보인다. 구버전 보고서(문자열 notes)는 insight만 채워지고 근거·메이크업 줄은 생략(폴백).

---

## Task 6: P2 통합 검증

- [ ] **Step 1: 백엔드 테스트**

Run: `cd services/backend && python3 -m pytest tests/test_region_notes_structured.py tests/test_analysis_measurements_payload.py -q`
Expected: PASS.

- [ ] **Step 2: 모바일 타입 + 기존 순수 테스트**

Run: `cd apps/mobile && npm run typecheck && npm run test:face-report`
Expected: typecheck 0 errors, `reportFormat.test.ts (Task 1) OK`.

- [ ] **Step 3: 실기기 회귀** — S3 카드가 근거·조언 3단으로 나오는지, 구버전 보고서가 insight-only로 폴백하는지 확인.

---

## Self-Review (작성자 체크)

- **Spec 커버리지:** regionNotes 구조체=Task 1/3/4 · 프롬프트=Task 2 · S3 렌더=Task 5. 인상 축·맵과 부위 크롭·실가이드는 **P3/P4**(범위 밖, 명시).
- **Placeholder 스캔:** 없음. 각 스텝에 실제 코드/명령.
- **타입 일관성:** `FaceAnalysisRegionNote{insight,evidence,recommendation}`가 faceAnalysis.ts(Task 3)·normalizeRegionNote(Task 4)·RegionCardData(Task 3)·S3Features(Task 5)에서 일치. 백엔드 반환 dict 3키와 모바일 3필드 일치.
- **하위호환:** normalizeRegionNote가 string/object/부재 모두 흡수; 백엔드는 항상 구조체.
- **정직성:** evidence/recommendation는 "AI 제안"(라벨 불변), 숫자 비노출.

## 후속 (P3/P4)
- **P3**: 부위 크롭 + 실측 가이드라인(regionVisualsBuilder + measurements codec + S3 캐러셀).
- **P4**: 인상 좌표 맵(impressionNotes.axes 백엔드 추가 + S6 맵 UI).
