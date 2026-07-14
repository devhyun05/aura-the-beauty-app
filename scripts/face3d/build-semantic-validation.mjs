#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  validateBilateralSymmetryPolicy,
} from './semantic-candidate-core.mjs';

export const CANDIDATE_SCHEMA_VERSION = 'aura.face3d-semantic-candidate.v1';
export const VALIDATION_SCHEMA_VERSION = 'aura.face3d-semantic-validation.v1';

const TOPOLOGY_ALGORITHM = 'sha256-le-v1';
const TOPOLOGY_SOURCE = 'arkit_face_mesh';
const GATE_VERSION = 'face3d-gate-v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const ALLOWED_SHOT_KINDS = new Set(['neutral', 'yawLeft', 'yawRight']);
const TOPOLOGY_FIELDS = [
  'algorithm',
  'vertexCount',
  'indexCount',
  'uvCount',
  'indicesHash',
  'uvHash',
  'fingerprint',
];
const FALLBACK_COLORS = [
  '#ff3b30',
  '#007aff',
  '#ffd60a',
  '#ff9f0a',
  '#30d158',
  '#64d2ff',
  '#bf5af2',
  '#5e5ce6',
  '#ff375f',
  '#40c8e0',
  '#ac8e68',
];
const SUBJECT_WARNING =
  '서로 다른 얼굴 3명 조건은 캡처 데이터만으로 자동 증명할 수 없습니다. 촬영 대상 구분과 3명 충족 여부는 사람이 기록하고 확인해야 합니다.';
const RUNTIME_WARNING =
  '이 도구는 재투영 검수판만 만들며 ARKitFaceSemanticMapV1.json 같은 런타임 승인 파일을 자동 생성하지 않습니다.';

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

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validateNonEmptyString(value, label) {
  requireCondition(typeof value === 'string' && value.trim().length > 0, `${label}가 없습니다.`);
  return value.trim();
}

function canonicalizeBilateralSymmetryPolicy(candidate) {
  const errors = validateBilateralSymmetryPolicy(candidate);
  requireCondition(errors.length === 0, errors.join('\n'));
  const policy = candidate.bilateralSymmetryPolicy;
  return {
    policyVersion: policy.policyVersion,
    mirrorSource: policy.mirrorSource,
    mirrorMapSha256: policy.mirrorMapSha256,
    topologyUvHash: policy.topologyUvHash,
    residualCap: policy.residualCap,
    minimumAmbiguityRatioRequired: policy.minimumAmbiguityRatioRequired,
    maximumResidual: policy.maximumResidual,
    minimumAmbiguityRatio: policy.minimumAmbiguityRatio,
    topologyMirrorPairCount: policy.topologyMirrorPairCount,
    topologySelfPairCount: policy.topologySelfPairCount,
    groupPairs: [...policy.groupPairs]
      .map(entry => ({
        leftGroupKey: entry.leftGroupKey,
        rightGroupKey: entry.rightGroupKey,
        ...(entry.uvSideBounds ? {uvSideBounds: {...entry.uvSideBounds}} : {}),
        pairs: [...entry.pairs]
          .map(pair => [...pair])
          .sort((left, right) => left[0] - right[0] || left[1] - right[1]),
      }))
      .sort((left, right) =>
        left.leftGroupKey.localeCompare(right.leftGroupKey)
          || left.rightGroupKey.localeCompare(right.rightGroupKey),
      ),
  };
}

export function computeBilateralSymmetryPolicySha256(candidate) {
  return sha256Text(JSON.stringify(canonicalizeBilateralSymmetryPolicy(candidate)));
}

