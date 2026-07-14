const freezeGroup = group => Object.freeze({...group});

export const SCORE_TIE_EPSILON = 1e-6;
export const UV_MIRROR_RESIDUAL_CAP = 0.00125;
export const TIER2_AUTHORING_SCHEMA_VERSION = 'aura.face3d-tier2-seed-authoring.v1';
export const COVERAGE_VERDICTS = Object.freeze(['pending', 'pass', 'fail']);

export const TIER2_GROUPS = Object.freeze([
  freezeGroup({
    key: 'nasionIndices',
    label: 'nasion 코뿌리',
    color: '#f2b23e',
    allowG1Overlap: true,
    countRule: 'exact',
    minimumCount: 1,
    required: true,
  }),
  freezeGroup({
    key: 'noseBridgeMidlineIndices',
    label: 'noseBridgeMidline 콧대중앙선',
    color: '#4fd0e8',
    allowG1Overlap: true,
    countRule: 'minimum',
    minimumCount: 4,
    required: false,
  }),
  freezeGroup({
    key: 'alarLeftIndices',
    label: 'alare 콧볼 · 해부학적 Left',
    color: '#ff9db0',
    countRule: 'minimum',
    minimumCount: 5,
    required: true,
    sideSign: -1,
    winnerAxis: 'lateral',
  }),
  freezeGroup({
    key: 'alarRightIndices',
    label: 'alare 콧볼 · 해부학적 Right',
    color: '#f27d92',
    countRule: 'minimum',
    minimumCount: 5,
    required: true,
    sideSign: 1,
    winnerAxis: 'lateral',
  }),
  freezeGroup({
    key: 'malarApexLeftIndices',
    label: '앞광대 · 해부학적 Left',
    color: '#c4b5fd',
    countRule: 'minimum',
    minimumCount: 5,
    required: true,
    sideSign: -1,
    winnerAxis: 'anterior',
  }),
  freezeGroup({
    key: 'malarApexRightIndices',
    label: '앞광대 · 해부학적 Right',
    color: '#a78bfa',
    countRule: 'minimum',
    minimumCount: 5,
    required: true,
    sideSign: 1,
    winnerAxis: 'anterior',
  }),
]);

export const TIER2_GROUP_KEYS = Object.freeze(TIER2_GROUPS.map(({key}) => key));
export const REQUIRED_TIER2_GROUP_KEYS = Object.freeze(
  TIER2_GROUPS.filter(({required}) => required).map(({key}) => key),
);

export const BILATERAL_GROUP_PAIRS = Object.freeze([
  Object.freeze({
    family: 'alar',
    leftGroupKey: 'alarLeftIndices',
    rightGroupKey: 'alarRightIndices',
  }),
  Object.freeze({
    family: 'malar',
    leftGroupKey: 'malarApexLeftIndices',
    rightGroupKey: 'malarApexRightIndices',
  }),
]);

const add = (left, right) => left.map((value, index) => value + right[index]);
const cross = (left, right) => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const magnitude = value => Math.hypot(...value);
const multiply = (value, scalar) => value.map(component => component * scalar);
const subtract = (left, right) => left.map((value, index) => value - right[index]);

function unit(value, label) {
  const length = magnitude(value);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new Error(`${label} 축을 만들 수 없습니다.`);
  }
  return multiply(value, 1 / length);
}

function centroid(vertices, indices, label) {
  if (!Array.isArray(indices) || indices.length === 0) {
    throw new Error(`${label} centroid 인덱스가 없습니다.`);
  }
  const sum = indices.reduce(
    (accumulator, index) => add(accumulator, vertices[index]),
    [0, 0, 0],
  );
  return multiply(sum, 1 / indices.length);
}

function topologyFingerprintValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.fingerprint === 'string') {
    return value.fingerprint;
  }
  return null;
}

export function emptyTier2Groups() {
  return Object.fromEntries(TIER2_GROUP_KEYS.map(key => [key, []]));
}

export function extractTier2Groups(payload) {
  if (payload == null) {
    return emptyTier2Groups();
  }
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Tier-2 patch JSON은 object여야 합니다.');
  }

  const source = payload.groups ?? payload.selected ?? payload.suggestions ?? payload;
  if (typeof source !== 'object' || source == null || Array.isArray(source)) {
    throw new Error('Tier-2 patch groups를 찾을 수 없습니다.');
  }

  const groups = emptyTier2Groups();
  for (const key of TIER2_GROUP_KEYS) {
    if (!(key in source)) {
      continue;
    }
    if (!Array.isArray(source[key])) {
      throw new Error(`${key}는 vertex index 배열이어야 합니다.`);
    }
    groups[key] = [...source[key]];
  }
  return groups;
}

