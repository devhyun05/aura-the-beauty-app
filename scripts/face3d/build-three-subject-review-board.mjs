#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  VALIDATION_SCHEMA_VERSION,
  validateTopologyFingerprint,
} from './build-semantic-validation.mjs';

export const THREE_SUBJECT_REVIEW_SCHEMA_VERSION =
  'aura.face3d-three-subject-review-board.v1';

const REQUIRED_SHOT_KINDS = Object.freeze(['neutral', 'yawLeft', 'yawRight']);
const REQUIRED_SUBJECT_COUNT = 3;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const PSEUDONYMOUS_SUBJECT_PATTERN = /^subject-[0-9]{2,}$/;
const HUMAN_APPROVAL_WARNING =
  '이 보드는 세 사람의 재투영 결과를 비교하기 위한 검수 자료입니다. 해부학적 정합은 사람이 직접 승인해야 합니다.';
const RUNTIME_MAP_WARNING =
  '이 도구는 런타임 시맨틱 맵을 생성하거나 승인하지 않습니다. ARKitFaceSemanticMapV1.json은 별도 승인 절차 뒤에만 생성해야 합니다.';
const CHECKBOX_WARNING =
  '보드의 체크박스는 임시 검수 메모일 뿐이며 승인 기록이나 런타임 파일로 저장되지 않습니다.';

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function validateNonEmptyString(value, label) {
  requireCondition(
    typeof value === 'string' && value.trim().length > 0,
    `${label}가 없습니다.`,
  );
  return value.trim();
}