export function validateTopologyFingerprint(value, label) {
  requireCondition(isObject(value), `${label} topologyFingerprint가 없습니다.`);
  const algorithm = validateNonEmptyString(value.algorithm, `${label} topologyFingerprint.algorithm`);
  requireCondition(
    algorithm === TOPOLOGY_ALGORITHM,
    `${label} topologyFingerprint.algorithm이 Unity 계약과 다릅니다: ${algorithm}`,
  );
  for (const field of ['vertexCount', 'indexCount', 'uvCount']) {
    requireCondition(
      Number.isInteger(value[field]) && value[field] > 0,
      `${label} topologyFingerprint.${field}가 잘못됐습니다.`,
    );
  }
  requireCondition(value.indexCount % 3 === 0, `${label} indexCount는 3의 배수여야 합니다.`);
  requireCondition(
    value.uvCount === value.vertexCount,
    `${label} topologyFingerprint.uvCount는 vertexCount와 같아야 합니다.`,
  );
  for (const field of ['indicesHash', 'uvHash', 'fingerprint']) {
    requireCondition(
      typeof value[field] === 'string' && SHA256_PATTERN.test(value[field]),
      `${label} topologyFingerprint.${field}는 64자리 SHA-256이어야 합니다.`,
    );
  }
  const normalized = {
    algorithm,
    vertexCount: value.vertexCount,
    indexCount: value.indexCount,
    uvCount: value.uvCount,
    indicesHash: value.indicesHash.toLowerCase(),
    uvHash: value.uvHash.toLowerCase(),
    fingerprint: value.fingerprint.toLowerCase(),
  };
  const expectedFingerprint = sha256Text([
    TOPOLOGY_ALGORITHM,
    TOPOLOGY_SOURCE,
    String(normalized.vertexCount),
    String(normalized.indexCount),
    String(normalized.uvCount),
    normalized.indicesHash,
    normalized.uvHash,
  ].join('|'));
  requireCondition(
    normalized.fingerprint === expectedFingerprint,
    `${label} topologyFingerprint.fingerprint가 Unity composite 계약과 일치하지 않습니다.`,
  );
  return normalized;
}

export function computeCandidateSemanticContentSha256(candidate) {
  requireCondition(isObject(candidate), 'candidate semantic content가 객체가 아닙니다.');
  const candidateId = validateNonEmptyString(candidate.candidateId, 'candidate.candidateId');
  requireCondition(
    candidate.schemaVersion === CANDIDATE_SCHEMA_VERSION,
    `candidate semantic schemaVersion이 잘못됐습니다: ${candidate.schemaVersion}`,
  );
  requireCondition(candidate.source === TOPOLOGY_SOURCE, 'candidate source가 arkit_face_mesh가 아닙니다.');
  requireCondition(candidate.gateVersion === GATE_VERSION, 'candidate gateVersion이 face3d-gate-v1이 아닙니다.');
  const topologyFingerprint = validateTopologyFingerprint(
    candidate.topologyFingerprint ?? candidate.topology,
    'candidate semantic content',
  );
  requireCondition(isObject(candidate.groups), 'candidate semantic groups가 없습니다.');
  const groupKeys = Object.keys(candidate.groups).sort();
  requireCondition(groupKeys.length > 0, 'candidate semantic groups가 비어 있습니다.');
  const groups = Object.fromEntries(groupKeys.map(groupKey => {
    const indices = candidate.groups[groupKey];
    requireCondition(Array.isArray(indices) && indices.length > 0, `${groupKey} 그룹이 비어 있습니다.`);
    requireCondition(new Set(indices).size === indices.length, `${groupKey} 그룹에 중복 정점이 있습니다.`);
    requireCondition(
      indices.every(index => Number.isInteger(index) && index >= 0 && index < topologyFingerprint.vertexCount),
      `${groupKey} 그룹에 범위를 벗어난 정점이 있습니다.`,
    );
    return [groupKey, [...indices].sort((left, right) => left - right)];
  }));
  const canonicalContent = {
    schemaVersion: candidate.schemaVersion,
    candidateId,
    source: candidate.source,
    gateVersion: candidate.gateVersion,
    topologyFingerprint,
    groups,
    bilateralSymmetryPolicy: canonicalizeBilateralSymmetryPolicy({
      ...candidate,
      topologyFingerprint,
      groups,
    }),
  };
  return sha256Text(JSON.stringify(canonicalContent));
}

function requireMatchingTopology(expected, actual, label) {
  const mismatches = TOPOLOGY_FIELDS.filter(field => expected[field] !== actual[field]);
  requireCondition(
    mismatches.length === 0,
    `${label} topology fingerprint가 후보와 다릅니다: ${mismatches.join(', ')}`,
  );
}