export function buildMeshAdjacency(vertexCount, triangleIndices) {
  if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
    throw new Error('vertexCount가 양의 정수가 아닙니다.');
  }
  if (!Array.isArray(triangleIndices) || triangleIndices.length % 3 !== 0) {
    throw new Error('triangle indices 길이는 3의 배수여야 합니다.');
  }

  const adjacency = Array.from({length: vertexCount}, () => new Set());
  for (let offset = 0; offset < triangleIndices.length; offset += 3) {
    const triangle = triangleIndices.slice(offset, offset + 3);
    for (const index of triangle) {
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        throw new Error(`triangle index가 범위를 벗어났습니다: ${index}`);
      }
    }
    for (const [left, right] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      adjacency[left].add(right);
      adjacency[right].add(left);
    }
  }
  return adjacency;
}

export function connectedComponents(indices, adjacency) {
  const remaining = new Set(indices);
  const components = [];
  while (remaining.size > 0) {
    const seed = Math.min(...remaining);
    remaining.delete(seed);
    const component = [];
    const stack = [seed];
    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency[current] ?? []) {
        if (remaining.delete(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
    components.push(component.sort((left, right) => left - right));
  }
  return components;
}

export function graphBoundaryIndices(indices, adjacency) {
  const selected = new Set(indices);
  return [...selected]
    .filter(index => [...(adjacency[index] ?? [])].some(neighbor => !selected.has(neighbor)))
    .sort((left, right) => left - right);
}

export function buildUvMirrorMap(uvs) {
  if (!Array.isArray(uvs) || uvs.length === 0) {
    throw new Error('UV 배열이 없습니다.');
  }
  const mirrorIndices = [];
  const residuals = [];
  for (const [u, v] of uvs) {
    let bestIndex = -1;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < uvs.length; index += 1) {
      const du = uvs[index][0] - (1 - u);
      const dv = uvs[index][1] - v;
      const distanceSquared = du * du + dv * dv;
      if (
        distanceSquared < bestDistanceSquared
        || (distanceSquared === bestDistanceSquared && index < bestIndex)
      ) {
        bestIndex = index;
        bestDistanceSquared = distanceSquared;
      }
    }
    mirrorIndices.push(bestIndex);
    residuals.push(Math.sqrt(bestDistanceSquared));
  }
  const mutualCount = mirrorIndices.reduce(
    (count, partner, index) => count + Number(mirrorIndices[partner] === index),
    0,
  );
  return {mirrorIndices, mutualCount, residuals};
}

export function createFaceCoordinateFrame(localVertices, liveMap) {
  const left = centroid(
    localVertices,
    liveMap.midfaceReferenceLeftIndices,
    'midfaceReferenceLeftIndices',
  );
  const right = centroid(
    localVertices,
    liveMap.midfaceReferenceRightIndices,
    'midfaceReferenceRightIndices',
  );
  const upper = centroid(
    localVertices,
    liveMap.midfaceReferenceUpperIndices,
    'midfaceReferenceUpperIndices',
  );
  const noseTip = centroid(localVertices, liveMap.noseTipIndices, 'noseTipIndices');
  const origin = multiply(add(left, right), 0.5);
  const lateralVector = subtract(right, left);
  const faceScale = magnitude(lateralVector);
  const lateral = unit(lateralVector, 'lateral');
  let anterior = unit(cross(lateralVector, subtract(upper, origin)), 'anterior');
  if (dot(subtract(noseTip, origin), anterior) < 0) {
    anterior = multiply(anterior, -1);
  }
  const up = unit(cross(anterior, lateral), 'up');
  return {anterior, faceScale, lateral, origin, up};
}

export function toFaceCoordinates(vertex, frame) {
  const relative = subtract(vertex, frame.origin);
  return [
    dot(relative, frame.lateral) / frame.faceScale,
    dot(relative, frame.up) / frame.faceScale,
    dot(relative, frame.anterior) / frame.faceScale,
  ];
}

export function selectScoreWinner(indices, score, epsilon = SCORE_TIE_EPSILON) {
  if (!Array.isArray(indices) || indices.length === 0) {
    return null;
  }
  const rows = indices.map(index => ({index, score: score(index)}));
  if (rows.some(row => !Number.isFinite(row.score))) {
    throw new Error('winner score가 finite가 아닙니다.');
  }
  const maximum = Math.max(...rows.map(row => row.score));
  const tiedIndices = rows
    .filter(row => row.score >= maximum - epsilon)
    .map(row => row.index)
    .sort((left, right) => left - right);
  const index = tiedIndices[0];
  return {index, maximum, tiedIndices};
}

function jaccard(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 1;
  }
  return [...leftSet].filter(value => rightSet.has(value)).length / union.size;
}

