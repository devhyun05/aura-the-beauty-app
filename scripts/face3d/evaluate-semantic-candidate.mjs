#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  CANDIDATE_SCHEMA_VERSION,
  validateBilateralSymmetryPolicy,
  validateCandidateGroups,
} from './semantic-candidate-core.mjs';

const DIAGNOSTICS_SCHEMA_VERSION = 'aura.face3d-semantic-candidate-diagnostics.v1';
const DIAGNOSTICS_STATUS = 'provisional_candidate_diagnostics';
const CAPTURE_SCHEMA_VERSION = 'e7-arface-frame-export-v1';
const FACE3D_SOURCE = 'arkit_face_mesh';
const GATE_VERSION = 'face3d-gate-v1';
const HASH_ALGORITHM = 'sha256-le-v1';
const GEOMETRY_EPSILON = 0.000001;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const CAPTURE_SHOT_KINDS = new Set(['neutral', 'yawLeft', 'yawRight']);

export const METRIC_GROUP_KEYS = Object.freeze([
  'noseTipIndices',
  'chinIndices',
  'upperLipIndices',
  'lowerLipIndices',
  'midfaceReferenceLeftIndices',
  'midfaceReferenceRightIndices',
  'midfaceReferenceUpperIndices',
  'chinReferenceLeftIndices',
  'chinReferenceRightIndices',
  'chinReferenceUpperIndices',
  'centralRegionIndices',
]);

export const UNUSED_CANDIDATE_GROUP_KEYS = Object.freeze([
  'chinBottomIndices',
]);

export const METRIC_KEYS = Object.freeze([
  'noseTipProjection',
  'chinProjection',
  'upperLipToELine',
  'lowerLipToELine',
  'centralProjectionScore',
]);

const METRIC_GROUP_MAPPING = Object.freeze({
  noseTipProjection: ['noseTipIndices', 'midfaceReferenceLeftIndices', 'midfaceReferenceRightIndices', 'midfaceReferenceUpperIndices'],
  chinProjection: ['chinIndices', 'chinReferenceLeftIndices', 'chinReferenceRightIndices', 'chinReferenceUpperIndices'],
  upperLipToELine: ['upperLipIndices', 'noseTipIndices', 'chinIndices', 'midfaceReferenceLeftIndices', 'midfaceReferenceRightIndices', 'midfaceReferenceUpperIndices'],
  lowerLipToELine: ['lowerLipIndices', 'noseTipIndices', 'chinIndices', 'midfaceReferenceLeftIndices', 'midfaceReferenceRightIndices', 'midfaceReferenceUpperIndices'],
  centralProjectionScore: ['centralRegionIndices', 'midfaceReferenceLeftIndices', 'midfaceReferenceRightIndices', 'midfaceReferenceUpperIndices'],
});

export class Face3DCandidateDiagnosticsError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'Face3DCandidateDiagnosticsError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new Face3DCandidateDiagnosticsError(code, message);
}