function validateCandidate(candidate, candidatePath) {
  requireCondition(isObject(candidate), `후보 JSON이 객체가 아닙니다: ${candidatePath}`);
  requireCondition(
    candidate.schemaVersion === CANDIDATE_SCHEMA_VERSION,
    `승인 전 candidate JSON만 사용할 수 있습니다. 기대 schemaVersion: ${CANDIDATE_SCHEMA_VERSION}`,
  );
  const candidateId = validateNonEmptyString(candidate.candidateId, 'candidateId');
  const reviewStatus = validateNonEmptyString(candidate.reviewStatus, 'reviewStatus');
  requireCondition(
    reviewStatus.includes('not_runtime_approved'),
    '런타임 승인 전 후보만 검증할 수 있습니다. reviewStatus가 not_runtime_approved 상태가 아닙니다.',
  );
  requireCondition(candidate.source === TOPOLOGY_SOURCE, '후보 source가 arkit_face_mesh가 아닙니다.');
  requireCondition(candidate.gateVersion === GATE_VERSION, '후보 gateVersion이 face3d-gate-v1이 아닙니다.');
  const topology = validateTopologyFingerprint(candidate.topologyFingerprint, '후보');
  requireCondition(isObject(candidate.groups), '후보 groups가 없습니다.');

  const groupEntries = Object.entries(candidate.groups);
  requireCondition(groupEntries.length > 0, '후보 groups가 비어 있습니다.');
  const groups = {};
  for (const [groupKey, indices] of groupEntries) {
    requireCondition(Array.isArray(indices) && indices.length > 0, `${groupKey} 그룹이 비어 있습니다.`);
    requireCondition(new Set(indices).size === indices.length, `${groupKey} 그룹에 중복 정점이 있습니다.`);
    requireCondition(
      indices.every(index => Number.isInteger(index) && index >= 0 && index < topology.vertexCount),
      `${groupKey} 그룹에 범위를 벗어난 정점이 있습니다.`,
    );
    groups[groupKey] = [...indices];
  }

  const bilateralSymmetryPolicy = canonicalizeBilateralSymmetryPolicy({
    ...candidate,
    topologyFingerprint: topology,
    groups,
  });

  return {
    bilateralSymmetryPolicy,
    candidateId,
    gateVersion: candidate.gateVersion,
    groupDefinitions: isObject(candidate.groupDefinitions) ? candidate.groupDefinitions : {},
    groups,
    reviewStatus,
    schemaVersion: candidate.schemaVersion,
    source: candidate.source,
    topology,
  };
}

