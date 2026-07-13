import crypto from 'node:crypto';
import path from 'node:path';

export const CANDIDATE_SCHEMA_VERSION = 'aura.face3d-semantic-candidate.v1';
export const RUNTIME_SCHEMA_VERSION = 'aura.face3d-semantic-map.v1';

export const SEMANTIC_GROUPS = Object.freeze([
  {
    color: '#ff3b30',
    depthWeight: 0.38,
    fixedIndices: [7, 8, 9],
    key: 'noseTipIndices',
    label: '코끝',
    minimumCount: 3,
    radiusX: 0.08,
    radiusY: 0.08,
    targetCount: 3,
    targetX: 0.5,
    targetY: 0.52,
  },
  {
    color: '#007aff',
    depthWeight: 0.18,
    fixedIndices: [31, 32, 33],
    key: 'chinIndices',
    label: '턱 전방점(Pogonion/E-line)',
    minimumCount: 3,
    radiusX: 0.09,
    radiusY: 0.08,
    targetCount: 3,
    targetX: 0.5,
    targetY: 0.87,
  },
  {
    color: '#ff2d55',
    depthWeight: 0,
    fixedIndices: [913, 914, 1047],
    key: 'chinBottomIndices',
    label: '턱 최하단(Menton)',
    minimumCount: 3,
    radiusX: 0.08,
    radiusY: 0.05,
    targetCount: 3,
    targetX: 0.5,
    targetY: 0.98,
  },
  {
    color: '#ffd60a',
    depthWeight: 0.22,
    fixedIndices: [1, 21, 22],
    key: 'upperLipIndices',
    label: '윗입술 중앙',
    minimumCount: 3,
    radiusX: 0.11,
    radiusY: 0.045,
    targetCount: 3,
    targetX: 0.5,
    targetY: 0.70,
  },
  {
    color: '#ff9500',
    depthWeight: 0.22,
    fixedIndices: [26, 27, 28],
    key: 'lowerLipIndices',
    label: '아랫입술 중앙',
    minimumCount: 3,
    radiusX: 0.11,
    radiusY: 0.045,
    targetCount: 3,
    targetX: 0.5,
    targetY: 0.79,
  },
  {
    color: '#34c759',
    depthWeight: 0,
    key: 'midfaceReferenceLeftIndices',
    label: '중안면 기준 왼쪽',
    minimumCount: 8,
    radiusX: 0.09,
    radiusY: 0.08,
    targetCount: 15,
    targetX: 0.28,
    targetY: 0.54,
  },
  {
    color: '#30d158',
    depthWeight: 0,
    key: 'midfaceReferenceRightIndices',
    label: '중안면 기준 오른쪽',
    minimumCount: 8,
    radiusX: 0.09,
    radiusY: 0.08,
    targetCount: 15,
    targetX: 0.72,
    targetY: 0.54,
  },
  {
    color: '#00c7be',
    depthWeight: 0,
    key: 'midfaceReferenceUpperIndices',
    label: '중안면 기준 상단',
    minimumCount: 8,
    radiusX: 0.08,
    radiusY: 0.07,
    targetCount: 13,
    targetX: 0.5,
    targetY: 0.34,
  },
  {
    color: '#af52de',
    depthWeight: 0,
    key: 'chinReferenceLeftIndices',
    label: '턱 기준 왼쪽',
    minimumCount: 8,
    radiusX: 0.1,
    radiusY: 0.07,
    targetCount: 15,
    targetX: 0.35,
    targetY: 0.86,
  },
  {
    color: '#bf5af2',
    depthWeight: 0,
    key: 'chinReferenceRightIndices',
    label: '턱 기준 오른쪽',
    minimumCount: 8,
    radiusX: 0.1,
    radiusY: 0.07,
    targetCount: 15,
    targetX: 0.65,
    targetY: 0.86,
  },
  {
    color: '#5856d6',
    depthWeight: 0,
    key: 'chinReferenceUpperIndices',
    label: '턱 기준 상단(아래 입술밑고랑)',
    minimumCount: 8,
    radiusX: 0.09,
    radiusY: 0.06,
    targetCount: 13,
    targetX: 0.5,
    targetY: 0.84,
  },
  {
    color: '#64d2ff',
    depthWeight: 0.08,
    key: 'centralRegionIndices',
    label: '코 중앙부 ROI(콧등~코끝)',
    minimumCount: 16,
    radiusX: 0.16,
    radiusY: 0.15,
    targetCount: 35,
    targetX: 0.5,
    targetY: 0.51,
  },
]);

export const MEASUREMENT_LANDMARK_GROUP_KEYS = Object.freeze([
  'noseTipIndices',
  'chinIndices',
  'chinBottomIndices',
  'upperLipIndices',
  'lowerLipIndices',
]);

export const REFERENCE_PLANE_GROUP_KEYS = Object.freeze([
  'midfaceReferenceLeftIndices',
  'midfaceReferenceRightIndices',
  'midfaceReferenceUpperIndices',
  'chinReferenceLeftIndices',
  'chinReferenceRightIndices',
  'chinReferenceUpperIndices',
]);

export const BILATERAL_REFERENCE_GROUP_PAIRS = Object.freeze([
  Object.freeze({
    leftGroupKey: 'midfaceReferenceLeftIndices',
    rightGroupKey: 'midfaceReferenceRightIndices',
    uvSideBounds: Object.freeze({
      maximumLeftU: 0.405,
      minimumRightU: 0.595,
    }),
  }),
  Object.freeze({
    leftGroupKey: 'chinReferenceLeftIndices',
    rightGroupKey: 'chinReferenceRightIndices',
  }),
]);

export const BILATERAL_SYMMETRY_POLICY_VERSION =
  'uv-reflection-mutual-nearest-paired-connected-v2';

export const FORBIDDEN_GROUP_OVERLAPS = Object.freeze(
  MEASUREMENT_LANDMARK_GROUP_KEYS.flatMap(landmarkGroupKey =>
    REFERENCE_PLANE_GROUP_KEYS.map(referencePlaneGroupKey => Object.freeze({
      landmarkGroupKey,
      referencePlaneGroupKey,
    })),
  ),
);

export const GROUP_OVERLAP_POLICY_VERSION =
  'measurement-landmark-reference-plane-disjoint-v1';

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const MEASUREMENT_LANDMARK_GROUP_KEY_SET = new Set(MEASUREMENT_LANDMARK_GROUP_KEYS);
const REFERENCE_PLANE_GROUP_KEY_SET = new Set(REFERENCE_PLANE_GROUP_KEYS);
const BILATERAL_REFERENCE_GROUP_KEY_SET = new Set(
  BILATERAL_REFERENCE_GROUP_PAIRS.flatMap(({leftGroupKey, rightGroupKey}) => [
    leftGroupKey,
    rightGroupKey,
  ]),
);
const UV_MIRROR_RESIDUAL_CAP = 0.00125;
const UV_MIRROR_MINIMUM_AMBIGUITY_RATIO = 2;