function addIssue(target, code, message, groupKey = null) {
  target.push({code, groupKey, message});
}

export function validateTier2Patch({
  candidateTopologyFingerprint = null,
  captureTopologyFingerprint = null,
  groups: rawGroups,
  annotations = {},
  g1Indices = [],
  localVertices,
  meshAdjacency,
  mirrorPolicy = null,
  requireComplete = true,
}) {
  if (
    !mirrorPolicy?.frame
    || !Array.isArray(mirrorPolicy.mirrorIndices)
    || !Array.isArray(mirrorPolicy.residuals)
  ) {
    throw new Error('face frame과 UV mirror policy가 필요합니다.');
  }
  const groups = extractTier2Groups({groups: rawGroups});
  const errors = [];
  const warnings = [];
  const groupDiagnostics = {};
  const vertexCount = localVertices.length;
  const g1 = new Set(g1Indices);
  const coverageVerdicts = new Set(COVERAGE_VERDICTS);
  const captureFingerprint = topologyFingerprintValue(captureTopologyFingerprint);
  const candidateFingerprint = topologyFingerprintValue(candidateTopologyFingerprint);

  if (captureTopologyFingerprint == null) {
    addIssue(errors, 'capture_topology_fingerprint_missing', 'capture topology fingerprint가 없습니다.');
  } else if (captureFingerprint == null) {
    addIssue(errors, 'capture_topology_fingerprint_invalid', 'capture topology fingerprint 형식이 잘못됐습니다.');
  }

  if (candidateTopologyFingerprint != null && candidateFingerprint == null) {
    addIssue(errors, 'topology_fingerprint_invalid', 'patch topologyFingerprint 형식이 잘못됐습니다.');
  } else if (candidateFingerprint && captureFingerprint && candidateFingerprint !== captureFingerprint) {
    addIssue(errors, 'topology_fingerprint_mismatch', 'patch와 capture topology fingerprint가 다릅니다.');
  } else if (candidateTopologyFingerprint == null) {
    addIssue(
      requireComplete ? errors : warnings,
      'topology_fingerprint_missing',
      'patch에 topology fingerprint가 없습니다.',
    );
  }

  const validGroups = {};
  for (const definition of TIER2_GROUPS) {
    const input = groups[definition.key];
    const annotation = annotations?.[definition.key] ?? {};
    const disposition = annotation.disposition === 'unsupported_null'
      ? 'unsupported_null'
      : 'candidate_review';
    const hasFixedPatchAnnotation = Object.prototype.hasOwnProperty.call(
      annotation,
      'fixedPatchIndices',
    );
    const fixedPatchAnnotationInput = annotation.fixedPatchIndices;
    let fixedPatchAnnotationIndices = [];
    let fixedPatchAnnotationIsValid = true;
    if (!hasFixedPatchAnnotation) {
      fixedPatchAnnotationIsValid = false;
      addIssue(
        errors,
        'fixed_patch_annotation_missing',
        `${definition.key}: annotations.fixedPatchIndices가 필요합니다.`,
        definition.key,
      );
    } else if (!Array.isArray(fixedPatchAnnotationInput)) {
      fixedPatchAnnotationIsValid = false;
      addIssue(
        errors,
        'fixed_patch_annotation_invalid',
        `${definition.key}: annotations.fixedPatchIndices는 vertex index 배열이어야 합니다.`,
        definition.key,
      );
    } else {
      const annotationDuplicates = [...new Set(fixedPatchAnnotationInput.filter(
        (value, index) => fixedPatchAnnotationInput.indexOf(value) !== index,
      ))].sort((left, right) => left - right);
      const annotationInvalid = fixedPatchAnnotationInput.filter(
        index => !Number.isInteger(index) || index < 0 || index >= vertexCount,
      );
      if (annotationDuplicates.length > 0) {
        fixedPatchAnnotationIsValid = false;
        addIssue(
          errors,
          'fixed_patch_annotation_duplicate_indices',
          `${definition.key}: annotations.fixedPatchIndices 중복 [${annotationDuplicates.join(', ')}]`,
          definition.key,
        );
      }
      if (annotationInvalid.length > 0) {
        fixedPatchAnnotationIsValid = false;
        addIssue(
          errors,
          'fixed_patch_annotation_index_out_of_range',
          `${definition.key}: annotations.fixedPatchIndices 범위 밖 index [${annotationInvalid.join(', ')}]`,
          definition.key,
        );
      }
      fixedPatchAnnotationIndices = [...new Set(fixedPatchAnnotationInput.filter(
        index => Number.isInteger(index) && index >= 0 && index < vertexCount,
      ))].sort((left, right) => left - right);
    }
    const hasAllowedRegion = Object.prototype.hasOwnProperty.call(
      annotation,
      'allowedRegionIndices',
    );
    const allowedRegionInput = annotation.allowedRegionIndices;
    let allowedRegionIndices = [];
    let allowedRegionIsValid = true;
    if (hasAllowedRegion && !Array.isArray(allowedRegionInput)) {
      allowedRegionIsValid = false;
      addIssue(
        errors,
        'allowed_region_invalid',
        `${definition.key}: allowedRegionIndices는 vertex index 배열이어야 합니다.`,
        definition.key,
      );
    } else if (hasAllowedRegion) {
      const allowedDuplicates = [...new Set(allowedRegionInput.filter(
        (value, index) => allowedRegionInput.indexOf(value) !== index,
      ))].sort((left, right) => left - right);
      const allowedInvalid = allowedRegionInput.filter(
        index => !Number.isInteger(index) || index < 0 || index >= vertexCount,
      );
      if (allowedDuplicates.length > 0) {
        allowedRegionIsValid = false;
        addIssue(
          errors,
          'allowed_region_duplicate_indices',
          `${definition.key}: allowedRegionIndices 중복 [${allowedDuplicates.join(', ')}]`,
          definition.key,
        );
      }
      if (allowedInvalid.length > 0) {
        allowedRegionIsValid = false;
        addIssue(
          errors,
          'allowed_region_index_out_of_range',
          `${definition.key}: allowedRegionIndices 범위 밖 index [${allowedInvalid.join(', ')}]`,
          definition.key,
        );
      }
      allowedRegionIndices = [...new Set(allowedRegionInput.filter(
        index => Number.isInteger(index) && index >= 0 && index < vertexCount,
      ))].sort((left, right) => left - right);
    }
    const allowedRegion = new Set(allowedRegionIndices);
    const targetIndex = annotation.targetIndex ?? null;
    if (targetIndex != null) {
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= vertexCount) {
        addIssue(
          errors,
          'target_index_invalid',
          `${definition.key}: targetIndex가 유효한 vertex index가 아닙니다.`,
          definition.key,
        );
      } else if (!hasAllowedRegion || !allowedRegionIsValid || !allowedRegion.has(targetIndex)) {
        addIssue(
          errors,
          'target_outside_allowed_region',
          `${definition.key}: targetIndex ${targetIndex}가 allowed ROI 안에 없습니다.`,
          definition.key,
        );
      }
    }
    const evidenceLateralityViolationIndices = definition.sideSign == null
      ? []
      : allowedRegionIndices.filter(index => (
        toFaceCoordinates(localVertices[index], mirrorPolicy.frame)[0] * definition.sideSign
        <= SCORE_TIE_EPSILON
      ));
    if (evidenceLateralityViolationIndices.length > 0) {
      addIssue(
        errors,
        'evidence_laterality_violation',
        `${definition.key}: ROI/target evidence의 반대쪽·정중선 index [${evidenceLateralityViolationIndices.join(', ')}]`,
        definition.key,
      );
    }
    const coverageVerdict = annotation.coverageVerdict ?? 'pending';
    const coverageNote = typeof annotation.coverageNote === 'string'
      ? annotation.coverageNote.trim()
      : '';
    if (!coverageVerdicts.has(coverageVerdict)) {
      addIssue(
        errors,
        'coverage_verdict_invalid',
        `${definition.key}: coverageVerdict는 pending/pass/fail 중 하나여야 합니다.`,
        definition.key,
      );
    }
    if (annotation.coverageNote != null && typeof annotation.coverageNote !== 'string') {
      addIssue(
        errors,
        'coverage_note_invalid',
        `${definition.key}: coverageNote는 문자열이어야 합니다.`,
        definition.key,
      );
    }
    const duplicateIndices = [...new Set(input.filter((value, index) => input.indexOf(value) !== index))]
      .sort((left, right) => left - right);
    const invalidIndices = input.filter(
      index => !Number.isInteger(index) || index < 0 || index >= vertexCount,
    );
    if (duplicateIndices.length > 0) {
      addIssue(
        errors,
        'duplicate_indices',
        `${definition.key}: 중복 index [${duplicateIndices.join(', ')}]`,
        definition.key,
      );
    }
    if (invalidIndices.length > 0) {
      addIssue(
        errors,
        'index_out_of_range',
        `${definition.key}: 범위 밖 index [${invalidIndices.join(', ')}]`,
        definition.key,
      );
    }
    const valid = [...new Set(input.filter(
      index => Number.isInteger(index) && index >= 0 && index < vertexCount,
    ))].sort((left, right) => left - right);
    validGroups[definition.key] = valid;
    if (
      fixedPatchAnnotationIsValid
      && (
        fixedPatchAnnotationIndices.length !== valid.length
        || fixedPatchAnnotationIndices.some((index, offset) => index !== valid[offset])
      )
    ) {
      addIssue(
        errors,
        'fixed_patch_annotation_mismatch',
        `${definition.key}: annotations.fixedPatchIndices와 groups가 일치하지 않습니다.`,
        definition.key,
      );
    }

    if (disposition === 'unsupported_null') {
      if (valid.length > 0) {
        addIssue(
          errors,
          'unsupported_group_has_indices',
          `${definition.key}: unsupported/null 그룹은 고정 index가 비어야 합니다.`,
          definition.key,
        );
      }
      if (typeof annotation.unsupportedReason !== 'string' || !annotation.unsupportedReason.trim()) {
        addIssue(
          errors,
          'unsupported_reason_missing',
          `${definition.key}: unsupported/null 사유가 필요합니다.`,
          definition.key,
        );
      }
      if (coverageVerdict !== 'fail') {
        addIssue(
          errors,
          'unsupported_coverage_not_fail',
          `${definition.key}: unsupported/null은 coverageVerdict=fail로 명시해야 합니다.`,
          definition.key,
        );
      }
      if (!coverageNote) {
        addIssue(
          errors,
          'coverage_note_missing',
          `${definition.key}: unsupported/null coverage 판정 메모가 필요합니다.`,
          definition.key,
        );
      }
      groupDiagnostics[definition.key] = {
        allowedRegionIndices,
        boundaryIndices: [],
        componentCount: 0,
        count: valid.length,
        coverageNote,
        coverageVerdict,
        disposition,
        evidenceLateralityViolationIndices,
        g1OverlapIndices: [],
        lateralityViolationIndices: [],
        targetIndex,
        winnerBoundaryHit: false,
        winnerIndex: null,
      };
      continue;
    }

    if (definition.required && requireComplete) {
      if (!hasAllowedRegion || (allowedRegionIsValid && allowedRegionIndices.length === 0)) {
        addIssue(
          errors,
          'required_allowed_region_missing',
          `${definition.key}: 필수 candidate 그룹의 allowed ROI가 비었습니다.`,
          definition.key,
        );
      }
      if (targetIndex == null) {
        addIssue(
          errors,
          'required_target_missing',
          `${definition.key}: 필수 candidate 그룹의 targetIndex가 필요합니다.`,
          definition.key,
        );
      }
    }

    if (valid.length === 0) {
      if (definition.required && requireComplete) {
        addIssue(errors, 'required_group_missing', `${definition.key}: 필수 그룹이 비었습니다.`, definition.key);
      }
      if (definition.required && requireComplete && coverageVerdict !== 'pass') {
        addIssue(
          errors,
          'required_coverage_not_pass',
          `${definition.key}: 필수 candidate 그룹은 coverageVerdict=pass가 필요합니다.`,
          definition.key,
        );
      }
      if (definition.required && requireComplete && !coverageNote) {
        addIssue(
          errors,
          'coverage_note_missing',
          `${definition.key}: 필수 candidate coverage 판정 메모가 필요합니다.`,
          definition.key,
        );
      }
      groupDiagnostics[definition.key] = {
        allowedRegionIndices,
        boundaryIndices: [],
        componentCount: 0,
        count: 0,
        coverageNote,
        coverageVerdict,
        disposition,
        evidenceLateralityViolationIndices,
        g1OverlapIndices: [],
        lateralityViolationIndices: [],
        targetIndex,
        winnerBoundaryHit: false,
        winnerIndex: null,
      };
      continue;
    }

    if (coverageVerdict !== 'pass') {
      addIssue(
        errors,
        definition.required && requireComplete
          ? 'required_coverage_not_pass'
          : 'candidate_coverage_not_pass',
        `${definition.key}: 고정 candidate patch는 coverageVerdict=pass가 필요합니다.`,
        definition.key,
      );
    }
    if (!coverageNote) {
      addIssue(
        errors,
        'coverage_note_missing',
        `${definition.key}: fixed patch가 있는 candidate coverage 판정 메모가 필요합니다.`,
        definition.key,
      );
    }

    if (!hasAllowedRegion) {
      addIssue(
        errors,
        'fixed_patch_allowed_region_missing',
        `${definition.key}: fixed patch를 검증할 allowed ROI가 없습니다.`,
        definition.key,
      );
    } else if (allowedRegionIsValid) {
      const outsideAllowedRegion = valid.filter(index => !allowedRegion.has(index));
      if (outsideAllowedRegion.length > 0) {
        addIssue(
          errors,
          'fixed_patch_outside_allowed_region',
          `${definition.key}: fixed patch가 allowed ROI 밖 index [${outsideAllowedRegion.join(', ')}]를 포함합니다.`,
          definition.key,
        );
      }
    }

    if (definition.countRule === 'exact' && valid.length !== definition.minimumCount) {
      addIssue(
        errors,
        'group_count_not_exact',
        `${definition.key}: 정확히 ${definition.minimumCount}개가 필요하지만 ${valid.length}개입니다.`,
        definition.key,
      );
    } else if (definition.countRule === 'minimum' && valid.length < definition.minimumCount) {
      addIssue(
        errors,
        'group_below_minimum',
        `${definition.key}: 최소 ${definition.minimumCount}개가 필요하지만 ${valid.length}개입니다.`,
        definition.key,
      );
    }

    const components = connectedComponents(valid, meshAdjacency);
    if (components.length !== 1) {
      addIssue(
        errors,
        'group_disconnected',
        `${definition.key}: mesh component가 ${components.length}개입니다.`,
        definition.key,
      );
    }

    const g1OverlapIndices = valid.filter(index => g1.has(index));
    if (g1OverlapIndices.length > 0 && definition.allowG1Overlap !== true) {
      addIssue(
        errors,
        'g1_overlap',
        `${definition.key}: g1 overlap [${g1OverlapIndices.join(', ')}]`,
        definition.key,
      );
    }

    const faceCoordinates = Object.fromEntries(
      valid.map(index => [index, toFaceCoordinates(localVertices[index], mirrorPolicy.frame)]),
    );
    const lateralityViolationIndices = definition.sideSign == null
      ? []
      : valid.filter(index => faceCoordinates[index][0] * definition.sideSign <= SCORE_TIE_EPSILON);
    if (lateralityViolationIndices.length > 0) {
      addIssue(
        errors,
        'laterality_violation',
        `${definition.key}: 반대쪽/정중선 index [${lateralityViolationIndices.join(', ')}]`,
        definition.key,
      );
    }

    const boundaryIndices = graphBoundaryIndices(valid, meshAdjacency);
    let winner = null;
    if (definition.winnerAxis === 'lateral') {
      winner = selectScoreWinner(
        valid,
        index => faceCoordinates[index][0] * definition.sideSign,
      );
    } else if (definition.winnerAxis === 'anterior') {
      winner = selectScoreWinner(valid, index => faceCoordinates[index][2]);
    }
    const winnerBoundaryHit = winner != null && boundaryIndices.includes(winner.index);
    if (winnerBoundaryHit) {
      addIssue(
        warnings,
        'winner_on_patch_boundary',
        `${definition.key}: runtime winner ${winner.index}가 patch boundary입니다.`,
        definition.key,
      );
    }

    groupDiagnostics[definition.key] = {
      allowedRegionIndices,
      boundaryIndices,
      componentCount: components.length,
      count: valid.length,
      coverageNote,
      coverageVerdict,
      disposition,
      evidenceLateralityViolationIndices,
      g1OverlapIndices,
      g1OverlapAllowed: definition.allowG1Overlap === true,
      lateralityViolationIndices,
      targetIndex,
      winnerBoundaryHit,
      winnerIndex: winner?.index ?? null,
    };
  }

  const overlaps = [];
  for (let leftIndex = 0; leftIndex < TIER2_GROUP_KEYS.length; leftIndex += 1) {
    const leftKey = TIER2_GROUP_KEYS[leftIndex];
    for (const rightKey of TIER2_GROUP_KEYS.slice(leftIndex + 1)) {
      const right = new Set(validGroups[rightKey]);
      const indices = validGroups[leftKey].filter(index => right.has(index));
      if (indices.length > 0) {
        overlaps.push({groupA: leftKey, groupB: rightKey, indices});
        addIssue(
          errors,
          'tier2_group_overlap',
          `${leftKey} ↔ ${rightKey}: overlap [${indices.join(', ')}]`,
        );
      }
    }
  }

  const bilateral = {};
  for (const pair of BILATERAL_GROUP_PAIRS) {
    const left = validGroups[pair.leftGroupKey];
    const right = validGroups[pair.rightGroupKey];
    if (left.length === 0 && right.length === 0) {
      bilateral[pair.family] = null;
      continue;
    }
    if (left.length === 0 || right.length === 0) {
      addIssue(
        errors,
        'bilateral_pair_incomplete',
        `${pair.family}: 좌우 patch가 모두 필요합니다.`,
      );
      bilateral[pair.family] = null;
      continue;
    }

    const mirroredLeft = left.map(index => mirrorPolicy.mirrorIndices[index]).sort((a, b) => a - b);
    const mirrorJaccard = jaccard(mirroredLeft, right);
    const maximumResidual = Math.max(
      ...left.map(index => mirrorPolicy.residuals[index]),
      ...right.map(index => mirrorPolicy.residuals[index]),
    );
    const mutual = [...left, ...right].every(
      index => mirrorPolicy.mirrorIndices[mirrorPolicy.mirrorIndices[index]] === index,
    );
    const exact = left.length === right.length
      && mirrorJaccard === 1
      && mutual
      && maximumResidual <= UV_MIRROR_RESIDUAL_CAP;
    bilateral[pair.family] = {
      exact,
      maximumResidual,
      mirrorJaccard,
      mirroredLeft,
      mutual,
    };
    if (!exact) {
      addIssue(
        errors,
        'bilateral_uv_mismatch',
        `${pair.family}: UV mirror J=${mirrorJaccard.toFixed(3)}, mutual=${mutual}, residual=${maximumResidual.toFixed(6)}`,
      );
    }
  }

  const completionStatus = errors.length > 0
    ? 'incomplete_or_error'
    : TIER2_GROUPS.some(({key}) => (
      annotations?.[key]?.disposition === 'unsupported_null'
    ))
      ? 'complete_with_unsupported'
      : 'candidate_structural_pass';

  return {
    bilateral,
    completionStatus,
    errors,
    groupDiagnostics,
    overlaps,
    result: errors.length === 0 ? 'pass' : 'fail',
    status: completionStatus,
    warnings,
  };
}

export function buildAuthoringPayload({
  annotations = null,
  capturePairId,
  groups,
  registrationStatus = 'pending',
  reviewerId = '',
  topologyFingerprint,
  validation,
}) {
  const sortedGroups = Object.fromEntries(
    TIER2_GROUP_KEYS.map(key => [
      key,
      [...new Set(groups[key] ?? [])].sort((left, right) => left - right),
    ]),
  );
  return {
    schemaVersion: TIER2_AUTHORING_SCHEMA_VERSION,
    reviewStatus: 'provisional_human_review_required',
    capturePairId,
    topologyFingerprint,
    reviewerId,
    registrationStatus,
    annotations,
    groups: sortedGroups,
    validation,
  };
}