function requireCondition(condition, code, message) {
  if (!condition) {
    fail(code, message);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isFiniteTuple(value, length) {
  return Array.isArray(value)
    && value.length === length
    && value.every(Number.isFinite);
}

function normalizedTopologyFingerprint(value, context) {
  requireCondition(value && typeof value === 'object', 'topology_missing', `${context} topologyFingerprint가 없습니다.`);
  requireCondition(value.algorithm === HASH_ALGORITHM, 'topology_algorithm_unsupported', `${context} hash algorithm이 ${HASH_ALGORITHM}이 아닙니다.`);
  requireCondition(Number.isInteger(value.vertexCount) && value.vertexCount > 0, 'topology_counts_invalid', `${context} vertexCount가 잘못되었습니다.`);
  requireCondition(Number.isInteger(value.indexCount) && value.indexCount > 0, 'topology_counts_invalid', `${context} indexCount가 잘못되었습니다.`);
  requireCondition(Number.isInteger(value.uvCount) && value.uvCount > 0, 'topology_counts_invalid', `${context} uvCount가 잘못되었습니다.`);
  requireCondition(value.indexCount % 3 === 0 && value.uvCount === value.vertexCount, 'topology_shape_invalid', `${context} topology 배열 크기 관계가 잘못되었습니다.`);
  requireCondition(SHA256_PATTERN.test(value.indicesHash ?? ''), 'topology_hash_invalid', `${context} indicesHash가 SHA-256 형식이 아닙니다.`);
  requireCondition(SHA256_PATTERN.test(value.uvHash ?? ''), 'topology_hash_invalid', `${context} uvHash가 SHA-256 형식이 아닙니다.`);
  requireCondition(SHA256_PATTERN.test(value.fingerprint ?? ''), 'topology_hash_invalid', `${context} fingerprint가 SHA-256 형식이 아닙니다.`);

  const topology = {
    algorithm: value.algorithm,
    vertexCount: value.vertexCount,
    indexCount: value.indexCount,
    uvCount: value.uvCount,
    indicesHash: value.indicesHash.toLowerCase(),
    uvHash: value.uvHash.toLowerCase(),
    fingerprint: value.fingerprint.toLowerCase(),
  };
  const composite = [
    topology.algorithm,
    FACE3D_SOURCE,
    topology.vertexCount,
    topology.indexCount,
    topology.uvCount,
    topology.indicesHash,
    topology.uvHash,
  ].join('|');
  requireCondition(
    sha256(composite) === topology.fingerprint,
    'topology_fingerprint_inconsistent',
    `${context} fingerprint가 counts/hash 조합과 일치하지 않습니다.`,
  );
  return topology;
}

function topologyEquals(left, right) {
  return left.algorithm === right.algorithm
    && left.vertexCount === right.vertexCount
    && left.indexCount === right.indexCount
    && left.uvCount === right.uvCount
    && left.indicesHash === right.indicesHash
    && left.uvHash === right.uvHash
    && left.fingerprint === right.fingerprint;
}

function hashIndices(indices) {
  const bytes = Buffer.alloc(4 + (indices.length * 4));
  bytes.writeInt32LE(indices.length, 0);
  indices.forEach((value, index) => bytes.writeInt32LE(value, 4 + (index * 4)));
  return sha256(bytes);
}

function hashUvs(uvs) {
  const bytes = Buffer.alloc(4 + (uvs.length * 8));
  bytes.writeInt32LE(uvs.length, 0);
  uvs.forEach((value, index) => {
    // Unity normalizes negative zero before hashing the original float32 bits.
    const x = value[0] === 0 ? 0 : value[0];
    const y = value[1] === 0 ? 0 : value[1];
    bytes.writeFloatLE(x, 4 + (index * 8));
    bytes.writeFloatLE(y, 8 + (index * 8));
  });
  return sha256(bytes);
}

export function createTopologyFingerprint(indices, uvs, vertexCount) {
  requireCondition(Number.isInteger(vertexCount) && vertexCount > 0, 'mesh_vertices_missing', 'vertexCount가 필요합니다.');
  requireCondition(Array.isArray(indices) && indices.length > 0 && indices.length % 3 === 0, 'mesh_triangle_indices_invalid', '삼각형 indices가 잘못되었습니다.');
  requireCondition(indices.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount), 'mesh_triangle_index_out_of_range', 'indices에 범위를 벗어난 정점 번호가 있습니다.');
  requireCondition(Array.isArray(uvs) && uvs.length === vertexCount, 'mesh_uv_layout_invalid', 'UV 개수가 정점 수와 다릅니다.');
  requireCondition(uvs.every(value => isFiniteTuple(value, 2)), 'mesh_uv_not_finite', 'UV에 유한하지 않은 값이 있습니다.');

  const indicesHash = hashIndices(indices);
  const uvHash = hashUvs(uvs);
  const composite = [
    HASH_ALGORITHM,
    FACE3D_SOURCE,
    vertexCount,
    indices.length,
    uvs.length,
    indicesHash,
    uvHash,
  ].join('|');
  return {
    algorithm: HASH_ALGORITHM,
    vertexCount,
    indexCount: indices.length,
    uvCount: uvs.length,
    indicesHash,
    uvHash,
    fingerprint: sha256(composite),
  };
}

export function validateCandidate(candidate) {
  requireCondition(candidate && typeof candidate === 'object', 'candidate_missing', 'candidate JSON 객체가 필요합니다.');
  requireCondition(candidate.schemaVersion === CANDIDATE_SCHEMA_VERSION, 'candidate_schema_unsupported', `candidate schemaVersion은 ${CANDIDATE_SCHEMA_VERSION}이어야 합니다.`);
  requireCondition(typeof candidate.candidateId === 'string' && candidate.candidateId.trim().length > 0, 'candidate_id_missing', 'candidateId가 없습니다.');
  requireCondition(candidate.source === FACE3D_SOURCE, 'candidate_source_unsupported', `candidate source는 ${FACE3D_SOURCE}이어야 합니다.`);
  requireCondition(candidate.gateVersion === GATE_VERSION, 'candidate_gate_unsupported', `candidate gateVersion은 ${GATE_VERSION}이어야 합니다.`);
  requireCondition(
    typeof candidate.reviewStatus === 'string'
      && candidate.reviewStatus.includes('not_runtime_approved'),
    'candidate_review_status_unsupported',
    '런타임 승인 전 후보만 진단할 수 있습니다. reviewStatus가 not_runtime_approved 상태가 아닙니다.',
  );
  requireCondition(candidate.groups && typeof candidate.groups === 'object', 'candidate_groups_missing', 'candidate groups 객체가 없습니다.');

  const topology = normalizedTopologyFingerprint(candidate.topologyFingerprint, 'candidate');
  const groupErrors = validateCandidateGroups(candidate.groups, topology.vertexCount);
  const symmetryErrors = validateBilateralSymmetryPolicy({
    ...candidate,
    topologyFingerprint: topology,
  });
  requireCondition(
    groupErrors.length === 0 && symmetryErrors.length === 0,
    'semantic_groups_invalid',
    [...groupErrors, ...symmetryErrors].join(' | '),
  );
  return topology;
}

function validateCapturePayload(payload, candidateTopology, sourceLabel) {
  requireCondition(payload && typeof payload === 'object', 'capture_export_missing', `${sourceLabel}: arface_export JSON 객체가 필요합니다.`);
  requireCondition(payload.schemaVersion === CAPTURE_SCHEMA_VERSION, 'capture_schema_unsupported', `${sourceLabel}: schemaVersion은 ${CAPTURE_SCHEMA_VERSION}이어야 합니다.`);
  requireCondition(typeof payload.capturePairId === 'string' && payload.capturePairId.trim().length > 0, 'capture_pair_id_missing', `${sourceLabel}: capturePairId가 없습니다.`);
  requireCondition(CAPTURE_SHOT_KINDS.has(payload.captureShotKind), 'capture_shot_kind_unsupported', `${sourceLabel}: captureShotKind는 neutral/yawLeft/yawRight 중 하나여야 합니다.`);
  const {indices, localVertices, uvs} = payload;
  requireCondition(Array.isArray(localVertices) && localVertices.length > 0, 'mesh_vertices_missing', `${sourceLabel}: localVertices가 없습니다.`);
  requireCondition(localVertices.every(value => isFiniteTuple(value, 3)), 'mesh_vertex_not_finite', `${sourceLabel}: localVertices에 유한하지 않은 좌표가 있습니다.`);
  requireCondition(Array.isArray(indices) && indices.length > 0 && indices.length % 3 === 0, 'mesh_triangle_indices_invalid', `${sourceLabel}: 삼각형 indices가 잘못되었습니다.`);
  requireCondition(indices.every(index => Number.isInteger(index) && index >= 0 && index < localVertices.length), 'mesh_triangle_index_out_of_range', `${sourceLabel}: indices에 범위를 벗어난 정점 번호가 있습니다.`);
  requireCondition(Array.isArray(uvs) && uvs.length === localVertices.length, 'mesh_uv_layout_invalid', `${sourceLabel}: UV 개수가 localVertices와 다릅니다.`);
  requireCondition(uvs.every(value => isFiniteTuple(value, 2)), 'mesh_uv_not_finite', `${sourceLabel}: UV에 유한하지 않은 값이 있습니다.`);

  requireCondition(localVertices.length === candidateTopology.vertexCount, 'unknown_face_mesh_topology', `${sourceLabel}: vertexCount가 candidate topology와 다릅니다.`);
  requireCondition(indices.length === candidateTopology.indexCount, 'unknown_face_mesh_topology', `${sourceLabel}: indexCount가 candidate topology와 다릅니다.`);
  requireCondition(uvs.length === candidateTopology.uvCount, 'unknown_face_mesh_topology', `${sourceLabel}: uvCount가 candidate topology와 다릅니다.`);
  requireCondition(hashIndices(indices) === candidateTopology.indicesHash, 'unknown_face_mesh_topology', `${sourceLabel}: JSON indices를 재해시한 값이 candidate topology와 다릅니다.`);

  requireCondition(
    payload.face3dCalibration?.fingerprintSource === 'unity_exact_native_arrays',
    'capture_topology_source_unsupported',
    `${sourceLabel}: topology fingerprint가 Unity 원본 native 배열에서 계산되지 않았습니다.`,
  );
  requireCondition(
    payload.face3dCalibration?.status === 'ready_for_candidate_generation',
    'capture_calibration_status_unsupported',
    `${sourceLabel}: Face3D 캘리브레이션 상태가 ready_for_candidate_generation이 아닙니다.`,
  );
  requireCondition(
    payload.face3dCalibration?.candidateSchemaVersion === CANDIDATE_SCHEMA_VERSION,
    'capture_candidate_schema_unsupported',
    `${sourceLabel}: 캡처의 candidateSchemaVersion이 ${CANDIDATE_SCHEMA_VERSION}이 아닙니다.`,
  );

  const exportedTopology = normalizedTopologyFingerprint(
    payload.face3dCalibration?.topologyFingerprint,
    `${sourceLabel} arface_export`,
  );
  requireCondition(topologyEquals(exportedTopology, candidateTopology), 'unknown_face_mesh_topology', `${sourceLabel}: Unity 원본 배열 topologyFingerprint가 candidate와 다릅니다.`);

  return {
    capturePairId: payload.capturePairId,
    captureShotKind: payload.captureShotKind,
    localVertices,
    uvs,
  };
}

function add(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(value, scalar) {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function dot(left, right) {
  return (left[0] * right[0]) + (left[1] * right[1]) + (left[2] * right[2]);
}

function cross(left, right) {
  return [
    (left[1] * right[2]) - (left[2] * right[1]),
    (left[2] * right[0]) - (left[0] * right[2]),
    (left[0] * right[1]) - (left[1] * right[0]),
  ];
}

function squaredMagnitude(value) {
  return dot(value, value);
}

function magnitude(value) {
  return Math.sqrt(squaredMagnitude(value));
}

function normalize(value) {
  return multiply(value, 1 / magnitude(value));
}

function centroid(vertices, indices, key) {
  let result = [0, 0, 0];
  for (const index of indices) {
    const vertex = vertices[index];
    requireCondition(isFiniteTuple(vertex, 3), 'semantic_landmark_geometry_invalid', `${key} 정점 좌표가 잘못되었습니다.`);
    result = add(result, vertex);
  }
  result = multiply(result, 1 / indices.length);
  requireCondition(result.every(Number.isFinite), 'semantic_landmark_geometry_invalid', `${key} centroid가 유한하지 않습니다.`);
  return result;
}

function createReferencePlane(left, right, upper, name) {
  const origin = multiply(add(left, right), 0.5);
  const horizontal = subtract(right, left);
  const up = subtract(upper, origin);
  const rawNormal = cross(horizontal, up);
  requireCondition(
    origin.every(Number.isFinite)
      && rawNormal.every(Number.isFinite)
      && squaredMagnitude(rawNormal) > GEOMETRY_EPSILON * GEOMETRY_EPSILON,
    'reference_plane_degenerate',
    `${name} reference plane이 퇴화했습니다.`,
  );
  return {normal: normalize(rawNormal), origin};
}

function signedPlaneProjection(point, planeOrigin, planeNormal, faceScale) {
  return dot(subtract(point, planeOrigin), planeNormal) / faceScale;
}

function selectPogonionVertex(vertices, indices, planeOrigin, planeNormal, faceScale) {
  const candidates = indices.map(index => {
    const point = vertices[index];
    requireCondition(isFiniteTuple(point, 3), 'semantic_landmark_geometry_invalid', `chinIndices 정점 ${index} 좌표가 잘못되었습니다.`);
    const projection = signedPlaneProjection(
      point,
      planeOrigin,
      planeNormal,
      faceScale,
    );
    requireCondition(Number.isFinite(projection), 'semantic_landmark_geometry_invalid', `chinIndices 정점 ${index}의 중안면 plane projection이 유한하지 않습니다.`);
    return {index, point, projection};
  });
  requireCondition(candidates.length > 0, 'semantic_landmark_geometry_invalid', 'chinIndices 후보 패치가 비었습니다.');

  const maximumProjection = Math.max(...candidates.map(({projection}) => projection));
  const selected = candidates
    .filter(({projection}) => maximumProjection - projection <= GEOMETRY_EPSILON)
    .sort((left, right) => left.index - right.index)[0];
  return selected;
}

function signedDistanceToLine(point, lineOrigin, lineDirection, depthAxis, faceScale) {
  const relative = subtract(point, lineOrigin);
  const closestPoint = add(lineOrigin, multiply(lineDirection, dot(relative, lineDirection)));
  return dot(subtract(point, closestPoint), depthAxis) / faceScale;
}

export function evaluateMetrics(localVertices, groups) {
  const noseTip = centroid(localVertices, groups.noseTipIndices, 'noseTipIndices');
  const upperLip = centroid(localVertices, groups.upperLipIndices, 'upperLipIndices');
  const lowerLip = centroid(localVertices, groups.lowerLipIndices, 'lowerLipIndices');
  const midfaceLeft = centroid(localVertices, groups.midfaceReferenceLeftIndices, 'midfaceReferenceLeftIndices');
  const midfaceRight = centroid(localVertices, groups.midfaceReferenceRightIndices, 'midfaceReferenceRightIndices');
  const midfaceUpper = centroid(localVertices, groups.midfaceReferenceUpperIndices, 'midfaceReferenceUpperIndices');
  const chinReferenceLeft = centroid(localVertices, groups.chinReferenceLeftIndices, 'chinReferenceLeftIndices');
  const chinReferenceRight = centroid(localVertices, groups.chinReferenceRightIndices, 'chinReferenceRightIndices');
  const chinReferenceUpper = centroid(localVertices, groups.chinReferenceUpperIndices, 'chinReferenceUpperIndices');
  const centralRegion = centroid(localVertices, groups.centralRegionIndices, 'centralRegionIndices');

  const midfaceHorizontal = subtract(midfaceRight, midfaceLeft);
  const faceScale = magnitude(midfaceHorizontal);
  requireCondition(Number.isFinite(faceScale) && faceScale > GEOMETRY_EPSILON, 'reference_face_scale_degenerate', '중안면 좌우 기준의 faceScale이 퇴화했습니다.');

  const midfacePlane = createReferencePlane(midfaceLeft, midfaceRight, midfaceUpper, 'midface');
  const chinPlane = createReferencePlane(chinReferenceLeft, chinReferenceRight, chinReferenceUpper, 'chin');
  let midfaceNormal = midfacePlane.normal;
  let chinNormal = chinPlane.normal;

  const noseDepth = dot(subtract(noseTip, midfacePlane.origin), midfaceNormal);
  requireCondition(Number.isFinite(noseDepth) && Math.abs(noseDepth) > GEOMETRY_EPSILON * faceScale, 'reference_plane_orientation_ambiguous', '코끝으로 중안면 plane 방향을 결정할 수 없습니다.');
  if (noseDepth < 0) {
    midfaceNormal = multiply(midfaceNormal, -1);
  }

  const pogonion = selectPogonionVertex(
    localVertices,
    groups.chinIndices,
    midfacePlane.origin,
    midfaceNormal,
    faceScale,
  );

  const chinPlaneAlignment = dot(chinNormal, midfaceNormal);
  requireCondition(Number.isFinite(chinPlaneAlignment) && Math.abs(chinPlaneAlignment) > GEOMETRY_EPSILON, 'chin_reference_plane_orientation_ambiguous', '턱 reference plane 방향을 결정할 수 없습니다.');
  if (chinPlaneAlignment < 0) {
    chinNormal = multiply(chinNormal, -1);
  }

  const eLine = subtract(pogonion.point, noseTip);
  const eLineLength = magnitude(eLine);
  requireCondition(Number.isFinite(eLineLength) && eLineLength > GEOMETRY_EPSILON, 'esthetic_line_degenerate', '코끝과 턱 전방점(Pogonion)의 E-line이 퇴화했습니다.');
  const eLineDirection = multiply(eLine, 1 / eLineLength);
  let eLineDepthAxis = subtract(
    midfaceNormal,
    multiply(eLineDirection, dot(midfaceNormal, eLineDirection)),
  );
  requireCondition(
    eLineDepthAxis.every(Number.isFinite)
      && squaredMagnitude(eLineDepthAxis) > GEOMETRY_EPSILON * GEOMETRY_EPSILON,
    'esthetic_line_depth_axis_degenerate',
    'E-line depth axis가 퇴화했습니다.',
  );
  eLineDepthAxis = normalize(eLineDepthAxis);
  if (dot(eLineDepthAxis, midfaceNormal) < 0) {
    eLineDepthAxis = multiply(eLineDepthAxis, -1);
  }

  const metrics = {
    noseTipProjection: signedPlaneProjection(noseTip, midfacePlane.origin, midfaceNormal, faceScale),
    // C1: chin vs the face-spanning midface plane (mirrors noseTip/central), not the chin's
    // own neighbor plane. Keeps parity with the runtime Face3DMetricEvaluator change.
    chinProjection: signedPlaneProjection(pogonion.point, midfacePlane.origin, midfaceNormal, faceScale),
    upperLipToELine: signedDistanceToLine(upperLip, noseTip, eLineDirection, eLineDepthAxis, faceScale),
    lowerLipToELine: signedDistanceToLine(lowerLip, noseTip, eLineDirection, eLineDepthAxis, faceScale),
    centralProjectionScore: signedPlaneProjection(centralRegion, midfacePlane.origin, midfaceNormal, faceScale),
  };
  requireCondition(Object.values(metrics).every(Number.isFinite), 'face3d_metric_not_finite', '계산된 Face3D metric에 유한하지 않은 값이 있습니다.');
  return {
    faceScale,
    metrics,
    selectedPogonionVertexIndex: pogonion.index,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) * 0.5;
}

export function summarizeMetricValues(values) {
  requireCondition(Array.isArray(values) && values.length > 0 && values.every(Number.isFinite), 'metric_summary_input_invalid', 'metric summary에는 유한한 값이 하나 이상 필요합니다.');
  const center = median(values);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return {
    sampleCount: values.length,
    median: center,
    mad: median(values.map(value => Math.abs(value - center))),
    min: minimum,
    max: maximum,
    range: maximum - minimum,
  };
}

export function evaluateSemanticCandidateData(candidate, captureInputs, options = {}) {
  requireCondition(Array.isArray(captureInputs) && captureInputs.length >= 2, 'capture_count_insufficient', 'candidate 진단에는 캡처가 2개 이상 필요합니다.');
  const candidateTopology = validateCandidate(candidate);
  const captures = captureInputs.map((input, index) => {
    const sourceLabel = input?.sourceLabel ?? `capture-${index + 1}`;
    const validated = validateCapturePayload(input?.payload, candidateTopology, sourceLabel);
    const symmetryErrors = validateBilateralSymmetryPolicy(
      {
        ...candidate,
        topologyFingerprint: candidateTopology,
      },
      validated.uvs,
    );
    requireCondition(
      symmetryErrors.length === 0,
      'semantic_groups_invalid',
      `${sourceLabel}: ${symmetryErrors.join(' | ')}`,
    );
    const evaluation = evaluateMetrics(validated.localVertices, candidate.groups);
    return {
      captureOrdinal: index + 1,
      capturePairId: validated.capturePairId,
      captureShotKind: validated.captureShotKind,
      topologyMatch: true,
      localVerticesFinite: true,
      derivedGeometry: {
        faceScale: evaluation.faceScale,
        selectedPogonionVertexIndex: evaluation.selectedPogonionVertexIndex,
      },
      metrics: evaluation.metrics,
    };
  });
  requireCondition(
    new Set(captures.map(capture => capture.capturePairId)).size === captures.length,
    'duplicate_capture_pair_id',
    '같은 capturePairId를 두 번 이상 넣을 수 없습니다. 중복 입력은 안정성 범위를 거짓으로 낮춥니다.',
  );

  const metricSummary = Object.fromEntries(
    METRIC_KEYS.map(key => [
      key,
      summarizeMetricValues(captures.map(capture => capture.metrics[key])),
    ]),
  );
  const groupVertexCounts = Object.fromEntries(
    [...METRIC_GROUP_KEYS, ...UNUSED_CANDIDATE_GROUP_KEYS].map(key => [key, candidate.groups[key].length]),
  );

  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    status: DIAGNOSTICS_STATUS,
    generatedAtUtc: options.generatedAtUtc ?? new Date().toISOString(),
    algorithm: {
      evaluator: 'Unity Face3DMetricEvaluator formula parity (offline approximation)',
      geometryEpsilon: GEOMETRY_EPSILON,
      metricUnit: 'normalized',
      pogonionSelection: 'maximum signed projection to oriented midface plane; ties within 1e-6 choose smaller vertex index',
      summaryMethod: 'median_and_raw_mad_without_outlier_rejection',
      madDefinition: 'median(abs(value - median))',
      numericPrecision: 'exported localVertices rounded to 6 decimals; JavaScript float64 differs from Unity native float32 runtime',
      runtimeAggregation: 'not_applied; this report does not run the Unity 20-30 frame 3xMAD outlier collector',
    },
    candidate: {
      schemaVersion: candidate.schemaVersion,
      candidateId: candidate.candidateId,
      reviewStatus: candidate.reviewStatus,
      generationMethod: candidate.generationMethod ?? null,
      topologyFingerprint: candidateTopology,
      groupVertexCounts,
    },
    validation: {
      bilateralSymmetryPolicyValid: true,
      bilateralSymmetryValidatedAgainstCaptureUvs: true,
      bilateralSymmetryPolicyVersion: candidate.bilateralSymmetryPolicy.policyVersion,
      bilateralMirrorMapSha256: candidate.bilateralSymmetryPolicy.mirrorMapSha256,
      candidateSchemaValid: true,
      candidateTopologyValid: true,
      captureSchemaValid: true,
      captureCount: captures.length,
      allCaptureTopologiesMatchCandidate: true,
      allLocalVerticesFinite: true,
      topologyValidation: {
        indices: 'rehashed_from_lossless_exported_indices',
        uvs: 'matched_by_embedded_unity_exact_native_arrays_fingerprint',
        note: 'arface_export UV coordinates are rounded to 6 decimals and cannot reproduce the native float32 UV hash',
      },
      runtimeMetricGroupCount: METRIC_GROUP_KEYS.length,
      runtimeMetricGroups: [...METRIC_GROUP_KEYS],
      metricGroupMapping: METRIC_GROUP_MAPPING,
      validatedButUnusedByCurrentMetrics: {
        chinBottomIndices: 'Menton (턱 최하단); current five metrics do not consume this group',
      },
      chinProjectionLandmark: 'chinIndices fixed candidate patch; each capture selects the maximum signed projection to the oriented midface plane as the soft-tissue Pogonion / E-line endpoint (ties within 1e-6 choose the smaller vertex index)',
    },
    captures,
    metricSummary,
    warnings: [
      'provisional_candidate_diagnostics: 이 결과는 후보 정점의 수치 진단이며 human overlay 승인이나 runtime map 승인이 아닙니다.',
      'chinProjection과 E-line은 chinIndices 고정 후보 패치에서 캡처별로 선택한 동일한 soft-tissue Pogonion 정점을 사용합니다. chinBottomIndices(Menton)는 검증만 하며 현재 5개 metric 계산에는 사용하지 않습니다.',
      '오프라인 수식은 Unity와 같지만 JSON localVertices 반올림과 JavaScript/Unity 수치 정밀도 차이로 bit-identical runtime 결과는 아닙니다.',
      '포즈가 다른 소수 캡처의 median/MAD/range는 실험용 안정성 지표이며 모집단 일반화 근거가 아닙니다.',
    ],
  };
}

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function usage(scriptPath = fileURLToPath(import.meta.url)) {
  const script = path.relative(process.cwd(), scriptPath);
  return [
    `사용법: node ${script} <candidate.json> <capture-dir> <capture-dir> [...] [--force] --output <diagnostics.json>`,
    `예: node ${script} artifacts/.../ARKitFaceSemanticMapV1.consensus.candidate.json artifacts/.../neutral artifacts/.../yaw-left --output artifacts/.../metric-diagnostics.json`,
    '--force는 기존 diagnostics 파일만 교체합니다. candidate/arface_export 입력 경로는 어떤 경우에도 덮어쓸 수 없습니다.',
  ].join('\n');
}

export function parseArguments(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return {help: true};
  }
  const forceCount = argv.filter(value => value === '--force').length;
  requireCondition(forceCount <= 1, 'arguments_invalid', '--force는 한 번만 지정할 수 있습니다.');
  const filtered = argv.filter(value => value !== '--force');
  requireCondition(filtered.length >= 5, 'arguments_invalid', usage());
  requireCondition(filtered.at(-2) === '--output' && typeof filtered.at(-1) === 'string' && filtered.at(-1).length > 0, 'output_argument_missing', '--output <diagnostics.json>을 마지막에 지정하세요.');
  const positional = filtered.slice(0, -2);
  requireCondition(!positional.some(value => value.startsWith('--')), 'arguments_invalid', '지원하지 않는 옵션이 있습니다.');
  requireCondition(positional.length >= 3, 'capture_count_insufficient', 'candidate JSON 뒤에 캡처 폴더를 2개 이상 지정하세요.');
  return {
    help: false,
    force: forceCount === 1,
    candidatePath: path.resolve(positional[0]),
    captureDirectories: positional.slice(1).map(value => path.resolve(value)),
    outputPath: path.resolve(filtered.at(-1)),
  };
}

function canonicalPath(filePath) {
  return fs.existsSync(filePath)
    ? fs.realpathSync(filePath)
    : path.resolve(filePath);
}

function writeJsonAtomically(outputPath, value, force) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  requireCondition(
    force || !fs.existsSync(outputPath),
    'output_exists',
    `출력 파일이 이미 있습니다. 교체하려면 --force를 지정하세요: ${outputPath}`,
  );
  requireCondition(
    !fs.existsSync(outputPath) || fs.statSync(outputPath).isFile(),
    'output_path_invalid',
    `출력 경로가 파일이 아닙니다: ${outputPath}`,
  );

  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', flag: 'wx'});
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

export function runCli(argv, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const parsed = parseArguments(argv);
  if (parsed.help) {
    stdout.write(`${usage()}\n`);
    return null;
  }

  requireCondition(fs.existsSync(parsed.candidatePath) && fs.statSync(parsed.candidatePath).isFile(), 'candidate_file_missing', `candidate 파일이 없습니다: ${parsed.candidatePath}`);
  const canonicalCaptureDirectories = parsed.captureDirectories.map(directory => {
    requireCondition(fs.existsSync(directory) && fs.statSync(directory).isDirectory(), 'capture_directory_missing', `캡처 폴더가 없습니다: ${directory}`);
    return canonicalPath(directory);
  });
  requireCondition(
    new Set(canonicalCaptureDirectories).size === canonicalCaptureDirectories.length,
    'duplicate_capture_directory',
    '같은 캡처 폴더를 두 번 이상 지정할 수 없습니다.',
  );

  const inputPaths = [canonicalPath(parsed.candidatePath)];
  const captureInputs = parsed.captureDirectories.map(directory => {
    const exportPath = path.join(directory, 'arface_export.json');
    requireCondition(fs.existsSync(exportPath) && fs.statSync(exportPath).isFile(), 'capture_export_missing', `arface_export.json이 없습니다: ${exportPath}`);
    inputPaths.push(canonicalPath(exportPath));
    return {
      payload: readJson(exportPath),
      sourceLabel: path.basename(directory),
    };
  });
  requireCondition(
    !inputPaths.includes(canonicalPath(parsed.outputPath)),
    'output_input_collision',
    '출력 경로는 candidate 또는 arface_export.json 입력 파일과 같을 수 없습니다.',
  );

  const diagnostics = evaluateSemanticCandidateData(
    readJson(parsed.candidatePath),
    captureInputs,
  );
  writeJsonAtomically(parsed.outputPath, diagnostics, parsed.force);
  stdout.write(`Face3D 후보 오프라인 진단 완료 (${captureInputs.length} captures): ${parsed.outputPath}\n`);
  stdout.write(`상태: ${DIAGNOSTICS_STATUS} (runtime 승인 아님)\n`);
  return diagnostics;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Face3D 후보 오프라인 진단 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