function isFiniteTuple(value, minimumLength) {
  return Array.isArray(value)
    && value.length >= minimumLength
    && value.slice(0, minimumLength).every(Number.isFinite);
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cloneGroups(groups) {
  return Object.fromEntries(
    SEMANTIC_GROUPS.map(({key}) => [key, [...(groups[key] ?? [])]]),
  );
}

export function validateArFaceExport(payload) {
  requireCondition(payload && typeof payload === 'object', 'ARFace export JSON 객체가 필요합니다.');

  const {indices, localVertices, screenVertices, uvs} = payload;
  requireCondition(Array.isArray(localVertices) && localVertices.length > 0, 'localVertices가 없습니다.');
  requireCondition(Array.isArray(screenVertices), 'screenVertices가 없습니다.');
  requireCondition(Array.isArray(uvs), 'uvs가 없습니다.');
  requireCondition(Array.isArray(indices) && indices.length > 0, 'indices가 없습니다.');

  const vertexCount = localVertices.length;
  requireCondition(screenVertices.length === vertexCount, 'screenVertices 개수가 정점 수와 다릅니다.');
  requireCondition(uvs.length === vertexCount, 'uvs 개수가 정점 수와 다릅니다.');
  requireCondition(indices.length % 3 === 0, 'indices 개수가 삼각형 형식이 아닙니다.');
  requireCondition(localVertices.every(value => isFiniteTuple(value, 3)), 'localVertices에 잘못된 값이 있습니다.');
  requireCondition(screenVertices.every(value => isFiniteTuple(value, 3)), 'screenVertices에 잘못된 값이 있습니다.');
  requireCondition(uvs.every(value => isFiniteTuple(value, 2)), 'uvs에 잘못된 값이 있습니다.');
  requireCondition(
    indices.every(value => Number.isInteger(value) && value >= 0 && value < vertexCount),
    'indices에 범위를 벗어난 정점 번호가 있습니다.',
  );

  const displaySize = payload.display?.videoFrameSize;
  requireCondition(isFiniteTuple(displaySize, 2), 'display.videoFrameSize가 없습니다.');
  requireCondition(
    payload.display?.isMirrored === false,
    '좌우 UV 시맨틱 후보 생성에는 display.isMirrored=false 캡처만 사용할 수 있습니다.',
  );
  const frameWidth = displaySize[0];
  const frameHeight = displaySize[1];
  requireCondition(frameWidth > 0 && frameHeight > 0, '프레임 크기가 잘못되었습니다.');
  const outOfFrameIndices = [];
  for (let index = 0; index < screenVertices.length; index += 1) {
    const [x, y] = screenVertices[index];
    if (x < 0 || x > frameWidth || y < 0 || y > frameHeight) {
      outOfFrameIndices.push(index);
    }
  }
  requireCondition(
    outOfFrameIndices.length === 0,
    `얼굴 메시 전체가 프레임 안에 있지 않습니다. 화면에서 더 멀어져 이마와 턱을 모두 넣고 다시 캡처하세요. (화면 밖 정점 ${outOfFrameIndices.length}개)`,
  );

  const calibration = payload.face3dCalibration;
  requireCondition(
    calibration?.status === 'ready_for_candidate_generation',
    '이 덤프에는 Unity가 계산한 Face3D topology fingerprint가 없습니다. Face3D 캘리브레이션 코드가 포함된 UnityFramework로 다시 캡처하세요.',
  );
  requireCondition(
    calibration.fingerprintSource === 'unity_exact_native_arrays',
    'topology fingerprint가 원본 Unity 배열에서 계산되지 않았습니다.',
  );

  const topology = calibration.topologyFingerprint;
  requireCondition(topology && typeof topology === 'object', 'topologyFingerprint가 없습니다.');
  requireCondition(topology.algorithm === 'sha256-le-v1', '지원하지 않는 topology hash 알고리즘입니다.');
  requireCondition(topology.vertexCount === vertexCount, 'fingerprint vertexCount가 덤프와 다릅니다.');
  requireCondition(topology.indexCount === indices.length, 'fingerprint indexCount가 덤프와 다릅니다.');
  requireCondition(topology.uvCount === uvs.length, 'fingerprint uvCount가 덤프와 다릅니다.');
  requireCondition(SHA256_PATTERN.test(topology.indicesHash ?? ''), 'indicesHash 형식이 잘못되었습니다.');
  requireCondition(SHA256_PATTERN.test(topology.uvHash ?? ''), 'uvHash 형식이 잘못되었습니다.');
  requireCondition(SHA256_PATTERN.test(topology.fingerprint ?? ''), 'fingerprint 형식이 잘못되었습니다.');

  return {
    captureFraming: {
      frameHeight,
      frameWidth,
      fullMeshInFrame: true,
      outOfFrameVertexCount: 0,
    },
    indices,
    localVertices,
    payload,
    screenVertices,
    topology: {...topology},
    uvs,
    vertexCount,
  };
}

function buildAdjacency(vertexCount, indices) {
  const adjacency = Array.from({length: vertexCount}, () => new Set());
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    for (let index = 0; index < 3; index += 1) {
      const from = triangle[index];
      const toA = triangle[(index + 1) % 3];
      const toB = triangle[(index + 2) % 3];
      adjacency[from].add(toA);
      adjacency[from].add(toB);
    }
  }
  return adjacency;
}

