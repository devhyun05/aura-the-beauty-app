// G4 repeatability analyzer.
//
// A user-facing 3D trait label is only allowed once same-person repeat captures agree
// far more tightly than different people differ. This computes, per metric, the typical
// within-subject spread (repeat error) and the between-subject spread (real differences),
// and reports discriminability = between / within. G4 passes a metric when repeats are
// clearly tighter than people are apart.
//
// Pure core is exported for the contract test; the CLI at the bottom reads real captures.

import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Required (g1) 5지표 — overallPass/노출 게이트는 이 5키만으로 판정한다(계약 불변).
export const FACE3D_METRIC_KEYS = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
];

// Tier-2 optional 6지표(코 형태·광대) — g1 맵에서는 null 이라 데이터가 없다.
// overallPass 에 영향을 주지 않고, 데이터가 충분한 것만 별도 pass(=노출 후보)를 낸다.
export const FACE3D_OPTIONAL_METRIC_KEYS = [
  'noseLength',
  'nasalBridgeStraightness',
  'nasalAxisDeviation',
  'alarWidth',
  'malarProjectionLeft',
  'malarProjectionRight',
];

export const FACE3D_ALL_METRIC_KEYS = [
  ...FACE3D_METRIC_KEYS,
  ...FACE3D_OPTIONAL_METRIC_KEYS,
];