function validateSha256(value, label) {
  requireCondition(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    `${label}는 64자리 SHA-256이어야 합니다.`,
  );
  return value.toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveInsideDirectory(directory, relativePath, label) {
  const normalizedRelativePath = validateNonEmptyString(relativePath, label);
  requireCondition(!path.isAbsolute(normalizedRelativePath), `${label}는 상대 경로여야 합니다.`);
  const resolved = path.resolve(directory, normalizedRelativePath);
  const relative = path.relative(directory, resolved);
  requireCondition(
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${label}가 validation 폴더 밖을 가리킵니다: ${normalizedRelativePath}`,
  );
  return resolved;
}

function requireArtifact({directory, relativePath, expectedSha256, label, expectedExtension}) {
  const artifactPath = resolveInsideDirectory(directory, relativePath, `${label}.file`);
  requireCondition(fs.existsSync(artifactPath), `${label} 파일이 없습니다: ${artifactPath}`);
  requireCondition(fs.statSync(artifactPath).isFile(), `${label} 경로가 파일이 아닙니다: ${artifactPath}`);
  if (expectedExtension) {
    requireCondition(
      path.extname(artifactPath).toLowerCase() === expectedExtension,
      `${label} 확장자는 ${expectedExtension}여야 합니다.`,
    );
  }
  const normalizedExpectedSha256 = validateSha256(expectedSha256, `${label}.sha256`);
  const actualSha256 = sha256File(artifactPath);
  requireCondition(
    actualSha256 === normalizedExpectedSha256,
    `${label} SHA-256이 summary와 다릅니다. expected=${normalizedExpectedSha256} actual=${actualSha256}`,
  );
  return {
    artifactPath,
    relativePath: path.relative(directory, artifactPath),
    sha256: actualSha256,
  };
}

function sameTopology(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateStandaloneSvg(svgSource, label) {
  requireCondition(
    /<svg(?:\s|>)/i.test(svgSource) && /<\/svg>\s*$/i.test(svgSource),
    `${label}가 완전한 SVG가 아닙니다.`,
  );
  requireCondition(!/<script(?:\s|>)/i.test(svgSource), `${label}에 script가 포함돼 있습니다.`);
  requireCondition(
    !/\son[a-z]+\s*=/i.test(svgSource),
    `${label}에 실행 가능한 event handler가 포함돼 있습니다.`,
  );
  const resourceReferences = [...svgSource.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
    .map(match => match[1]);
  requireCondition(
    resourceReferences.some(reference => reference.startsWith('data:image/')),
    `${label}에 base64 또는 data URI로 내장된 프레임 이미지가 없습니다.`,
  );
  const externalReference = resourceReferences.find(reference =>
    !reference.startsWith('data:') && !reference.startsWith('#'));
  requireCondition(
    externalReference === undefined,
    `${label}가 외부 resource를 참조해 standalone이 아닙니다: ${externalReference}`,
  );
  const cssReferences = [...svgSource.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)]
    .map(match => match[1]);
  const externalCssReference = cssReferences.find(reference =>
    !reference.startsWith('data:') && !reference.startsWith('#'));
  requireCondition(
    externalCssReference === undefined,
    `${label} CSS가 외부 resource를 참조해 standalone이 아닙니다: ${externalCssReference}`,
  );
}

function validatePseudonymousSubjectLabel(value) {
  const label = validateNonEmptyString(value, 'subject label');
  requireCondition(
    PSEUDONYMOUS_SUBJECT_PATTERN.test(label),
    `subject label은 실명 대신 subject-01 같은 익명 코드여야 합니다: ${label}`,
  );
  return label;
}

function validateValidationSummary({subjectLabel, summaryPath}) {
  const absoluteSummaryPath = path.resolve(summaryPath);
  requireCondition(fs.existsSync(absoluteSummaryPath), `validation summary가 없습니다: ${absoluteSummaryPath}`);
  requireCondition(
    fs.statSync(absoluteSummaryPath).isFile(),
    `validation summary 경로가 파일이 아닙니다: ${absoluteSummaryPath}`,
  );
  const validationDirectory = path.dirname(absoluteSummaryPath);
  const summary = readJson(absoluteSummaryPath);
  requireCondition(isObject(summary), `${subjectLabel} validation summary가 객체가 아닙니다.`);
  requireCondition(
    summary.schemaVersion === VALIDATION_SCHEMA_VERSION,
    `${subjectLabel} validation schemaVersion이 잘못됐습니다: ${summary.schemaVersion}`,
  );
  requireCondition(
    summary.result === 'inputs_valid_human_overlay_review_required',
    `${subjectLabel} validation result가 사람 검수 대기 상태가 아닙니다: ${summary.result}`,
  );
  requireCondition(
    summary.runtimeMapGenerated === false,
    `${subjectLabel} summary는 런타임 맵이 생성되지 않은 검수 결과여야 합니다.`,
  );

  requireCondition(isObject(summary.candidate), `${subjectLabel} candidate 정보가 없습니다.`);
  const candidateId = validateNonEmptyString(
    summary.candidate.candidateId,
    `${subjectLabel} candidateId`,
  );
  const semanticContentSha256 = validateSha256(
    summary.candidate.semanticContentSha256,
    `${subjectLabel} semanticContentSha256`,
  );
  const reviewStatus = validateNonEmptyString(
    summary.candidate.reviewStatus,
    `${subjectLabel} candidate.reviewStatus`,
  );
  requireCondition(
    reviewStatus.includes('not_runtime_approved'),
    `${subjectLabel} candidate는 not_runtime_approved 상태여야 합니다.`,
  );
  const topologyFingerprint = validateTopologyFingerprint(
    summary.topologyFingerprint,
    `${subjectLabel} validation summary`,
  );
  requireCondition(
    isObject(summary.bilateralSymmetryValidation),
    `${subjectLabel} bilateralSymmetryValidation이 없습니다.`,
  );
  const bilateralSymmetryValidation = {
    status: validateNonEmptyString(
      summary.bilateralSymmetryValidation.status,
      `${subjectLabel} bilateral symmetry status`,
    ),
    policyVersion: validateNonEmptyString(
      summary.bilateralSymmetryValidation.policyVersion,
      `${subjectLabel} bilateral symmetry policyVersion`,
    ),
    policySha256: validateSha256(
      summary.bilateralSymmetryValidation.policySha256,
      `${subjectLabel} bilateral symmetry policySha256`,
    ),
    mirrorMapSha256: validateSha256(
      summary.bilateralSymmetryValidation.mirrorMapSha256,
      `${subjectLabel} bilateral symmetry mirrorMapSha256`,
    ),
    selectedMirrorPairCount: summary.bilateralSymmetryValidation.selectedMirrorPairCount,
  };
  requireCondition(
    bilateralSymmetryValidation.status === 'passed',
    `${subjectLabel} bilateral symmetry 검증이 passed가 아닙니다.`,
  );
  requireCondition(
    Number.isInteger(bilateralSymmetryValidation.selectedMirrorPairCount)
      && bilateralSymmetryValidation.selectedMirrorPairCount > 0,
    `${subjectLabel} selectedMirrorPairCount가 잘못됐습니다.`,
  );

  requireCondition(
    summary.captureCount === REQUIRED_SHOT_KINDS.length,
    `${subjectLabel} captureCount는 정확히 3이어야 합니다.`,
  );
  requireCondition(
    Array.isArray(summary.captures) && summary.captures.length === REQUIRED_SHOT_KINDS.length,
    `${subjectLabel} captures는 정확히 3개여야 합니다.`,
  );
  requireCondition(
    Array.isArray(summary.captureShotKinds),
    `${subjectLabel} captureShotKinds가 없습니다.`,
  );
  const declaredShotKinds = [...summary.captureShotKinds].sort();
  const expectedShotKinds = [...REQUIRED_SHOT_KINDS].sort();
  requireCondition(
    JSON.stringify(declaredShotKinds) === JSON.stringify(expectedShotKinds),
    `${subjectLabel} captureShotKinds는 neutral, yawLeft, yawRight를 각각 하나씩 포함해야 합니다.`,
  );

  const capturesByShotKind = new Map();
  for (const capture of summary.captures) {
    requireCondition(isObject(capture), `${subjectLabel} capture 항목이 객체가 아닙니다.`);
    const shotKind = validateNonEmptyString(
      capture.captureShotKind,
      `${subjectLabel} captureShotKind`,
    );
    requireCondition(
      REQUIRED_SHOT_KINDS.includes(shotKind),
      `${subjectLabel} 지원하지 않는 captureShotKind입니다: ${shotKind}`,
    );
    requireCondition(
      !capturesByShotKind.has(shotKind),
      `${subjectLabel} ${shotKind} 촬영이 중복됐습니다.`,
    );
    requireCondition(
      capture.fullMeshInFrame === true && capture.outOfFrameVertexCount === 0,
      `${subjectLabel} ${shotKind} 메시가 프레임 안에 완전히 들어오지 않았습니다.`,
    );
    requireCondition(
      capture.topologyMatch === true,
      `${subjectLabel} ${shotKind} topologyMatch가 true가 아닙니다.`,
    );
    const overlay = requireArtifact({
      directory: validationDirectory,
      relativePath: capture.overlayFile,
      expectedSha256: capture.overlaySha256,
      expectedExtension: '.svg',
      label: `${subjectLabel} ${shotKind} overlay`,
    });
    const svgSource = fs.readFileSync(overlay.artifactPath, 'utf8');
    validateStandaloneSvg(svgSource, `${subjectLabel} ${shotKind} overlay`);
    capturesByShotKind.set(shotKind, {
      capturePairId: validateNonEmptyString(
        capture.capturePairId,
        `${subjectLabel} ${shotKind} capturePairId`,
      ),
      frameHeight: capture.frameHeight,
      frameWidth: capture.frameWidth,
      overlayFile: overlay.relativePath,
      overlaySha256: overlay.sha256,
      shotKind,
      svgBase64: Buffer.from(svgSource, 'utf8').toString('base64'),
    });
  }
  for (const shotKind of REQUIRED_SHOT_KINDS) {
    requireCondition(
      capturesByShotKind.has(shotKind),
      `${subjectLabel} ${shotKind} 촬영이 없습니다.`,
    );
  }

  requireCondition(isObject(summary.reviewMatrix), `${subjectLabel} reviewMatrix가 없습니다.`);
  const reviewMatrix = requireArtifact({
    directory: validationDirectory,
    relativePath: summary.reviewMatrix.file,
    expectedSha256: summary.reviewMatrix.sha256,
    expectedExtension: '.html',
    label: `${subjectLabel} reviewMatrix`,
  });

  return {
    bilateralSymmetryValidation,
    candidateId,
    captures: REQUIRED_SHOT_KINDS.map(shotKind => capturesByShotKind.get(shotKind)),
    reviewMatrix: {
      file: reviewMatrix.relativePath,
      sha256: reviewMatrix.sha256,
    },
    semanticContentSha256,
    sourceSummaryFile: path.basename(absoluteSummaryPath),
    sourceSummarySha256: sha256File(absoluteSummaryPath),
    subjectLabel,
    summaryPath: absoluteSummaryPath,
    topologyFingerprint,
  };
}

export function loadThreeSubjectReviewInputs(subjectInputs) {
  requireCondition(
    Array.isArray(subjectInputs) && subjectInputs.length === REQUIRED_SUBJECT_COUNT,
    `검수 보드에는 익명 대상 3명의 validation summary가 정확히 필요합니다.`,
  );
  const normalizedInputs = subjectInputs.map(input => {
    requireCondition(isObject(input), 'subject 입력 형식이 잘못됐습니다.');
    return {
      subjectLabel: validatePseudonymousSubjectLabel(input.subjectLabel),
      summaryPath: validateNonEmptyString(input.summaryPath, 'validation summary path'),
    };
  });
  requireCondition(
    new Set(normalizedInputs.map(input => input.subjectLabel)).size === REQUIRED_SUBJECT_COUNT,
    'subject label이 중복됐습니다.',
  );
  requireCondition(
    new Set(normalizedInputs.map(input => path.resolve(input.summaryPath))).size
      === REQUIRED_SUBJECT_COUNT,
    '같은 validation summary를 여러 사람으로 중복 사용할 수 없습니다.',
  );

  const subjects = normalizedInputs.map(validateValidationSummary);
  const reference = subjects[0];
  for (const subject of subjects.slice(1)) {
    requireCondition(
      subject.candidateId === reference.candidateId,
      `${subject.subjectLabel} candidateId가 ${reference.subjectLabel}과 다릅니다.`,
    );
    requireCondition(
      subject.semanticContentSha256 === reference.semanticContentSha256,
      `${subject.subjectLabel} semanticContentSha256가 ${reference.subjectLabel}과 다릅니다.`,
    );
    requireCondition(
      sameTopology(subject.topologyFingerprint, reference.topologyFingerprint),
      `${subject.subjectLabel} topology fingerprint가 ${reference.subjectLabel}과 다릅니다.`,
    );
    requireCondition(
      JSON.stringify(subject.bilateralSymmetryValidation)
        === JSON.stringify(reference.bilateralSymmetryValidation),
      `${subject.subjectLabel} bilateral symmetry policy/hash가 ${reference.subjectLabel}과 다릅니다.`,
    );
  }

  const capturePairIds = subjects.flatMap(subject =>
    subject.captures.map(capture => capture.capturePairId));
  requireCondition(
    new Set(capturePairIds).size === capturePairIds.length,
    '서로 다른 subject 사이에 capturePairId가 중복됐습니다.',
  );
  return subjects;
}

export function buildThreeSubjectReviewManifest(subjects) {
  const reference = subjects[0];
  return {
    schemaVersion: THREE_SUBJECT_REVIEW_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    result: 'artifacts_verified_human_approval_required',
    reviewStatus: 'human_approval_required_not_runtime_approved',
    requiredSubjectCount: REQUIRED_SUBJECT_COUNT,
    subjectCount: subjects.length,
    requiredShotKinds: [...REQUIRED_SHOT_KINDS],
    candidate: {
      candidateId: reference.candidateId,
      semanticContentSha256: reference.semanticContentSha256,
    },
    bilateralSymmetryValidation: {...reference.bilateralSymmetryValidation},
    topologyFingerprint: {...reference.topologyFingerprint},
    subjects: subjects.map(subject => ({
      bilateralSymmetryValidation: {...subject.bilateralSymmetryValidation},
      subjectLabel: subject.subjectLabel,
      sourceSummaryFile: subject.sourceSummaryFile,
      sourceSummarySha256: subject.sourceSummarySha256,
      reviewMatrix: {
        ...subject.reviewMatrix,
        artifactSha256Verified: true,
      },
      captures: subject.captures.map(capture => ({
        capturePairId: capture.capturePairId,
        captureShotKind: capture.shotKind,
        overlayFile: capture.overlayFile,
        overlaySha256: capture.overlaySha256,
        artifactSha256Verified: true,
        embeddedAsBase64: true,
      })),
    })),
    artifactVerification: {
      validationSummaryCount: subjects.length,
      reviewMatrixCount: subjects.length,
      overlaySvgCount: subjects.reduce((sum, subject) => sum + subject.captures.length, 0),
      allReferencedArtifactSha256Verified: true,
    },
    humanApprovalRequired: true,
    runtimeMapGenerated: false,
    warnings: [HUMAN_APPROVAL_WARNING, RUNTIME_MAP_WARNING, CHECKBOX_WARNING],
  };
}

function buildReviewCell(subject, capture) {
  const label = `${subject.subjectLabel} ${capture.shotKind}`;
  return `<article class="review-cell" data-subject="${escapeHtml(subject.subjectLabel)}" data-shot="${escapeHtml(capture.shotKind)}">
    <header><strong>${escapeHtml(subject.subjectLabel)}</strong><span>${escapeHtml(capture.shotKind)}</span></header>
    <img class="review-overlay" src="data:image/svg+xml;base64,${capture.svgBase64}" data-embedded-svg="true" alt="${escapeHtml(label)} 시맨틱 메시 재투영"/>
    <label class="cell-check"><input type="checkbox"/> 해부학적 위치 확인</label>
  </article>`;
}

export function buildThreeSubjectReviewHtml({subjects, manifest}) {
  const subjectHeaders = subjects
    .map(subject => `<div class="subject-header">${escapeHtml(subject.subjectLabel)}</div>`)
    .join('');
  const reviewRows = REQUIRED_SHOT_KINDS.map(shotKind => {
    const cells = subjects.map(subject => {
      const capture = subject.captures.find(item => item.shotKind === shotKind);
      return buildReviewCell(subject, capture);
    }).join('');
    return `<div class="shot-label">${escapeHtml(shotKind)}</div>${cells}`;
  }).join('');
  const subjectChecks = subjects
    .map(subject => `<label><input type="checkbox"/> ${escapeHtml(subject.subjectLabel)} 3자세 정합</label>`)
    .join('');
  const manifestJson = escapeHtml(JSON.stringify(manifest, null, 2));

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="icon" href="data:,"/>
  <title>Face3D G1 세 사람 시맨틱 메시 검수 보드</title>
  <style>
    :root { color-scheme:dark; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#090b10; color:#f5f7fb; }
    * { box-sizing:border-box; }
    body { margin:0; padding:22px; background:linear-gradient(155deg,#172033,#090b10 36%); }
    main { max-width:1900px; margin:0 auto; }
    h1 { margin:0 0 8px; font-size:clamp(24px,3vw,38px); }
    h2 { margin:24px 0 10px; font-size:19px; }
    p { color:#bec8da; line-height:1.5; }
    code { color:#a5d8ff; overflow-wrap:anywhere; }
    .warning { border:1px solid #f59e0b; background:#3b260c; color:#ffe3a3; border-radius:11px; padding:11px 14px; margin:9px 0; font-weight:650; }
    .critical { border-color:#fb7185; background:#3c141c; color:#ffd1da; }
    .metadata, .controls, .approval-panel, details { border:1px solid #2c374a; background:#111722; border-radius:13px; padding:14px; }
    .metadata { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:9px; margin-top:14px; }
    .controls { display:flex; gap:18px; align-items:center; flex-wrap:wrap; position:sticky; top:8px; z-index:5; box-shadow:0 12px 30px #0009; }
    .controls label, .approval-panel label, .cell-check { display:flex; align-items:center; gap:7px; }
    .board-scroll { overflow-x:auto; margin-top:14px; padding-bottom:8px; }
    .board { min-width:1040px; display:grid; grid-template-columns:82px repeat(3,minmax(300px,1fr)); gap:10px; align-items:start; }
    .corner, .subject-header, .shot-label { padding:10px; border-radius:10px; background:#182133; color:#dbe5f5; font-weight:800; text-align:center; }
    .shot-label { writing-mode:vertical-rl; transform:rotate(180deg); min-height:260px; display:grid; place-items:center; color:#9bd4ff; }
    .review-cell { overflow:hidden; border:1px solid #303c51; border-radius:12px; background:#0f1520; }
    .review-cell header { display:flex; justify-content:space-between; gap:8px; padding:9px 11px; }
    .review-cell header span { color:#9bd4ff; }
    .review-overlay, .review-svg { display:block; width:100%; height:auto; background:#000; }
    .cell-check { padding:9px 11px; color:#cbd4e4; font-size:13px; }
    .review-svg .group-label { display:none !important; }
    body.show-group-labels .review-svg .group-label { display:block !important; }
    body.hide-mesh .review-svg .review-board-mesh { display:none !important; }
    .approval-panel { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
    details { margin-top:18px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; color:#bac5d8; }
    @media (max-width:680px) { body { padding:14px; } .controls { position:static; } }
  </style>
</head>
<body>
<main>
  <h1>Face3D G1 세 사람 시맨틱 메시 검수 보드</h1>
  <p>동일 후보 정점군을 익명 대상 3명 × 정면·좌회전·우회전 3자세에 재투영한 비교판입니다. 자동 검증은 후보·topology·파일 무결성까지만 보증합니다.</p>
  <div class="warning critical">${escapeHtml(HUMAN_APPROVAL_WARNING)}</div>
  <div class="warning critical">${escapeHtml(RUNTIME_MAP_WARNING)}</div>
  <div class="warning">${escapeHtml(CHECKBOX_WARNING)}</div>

  <section class="metadata">
    <div><strong>후보 ID</strong><br/><code>${escapeHtml(manifest.candidate.candidateId)}</code></div>
    <div><strong>Semantic SHA-256</strong><br/><code>${escapeHtml(manifest.candidate.semanticContentSha256)}</code></div>
    <div><strong>Topology</strong><br/><code>${escapeHtml(manifest.topologyFingerprint.fingerprint)}</code></div>
    <div><strong>좌우 UV 쌍 정책</strong><br/><code>${escapeHtml(manifest.bilateralSymmetryValidation.policyVersion)}</code><br/>선택 쌍 ${manifest.bilateralSymmetryValidation.selectedMirrorPairCount}개 · 검증 통과</div>
    <div><strong>검증 범위</strong><br/>3명 · 9 SVG · 참조 artifact SHA-256 일치</div>
    <div><strong>현재 상태</strong><br/>사람 승인 필요 · 런타임 맵 아님</div>
  </section>

  <h2>표시 제어</h2>
  <section class="controls">
    <label><input id="mesh-toggle" type="checkbox" checked/>메시 와이어</label>
    <label><input id="label-toggle" type="checkbox"/>그룹 이름</label>
  </section>

  <div class="board-scroll">
    <section class="board" aria-label="세 사람 세 자세 비교 보드">
      <div class="corner">자세</div>${subjectHeaders}${reviewRows}
    </section>
  </div>

  <h2>사람 검수 체크</h2>
  <section class="approval-panel">
    ${subjectChecks}
    <label><input type="checkbox"/> 세 사람 모두 같은 해부학적 정점군임을 확인</label>
    <label><input type="checkbox"/> 최종 승인 담당자에게 별도 승인 요청</label>
  </section>
  <details><summary>검증 manifest 보기</summary><pre>${manifestJson}</pre></details>
</main>
<script>
  const decodeUtf8Base64 = value => {
    const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  document.querySelectorAll('.review-overlay[data-embedded-svg="true"]').forEach(image => {
    const base64Start = image.src.indexOf(',') + 1;
    if (base64Start <= 0) return;
    const source = decodeUtf8Base64(image.src.slice(base64Start));
    const documentValue = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = documentValue.documentElement;
    if (svg.localName !== 'svg' || documentValue.querySelector('parsererror')) return;
    svg.classList.add('review-svg');
    const mesh = svg.querySelector('path');
    if (mesh) mesh.classList.add('review-board-mesh');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', image.alt);
    image.replaceWith(document.importNode(svg, true));
  });

  document.querySelector('#mesh-toggle').addEventListener('change', event => {
    document.body.classList.toggle('hide-mesh', !event.target.checked);
  });
  document.querySelector('#label-toggle').addEventListener('change', event => {
    document.body.classList.toggle('show-group-labels', event.target.checked);
  });
</script>
</body>
</html>\n`;
}

function usage() {
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  console.error(`사용법: node ${script} --subject subject-01 <summary.json> --subject subject-02 <summary.json> --subject subject-03 <summary.json> --output <output-dir>`);
  console.error('subject label에는 실명 대신 subject-01 형식의 익명 코드만 사용할 수 있습니다.');
}

export function parseCliArguments(argv) {
  const subjectInputs = [];
  let outputValue = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--subject') {
      requireCondition(index + 2 < argv.length, '--subject 뒤에 익명 label과 summary path가 필요합니다.');
      subjectInputs.push({
        subjectLabel: argv[index + 1],
        summaryPath: argv[index + 2],
      });
      index += 2;
      continue;
    }
    if (value === '--output' || value === '-o') {
      requireCondition(outputValue === null, '--output을 두 번 지정할 수 없습니다.');
      requireCondition(index + 1 < argv.length, '--output 뒤에 output directory가 필요합니다.');
      outputValue = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`알 수 없는 인자입니다: ${value}`);
  }
  requireCondition(outputValue !== null, '--output <output-dir>를 지정해야 합니다.');
  requireCondition(subjectInputs.length === REQUIRED_SUBJECT_COUNT, '--subject를 정확히 3번 지정해야 합니다.');
  return {outputValue, subjectInputs};
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return;
  }
  const {outputValue, subjectInputs} = parseCliArguments(argv);
  const subjects = loadThreeSubjectReviewInputs(subjectInputs);
  const outputDirectory = path.resolve(outputValue);
  fs.mkdirSync(outputDirectory, {recursive: true});
  const runtimeMapPath = path.join(outputDirectory, 'ARKitFaceSemanticMapV1.json');
  requireCondition(
    !fs.existsSync(runtimeMapPath),
    `출력 폴더에 런타임 맵이 이미 있어 검수 전용 상태를 보증할 수 없습니다: ${runtimeMapPath}`,
  );

  const manifest = buildThreeSubjectReviewManifest(subjects);
  const htmlPath = path.join(outputDirectory, 'three_subject_review_board.html');
  const manifestPath = path.join(outputDirectory, 'three_subject_review_summary.json');
  const html = buildThreeSubjectReviewHtml({subjects, manifest});
  manifest.reviewBoard = {
    file: path.basename(htmlPath),
    sha256: sha256(html),
    standalone: true,
    embeddedSvgCount: REQUIRED_SUBJECT_COUNT * REQUIRED_SHOT_KINDS.length,
  };
  fs.writeFileSync(htmlPath, html, 'utf8');
  writeJson(manifestPath, manifest);

  console.log(`Face3D 세 사람 검수 보드 생성 완료: ${htmlPath}`);
  console.log(`검증 summary: ${manifestPath}`);
  console.log('참조 artifact SHA-256 검증: validation HTML 3개 + overlay SVG 9개 일치');
  console.warn(`주의: ${HUMAN_APPROVAL_WARNING}`);
  console.warn(`주의: ${RUNTIME_MAP_WARNING}`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(`Face3D 세 사람 검수 보드 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