function normalizeProjectedVertices(screenVertices) {
  const xs = screenVertices.map(value => value[0]);
  const ys = screenVertices.map(value => value[1]);
  const depths = screenVertices.map(value => value[2]).filter(value => value > 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  const depthRange = Math.max(1e-6, maxDepth - minDepth);

  return {
    bounds: {height, maxX, maxY, minX, minY, width},
    points: screenVertices.map(([x, y, depth]) => ({
      depth: depth > 0 ? (depth - minDepth) / depthRange : 1,
      x: (x - minX) / width,
      y: (y - minY) / height,
    })),
  };
}

function candidateScore(point, definition) {
  const dx = (point.x - definition.targetX) / definition.radiusX;
  const dy = (point.y - definition.targetY) / definition.radiusY;
  return (dx * dx) + (dy * dy) + (point.depth * definition.depthWeight);
}

function reflectedUvDistance(left, right) {
  return Math.hypot((1 - left[0]) - right[0], left[1] - right[1]);
}

function buildUvMirrorPairing(uvs) {
  const nearestByIndex = uvs.map((uv, sourceIndex) => {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let secondNearestDistance = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < uvs.length; candidateIndex += 1) {
      const distance = reflectedUvDistance(uv, uvs[candidateIndex]);
      if (
        distance < nearestDistance
        || (distance === nearestDistance && candidateIndex < nearestIndex)
      ) {
        secondNearestDistance = nearestDistance;
        nearestDistance = distance;
        nearestIndex = candidateIndex;
      } else if (distance < secondNearestDistance) {
        secondNearestDistance = distance;
      }
    }

    requireCondition(nearestIndex >= 0, `${sourceIndex}: UV mirror 대응 정점을 찾지 못했습니다.`);
    requireCondition(
      Number.isFinite(secondNearestDistance),
      `${sourceIndex}: UV mirror 대응의 모호성을 판정할 두 번째 후보가 없습니다.`,
    );
    return {nearestDistance, nearestIndex, secondNearestDistance};
  });

  let maximumResidual = 0;
  let minimumAmbiguityRatio = Number.POSITIVE_INFINITY;
  let selfPairCount = 0;
  for (let index = 0; index < nearestByIndex.length; index += 1) {
    const match = nearestByIndex[index];
    const reverseMatch = nearestByIndex[match.nearestIndex];
    requireCondition(
      reverseMatch.nearestIndex === index,
      `${index} ↔ ${match.nearestIndex}: UV mirror 대응이 상호 최근접 쌍이 아닙니다.`,
    );
    requireCondition(
      match.nearestDistance <= UV_MIRROR_RESIDUAL_CAP,
      `${index} ↔ ${match.nearestIndex}: UV mirror residual ${match.nearestDistance}가 허용치 ${UV_MIRROR_RESIDUAL_CAP}를 넘었습니다.`,
    );
    const ambiguityRatio = match.secondNearestDistance
      / Math.max(match.nearestDistance, 1e-9);
    requireCondition(
      ambiguityRatio >= UV_MIRROR_MINIMUM_AMBIGUITY_RATIO,
      `${index}: UV mirror 최근접 후보가 모호합니다. ratio=${ambiguityRatio}`,
    );
    if (match.nearestIndex === index) {
      selfPairCount += 1;
    } else {
      requireCondition(
        (uvs[index][0] - 0.5) * (uvs[match.nearestIndex][0] - 0.5) < 0,
        `${index} ↔ ${match.nearestIndex}: UV mirror 쌍이 얼굴 중심선의 반대편에 있지 않습니다.`,
      );
    }
    maximumResidual = Math.max(maximumResidual, match.nearestDistance);
    minimumAmbiguityRatio = Math.min(minimumAmbiguityRatio, ambiguityRatio);
  }

  const pairs = [];
  for (let index = 0; index < nearestByIndex.length; index += 1) {
    const mirrorIndex = nearestByIndex[index].nearestIndex;
    if (mirrorIndex === index || index > mirrorIndex) {
      continue;
    }
    const [leftIndex, rightIndex] = uvs[index][0] < uvs[mirrorIndex][0]
      ? [index, mirrorIndex]
      : [mirrorIndex, index];
    pairs.push({leftIndex, rightIndex});
  }
  pairs.sort((left, right) =>
    left.leftIndex - right.leftIndex || left.rightIndex - right.rightIndex,
  );

  requireCondition(
    (pairs.length * 2) + selfPairCount === uvs.length,
    'UV mirror pairing이 모든 topology 정점을 정확히 한 번씩 포함하지 않습니다.',
  );
  return {
    maximumResidual,
    minimumAmbiguityRatio,
    mirrorMapSha256: crypto
      .createHash('sha256')
      .update(JSON.stringify(nearestByIndex.map(({nearestIndex}) => nearestIndex)))
      .digest('hex'),
    pairs,
    selfPairCount,
  };
}

function buildBilateralPairAdjacency(pairs, adjacency) {
  const pairIndexByLeftVertex = new Map(
    pairs.map((pair, pairIndex) => [pair.leftIndex, pairIndex]),
  );
  return pairs.map((pair, pairIndex) => {
    const neighbors = new Set();
    for (const leftNeighbor of adjacency[pair.leftIndex]) {
      const neighborPairIndex = pairIndexByLeftVertex.get(leftNeighbor);
      if (neighborPairIndex === undefined || neighborPairIndex === pairIndex) {
        continue;
      }
      const neighborPair = pairs[neighborPairIndex];
      if (adjacency[pair.rightIndex].has(neighborPair.rightIndex)) {
        neighbors.add(neighborPairIndex);
      }
    }
    return neighbors;
  });
}

function isConnectedPatch(indices, adjacency) {
  if (indices.length === 0) {
    return false;
  }
  const selected = new Set(indices);
  const visited = new Set([indices[0]]);
  const queue = [indices[0]];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of adjacency[current]) {
      if (selected.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size === selected.size;
}

function growConnectedBilateralPatch({
  adjacency,
  excludedIndices,
  leftDefinition,
  pairAdjacency,
  pairs,
  points,
  rightDefinition,
  uvs,
  uvSideBounds,
}) {
  requireCondition(
    leftDefinition.targetCount === rightDefinition.targetCount,
    `${leftDefinition.key} ↔ ${rightDefinition.key}: 좌우 targetCount가 다릅니다.`,
  );

  const pairScores = new Map();
  for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
    const pair = pairs[pairIndex];
    if (excludedIndices.has(pair.leftIndex) || excludedIndices.has(pair.rightIndex)) {
      continue;
    }
    if (
      uvSideBounds
      && (
        uvs[pair.leftIndex][0] > uvSideBounds.maximumLeftU
        || uvs[pair.rightIndex][0] < uvSideBounds.minimumRightU
      )
    ) {
      continue;
    }
    pairScores.set(
      pairIndex,
      (
        candidateScore(points[pair.leftIndex], leftDefinition)
        + candidateScore(points[pair.rightIndex], rightDefinition)
      ) / 2,
    );
  }

  const comparePairIndices = (leftPairIndex, rightPairIndex) => {
    const scoreDifference = pairScores.get(leftPairIndex) - pairScores.get(rightPairIndex);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }
    const leftPair = pairs[leftPairIndex];
    const rightPair = pairs[rightPairIndex];
    return leftPair.leftIndex - rightPair.leftIndex
      || leftPair.rightIndex - rightPair.rightIndex;
  };
  const eligiblePairIndices = [...pairScores.keys()].sort(comparePairIndices);
  requireCondition(
    eligiblePairIndices.length > 0,
    `${leftDefinition.key} ↔ ${rightDefinition.key}: 금지 정점을 제외한 UV mirror 쌍이 없습니다.`,
  );

  const selectedPairIndices = new Set([eligiblePairIndices[0]]);
  const frontier = new Set(
    [...pairAdjacency[eligiblePairIndices[0]]].filter(pairIndex => pairScores.has(pairIndex)),
  );
  while (selectedPairIndices.size < leftDefinition.targetCount && frontier.size > 0) {
    const bestPairIndex = [...frontier].sort(comparePairIndices)[0];
    frontier.delete(bestPairIndex);
    selectedPairIndices.add(bestPairIndex);
    for (const neighborPairIndex of pairAdjacency[bestPairIndex]) {
      if (pairScores.has(neighborPairIndex) && !selectedPairIndices.has(neighborPairIndex)) {
        frontier.add(neighborPairIndex);
      }
    }
  }

  requireCondition(
    selectedPairIndices.size === leftDefinition.targetCount,
    `${leftDefinition.key} ↔ ${rightDefinition.key}: 양쪽에서 동시에 연결된 UV mirror 쌍을 ${leftDefinition.targetCount}개 확보하지 못했습니다.`,
  );
  const selectedPairs = [...selectedPairIndices]
    .map(pairIndex => pairs[pairIndex])
    .sort((left, right) =>
      left.leftIndex - right.leftIndex || left.rightIndex - right.rightIndex,
    );
  const leftIndices = selectedPairs.map(({leftIndex}) => leftIndex).sort((a, b) => a - b);
  const rightIndices = selectedPairs.map(({rightIndex}) => rightIndex).sort((a, b) => a - b);
  requireCondition(
    isConnectedPatch(leftIndices, adjacency) && isConnectedPatch(rightIndices, adjacency),
    `${leftDefinition.key} ↔ ${rightDefinition.key}: 선택 결과가 양쪽 원본 mesh에서 모두 연결되어 있지 않습니다.`,
  );

  return {
    leftIndices,
    pairs: selectedPairs.map(({leftIndex, rightIndex}) => [leftIndex, rightIndex]),
    rightIndices,
  };
}