function resolveInsideCapture(captureDirectory, relativePath, label) {
  const resolved = path.resolve(captureDirectory, relativePath);
  const relative = path.relative(captureDirectory, resolved);
  requireCondition(
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${label} 경로가 캡처 폴더 밖을 가리킵니다: ${relativePath}`,
  );
  return resolved;
}

function frameMimeType(framePath) {
  switch (path.extname(framePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      throw new Error(`지원하지 않는 프레임 이미지 형식입니다: ${framePath}`);
  }
}

function buildDataUri(framePath) {
  return `data:${frameMimeType(framePath)};base64,${fs.readFileSync(framePath).toString('base64')}`;
}

function validateCapture(captureDirectory, candidateTopology) {
  const exportPath = path.join(captureDirectory, 'arface_export.json');
  const summaryPath = path.join(captureDirectory, 'capture_summary.json');
  requireCondition(fs.existsSync(exportPath), `ARFace 덤프가 없습니다: ${exportPath}`);
  requireCondition(fs.existsSync(summaryPath), `capture summary가 없습니다: ${summaryPath}`);

  const payload = readJson(exportPath);
  const summary = readJson(summaryPath);
  const capturePairId = validateNonEmptyString(payload.capturePairId, `${captureDirectory} capturePairId`);
  const captureSetId = validateNonEmptyString(payload.captureSetId, `${capturePairId} captureSetId`);
  const captureShotKind = validateNonEmptyString(
    payload.captureShotKind,
    `${capturePairId} captureShotKind`,
  );
  requireCondition(
    ALLOWED_SHOT_KINDS.has(captureShotKind),
    `${capturePairId} captureShotKind가 지원 범위를 벗어났습니다: ${captureShotKind}`,
  );
  requireCondition(
    summary.capturePairId === capturePairId,
    `${capturePairId} capture_summary.json의 capturePairId가 ARFace 덤프와 다릅니다.`,
  );
  requireCondition(
    summary.captureSetId === captureSetId,
    `${capturePairId} capture_summary.json의 captureSetId가 ARFace 덤프와 다릅니다.`,
  );
  requireCondition(
    summary.captureShotKind === captureShotKind,
    `${capturePairId} capture_summary.json의 captureShotKind가 ARFace 덤프와 다릅니다.`,
  );

  const topology = validateTopologyFingerprint(
    payload.face3dCalibration?.topologyFingerprint,
    `${capturePairId} ARFace 덤프`,
  );
  requireMatchingTopology(candidateTopology, topology, capturePairId);
  const summaryTopology = validateTopologyFingerprint(
    summary.face3dCalibration?.topologyFingerprint,
    `${capturePairId} capture summary`,
  );
  requireMatchingTopology(topology, summaryTopology, `${capturePairId} capture summary`);

  const frameSize = payload.display?.videoFrameSize;
  requireCondition(
    Array.isArray(frameSize) && frameSize.length >= 2
      && Number.isFinite(frameSize[0]) && frameSize[0] > 0
      && Number.isFinite(frameSize[1]) && frameSize[1] > 0,
    `${capturePairId} display.videoFrameSize가 잘못됐습니다.`,
  );
  const [frameWidth, frameHeight] = frameSize;
  requireCondition(
    summary.frameWidth === frameWidth && summary.frameHeight === frameHeight,
    `${capturePairId} capture summary의 frame 크기가 ARFace 덤프와 다릅니다.`,
  );

  requireCondition(
    Array.isArray(payload.screenVertices) && payload.screenVertices.length === topology.vertexCount,
    `${capturePairId} screenVertices 개수가 topology vertexCount와 다릅니다.`,
  );
  requireCondition(
    payload.screenVertices.every(point =>
      Array.isArray(point) && point.length >= 3
      && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2])),
    `${capturePairId} screenVertices에 잘못된 좌표가 있습니다.`,
  );
  const outOfFrameIndices = [];
  for (let index = 0; index < payload.screenVertices.length; index += 1) {
    const [x, y] = payload.screenVertices[index];
    if (x < 0 || x > frameWidth || y < 0 || y > frameHeight) {
      outOfFrameIndices.push(index);
    }
  }
  requireCondition(
    outOfFrameIndices.length === 0,
    `${capturePairId} 얼굴 메시 전체가 프레임 안에 있지 않습니다. 화면 밖 정점 ${outOfFrameIndices.length}개`,
  );

  requireCondition(
    Array.isArray(payload.indices) && payload.indices.length === topology.indexCount,
    `${capturePairId} indices 개수가 topology indexCount와 다릅니다.`,
  );
  requireCondition(
    payload.indices.every(index => Number.isInteger(index) && index >= 0 && index < topology.vertexCount),
    `${capturePairId} indices에 범위를 벗어난 정점이 있습니다.`,
  );
  requireCondition(
    Array.isArray(payload.uvs) && payload.uvs.length === topology.uvCount,
    `${capturePairId} uvs 개수가 topology uvCount와 다릅니다.`,
  );
  requireCondition(
    payload.uvs.every(uv =>
      Array.isArray(uv) && uv.length >= 2
      && Number.isFinite(uv[0]) && Number.isFinite(uv[1])),
    `${capturePairId} uvs에 잘못된 좌표가 있습니다.`,
  );
  requireCondition(
    summary.meshVertexCount === topology.vertexCount
      && summary.meshIndexCount === topology.indexCount
      && summary.meshUvCount === topology.uvCount,
    `${capturePairId} capture summary의 mesh count가 topology와 다릅니다.`,
  );

  const frameRelativePath = validateNonEmptyString(
    payload.framePath ?? 'frame.png',
    `${capturePairId} framePath`,
  );
  const framePath = resolveInsideCapture(captureDirectory, frameRelativePath, `${capturePairId} framePath`);
  requireCondition(fs.existsSync(framePath), `검수용 프레임 이미지가 없습니다: ${framePath}`);

  return {
    captureDirectory,
    capturePairId,
    captureSetId,
    captureShotKind,
    dataUri: buildDataUri(framePath),
    frameHeight,
    framePath,
    frameWidth,
    indices: payload.indices,
    screenVertices: payload.screenVertices,
    topology,
    uvs: payload.uvs,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  return Number(value.toFixed(3));
}

function groupMetadata(candidate, groupKey, groupIndex) {
  const definition = isObject(candidate.groupDefinitions[groupKey])
    ? candidate.groupDefinitions[groupKey]
    : {};
  const rawColor = definition.color;
  return {
    color: typeof rawColor === 'string' && /^#[a-f0-9]{3,8}$/i.test(rawColor)
      ? rawColor
      : FALLBACK_COLORS[groupIndex % FALLBACK_COLORS.length],
    label: typeof definition.label === 'string' && definition.label.trim()
      ? definition.label.trim()
      : groupKey,
  };
}

function buildMeshPath(capture) {
  const commands = [];
  for (let offset = 0; offset < capture.indices.length; offset += 3) {
    const a = capture.screenVertices[capture.indices[offset]];
    const b = capture.screenVertices[capture.indices[offset + 1]];
    const c = capture.screenVertices[capture.indices[offset + 2]];
    commands.push(
      `M${formatNumber(a[0])},${formatNumber(a[1])}`
      + `L${formatNumber(b[0])},${formatNumber(b[1])}`
      + `L${formatNumber(c[0])},${formatNumber(c[1])}Z`,
    );
  }
  return commands.join('');
}

function buildGroupOverlay(candidate, capture, groupKey, groupIndex) {
  const metadata = groupMetadata(candidate, groupKey, groupIndex);
  const points = candidate.groups[groupKey].map(index => ({
    index,
    x: capture.screenVertices[index][0],
    y: capture.screenVertices[index][1],
  }));
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const radius = points.length <= 3 ? 6 : points.length <= 15 ? 4.5 : 3.5;
  const circles = points.map(point =>
    `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="${radius}" fill="${metadata.color}" stroke="#ffffff" stroke-width="1.5"><title>${escapeHtml(metadata.label)} · vertex ${point.index}</title></circle>`,
  ).join('');
  return `<g class="semantic-group semantic-group-${groupIndex}">${circles}<text class="group-label" x="${formatNumber(centerX + 8)}" y="${formatNumber(centerY - 8)}" fill="${metadata.color}">${escapeHtml(metadata.label)}</text></g>`;
}

function buildCaptureCard(candidate, capture, captureIndex) {
  const groupOverlays = Object.keys(candidate.groups)
    .map((groupKey, groupIndex) => buildGroupOverlay(candidate, capture, groupKey, groupIndex))
    .join('');
  return `<article class="capture-card">
    <header>
      <div><strong>${captureIndex + 1}. ${escapeHtml(capture.captureShotKind)}</strong><span>${escapeHtml(capture.capturePairId)}</span></div>
      <span class="status">입력 검증 통과 · 사람 검수 필요</span>
    </header>
    <svg viewBox="0 0 ${capture.frameWidth} ${capture.frameHeight}" role="img" aria-label="${escapeHtml(capture.capturePairId)} 후보 정점 재투영">
      <image href="${capture.dataUri}" x="0" y="0" width="${capture.frameWidth}" height="${capture.frameHeight}" preserveAspectRatio="none"/>
      <path class="mesh-overlay" d="${buildMeshPath(capture)}"/>
      ${groupOverlays}
    </svg>
    <div class="manual-checks">
      <label><input type="checkbox"/> 얼굴 메시와 원본 프레임 정합</label>
      <label><input type="checkbox"/> 각 색상 그룹의 해부학적 위치 정합</label>
      <label><input type="checkbox"/> 회전 시에도 동일 정점군 유지</label>
    </div>
  </article>`;
}

export function buildValidationOverlaySvg({candidate, capture}) {
  const groupOverlays = Object.keys(candidate.groups)
    .map((groupKey, groupIndex) => buildGroupOverlay(candidate, capture, groupKey, groupIndex))
    .join('');
  const title = `${capture.captureShotKind} · ${capture.capturePairId}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${capture.frameWidth}" height="${capture.frameHeight}" viewBox="0 0 ${capture.frameWidth} ${capture.frameHeight}">
  <image href="${capture.dataUri}" x="0" y="0" width="${capture.frameWidth}" height="${capture.frameHeight}"/>
  <path d="${buildMeshPath(capture)}" fill="none" stroke="#7dd3fc" stroke-width="0.7" stroke-opacity="0.24"/>
  <style>.group-label{font:800 14px -apple-system,BlinkMacSystemFont,sans-serif;paint-order:stroke;stroke:#000;stroke-width:4px;stroke-linejoin:round}</style>
  ${groupOverlays}
  <g><rect x="8" y="8" width="${Math.min(520, capture.frameWidth - 16)}" height="54" rx="10" fill="#000" fill-opacity="0.72"/><text x="22" y="32" fill="#fff" font-size="16" font-weight="700">${escapeHtml(title)}</text><text x="22" y="51" fill="#ffd38a" font-size="12">고정 후보 재투영 · 사람 검수 필요</text></g>
</svg>\n`;
}

export function buildValidationManifest({candidate, captures, candidatePath}) {
  const shotKinds = [...new Set(captures.map(capture => capture.captureShotKind))];
  const captureSetIds = [...new Set(captures.map(capture => capture.captureSetId))];
  return {
    schemaVersion: VALIDATION_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    result: 'inputs_valid_human_overlay_review_required',
    candidate: {
      candidateId: candidate.candidateId,
      candidatePath,
      reviewStatus: candidate.reviewStatus,
      schemaVersion: candidate.schemaVersion,
      semanticContentSha256: computeCandidateSemanticContentSha256(candidate),
    },
    bilateralSymmetryValidation: {
      status: 'passed',
      policyVersion: candidate.bilateralSymmetryPolicy.policyVersion,
      policySha256: computeBilateralSymmetryPolicySha256(candidate),
      mirrorMapSha256: candidate.bilateralSymmetryPolicy.mirrorMapSha256,
      groupPairCount: candidate.bilateralSymmetryPolicy.groupPairs.length,
      selectedMirrorPairCount: candidate.bilateralSymmetryPolicy.groupPairs
        .reduce((sum, entry) => sum + entry.pairs.length, 0),
      topologyMirrorPairCount: candidate.bilateralSymmetryPolicy.topologyMirrorPairCount,
      topologySelfPairCount: candidate.bilateralSymmetryPolicy.topologySelfPairCount,
    },
    topologyFingerprint: {...candidate.topology},
    captureCount: captures.length,
    captureShotKinds: shotKinds,
    captures: captures.map((capture, index) => ({
      capturePairId: capture.capturePairId,
      captureSetId: capture.captureSetId,
      captureShotKind: capture.captureShotKind,
      overlayFile: `semantic_validation_${String(index + 1).padStart(2, '0')}_${capture.captureShotKind}.svg`,
      overlaySha256: sha256Text(buildValidationOverlaySvg({candidate, capture})),
      frameHeight: capture.frameHeight,
      frameWidth: capture.frameWidth,
      fullMeshInFrame: true,
      outOfFrameVertexCount: 0,
      topologyMatch: true,
    })),
    captureSetIds,
    sameCaptureSet: captureSetIds.length === 1,
    groupVertexCounts: Object.fromEntries(
      Object.entries(candidate.groups).map(([groupKey, indices]) => [groupKey, indices.length]),
    ),
    subjectCoverage: {
      requiredMinimumDifferentPeople: 3,
      status: 'not_machine_verifiable',
    },
    runtimeMapGenerated: false,
    warnings: [RUNTIME_WARNING, SUBJECT_WARNING],
  };
}

export function buildValidationHtml({candidate, captures, manifest}) {
  const groupControls = Object.keys(candidate.groups).map((groupKey, groupIndex) => {
    const metadata = groupMetadata(candidate, groupKey, groupIndex);
    return `<label class="legend-item"><input type="checkbox" data-target="semantic-group-${groupIndex}" checked/><span style="background:${metadata.color}"></span>${escapeHtml(metadata.label)} <small>${candidate.groups[groupKey].length}</small></label>`;
  }).join('');
  const captureRows = captures.map(capture => `<tr><td>${escapeHtml(capture.capturePairId)}</td><td>${escapeHtml(capture.captureSetId)}</td><td>${escapeHtml(capture.captureShotKind)}</td><td>${capture.frameWidth}×${capture.frameHeight}</td><td>일치</td><td>전체 프레임 안</td></tr>`).join('');
  const cards = captures.map((capture, index) => buildCaptureCard(candidate, capture, index)).join('');
  const fingerprint = escapeHtml(candidate.topology.fingerprint);
  const manifestJson = escapeHtml(JSON.stringify(manifest, null, 2));

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Face3D G1 시맨틱 재투영 검증 매트릭스</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#090b10; color:#f5f7fb; }
    * { box-sizing:border-box; }
    body { margin:0; padding:28px; background:linear-gradient(160deg,#111827,#090b10 42%); }
    main { max-width:1600px; margin:0 auto; }
    h1 { margin:0 0 8px; font-size:clamp(24px,3vw,38px); }
    h2 { margin:28px 0 12px; font-size:20px; }
    p { color:#bcc5d6; line-height:1.55; }
    code { color:#a5d8ff; overflow-wrap:anywhere; }
    .warning { border:1px solid #f59e0b; background:#3b260c; color:#ffe3a3; border-radius:12px; padding:13px 16px; margin:10px 0; font-weight:650; }
    .metadata, .controls, .table-wrap, details { border:1px solid #293244; background:#111722; border-radius:14px; padding:16px; }
    .metadata { display:grid; gap:8px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
    .controls { display:flex; gap:12px 18px; flex-wrap:wrap; align-items:center; position:sticky; top:8px; z-index:5; box-shadow:0 12px 34px #0008; }
    .legend-item { display:flex; align-items:center; gap:6px; cursor:pointer; }
    .legend-item span { width:13px; height:13px; border-radius:50%; box-shadow:0 0 0 1px #fff8; }
    .legend-item small { color:#95a0b5; }
    .matrix { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr)); gap:18px; margin-top:18px; }
    .capture-card { overflow:hidden; border:1px solid #303b50; background:#0f1520; border-radius:16px; }
    .capture-card header { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:13px 15px; }
    .capture-card header div { display:flex; flex-direction:column; gap:4px; min-width:0; }
    .capture-card header span { color:#9ba6ba; font-size:12px; overflow-wrap:anywhere; }
    .capture-card .status { color:#ffd38a; text-align:right; }
    svg { display:block; width:100%; height:auto; background:#000; }
    .mesh-overlay { fill:none; stroke:#7dd3fc; stroke-width:0.7; stroke-opacity:0.24; vector-effect:non-scaling-stroke; }
    .semantic-group circle { vector-effect:non-scaling-stroke; }
    .group-label { display:none; font-size:14px; font-weight:800; paint-order:stroke; stroke:#000; stroke-width:4px; stroke-linejoin:round; }
    .manual-checks { display:grid; gap:8px; padding:13px 15px; color:#c8d0df; font-size:13px; }
    .manual-checks label { display:flex; gap:8px; align-items:center; }
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; min-width:720px; }
    th, td { padding:9px 10px; text-align:left; border-bottom:1px solid #293244; }
    th { color:#91a0ba; }
    details { margin-top:18px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; color:#b8c3d8; }
    @media (max-width:640px) { body { padding:16px; } .controls { position:static; } }
  </style>
</head>
<body>
<main>
  <h1>Face3D G1 시맨틱 재투영 검증 매트릭스</h1>
  <p>후보의 고정 정점 그룹을 각 캡처의 <code>screenVertices</code>에 그대로 재투영한 검수판입니다. 입력 계약 통과는 해부학적 정합 승인과 다릅니다.</p>
  <div class="warning">${escapeHtml(RUNTIME_WARNING)}</div>
  <div class="warning">${escapeHtml(SUBJECT_WARNING)}</div>
  <section class="metadata">
    <div><strong>후보</strong><br/><code>${escapeHtml(candidate.candidateId)}</code></div>
    <div><strong>캡처</strong><br/>${captures.length}개 · ${escapeHtml(manifest.captureShotKinds.join(', '))}</div>
    <div><strong>Topology fingerprint</strong><br/><code>${fingerprint}</code></div>
    <div><strong>판정</strong><br/>입력 검증 통과 · 사람의 오버레이 검수 필요</div>
  </section>

  <h2>표시 제어</h2>
  <section class="controls">
    <label class="legend-item"><input id="mesh-toggle" type="checkbox" checked/>메시 와이어</label>
    <label class="legend-item"><input id="label-toggle" type="checkbox"/>그룹 이름</label>
    ${groupControls}
  </section>

  <section class="matrix">${cards}</section>

  <h2>입력 검증 요약</h2>
  <div class="table-wrap">
    <table><thead><tr><th>capturePairId</th><th>captureSetId</th><th>captureShotKind</th><th>프레임</th><th>Topology</th><th>전체 메시</th></tr></thead><tbody>${captureRows}</tbody></table>
  </div>
  <details><summary>검증 manifest 보기</summary><pre>${manifestJson}</pre></details>
</main>
<script>
  document.querySelector('#mesh-toggle').addEventListener('change', event => {
    document.querySelectorAll('.mesh-overlay').forEach(element => {
      element.style.display = event.target.checked ? '' : 'none';
    });
  });
  document.querySelector('#label-toggle').addEventListener('change', event => {
    document.querySelectorAll('.group-label').forEach(element => {
      element.style.display = event.target.checked ? '' : 'none';
    });
  });
  document.querySelectorAll('[data-target]').forEach(input => {
    input.addEventListener('change', event => {
      document.querySelectorAll('.' + event.target.dataset.target).forEach(element => {
        element.style.display = event.target.checked ? '' : 'none';
      });
    });
  });
</script>
</body>
</html>\n`;
}

export function loadValidationInputs(candidateValue, captureValues) {
  const candidatePath = path.resolve(candidateValue);
  requireCondition(fs.existsSync(candidatePath), `후보 JSON이 없습니다: ${candidatePath}`);
  requireCondition(fs.statSync(candidatePath).isFile(), `후보 JSON 경로가 파일이 아닙니다: ${candidatePath}`);
  requireCondition(captureValues.length >= 2, '재투영 검증에는 캡처 폴더가 2개 이상 필요합니다.');
  const candidate = validateCandidate(readJson(candidatePath), candidatePath);
  const captures = captureValues.map(value => {
    const captureDirectory = path.resolve(value);
    requireCondition(
      fs.existsSync(captureDirectory) && fs.statSync(captureDirectory).isDirectory(),
      `캡처 폴더가 없습니다: ${captureDirectory}`,
    );
    return validateCapture(captureDirectory, candidate.topology);
  });
  for (const capture of captures) {
    const symmetryErrors = validateBilateralSymmetryPolicy(
      {
        ...candidate,
        topologyFingerprint: candidate.topology,
      },
      capture.uvs,
    );
    requireCondition(
      symmetryErrors.length === 0,
      `${capture.capturePairId} bilateral symmetry 검증 실패:\n${symmetryErrors.join('\n')}`,
    );
  }
  const capturePairIds = captures.map(capture => capture.capturePairId);
  requireCondition(
    new Set(capturePairIds).size === capturePairIds.length,
    'capturePairId가 중복된 캡처를 검증 매트릭스에 넣을 수 없습니다.',
  );
  return {candidate, candidatePath, captures};
}

function usage() {
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  console.error(`사용법: node ${script} <candidate.json> <capture-dir> <capture-dir> [...] --output <output-dir>`);
  console.error('예: npm run face3d:semantic:validate -- /path/to/candidate.json /path/to/neutral /path/to/yaw-left --output /path/to/review');
}

function parseCliArguments(argv) {
  const outputIndex = argv.findIndex(value => value === '--output' || value === '-o');
  requireCondition(outputIndex >= 0, '--output <output-dir>를 지정해야 합니다.');
  requireCondition(outputIndex === argv.length - 2, '--output 뒤에는 output-dir 하나만 지정해야 합니다.');
  const positional = argv.slice(0, outputIndex);
  requireCondition(positional.length >= 3, 'candidate JSON 1개와 캡처 폴더 2개 이상이 필요합니다.');
  return {
    candidateValue: positional[0],
    captureValues: positional.slice(1),
    outputValue: argv[outputIndex + 1],
  };
}

export function runCli(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    return;
  }
  const {candidateValue, captureValues, outputValue} = parseCliArguments(argv);
  const {candidate, candidatePath, captures} = loadValidationInputs(candidateValue, captureValues);
  const outputDirectory = path.resolve(outputValue);
  fs.mkdirSync(outputDirectory, {recursive: true});
  const manifest = buildValidationManifest({candidate, captures, candidatePath});
  const manifestPath = path.join(outputDirectory, 'semantic_validation_summary.json');
  const htmlPath = path.join(outputDirectory, 'semantic_validation_matrix.html');
  const html = buildValidationHtml({candidate, captures, manifest});
  manifest.reviewMatrix = {
    file: path.basename(htmlPath),
    sha256: sha256Text(html),
  };
  writeJson(manifestPath, manifest);
  fs.writeFileSync(htmlPath, html, 'utf8');
  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const overlayPath = path.join(outputDirectory, manifest.captures[index].overlayFile);
    fs.writeFileSync(
      overlayPath,
      buildValidationOverlaySvg({candidate, capture}),
      'utf8',
    );
  }

  console.log(`Face3D 고정 후보 재투영 검증판 생성 완료 (${captures.length} captures): ${htmlPath}`);
  console.log(`입력 검증 요약: ${manifestPath}`);
  console.log(`정적 재투영 SVG: ${manifest.captures.map(capture => capture.overlayFile).join(', ')}`);
  console.warn(`주의: ${RUNTIME_WARNING}`);
  console.warn(`주의: ${SUBJECT_WARNING}`);
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(`Face3D 재투영 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