export function median(values) {
  const finite = values.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (finite.length === 0) {
    return Number.NaN;
  }
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 === 1 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

// Median absolute deviation from the median: a robust spread that ignores a stray capture.
export function medianAbsoluteDeviation(values) {
  const center = median(values);
  if (!Number.isFinite(center)) {
    return Number.NaN;
  }
  return median(values.map(v => Math.abs(v - center)));
}

// 노출 게이트 표본 요구량 — 정확히 3명 × 각 3회 neutral 캡처(별도 세트).
// 2명·1반복 같은 미달 표본이 지표별 pass 를 만들어내던 구멍을 봉쇄한다.
export const REPEATABILITY_REQUIRED_SUBJECTS = 3;
export const REPEATABILITY_REQUIRED_CAPTURES_PER_SUBJECT = 3;

/**
 * 매니페스트 표본 구성 검증(fail-closed). captures 항목은 subjectId 와 함께
 * shotKind 를 선언해야 하며 전부 'neutral' 이어야 한다 — 미선언도 거부.
 * @param {Array<{subjectId?: string, shotKind?: string}>} entries
 * @param {{requiredSubjects?: number, requiredCapturesPerSubject?: number}} [options]
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function validateRepeatabilityManifest(entries, options = {}) {
  const requiredSubjects = options.requiredSubjects ?? REPEATABILITY_REQUIRED_SUBJECTS;
  const requiredCapturesPerSubject =
    options.requiredCapturesPerSubject ?? REPEATABILITY_REQUIRED_CAPTURES_PER_SUBJECT;
  const reasons = [];
  const list = Array.isArray(entries) ? entries : [];
  const bySubject = new Map();

  list.forEach((entry, index) => {
    if (!entry || typeof entry.subjectId !== 'string' || entry.subjectId.length === 0) {
      reasons.push(`captures[${index}]: subjectId missing`);
      return;
    }
    if (entry.shotKind !== 'neutral') {
      reasons.push(
        `captures[${index}] (${entry.subjectId}): shotKind must be "neutral", got ` +
          `${JSON.stringify(entry.shotKind ?? null)}`,
      );
    }
    bySubject.set(entry.subjectId, (bySubject.get(entry.subjectId) ?? 0) + 1);
  });

  if (bySubject.size !== requiredSubjects) {
    reasons.push(`subjects: expected exactly ${requiredSubjects}, got ${bySubject.size}`);
  }
  for (const [subjectId, count] of bySubject) {
    if (count !== requiredCapturesPerSubject) {
      reasons.push(
        `subject ${subjectId}: expected exactly ${requiredCapturesPerSubject} ` +
          `neutral captures, got ${count}`,
      );
    }
  }

  return {ok: reasons.length === 0, reasons};
}

/**
 * @param {Array<{subjectId: string, metrics: Record<string, number>}>} captures
 * @param {{minDiscriminability?: number, madFloor?: number,
 *          minSubjects?: number, minRepeatedSubjects?: number}} [options]
 */
export function analyzeRepeatability(captures, options = {}) {
  const minDiscriminability = options.minDiscriminability ?? 2.0;
  // A subject can be perfectly stable (MAD 0); floor the within-spread so discriminability
  // stays finite instead of exploding to Infinity on a single noiseless subject.
  const madFloor = options.madFloor ?? 1e-4;
  // 지표별 pass 하한 — 매니페스트 게이트를 우회한 호출도 미달 표본으로는
  // pass 를 만들 수 없게 분석기 자체에도 같은 기준을 둔다.
  const minSubjects = options.minSubjects ?? REPEATABILITY_REQUIRED_SUBJECTS;
  const minRepeatedSubjects =
    options.minRepeatedSubjects ?? REPEATABILITY_REQUIRED_SUBJECTS;

  const bySubject = new Map();
  for (const capture of captures) {
    if (!capture || typeof capture.subjectId !== 'string' || !capture.metrics) {
      continue;
    }
    if (!bySubject.has(capture.subjectId)) {
      bySubject.set(capture.subjectId, []);
    }
    bySubject.get(capture.subjectId).push(capture.metrics);
  }

  const metrics = {};
  for (const key of FACE3D_ALL_METRIC_KEYS) {
    const subjectMedians = [];
    const withinSpreads = [];
    for (const metricsList of bySubject.values()) {
      const values = metricsList
        .map(m => (m ? m[key] : Number.NaN))
        .filter(v => Number.isFinite(v));
      if (values.length === 0) {
        continue;
      }
      subjectMedians.push(median(values));
      if (values.length >= 2) {
        withinSpreads.push(medianAbsoluteDeviation(values));
      }
    }

    const within = Math.max(madFloor, withinSpreads.length > 0 ? median(withinSpreads) : madFloor);
    const between = subjectMedians.length >= 2 ? medianAbsoluteDeviation(subjectMedians) : 0;
    const discriminability = within > 0 ? between / within : 0;
    metrics[key] = {
      within,
      between,
      discriminability,
      subjectCount: subjectMedians.length,
      repeatedSubjectCount: withinSpreads.length,
      pass:
        withinSpreads.length >= minRepeatedSubjects &&
        subjectMedians.length >= minSubjects &&
        discriminability >= minDiscriminability,
    };
  }

  // 노출 게이트는 required 5키만으로 판정한다(g1 계약 불변) — Tier-2 optional 키가
  // 데이터 부재(g1)여도 overallPass 는 영향받지 않는다.
  const evaluable = FACE3D_METRIC_KEYS.filter(
    k =>
      metrics[k].repeatedSubjectCount >= minRepeatedSubjects &&
      metrics[k].subjectCount >= minSubjects,
  );
  const overallPass = evaluable.length === FACE3D_METRIC_KEYS.length &&
    FACE3D_METRIC_KEYS.every(k => metrics[k].pass);

  // B2 노출 화이트리스트 후보 — Tier-2 키 중 표본이 충분(evaluable)하고 pass 한 것만.
  // 여기 오른 키만 RN FACE_3D_EXPOSED_METRIC_KEYS 편입 + GATE_STATUS 기록 대상이 된다.
  const exposableOptionalKeys = FACE3D_OPTIONAL_METRIC_KEYS.filter(
    k =>
      metrics[k].repeatedSubjectCount >= minRepeatedSubjects &&
      metrics[k].subjectCount >= minSubjects &&
      metrics[k].pass,
  );

  return {
    schemaVersion: 'aura.face3d-repeatability.v1',
    minDiscriminability,
    madFloor,
    minSubjects,
    minRepeatedSubjects,
    subjectCount: bySubject.size,
    captureCount: captures.length,
    metrics,
    overallPass,
    evaluableMetricCount: evaluable.length,
    exposableOptionalKeys,
  };
}

// Pulls the 5 metric values out of the last face3d_analyzed event in an events.jsonl file,
// or out of a bare profile JSON. Raw vertices never appear in these files.
export function extractMetricsFromCaptureFile(path) {
  const text = readFileSync(path, 'utf8').trim();
  let profile = null;

  if (path.endsWith('.jsonl')) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const event = entry.event ?? entry;
      if (event && event.type === 'face3d_analyzed' && event.profile) {
        profile = event.profile;
      }
    }
  } else {
    const parsed = JSON.parse(text);
    profile = parsed.profile ?? parsed;
  }

  if (!profile || !profile.metrics) {
    throw new Error(`No face3d_analyzed profile with metrics in ${path}`);
  }

  const metrics = {};
  // required 5 + Tier-2 optional 6. Tier-2 가 프로필에 없거나 value:null 이면 NaN 이
  // 되어 분석기의 finite 필터에서 자동 제외된다(g1 캡처 그대로 통과).
  for (const key of FACE3D_ALL_METRIC_KEYS) {
    const metric = profile.metrics[key];
    metrics[key] = metric && typeof metric.value === 'number' ? metric.value : Number.NaN;
  }
  return metrics;
}