function growConnectedPatch(definition, points, adjacency, excludedIndices = new Set()) {
  if (definition.fixedIndices) {
    requireCondition(
      definition.fixedIndices.every(index => Number.isInteger(index) && index >= 0 && index < points.length),
      `${definition.key}: 고정 검수 시드가 현재 topology 범위를 벗어났습니다.`,
    );
    requireCondition(
      definition.fixedIndices.every(index => !excludedIndices.has(index)),
      `${definition.key}: 고정 검수 시드가 금지된 측정 landmark 정점과 겹칩니다.`,
    );
    return [...definition.fixedIndices];
  }

  let seed = -1;
  let seedScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    if (excludedIndices.has(index)) {
      continue;
    }
    const score = candidateScore(points[index], definition);
    if (score < seedScore) {
      seed = index;
      seedScore = score;
    }
  }
  requireCondition(seed >= 0, `${definition.key}: 금지 정점을 제외한 후보 시드가 없습니다.`);

  const selected = new Set([seed]);
  const frontier = new Set(
    [...adjacency[seed]].filter(index => !excludedIndices.has(index)),
  );
  while (selected.size < definition.targetCount && frontier.size > 0) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const index of frontier) {
      const score = candidateScore(points[index], definition);
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    if (bestIndex < 0) {
      break;
    }
    frontier.delete(bestIndex);
    selected.add(bestIndex);
    for (const neighbor of adjacency[bestIndex]) {
      if (!selected.has(neighbor) && !excludedIndices.has(neighbor)) {
        frontier.add(neighbor);
      }
    }
  }

  return [...selected].sort((left, right) => left - right);
}

function buildCandidateGroups(points, adjacency, uvs) {
  const groups = {};
  const landmarkDefinitions = SEMANTIC_GROUPS.filter(({key}) =>
    MEASUREMENT_LANDMARK_GROUP_KEY_SET.has(key),
  );
  const remainingDefinitions = SEMANTIC_GROUPS.filter(({key}) =>
    !MEASUREMENT_LANDMARK_GROUP_KEY_SET.has(key)
      && !BILATERAL_REFERENCE_GROUP_KEY_SET.has(key),
  );

  for (const definition of landmarkDefinitions) {
    groups[definition.key] = growConnectedPatch(
      definition,
      points,
      adjacency,
    );
  }

  const excludedLandmarkIndices = new Set(
    MEASUREMENT_LANDMARK_GROUP_KEYS.flatMap(key => groups[key] ?? []),
  );
  const uvMirrorPairing = buildUvMirrorPairing(uvs);
  const pairAdjacency = buildBilateralPairAdjacency(
    uvMirrorPairing.pairs,
    adjacency,
  );
  const bilateralGroupPairs = [];
  for (const {
    leftGroupKey,
    rightGroupKey,
    uvSideBounds,
  } of BILATERAL_REFERENCE_GROUP_PAIRS) {
    const leftDefinition = SEMANTIC_GROUPS.find(({key}) => key === leftGroupKey);
    const rightDefinition = SEMANTIC_GROUPS.find(({key}) => key === rightGroupKey);
    requireCondition(
      leftDefinition && rightDefinition,
      `${leftGroupKey} ↔ ${rightGroupKey}: 시맨틱 그룹 정의가 없습니다.`,
    );
    const selection = growConnectedBilateralPatch({
      adjacency,
      excludedIndices: excludedLandmarkIndices,
      leftDefinition,
      pairAdjacency,
      pairs: uvMirrorPairing.pairs,
      points,
      rightDefinition,
      uvs,
      uvSideBounds,
    });
    groups[leftGroupKey] = selection.leftIndices;
    groups[rightGroupKey] = selection.rightIndices;
    bilateralGroupPairs.push({
      leftGroupKey,
      pairs: selection.pairs,
      rightGroupKey,
      ...(uvSideBounds ? {uvSideBounds: {...uvSideBounds}} : {}),
    });
  }

  for (const definition of remainingDefinitions) {
    const excludedIndices = new Set();
    if (REFERENCE_PLANE_GROUP_KEY_SET.has(definition.key)) {
      for (const index of excludedLandmarkIndices) {
        excludedIndices.add(index);
      }
    }
    groups[definition.key] = growConnectedPatch(
      definition,
      points,
      adjacency,
      excludedIndices,
    );
  }

  return {
    bilateralSymmetryPolicy: {
      policyVersion: BILATERAL_SYMMETRY_POLICY_VERSION,
      mirrorSource: 'topology_uv_reflection',
      residualCap: UV_MIRROR_RESIDUAL_CAP,
      minimumAmbiguityRatioRequired: UV_MIRROR_MINIMUM_AMBIGUITY_RATIO,
      maximumResidual: uvMirrorPairing.maximumResidual,
      mirrorMapSha256: uvMirrorPairing.mirrorMapSha256,
      minimumAmbiguityRatio: uvMirrorPairing.minimumAmbiguityRatio,
      topologyMirrorPairCount: uvMirrorPairing.pairs.length,
      topologySelfPairCount: uvMirrorPairing.selfPairCount,
      groupPairs: bilateralGroupPairs,
    },
    groups: Object.fromEntries(
      SEMANTIC_GROUPS.map(({key}) => [key, groups[key]]),
    ),
  };
}

export function buildSemanticCandidate(payload, options = {}) {
  const validated = validateArFaceExport(payload);
  const adjacency = buildAdjacency(validated.vertexCount, validated.indices);
  const normalized = normalizeProjectedVertices(validated.screenVertices);
  const {bilateralSymmetryPolicy, groups} = buildCandidateGroups(
    normalized.points,
    adjacency,
    validated.uvs,
  );

  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    candidateId: options.candidateId ?? `face3d-candidate-${Date.now()}`,
    createdAtUtc: options.createdAtUtc ?? new Date().toISOString(),
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    reviewStatus: 'candidate_only_not_runtime_approved',
    generationMethod: 'hybrid_reviewed_seed_bilateral_uv_paired_patch_v2',
    groupOverlapPolicy: {
      policyVersion: GROUP_OVERLAP_POLICY_VERSION,
      measurementLandmarkGroupKeys: [...MEASUREMENT_LANDMARK_GROUP_KEYS],
      referencePlaneGroupKeys: [...REFERENCE_PLANE_GROUP_KEYS],
    },
    topologyFingerprint: validated.topology,
    bilateralSymmetryPolicy: {
      ...bilateralSymmetryPolicy,
      topologyUvHash: validated.topology.uvHash,
    },
    captureFraming: validated.captureFraming,
    projectedFaceBounds: normalized.bounds,
    groups,
    groupDefinitions: Object.fromEntries(
      SEMANTIC_GROUPS.map(({color, fixedIndices, key, label, minimumCount}) => [
        key,
        {
          color,
          label,
          minimumCount,
          selectionMethod: fixedIndices
            ? 'reviewed_topology_seed_v1'
            : BILATERAL_REFERENCE_GROUP_KEY_SET.has(key)
              ? 'bilateral_uv_mirror_pair_connected_patch_v1'
              : 'connected_screen_patch_v1',
        },
      ]),
    ),
    warnings: [
      '이 파일은 자동 후보이며 런타임 시맨틱 맵이 아닙니다.',
      '정면과 측면 오버레이를 사람이 검수한 뒤에만 승인 맵으로 변환하세요.',
      '파란 턱 전방점은 E-line 용도의 soft-tissue Pogonion 영역인지 확인하세요.',
      '분홍 턱 최하단은 얼굴 윤곽의 Menton 영역인지 확인하세요.',
    ],
  };
}

