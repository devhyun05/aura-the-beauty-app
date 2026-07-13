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

export const FACE3D_METRIC_KEYS = [
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
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

/**
 * @param {Array<{subjectId: string, metrics: Record<string, number>}>} captures
 * @param {{minDiscriminability?: number, madFloor?: number}} [options]
 */
export function analyzeRepeatability(captures, options = {}) {
  const minDiscriminability = options.minDiscriminability ?? 2.0;
  // A subject can be perfectly stable (MAD 0); floor the within-spread so discriminability
  // stays finite instead of exploding to Infinity on a single noiseless subject.
  const madFloor = options.madFloor ?? 1e-4;

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
  for (const key of FACE3D_METRIC_KEYS) {
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
        withinSpreads.length >= 1 &&
        subjectMedians.length >= 2 &&
        discriminability >= minDiscriminability,
    };
  }

  const evaluable = FACE3D_METRIC_KEYS.filter(
    k => metrics[k].repeatedSubjectCount >= 1 && metrics[k].subjectCount >= 2,
  );
  const overallPass = evaluable.length === FACE3D_METRIC_KEYS.length &&
    FACE3D_METRIC_KEYS.every(k => metrics[k].pass);

  return {
    schemaVersion: 'aura.face3d-repeatability.v1',
    minDiscriminability,
    madFloor,
    subjectCount: bySubject.size,
    captureCount: captures.length,
    metrics,
    overallPass,
    evaluableMetricCount: evaluable.length,
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
  for (const key of FACE3D_METRIC_KEYS) {
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
        'manifest: { "captures": [ { "subjectId": "subject-01", "capturePath": "..." }, ... ] }',
    );
    process.exit(2);
  }

  const manifestPath = argv[manifestFlag + 1];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const captures = (manifest.captures ?? []).map(entry => ({
    subjectId: entry.subjectId,
    metrics: extractMetricsFromCaptureFile(entry.capturePath),
  }));

  const summary = analyzeRepeatability(captures, {
    minDiscriminability: manifest.minDiscriminability,
    madFloor: manifest.madFloor,
  });

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