function runCli(argv) {
  const manifestFlag = argv.indexOf('--manifest');
  const outputFlag = argv.indexOf('--output');
  if (manifestFlag === -1 || !argv[manifestFlag + 1]) {
    console.error(
      'Usage: node analyze-repeatability.mjs --manifest <manifest.json> [--output <summary.json>]\n' +
        'manifest: { "captures": [ { "subjectId": "subject-01", "shotKind": "neutral", "capturePath": "..." }, ... ] }\n' +
        `표본 요구량: 정확히 ${REPEATABILITY_REQUIRED_SUBJECTS}명 × 각 ` +
        `${REPEATABILITY_REQUIRED_CAPTURES_PER_SUBJECT}회 neutral 캡처(미달·초과·비-neutral 거부)`,
    );
    process.exit(2);
  }

  const manifestPath = argv[manifestFlag + 1];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // 표본 구성 게이트(fail-closed): 캡처 파일을 읽기 전에 매니페스트만으로 거부한다.
  const validation = validateRepeatabilityManifest(manifest.captures ?? []);
  if (!validation.ok) {
    console.error(JSON.stringify({manifestValidation: validation}, null, 2));
    console.error('G4_REPEATABILITY_REJECTED');
    process.exit(2);
  }

  const captures = (manifest.captures ?? []).map(entry => ({
    subjectId: entry.subjectId,
    metrics: extractMetricsFromCaptureFile(entry.capturePath),
  }));

  const summary = {
    ...analyzeRepeatability(captures, {
      minDiscriminability: manifest.minDiscriminability,
      madFloor: manifest.madFloor,
    }),
    manifestValidation: {
      ok: true,
      requiredSubjects: REPEATABILITY_REQUIRED_SUBJECTS,
      requiredCapturesPerSubject: REPEATABILITY_REQUIRED_CAPTURES_PER_SUBJECT,
    },
  };

  const rendered = JSON.stringify(summary, null, 2);
  if (outputFlag !== -1 && argv[outputFlag + 1]) {
    writeFileSync(argv[outputFlag + 1], `${rendered}\n`);
  }
  console.log(rendered);
  console.log(summary.overallPass ? 'G4_REPEATABILITY_PASS' : 'G4_REPEATABILITY_PENDING');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli(process.argv.slice(2));
}