export function buildSemanticConsensusCandidate(payloads, options = {}) {
  requireCondition(Array.isArray(payloads) && payloads.length >= 2, '합의 후보에는 캡처가 2개 이상 필요합니다.');
  requireCondition(
    payloads.every(payload => payload?.captureShotKind === 'neutral'),
    '합의 후보는 정면 neutral 캡처만 사용할 수 있습니다. 좌우 회전 캡처는 고정 후보 재투영 검증에 사용하세요.',
  );
  const validatedFrames = payloads.map(validateArFaceExport);
  const topologyFingerprint = validatedFrames[0].topology.fingerprint;
  requireCondition(
    validatedFrames.every(frame => frame.topology.fingerprint === topologyFingerprint),
    '합의 후보 캡처들의 topology fingerprint가 서로 다릅니다.',
  );

  const normalizedFrames = validatedFrames.map(frame =>
    normalizeProjectedVertices(frame.screenVertices),
  );
  const points = Array.from({length: validatedFrames[0].vertexCount}, (_, vertexIndex) => {
    const samples = normalizedFrames.map(frame => frame.points[vertexIndex]);
    return {
      depth: samples.reduce((sum, point) => sum + point.depth, 0) / samples.length,
      x: samples.reduce((sum, point) => sum + point.x, 0) / samples.length,
      y: samples.reduce((sum, point) => sum + point.y, 0) / samples.length,
    };
  });
  const adjacency = buildAdjacency(
    validatedFrames[0].vertexCount,
    validatedFrames[0].indices,
  );
  const {bilateralSymmetryPolicy, groups} = buildCandidateGroups(
    points,
    adjacency,
    validatedFrames[0].uvs,
  );

  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    candidateId: options.candidateId ?? `face3d-consensus-candidate-${Date.now()}`,
    createdAtUtc: options.createdAtUtc ?? new Date().toISOString(),
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    reviewStatus: 'candidate_only_not_runtime_approved',
    generationMethod: 'multi_capture_hybrid_reviewed_seed_bilateral_uv_paired_patch_v2',
    groupOverlapPolicy: {
      policyVersion: GROUP_OVERLAP_POLICY_VERSION,
      measurementLandmarkGroupKeys: [...MEASUREMENT_LANDMARK_GROUP_KEYS],
      referencePlaneGroupKeys: [...REFERENCE_PLANE_GROUP_KEYS],
    },
    topologyFingerprint: {...validatedFrames[0].topology},
    bilateralSymmetryPolicy: {
      ...bilateralSymmetryPolicy,
      topologyUvHash: validatedFrames[0].topology.uvHash,
    },
    sourceCapturePairIds: payloads.map(payload => payload.capturePairId ?? 'unknown'),
    sourceCaptureShotKinds: payloads.map(payload => payload.captureShotKind),
    sourceCaptureCount: payloads.length,
    projectedFaceBoundsByCapture: normalizedFrames.map(frame => frame.bounds),
    captureFramingByCapture: validatedFrames.map(frame => frame.captureFraming),
    groups,
    groupDefinitions: Object.fromEntries(
      SEMANTIC_GROUPS.map(({color, fixedIndices, key, label, minimumCount}) => [
        key,
        {
          color,
          label,
          minimumCount,
          selectionMethod: fixedIndices
            ? 'reviewed_topology_seed_v1'
            : BILATERAL_REFERENCE_GROUP_KEY_SET.has(key)
              ? 'bilateral_uv_mirror_pair_connected_patch_v1'
              : 'connected_screen_patch_v1',
        },
      ]),
    ),
    warnings: [
      '이 파일은 여러 정면 neutral 캡처의 평균 위치로 만든 자동 합의 후보이며 런타임 시맨틱 맵이 아닙니다.',
      '좌우 회전 캡처는 후보 생성에 섞지 말고 동일 정점 집합을 재투영해 검증하세요.',
      '서로 다른 얼굴과 약한 좌우 회전 오버레이를 사람이 검수한 뒤에만 승인 맵으로 변환하세요.',
      '파란 턱 전방점은 E-line 용도의 soft-tissue Pogonion 영역인지 확인하세요.',
      '분홍 턱 최하단은 얼굴 윤곽의 Menton 영역인지 확인하세요.',
    ],
  };
}

export function validateCandidateGroups(groups, vertexCount) {
  const errors = [];
  for (const definition of SEMANTIC_GROUPS) {
    const indices = groups?.[definition.key];
    if (!Array.isArray(indices)) {
      errors.push(`${definition.key}: 그룹이 없습니다.`);
      continue;
    }
    const unique = new Set(indices);
    if (unique.size !== indices.length) {
      errors.push(`${definition.key}: 중복 정점이 있습니다.`);
    }
    if (indices.length < definition.minimumCount) {
      errors.push(`${definition.key}: 최소 ${definition.minimumCount}개보다 적습니다.`);
    }
    if (!indices.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount)) {
      errors.push(`${definition.key}: 범위를 벗어난 정점이 있습니다.`);
    }
  }
  for (const {landmarkGroupKey, referencePlaneGroupKey} of FORBIDDEN_GROUP_OVERLAPS) {
    const landmarkIndices = groups?.[landmarkGroupKey];
    const referencePlaneIndices = groups?.[referencePlaneGroupKey];
    if (!Array.isArray(landmarkIndices) || !Array.isArray(referencePlaneIndices)) {
      continue;
    }
    const referencePlaneIndexSet = new Set(referencePlaneIndices);
    const overlap = [...new Set(
      landmarkIndices.filter(index => referencePlaneIndexSet.has(index)),
    )].sort((left, right) => left - right);
    if (overlap.length > 0) {
      errors.push(
        `${landmarkGroupKey} ↔ ${referencePlaneGroupKey}: 측정 landmark와 reference plane 정점이 겹칩니다 (${overlap.join(', ')}).`,
      );
    }
  }
  return errors;
}

export function validateBilateralSymmetryPolicy(candidate, uvs = null) {
  const errors = [];
  const policy = candidate?.bilateralSymmetryPolicy;
  const topology = candidate?.topologyFingerprint ?? candidate?.topology;
  const vertexCount = topology?.vertexCount;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return ['bilateralSymmetryPolicy: 좌우 UV mirror 정책이 없습니다.'];
  }
  if (policy.policyVersion !== BILATERAL_SYMMETRY_POLICY_VERSION) {
    errors.push(
      `bilateralSymmetryPolicy.policyVersion: ${BILATERAL_SYMMETRY_POLICY_VERSION}이 필요합니다.`,
    );
  }
  if (policy.mirrorSource !== 'topology_uv_reflection') {
    errors.push('bilateralSymmetryPolicy.mirrorSource: topology_uv_reflection이어야 합니다.');
  }
  if (policy.topologyUvHash !== topology?.uvHash) {
    errors.push('bilateralSymmetryPolicy.topologyUvHash가 후보 topology uvHash와 다릅니다.');
  }
  if (typeof policy.mirrorMapSha256 !== 'string' || !SHA256_PATTERN.test(policy.mirrorMapSha256)) {
    errors.push('bilateralSymmetryPolicy.mirrorMapSha256는 64자리 SHA-256이어야 합니다.');
  }
  if (policy.residualCap !== UV_MIRROR_RESIDUAL_CAP) {
    errors.push(`bilateralSymmetryPolicy.residualCap은 ${UV_MIRROR_RESIDUAL_CAP}이어야 합니다.`);
  }
  if (policy.minimumAmbiguityRatioRequired !== UV_MIRROR_MINIMUM_AMBIGUITY_RATIO) {
    errors.push(
      `bilateralSymmetryPolicy.minimumAmbiguityRatioRequired는 ${UV_MIRROR_MINIMUM_AMBIGUITY_RATIO}이어야 합니다.`,
    );
  }
  if (
    !Number.isFinite(policy.maximumResidual)
    || policy.maximumResidual < 0
    || policy.maximumResidual > UV_MIRROR_RESIDUAL_CAP
  ) {
    errors.push('bilateralSymmetryPolicy.maximumResidual이 허용 범위를 벗어났습니다.');
  }
  if (
    !Number.isFinite(policy.minimumAmbiguityRatio)
    || policy.minimumAmbiguityRatio < UV_MIRROR_MINIMUM_AMBIGUITY_RATIO
  ) {
    errors.push('bilateralSymmetryPolicy.minimumAmbiguityRatio가 최소 기준보다 작습니다.');
  }
  if (
    !Number.isInteger(policy.topologyMirrorPairCount)
    || policy.topologyMirrorPairCount < 1
    || !Number.isInteger(policy.topologySelfPairCount)
    || policy.topologySelfPairCount < 0
    || !Number.isInteger(vertexCount)
    || (policy.topologyMirrorPairCount * 2) + policy.topologySelfPairCount !== vertexCount
  ) {
    errors.push('bilateralSymmetryPolicy topology pair 수가 vertexCount와 일치하지 않습니다.');
  }

  if (!Array.isArray(policy.groupPairs)) {
    errors.push('bilateralSymmetryPolicy.groupPairs가 배열이 아닙니다.');
    return errors;
  }
  if (policy.groupPairs.length !== BILATERAL_REFERENCE_GROUP_PAIRS.length) {
    errors.push(
      `bilateralSymmetryPolicy.groupPairs는 정확히 ${BILATERAL_REFERENCE_GROUP_PAIRS.length}개여야 합니다.`,
    );
  }

  const actualTopologyPairs = new Set();
  let topologyPairing = null;
  if (uvs !== null) {
    try {
      requireCondition(
        Array.isArray(uvs) && uvs.length === vertexCount && uvs.every(value => isFiniteTuple(value, 2)),
        '검증용 UV 배열이 후보 vertexCount와 일치하지 않습니다.',
      );
      topologyPairing = buildUvMirrorPairing(uvs);
      for (const {leftIndex, rightIndex} of topologyPairing.pairs) {
        actualTopologyPairs.add(`${leftIndex}:${rightIndex}`);
      }
      if (topologyPairing.pairs.length !== policy.topologyMirrorPairCount) {
        errors.push('실제 UV mirror pair 수가 candidate 정책과 다릅니다.');
      }
      if (topologyPairing.mirrorMapSha256 !== policy.mirrorMapSha256) {
        errors.push('실제 UV mirror map SHA-256이 candidate 정책과 다릅니다.');
      }
      if (topologyPairing.selfPairCount !== policy.topologySelfPairCount) {
        errors.push('실제 UV centerline self-pair 수가 candidate 정책과 다릅니다.');
      }
      if (Math.abs(topologyPairing.maximumResidual - policy.maximumResidual) > 1e-12) {
        errors.push('실제 UV mirror maximumResidual이 candidate 정책과 다릅니다.');
      }
      if (
        Math.abs(topologyPairing.minimumAmbiguityRatio - policy.minimumAmbiguityRatio)
          > Math.max(1e-9, Math.abs(topologyPairing.minimumAmbiguityRatio) * 1e-12)
      ) {
        errors.push('실제 UV mirror minimumAmbiguityRatio가 candidate 정책과 다릅니다.');
      }
    } catch (error) {
      errors.push(`실제 topology UV mirror 검증 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const expectedPair of BILATERAL_REFERENCE_GROUP_PAIRS) {
    const matchingEntries = policy.groupPairs.filter(entry =>
      entry?.leftGroupKey === expectedPair.leftGroupKey
        && entry?.rightGroupKey === expectedPair.rightGroupKey,
    );
    if (matchingEntries.length !== 1) {
      errors.push(
        `${expectedPair.leftGroupKey} ↔ ${expectedPair.rightGroupKey}: groupPairs 항목이 정확히 하나여야 합니다.`,
      );
      continue;
    }
    const entry = matchingEntries[0];
    if (expectedPair.uvSideBounds) {
      if (
        !entry.uvSideBounds
        || entry.uvSideBounds.maximumLeftU !== expectedPair.uvSideBounds.maximumLeftU
        || entry.uvSideBounds.minimumRightU !== expectedPair.uvSideBounds.minimumRightU
      ) {
        errors.push(
          `${expectedPair.leftGroupKey}: 중안면 UV 안쪽 경계 계약이 생성기 설정과 다릅니다.`,
        );
      }
    }
    if (!Array.isArray(entry.pairs)) {
      errors.push(`${expectedPair.leftGroupKey}: pairs가 배열이 아닙니다.`);
      continue;
    }
    const leftIndices = [];
    const rightIndices = [];
    const pairKeys = new Set();
    for (const pair of entry.pairs) {
      if (
        !Array.isArray(pair)
        || pair.length !== 2
        || !pair.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount)
      ) {
        errors.push(`${expectedPair.leftGroupKey}: 잘못된 UV mirror pair가 있습니다.`);
        continue;
      }
      const [leftIndex, rightIndex] = pair;
      if (leftIndex === rightIndex) {
        errors.push(`${expectedPair.leftGroupKey}: centerline self-pair를 좌우 기준군에 사용할 수 없습니다.`);
      }
      const pairKey = `${leftIndex}:${rightIndex}`;
      if (pairKeys.has(pairKey)) {
        errors.push(`${expectedPair.leftGroupKey}: 중복 UV mirror pair가 있습니다.`);
      }
      pairKeys.add(pairKey);
      if (topologyPairing && !actualTopologyPairs.has(pairKey)) {
        errors.push(`${expectedPair.leftGroupKey}: ${pairKey}는 실제 topology UV mirror pair가 아닙니다.`);
      }
      if (
        topologyPairing
        && expectedPair.uvSideBounds
        && (
          uvs[leftIndex][0] > expectedPair.uvSideBounds.maximumLeftU
          || uvs[rightIndex][0] < expectedPair.uvSideBounds.minimumRightU
        )
      ) {
        errors.push(`${expectedPair.leftGroupKey}: ${pairKey}가 중안면 UV 안쪽 경계를 넘었습니다.`);
      }
      leftIndices.push(leftIndex);
      rightIndices.push(rightIndex);
    }
    if (new Set(leftIndices).size !== leftIndices.length) {
      errors.push(`${expectedPair.leftGroupKey}: 같은 왼쪽 정점이 여러 pair에 들어 있습니다.`);
    }
    if (new Set(rightIndices).size !== rightIndices.length) {
      errors.push(`${expectedPair.rightGroupKey}: 같은 오른쪽 정점이 여러 pair에 들어 있습니다.`);
    }
    const expectedLeft = [...(candidate?.groups?.[expectedPair.leftGroupKey] ?? [])]
      .sort((left, right) => left - right);
    const expectedRight = [...(candidate?.groups?.[expectedPair.rightGroupKey] ?? [])]
      .sort((left, right) => left - right);
    const pairedLeft = [...leftIndices].sort((left, right) => left - right);
    const pairedRight = [...rightIndices].sort((left, right) => left - right);
    if (JSON.stringify(expectedLeft) !== JSON.stringify(pairedLeft)) {
      errors.push(`${expectedPair.leftGroupKey}: 그룹이 UV mirror pair 왼쪽 집합과 다릅니다.`);
    }
    if (JSON.stringify(expectedRight) !== JSON.stringify(pairedRight)) {
      errors.push(`${expectedPair.rightGroupKey}: 그룹이 UV mirror pair 오른쪽 집합과 다릅니다.`);
    }
  }
  return errors;
}

export function buildApprovedRuntimeMap(candidate, mapId) {
  requireCondition(candidate?.schemaVersion === CANDIDATE_SCHEMA_VERSION, '후보 맵 스키마가 잘못되었습니다.');
  requireCondition(candidate.reviewStatus === 'human_overlay_approved', '사람의 오버레이 승인이 필요합니다.');
  requireCondition(typeof mapId === 'string' && mapId.trim().length >= 4, 'mapId를 4자 이상 입력하세요.');
  const errors = [
    ...validateCandidateGroups(candidate.groups, candidate.topologyFingerprint.vertexCount),
    ...validateBilateralSymmetryPolicy(candidate),
  ];
  requireCondition(errors.length === 0, errors.join('\n'));

  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    mapId: mapId.trim(),
    source: 'arkit_face_mesh',
    gateVersion: 'face3d-gate-v1',
    topologyFingerprint: {...candidate.topologyFingerprint},
    ...cloneGroups(candidate.groups),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeEmbeddedJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildReviewHtml({candidate, frameDataUri, framePath, payload}) {
  const frameSource = escapeHtml(
    frameDataUri ?? framePath.split(path.sep).join('/'),
  );
  const data = safeEmbeddedJson({
    candidate,
    groups: SEMANTIC_GROUPS,
    indices: payload.indices,
    screenVertices: payload.screenVertices,
  });

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Face3D 시맨틱 맵 검수</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #101114; color: #f5f5f7; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 100vh; }
    .stage { align-items: center; background: #050506; display: flex; justify-content: center; overflow: auto; padding: 20px; }
    canvas { box-shadow: 0 12px 48px #000a; cursor: crosshair; height: auto; max-height: calc(100vh - 40px); max-width: 100%; }
    aside { border-left: 1px solid #2c2c2e; overflow: auto; padding: 20px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    .note { color: #a1a1a6; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
    .group { align-items: center; background: #1c1c1e; border: 1px solid transparent; border-radius: 10px; color: inherit; display: flex; gap: 10px; margin: 6px 0; padding: 10px; text-align: left; width: 100%; }
    .group.active { border-color: #fff; }
    .swatch { border-radius: 50%; height: 14px; width: 14px; }
    .count { color: #a1a1a6; margin-left: auto; }
    .row { display: flex; gap: 8px; margin: 12px 0; }
    button, input { font: inherit; }
    .action { background: #2c2c2e; border: 0; border-radius: 8px; color: #fff; padding: 9px 12px; }
    .action.active { background: #0a84ff; }
    .action.primary { background: #30d158; color: #071b0d; font-weight: 700; width: 100%; }
    .action:disabled { opacity: .35; }
    label { color: #d1d1d6; display: block; font-size: 13px; margin: 12px 0; }
    input[type="range"] { width: 100%; }
    input[type="text"] { background: #1c1c1e; border: 1px solid #3a3a3c; border-radius: 8px; color: #fff; padding: 10px; width: 100%; }
    .status { background: #1c1c1e; border-radius: 8px; color: #ffd60a; font-size: 12px; line-height: 1.45; margin: 12px 0; padding: 10px; white-space: pre-wrap; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } aside { border-left: 0; border-top: 1px solid #2c2c2e; } }
  </style>
</head>
<body>
  <div class="layout">
    <main class="stage"><canvas id="canvas"></canvas></main>
    <aside>
      <h1>Face3D 시맨틱 맵 검수</h1>
      <div class="note">색상 후보를 실제 얼굴 부위와 대조하세요. 좌우 UV 쌍 기준군은 대칭 계약 보호를 위해 읽기 전용이며, 나머지 그룹만 클릭/드래그로 수정할 수 있습니다.</div>
      <div id="groups"></div>
      <div class="row">
        <button class="action active" id="addMode">추가</button>
        <button class="action" id="removeMode">제거</button>
        <button class="action" id="undo">실행 취소</button>
      </div>
      <label>브러시 반경 <span id="brushValue">12</span>px<input id="brush" max="60" min="3" type="range" value="12" /></label>
      <label><input id="showMesh" type="checkbox" checked /> 전체 메시 선 표시</label>
      <label><input id="showIds" type="checkbox" /> 선택 정점 번호 표시</label>
      <button class="action" id="downloadCandidate">수정 후보 JSON 저장</button>
      <hr />
      <div class="status" id="status">자동 후보 상태 — 런타임 사용 금지</div>
      <div class="note">이 한 장짜리 편집 화면에서는 런타임 맵을 승인할 수 없습니다. 수정 후보를 저장한 뒤 서로 다른 얼굴 3명의 정면·좌·우 고정 후보 재투영 검수와 별도 승인 gate를 통과해야 합니다.</div>
    </aside>
  </div>
  <img id="frame" src="${frameSource}" hidden />
  <script>
    const DATA = ${data};
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const frame = document.getElementById('frame');
    const selected = Object.fromEntries(Object.entries(DATA.candidate.groups).map(([key, values]) => [key, new Set(values)]));
    const bilateralKeys = new Set(
      (DATA.candidate.bilateralSymmetryPolicy?.groupPairs || [])
        .flatMap(value => [value.leftGroupKey, value.rightGroupKey]),
    );
    const history = [];
    let activeKey = DATA.groups[0].key;
    let mode = 'add';
    let dragging = false;

    function snapshot() {
      history.push(Object.fromEntries(Object.entries(selected).map(([key, values]) => [key, [...values]])));
      if (history.length > 30) history.shift();
    }

    function buildGroups() {
      const root = document.getElementById('groups');
      root.innerHTML = '';
      for (const definition of DATA.groups) {
        const button = document.createElement('button');
        button.className = 'group' + (definition.key === activeKey ? ' active' : '');
        button.innerHTML = '<span class="swatch" style="background:' + definition.color + '"></span><span>' + definition.label + (bilateralKeys.has(definition.key) ? ' · UV쌍 잠금' : '') + '</span><span class="count">' + selected[definition.key].size + '</span>';
        button.onclick = () => { activeKey = definition.key; buildGroups(); draw(); };
        root.appendChild(button);
      }
    }

    function draw() {
      if (!frame.complete || !frame.naturalWidth) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      if (document.getElementById('showMesh').checked) {
        context.strokeStyle = 'rgba(255,255,255,.18)'; context.lineWidth = 1;
        for (let offset = 0; offset < DATA.indices.length; offset += 3) {
          const a = DATA.screenVertices[DATA.indices[offset]];
          const b = DATA.screenVertices[DATA.indices[offset + 1]];
          const c = DATA.screenVertices[DATA.indices[offset + 2]];
          context.beginPath(); context.moveTo(a[0], a[1]); context.lineTo(b[0], b[1]); context.lineTo(c[0], c[1]); context.closePath(); context.stroke();
        }
      }
      for (const definition of DATA.groups) {
        const active = definition.key === activeKey;
        context.fillStyle = definition.color + (active ? 'ee' : '99');
        context.strokeStyle = active ? '#ffffff' : definition.color;
        for (const index of selected[definition.key]) {
          const point = DATA.screenVertices[index];
          context.beginPath(); context.arc(point[0], point[1], active ? 5 : 3.5, 0, Math.PI * 2); context.fill();
          if (active) context.stroke();
          if (document.getElementById('showIds').checked && active) {
            context.fillStyle = '#fff'; context.font = '12px monospace'; context.fillText(String(index), point[0] + 6, point[1] - 6); context.fillStyle = definition.color + 'ee';
          }
        }
      }
    }

    function canvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height};
    }

    function paint(event, saveHistory) {
      if (bilateralKeys.has(activeKey)) {
        validate();
        return;
      }
      if (saveHistory) snapshot();
      const point = canvasPoint(event);
      const radius = Number(document.getElementById('brush').value);
      let matches = DATA.screenVertices.map((value, index) => ({distance: Math.hypot(value[0] - point.x, value[1] - point.y), index})).filter(value => value.distance <= radius);
      if (!matches.length) matches = DATA.screenVertices.map((value, index) => ({distance: Math.hypot(value[0] - point.x, value[1] - point.y), index})).sort((a, b) => a.distance - b.distance).slice(0, 1);
      for (const match of matches) mode === 'add' ? selected[activeKey].add(match.index) : selected[activeKey].delete(match.index);
      buildGroups(); validate(); draw();
    }

    function plainGroups() { return Object.fromEntries(Object.entries(selected).map(([key, values]) => [key, [...values].sort((a, b) => a - b)])); }
    function errors() {
      const problems = [];
      for (const definition of DATA.groups) if (selected[definition.key].size < definition.minimumCount) problems.push(definition.label + ': 최소 ' + definition.minimumCount + '개 필요');
      return problems;
    }
    function validate() {
      const problems = errors();
      document.getElementById('status').textContent = bilateralKeys.has(activeKey)
        ? '좌우 UV mirror 쌍 기준군 — 읽기 전용 · 생성기에서 쌍 단위로만 변경 가능'
        : problems.length
        ? problems.join('\\n')
        : '후보 개수 조건 통과 — 수정 후보 저장 가능 · 런타임 승인 불가';
    }
    function download(name, value) {
      const blob = new Blob([JSON.stringify(value, null, 2) + '\\n'], {type: 'application/json'});
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href);
    }

    canvas.addEventListener('pointerdown', event => { dragging = true; canvas.setPointerCapture(event.pointerId); paint(event, true); });
    canvas.addEventListener('pointermove', event => { if (dragging) paint(event, false); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    document.getElementById('addMode').onclick = () => { mode = 'add'; document.getElementById('addMode').classList.add('active'); document.getElementById('removeMode').classList.remove('active'); };
    document.getElementById('removeMode').onclick = () => { mode = 'remove'; document.getElementById('removeMode').classList.add('active'); document.getElementById('addMode').classList.remove('active'); };
    document.getElementById('undo').onclick = () => { const previous = history.pop(); if (!previous) return; for (const [key, values] of Object.entries(previous)) selected[key] = new Set(values); buildGroups(); validate(); draw(); };
    document.getElementById('brush').oninput = event => { document.getElementById('brushValue').textContent = event.target.value; };
    document.getElementById('showMesh').onchange = draw; document.getElementById('showIds').onchange = draw;
    document.getElementById('downloadCandidate').onclick = () => download('ARKitFaceSemanticMapV1.candidate.json', {...DATA.candidate, groups: plainGroups(), reviewStatus: 'candidate_edited_not_runtime_approved'});
    frame.onload = () => { canvas.width = frame.naturalWidth; canvas.height = frame.naturalHeight; buildGroups(); validate(); draw(); };
    if (frame.complete) frame.onload();
  </script>
</body>
</html>`;
}

export function buildCandidateOverlaySvg({candidate, frameDataUri, framePath, payload}) {
  const displaySize = payload.display?.videoFrameSize;
  const width = Number(displaySize?.[0]) || Math.ceil(Math.max(...payload.screenVertices.map(value => value[0])));
  const height = Number(displaySize?.[1]) || Math.ceil(Math.max(...payload.screenVertices.map(value => value[1])));
  const frameSource = escapeHtml(
    frameDataUri ?? framePath.split(path.sep).join('/'),
  );
  const overlayOrder = [
    ...SEMANTIC_GROUPS.filter(definition => definition.key === 'centralRegionIndices'),
    ...SEMANTIC_GROUPS.filter(definition => definition.key.includes('Reference')),
    ...SEMANTIC_GROUPS.filter(definition =>
      definition.key !== 'centralRegionIndices' && !definition.key.includes('Reference'),
    ),
  ];
  const circles = overlayOrder.flatMap(definition =>
    candidate.groups[definition.key].map(index => {
      const [x, y] = payload.screenVertices[index];
      const isBroadRegion = definition.key === 'centralRegionIndices';
      return `<circle cx="${x}" cy="${y}" fill="${definition.color}" fill-opacity="${isBroadRegion ? '0.48' : '0.86'}" r="${isBroadRegion ? '3.5' : '4.5'}"><title>${definition.label} · vertex ${index}</title></circle>`;
    }),
  ).join('\n');
  const legend = SEMANTIC_GROUPS.map((definition, index) => {
    const y = 28 + (index * 24);
    return `<circle cx="22" cy="${y}" fill="${definition.color}" r="6"/><text x="36" y="${y + 4}" fill="white" font-size="13">${escapeHtml(definition.label)} (${candidate.groups[definition.key].length})</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${frameSource}" width="${width}" height="${height}"/>
  <g>${circles}</g>
  <g><rect x="8" y="8" width="250" height="${SEMANTIC_GROUPS.length * 24 + 16}" rx="10" fill="black" fill-opacity="0.7"/>${legend}</g>
  <text x="${width - 16}" y="${height - 18}" text-anchor="end" fill="#ffd60a" font-size="16">AUTO CANDIDATE · HUMAN REVIEW REQUIRED</text>
</svg>`;
}
