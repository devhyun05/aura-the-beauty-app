#!/usr/bin/env node
// Tier-2 고정 patch authoring/review — 실캡처 2D overlay + 회전 가능한 local-mesh 3D.
//
// 자동 후보는 탐색을 돕는 보조 레이어일 뿐 승인점이 아니다. reviewer는 허용 해부 영역,
// 대표 target, 고정 patch를 구분해 표시하고, g1/Tier-2 overlap·연결성·UV 좌우 대칭·
// runtime winner의 patch boundary hit를 확인한다. 현재 review corpus의 전면카메라 frame은
// 거울 표시이므로 피사체 자신의 해부학적 Left=화면 왼쪽=-face-local lateral이다.
// 3D 보기는 local geometry만 회전하므로 texture에서만 보이는 alar crease나 임상적
// 정답을 새로 만들어내지 않는다. 불명확하면 subnasal/pitch-up 실캡처가 추가로 필요하다.
//
// 사용: node build-tier2-seed-review.mjs <capture-dir> [<output.html>] [--patch <authoring.json>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  SCORE_TIE_EPSILON,
  TIER2_AUTHORING_SCHEMA_VERSION,
  TIER2_GROUPS,
  TIER2_GROUP_KEYS,
  UV_MIRROR_RESIDUAL_CAP,
  buildAuthoringPayload,
  buildMeshAdjacency,
  buildUvMirrorMap,
  createFaceCoordinateFrame,
  emptyTier2Groups,
  extractTier2Groups,
  selectScoreWinner,
  toFaceCoordinates,
  validateTier2Patch,
} from './tier2-seed-review-core.mjs';
import {validateArFaceExport} from './semantic-candidate-core.mjs';

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function resolveCaptureFile(captureDir, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error(`${label} 경로가 없습니다.`);
  }
  const resolved = path.resolve(captureDir, relativePath);
  if (!resolved.startsWith(`${captureDir}${path.sep}`)) {
    throw new Error(`${label} 경로가 capture 폴더 밖을 가리킵니다: ${relativePath}`);
  }
  const realCaptureDir = fs.realpathSync(captureDir);
  const realResolved = fs.realpathSync(resolved);
  if (!realResolved.startsWith(`${realCaptureDir}${path.sep}`)) {
    throw new Error(`${label} symlink가 capture 폴더 밖을 가리킵니다: ${relativePath}`);
  }
  return realResolved;
}

function assertIndexList(values, vertexCount, label) {
  if (!Array.isArray(values)) {
    throw new Error(`${label}는 vertex index 배열이어야 합니다.`);
  }
  const seen = new Set();
  for (const index of values) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new Error(`${label}에 범위 밖 vertex index가 있습니다: ${index}`);
    }
    if (seen.has(index)) {
      throw new Error(`${label}에 중복 vertex index가 있습니다: ${index}`);
    }
    seen.add(index);
  }
  return [...values].sort((left, right) => left - right);
}

function isCanonicalIsoUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function blindEvidenceIsComplete(annotations, faceVertices) {
  return TIER2_GROUPS.filter(({required}) => required).every(({key, sideSign}) => {
    const annotation = annotations?.[key] ?? {};
    const allowedRegionIndices = Array.isArray(annotation.allowedRegionIndices)
      ? annotation.allowedRegionIndices
      : [];
    const allowedRegionIsOnSide = sideSign == null
      || allowedRegionIndices.every(index => (
        Array.isArray(faceVertices?.[index])
        && faceVertices[index][0] * sideSign > SCORE_TIE_EPSILON
      ));
    const targetIsValid = annotation.targetIndex == null
      || (
        Number.isInteger(annotation.targetIndex)
        && allowedRegionIndices.includes(annotation.targetIndex)
      );
    if (annotation.disposition === 'unsupported_null') {
      return annotation.coverageVerdict === 'fail'
        && typeof annotation.coverageNote === 'string'
        && annotation.coverageNote.trim().length > 0
        && typeof annotation.unsupportedReason === 'string'
        && annotation.unsupportedReason.trim().length > 0
        && allowedRegionIsOnSide
        && targetIsValid;
    }
    return allowedRegionIndices.length > 0
      && Number.isInteger(annotation.targetIndex)
      && allowedRegionIndices.includes(annotation.targetIndex)
      && allowedRegionIsOnSide;
  });
}

// G1 후보 생성기는 얼굴 메시 전체가 frame 안에 있어야 한다. Tier-2의 기존 17개
// review corpus에는 이 조건을 못 맞춘 1개가 있으므로, review 도구에서는 그 사실을
// 숨기지 않고 captureFraming 경고로 보존하면서 topology/UV/배열 계약은 동일 validator로
// 계속 검증한다. clamp는 validator의 framing 검사만 통과시키는 내부 복사본에 한정하며,
// 실제 overlay와 3D에는 원본 screen/local vertex를 그대로 쓴다.
function validateTier2ReviewCapture(payload) {
  const displaySize = payload.display?.videoFrameSize;
  const frameWidth = Array.isArray(displaySize) ? displaySize[0] : Number.NaN;
  const frameHeight = Array.isArray(displaySize) ? displaySize[1] : Number.NaN;
  const outOfFrameIndices = Array.isArray(payload.screenVertices)
    ? payload.screenVertices.flatMap(([x, y], index) => (
      Number.isFinite(frameWidth)
      && Number.isFinite(frameHeight)
      && x >= 0 && x <= frameWidth
      && y >= 0 && y <= frameHeight
        ? []
        : [index]
    ))
    : [];
  if (outOfFrameIndices.length === 0) {
    return validateArFaceExport(payload);
  }

  const framingOnlyCopy = {
    ...payload,
    screenVertices: payload.screenVertices.map(([x, y, ...rest]) => [
      Math.max(0, Math.min(frameWidth, x)),
      Math.max(0, Math.min(frameHeight, y)),
      ...rest,
    ]),
  };
  const validated = validateArFaceExport(framingOnlyCopy);
  return {
    ...validated,
    captureFraming: {
      frameHeight,
      frameWidth,
      fullMeshInFrame: false,
      outOfFrameIndices,
      outOfFrameVertexCount: outOfFrameIndices.length,
    },
    payload,
    screenVertices: payload.screenVertices,
  };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIVE_MAP_PATH = path.join(
  REPO_ROOT,
  'apps/unity/MakeupAR/Assets/Resources/Face3D/ARKitFaceSemanticMapV1.json',
);

function parseCliArguments(argv) {
  const positional = [];
  let patchPath = null;
  let reprojectionMode = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--patch') {
      patchPath = argv[index + 1];
      if (!patchPath) {
        throw new Error('--patch 뒤에 JSON 경로가 필요합니다.');
      }
      index += 1;
      continue;
    }
    if (argument.startsWith('--patch=')) {
      patchPath = argument.slice('--patch='.length);
      continue;
    }
    if (argument === '--reprojection') {
      reprojectionMode = true;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`알 수 없는 옵션: ${argument}`);
    }
    positional.push(argument);
  }
  if (positional.length < 1 || positional.length > 2) {
    throw new Error(
      '사용: node build-tier2-seed-review.mjs <capture-dir> [<output.html>] [--patch <authoring.json>]',
    );
  }
  if (reprojectionMode && !patchPath) {
    throw new Error('--reprojection은 --patch <authoring.json>과 함께 사용해야 합니다.');
  }
  return {
    captureDir: path.resolve(positional[0]),
    outHtml: positional[1] ? path.resolve(positional[1]) : null,
    patchPath: patchPath ? path.resolve(patchPath) : null,
    reprojectionMode,
  };
}

function main() {
  const cli = parseCliArguments(process.argv.slice(2));
  const {captureDir} = cli;
  if (!fs.existsSync(captureDir)) {
    throw new Error(`캡처 폴더가 없습니다: ${captureDir}`);
  }
  const payload = readJson(path.join(captureDir, 'arface_export.json'));
  const validatedCapture = validateTier2ReviewCapture(payload);
  const liveMap = readJson(LIVE_MAP_PATH);
  if (
    liveMap.topologyFingerprint?.fingerprint
    !== validatedCapture.topology.fingerprint
  ) {
    throw new Error('capture와 live g1 map의 topology fingerprint가 다릅니다.');
  }
  const screen = validatedCapture.screenVertices;
  const local = validatedCapture.localVertices;
  const [width, height] = payload.display.videoFrameSize;

  const scr2 = i => [screen[i][0], screen[i][1]];
  const centroid2 = idx => {
    const s = idx.reduce((a, i) => [a[0] + screen[i][0], a[1] + screen[i][1]], [0, 0]);
    return [s[0] / idx.length, s[1] / idx.length];
  };
  const tip = centroid2(liveMap.noseTipIndices);
  const midL = centroid2(liveMap.midfaceReferenceLeftIndices);
  const midR = centroid2(liveMap.midfaceReferenceRightIndices);
  const upperLip = centroid2(liveMap.upperLipIndices);
  const midX = (midL[0] + midR[0]) / 2;
  const faceW = Math.hypot(midR[0] - midL[0], midR[1] - midL[1]);
  const upY = tip[1] - upperLip[1];
  const up = Math.abs(upY) < 1 ? -faceW * 0.5 : upY;

  // ── face-local 좌표 — evaluator와 같은 midface plane/scale.
  // 이 corpus의 거울 frame에서는 -lateral=해부학 Left, +lateral=해부학 Right. ──
  const faceFrame = createFaceCoordinateFrame(local, liveMap);
  const faceCoordinates = local.map(vertex => toFaceCoordinates(vertex, faceFrame));
  const lateralProjection = i => faceCoordinates[i][0];
  const anteriorProjection = i => faceCoordinates[i][2];

  const usedByG1 = new Set(
    [
      liveMap.noseTipIndices, liveMap.chinIndices, liveMap.chinBottomIndices,
      liveMap.upperLipIndices, liveMap.lowerLipIndices,
      liveMap.midfaceReferenceLeftIndices, liveMap.midfaceReferenceRightIndices,
      liveMap.midfaceReferenceUpperIndices, liveMap.chinReferenceLeftIndices,
      liveMap.chinReferenceRightIndices, liveMap.chinReferenceUpperIndices,
      liveMap.centralRegionIndices,
    ].flat(),
  );
  const free = i => !usedByG1.has(i);
  const groupDefinitionByKey = Object.fromEntries(TIER2_GROUPS.map(group => [group.key, group]));

  // 코 정중선(nasion·bridge): 2D 근접(앵커 기준). count 개 자동 제안 + 링 안 나머지 후보.
  const proximityGroups = [
    {...groupDefinitionByKey.nasionIndices,
      x: midX, y: tip[1] + up * 0.98, r: faceW * 0.14, count: 3,
      note: 'upper palpebral sulci 높이의 soft-tissue nasion proxy. deepest sellion 아님. g1 controlled overlap 허용.'},
    {...groupDefinitionByKey.noseBridgeMidlineIndices,
      x: midX, y: tip[1] + up * 0.55, r: faceW * 0.13, count: 6,
      note: 'nasion→코끝 정중선 능선(≥4). 실제 중앙선 보존을 위해 g1 controlled overlap 허용.'},
  ];

  // 콧볼(alare): 콧볼이 가장 넓어지는 최외측점(al). 코 밴드에서 |가로| 최대 = 콧볼점.
  //   세로: 코끝~콧방울 아래(상순 전). 가로: 코 폭 범위(광대까지 안 감).
  const noseLen = Math.max(1, upperLip[1] - tip[1]);
  const alaYTop = tip[1] - noseLen * 0.05;
  const alaYBot = tip[1] + noseLen * 0.6;
  const alaInner = faceW * 0.15; // 콧대 중앙(columella) 배제
  const alaOuter = faceW * 0.42; // 콧볼 폭 이내 — 코-볼 경계·볼 배제
  const alarGroups = [
    {...groupDefinitionByKey.alarLeftIndices, count: 5,
      note: '피사체 자신의 Left(거울 화면 왼쪽, -local lateral). convex ala 최외측, alar crease(ac) 아님.'},
    {...groupDefinitionByKey.alarRightIndices, count: 5,
      note: '피사체 자신의 Right(거울 화면 오른쪽, +local lateral). convex ala 최외측, alar crease(ac) 아님.'},
  ];

  // 광대 박스(해부학 기준). 위치는 랜드마크로 정하고, 전방 투영은 박스 안에서 정점만 고른다.
  //   세로: 눈밑(midU 아래) ~ 콧방울 높이(코끝 살짝 아래)  — 눈·코옆 배제
  //   가로: 그 박스 안 얼굴 실루엣까지 거리의 0.45~0.92 (측면 볼) — 코 옆 살·귀쪽 rim 배제
  const midU2 = centroid2(liveMap.midfaceReferenceUpperIndices);
  const eyeLevelY = midU2[1];            // 미간·콧대뿌리 높이(눈 높이 근처)
  const span = Math.max(1, tip[1] - eyeLevelY); // 눈→코끝 세로 거리(양수)
  const malarYTop = eyeLevelY + span * 0.25; // 눈보다 확실히 아래
  const malarYBot = tip[1] + span * 0.20;    // 코끝 살짝 아래(콧방울 높이)
  const malarInnerFrac = 0.45;               // 안쪽 경계(코 옆 배제)
  const malarOuterFrac = 0.92;               // 바깥 경계(귀쪽 실루엣 rim 제외)
  const projectionGroups = [
    {...groupDefinitionByKey.malarApexLeftIndices, count: 5,
      note: '피사체 Left(거울 화면 왼쪽) 앞광대 proxy. 히트맵 밝을수록 전방, 점선 링=max. zygion 폭 아님.'},
    {...groupDefinitionByKey.malarApexRightIndices, count: 5,
      note: '피사체 Right(거울 화면 오른쪽) 앞광대 proxy. 히트맵 밝을수록 전방, 점선 링=max. zygion 폭 아님.'},
  ];

  const suggestions = {};
  const groupSvg = [];
  const controls = [];

  const pushControl = (g, chosen) =>
    controls.push(
      `<label class="ctl"><input type="checkbox" data-g="${g.key}" disabled/>` +
        `<span class="sw" style="background:${g.color}"></span>` +
        `<b>${g.label}</b> <span class="sg">→ [${chosen.join(', ') || '없음 · 육안'}]</span>` +
        `<span class="nt">${g.note}</span></label>`,
    );

  // 코·콧볼(2D 근접) — 링 후보가 소수(≤10개)라 번호 라벨 유지.
  for (const g of proximityGroups) {
    const scored = [];
    for (let i = 0; i < screen.length; i += 1) {
      if (!free(i)) continue;
      const [sx, sy] = scr2(i);
      const d = Math.hypot(sx - g.x, sy - g.y);
      if (d <= g.r) scored.push({i, d, sx, sy});
    }
    scored.sort((a, b) => a.d - b.d);
    const chosen = scored.slice(0, g.count).map(s => s.i);
    const chosenSet = new Set(chosen);
    suggestions[g.key] = chosen;

    const marks = [
      `<circle cx="${g.x.toFixed(1)}" cy="${g.y.toFixed(1)}" r="${g.r.toFixed(1)}" fill="none" stroke="${g.color}" stroke-width="2" stroke-dasharray="7 6" opacity="0.5"/>`,
    ];
    for (const {i, sx, sy} of scored) {
      const isChosen = chosenSet.has(i);
      const dotSvg = isChosen
        ? `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="6" fill="${g.color}" stroke="#000" stroke-width="1.5"/>`
        : `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="none" stroke="${g.color}" stroke-width="1.6"/>`;
      marks.push(
        `<g class="v ${isChosen ? 'chosen' : 'ring'}" data-i="${i}"><title>${i}</title>${dotSvg}</g>` +
        `<text x="${(sx + 7).toFixed(1)}" y="${(sy - 5).toFixed(1)}" fill="#fff" font-family="monospace" font-size="${isChosen ? 13 : 11}" font-weight="${isChosen ? 700 : 500}" paint-order="stroke" stroke="#000" stroke-width="3">${i}</text>`,
      );
    }
    groupSvg.push(`<g class="grp" data-g="${g.key}">${marks.join('')}</g>`);
    pushControl(g, chosen);
  }

  // 콧볼(alare): 코 밴드에서 |가로| 최대 = 콧볼 최외측점. 밴드가 작아 번호 라벨 유지.
  for (const g of alarGroups) {
    const band = [];
    for (let i = 0; i < screen.length; i += 1) {
      if (!free(i)) continue;
      const [sx, sy] = scr2(i);
      if (sy < alaYTop || sy > alaYBot) continue;
      const screenLateral = Math.abs(sx - midX);
      const localLateral = lateralProjection(i) * g.sideSign;
      if (localLateral <= 0 || screenLateral < alaInner || screenLateral > alaOuter) continue;
      band.push({i, localLateral, screenLateral, sx, sy});
    }
    if (band.length === 0) {
      suggestions[g.key] = [];
      groupSvg.push(`<g class="grp" data-g="${g.key}"></g>`);
      pushControl(g, []);
      continue;
    }
    const winner = selectScoreWinner(
      band.map(({i}) => i),
      index => lateralProjection(index) * g.sideSign,
    );
    const alare = band.find(({i}) => i === winner.index);
    const byNear = band
      .map(b => ({...b, d: Math.hypot(b.sx - alare.sx, b.sy - alare.sy)}))
      .sort((a, b) => a.d - b.d || a.i - b.i);
    const chosen = byNear.slice(0, g.count).map(b => b.i);
    const chosenSet = new Set(chosen);
    suggestions[g.key] = chosen;
    const latMax = Math.max(SCORE_TIE_EPSILON, alare.localLateral);

    const marks = [];
    for (const b of band) {
      const t = Math.max(0, Math.min(1, b.localLateral / latMax)); // 바깥일수록 1
      const isChosen = chosenSet.has(b.i);
      const title = `<title>${b.i} · local lateral ${b.localLateral.toFixed(4)}</title>`;
      if (isChosen) {
        marks.push(
          `<g class="v chosen" data-i="${b.i}">${title}` +
          `<circle cx="${b.sx.toFixed(1)}" cy="${b.sy.toFixed(1)}" r="6" fill="${g.color}" stroke="#000" stroke-width="1.5"/></g>` +
          `<text x="${(b.sx + 7).toFixed(1)}" y="${(b.sy - 5).toFixed(1)}" fill="#fff" font-family="monospace" font-size="12" font-weight="700" paint-order="stroke" stroke="#000" stroke-width="3">${b.i}</text>`,
        );
      } else {
      marks.push(
          `<g class="v ring" data-i="${b.i}">${title}` +
          `<circle cx="${b.sx.toFixed(1)}" cy="${b.sy.toFixed(1)}" r="${(3 + t * 2).toFixed(1)}" fill="none" stroke="${g.color}" stroke-width="1.6" opacity="${(0.3 + t * 0.6).toFixed(2)}"/></g>`,
        );
      }
    }
    marks.push(
      `<circle cx="${alare.sx.toFixed(1)}" cy="${alare.sy.toFixed(1)}" r="12" fill="none" stroke="${g.color}" stroke-width="2.5" stroke-dasharray="4 3"/>`,
    );
    groupSvg.push(`<g class="grp" data-g="${g.key}">${marks.join('')}</g>`);
    pushControl(g, chosen);
  }

  // 광대(전방 투영 히트맵 — 라벨 없음, 호버로 번호 확인)
  for (const g of projectionGroups) {
    // 1) 세로 박스 안 + 해당 측면(정중선 바깥)의 free vertex 수집.
    const inBox = [];
    for (let i = 0; i < screen.length; i += 1) {
      if (!free(i)) continue;
      const [sx, sy] = scr2(i);
      if (sy < malarYTop || sy > malarYBot) continue;
      const localLateral = lateralProjection(i) * g.sideSign;
      if (localLateral <= 0) continue;
      inBox.push({i, screenLateral: Math.abs(sx - midX), sx, sy});
    }
    // 2) 이 박스 안 얼굴 실루엣(측면 최외곽)까지 거리의 비율로 안/바깥 경계 → 측면 볼만.
    const edge = inBox.reduce((m, b) => Math.max(m, b.screenLateral), 1);
    const band = inBox
      .filter(
        b => b.screenLateral >= edge * malarInnerFrac
          && b.screenLateral <= edge * malarOuterFrac,
      )
      .map(b => ({i: b.i, sx: b.sx, sy: b.sy, p: anteriorProjection(b.i)}));
    if (band.length === 0) {
      suggestions[g.key] = [];
      groupSvg.push(`<g class="grp" data-g="${g.key}"></g>`);
      pushControl(g, []);
      continue;
    }
    const ps = band.map(b => b.p);
    const pMin = Math.min(...ps);
    const pMax = Math.max(...ps);
    // 앞광대 정점 = 최대 투영. 제안 = 정점 + 2D 근접 이웃(같은 밴드).
    const winner = selectScoreWinner(
      band.map(({i}) => i),
      index => anteriorProjection(index),
    );
    const apex = band.find(({i}) => i === winner.index);
    const byNear = band
      .map(b => ({...b, d: Math.hypot(b.sx - apex.sx, b.sy - apex.sy)}))
      .sort((a, b) => a.d - b.d || a.i - b.i);
    const chosen = byNear.slice(0, g.count).map(b => b.i);
    const chosenSet = new Set(chosen);
    suggestions[g.key] = chosen;

    const marks = [];
    for (const b of band) {
      const t = pMax > pMin ? (b.p - pMin) / (pMax - pMin) : 1; // 0..1, 1=가장 앞
      const isChosen = chosenSet.has(b.i);
      const rad = isChosen ? 7 : 2.5 + t * 4.5;
      const op = isChosen ? 1 : 0.2 + t * 0.7;
      const title = `<title>${b.i} · 투영 ${b.p.toFixed(3)}</title>`;
      if (isChosen) {
        marks.push(
          `<g class="v chosen" data-i="${b.i}">${title}` +
          `<circle cx="${b.sx.toFixed(1)}" cy="${b.sy.toFixed(1)}" r="${rad}" fill="${g.color}" stroke="#000" stroke-width="1.6"/></g>`,
        );
      } else {
        marks.push(
          `<g class="v ring" data-i="${b.i}">${title}` +
          `<circle cx="${b.sx.toFixed(1)}" cy="${b.sy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${g.color}" opacity="${op.toFixed(2)}"/></g>`,
        );
      }
    }
    // 앞광대 정점 강조 링
    marks.push(
      `<circle cx="${apex.sx.toFixed(1)}" cy="${apex.sy.toFixed(1)}" r="14" fill="none" stroke="${g.color}" stroke-width="2.5" stroke-dasharray="4 3"/>`,
    );
    groupSvg.push(`<g class="grp" data-g="${g.key}">${marks.join('')}</g>`);
    pushControl(g, chosen);
  }

  // 모든 free vertex 레이어 — blind 시작 시 켜서 밴드/링 밖 어떤 점이든 독립 선택 가능.
  {
    const marks = [];
    for (let i = 0; i < screen.length; i += 1) {
      if (!free(i)) continue;
      const [sx, sy] = scr2(i);
      marks.push(
        `<g class="v" data-i="${i}"><title>${i}</title>` +
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.5" fill="#9fb0c7" opacity="0.55"/></g>`,
      );
    }
    groupSvg.push(`<g class="grp" data-g="__all" style="display:none">${marks.join('')}</g>`);
  }

  // g1 reserved vertex도 ROI/target 해부 증거로는 선택할 수 있다. runtime fixed patch만 막는다.
  const g1Owners = {};
  for (const [key, indices] of Object.entries(liveMap)) {
    if (!key.endsWith('Indices') || !Array.isArray(indices)) continue;
    for (const index of indices) {
      (g1Owners[index] ??= []).push(key);
    }
  }
  {
    const marks = [...usedByG1].sort((a, b) => a - b).map(index => {
      const [sx, sy] = scr2(index);
      const owners = g1Owners[index].join(', ');
      return `<g class="locked" data-i="${index}"><title>g1 reserved · ${index} · ${owners}</title>` +
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="#f59e0b" opacity="0.8"/></g>`;
    });
    groupSvg.push(`<g class="grp" data-g="__g1" style="display:none">${marks.join('')}</g>`);
  }

  const meshAdjacency = buildMeshAdjacency(local.length, payload.indices);
  const uvMirror = buildUvMirrorMap(payload.uvs);
  const mirrorPolicy = {...uvMirror, frame: faceFrame};
  const captureTopologyFingerprint = validatedCapture.topology;

  let importedPatch = null;
  let initialGroups = emptyTier2Groups();
  let sameCaptureImport = false;
  if (cli.patchPath) {
    if (!fs.existsSync(cli.patchPath)) {
      throw new Error(`patch JSON이 없습니다: ${cli.patchPath}`);
    }
    importedPatch = readJson(cli.patchPath);
    initialGroups = extractTier2Groups(importedPatch);
    for (const group of TIER2_GROUPS) {
      initialGroups[group.key] = assertIndexList(
        initialGroups[group.key],
        local.length,
        `groups.${group.key}`,
      );
      const importedAnnotation = importedPatch.annotations?.[group.key];
      if (importedAnnotation == null) continue;
      if (typeof importedAnnotation !== 'object' || Array.isArray(importedAnnotation)) {
        throw new Error(`annotations.${group.key}는 object여야 합니다.`);
      }
      if (importedAnnotation.allowedRegionIndices != null) {
        assertIndexList(
          importedAnnotation.allowedRegionIndices,
          local.length,
          `annotations.${group.key}.allowedRegionIndices`,
        );
      }
      if (
        importedAnnotation.targetIndex != null
        && (
          !Number.isInteger(importedAnnotation.targetIndex)
          || importedAnnotation.targetIndex < 0
          || importedAnnotation.targetIndex >= local.length
        )
      ) {
        throw new Error(`annotations.${group.key}.targetIndex가 범위를 벗어났습니다.`);
      }
      if (importedAnnotation.fixedPatchIndices != null) {
        const annotationFixed = assertIndexList(
          importedAnnotation.fixedPatchIndices,
          local.length,
          `annotations.${group.key}.fixedPatchIndices`,
        );
        if (JSON.stringify(annotationFixed) !== JSON.stringify(initialGroups[group.key])) {
          throw new Error(`annotations.${group.key}.fixedPatchIndices와 groups.${group.key}가 다릅니다.`);
        }
      }
    }
    const importedFingerprint = typeof importedPatch.topologyFingerprint === 'string'
      ? importedPatch.topologyFingerprint
      : importedPatch.topologyFingerprint?.fingerprint;
    if (!importedFingerprint) {
      throw new Error('import patch에 topologyFingerprint가 없습니다. legacy JSON은 topology를 재확인해 다시 내보내야 합니다.');
    }
    if (
      importedFingerprint
      && importedFingerprint !== captureTopologyFingerprint.fingerprint
    ) {
      throw new Error('import patch와 capture topology fingerprint가 다릅니다.');
    }
    sameCaptureImport = importedPatch.capturePairId === payload.capturePairId;
  }

  const initialAnnotations = Object.fromEntries(TIER2_GROUPS.map(group => {
    const importedAnnotation = sameCaptureImport
      ? importedPatch?.annotations?.[group.key] ?? {}
      : {};
    const fixedPatchIndices = [...initialGroups[group.key]];
    const reprojectionEvidence = cli.reprojectionMode
      ? fixedPatchIndices.map(index => ({
        index,
        kind: 'fixedPatchIndices',
        source: 'fixed-patch-reprojection',
      }))
      : [];
    return [group.key, {
      allowedRegionIndices: Array.isArray(importedAnnotation.allowedRegionIndices)
        ? [...importedAnnotation.allowedRegionIndices]
        : cli.reprojectionMode
          ? fixedPatchIndices
          : [],
      disposition: importedAnnotation.disposition === 'unsupported_null'
        ? 'unsupported_null'
        : 'candidate_review',
      coverageNote: typeof importedAnnotation.coverageNote === 'string'
        ? importedAnnotation.coverageNote
        : cli.reprojectionMode
          ? '고정 patch가 이 캡처에서도 같은 해부 영역을 덮는지 판정'
          : '',
      coverageVerdict: importedAnnotation.coverageVerdict === 'pass'
        || importedAnnotation.coverageVerdict === 'fail'
        ? importedAnnotation.coverageVerdict
        : 'pending',
      fixedPatchIndices,
      selectionEvidence: Array.isArray(importedAnnotation.selectionEvidence)
        ? [...importedAnnotation.selectionEvidence]
        : reprojectionEvidence,
      targetIndex: Number.isInteger(importedAnnotation.targetIndex)
        ? importedAnnotation.targetIndex
        : cli.reprojectionMode
          ? fixedPatchIndices[0] ?? null
          : null,
      unsupportedReason: typeof importedAnnotation.unsupportedReason === 'string'
        ? importedAnnotation.unsupportedReason
        : '',
    }];
  }));
  const initialValidation = validateTier2Patch({
    annotations: initialAnnotations,
    candidateTopologyFingerprint: importedPatch?.topologyFingerprint ?? null,
    captureTopologyFingerprint,
    g1Indices: [...usedByG1],
    groups: initialGroups,
    localVertices: local,
    meshAdjacency,
    mirrorPolicy,
  });
  const autoSuggestionAnnotations = Object.fromEntries(TIER2_GROUPS.map(group => {
    const fixedPatchIndices = [...(suggestions[group.key] ?? [])];
    return [group.key, {
      allowedRegionIndices: fixedPatchIndices,
      coverageNote: 'synthetic structural diagnostic only; not human anatomy approval',
      coverageVerdict: 'pass',
      disposition: 'candidate_review',
      fixedPatchIndices,
      targetIndex: fixedPatchIndices[0] ?? null,
      unsupportedReason: '',
    }];
  }));
  const autoSuggestionValidation = validateTier2Patch({
    annotations: autoSuggestionAnnotations,
    candidateTopologyFingerprint: captureTopologyFingerprint,
    captureTopologyFingerprint,
    g1Indices: [...usedByG1],
    groups: suggestions,
    localVertices: local,
    meshAdjacency,
    mirrorPolicy,
  });
  const initialAuthoringPayload = buildAuthoringPayload({
    annotations: initialAnnotations,
    capturePairId: payload.capturePairId,
    groups: initialGroups,
    registrationStatus: sameCaptureImport ? importedPatch?.registrationStatus ?? 'pending' : 'pending',
    reviewerId: sameCaptureImport ? importedPatch?.reviewerId ?? '' : '',
    topologyFingerprint: captureTopologyFingerprint,
    validation: initialValidation,
  });
  const fixedReprojectionSvg = cli.reprojectionMode
    ? TIER2_GROUPS.map(group => {
      const marks = initialGroups[group.key].map(index => {
        const [screenX, screenY] = scr2(index);
        return `<circle class="annotation-point v fixed-reprojection-point" data-i="${index}" cx="${screenX.toFixed(1)}" cy="${screenY.toFixed(1)}" r="9" fill="${group.color}" fill-opacity="0.62" stroke="#4ade80" stroke-width="3.5"><title>${group.key} fixed reprojection ${index}</title></circle>`;
      });
      return `<g class="grp fixed-reprojection-layer" data-g="${group.key}" style="display:none">${marks.join('')}</g>`;
    }).join('')
    : '';

  const groupMeta = TIER2_GROUPS.map(group => ({
    ...group,
    suggestedIndices: suggestions[group.key] ?? [],
  }));
  const framePath = resolveCaptureFile(captureDir, payload.framePath ?? 'frame.png', 'framePath');
  const frameExtension = path.extname(framePath).toLowerCase();
  const frameMime = frameExtension === '.jpg' || frameExtension === '.jpeg'
    ? 'image/jpeg'
    : 'image/png';
  const frameDataUri = `data:${frameMime};base64,${fs.readFileSync(framePath).toString('base64')}`;
  const reviewData = {
    authoringSchemaVersion: TIER2_AUTHORING_SCHEMA_VERSION,
    captureFraming: validatedCapture.captureFraming,
    capturePairId: payload.capturePairId,
    captureShotKind: payload.captureShotKind,
    coordinateSpaceValidated: payload.coordinateSpaceValidated === true,
    faceVertices: faceCoordinates,
    frameFocusPoint: [midX, tip[1]],
    frameSize: [width, height],
    freeIndices: Array.from({length: local.length}, (_, index) => index).filter(free),
    g1Indices: [...usedByG1].sort((a, b) => a - b),
    g1Owners,
    groups: groupMeta,
    initialAuthoringPayload,
    initialSuggestionsRevealedAtUtc: cli.reprojectionMode
      ? (
        isCanonicalIsoUtcTimestamp(importedPatch?.reviewedAtUtc)
          ? importedPatch.reviewedAtUtc
          : '1970-01-01T00:00:00.000Z'
      )
      : sameCaptureImport
      && importedPatch?.blindReviewCompleted === true
      && isCanonicalIsoUtcTimestamp(importedPatch?.suggestionsRevealedAtUtc)
      && blindEvidenceIsComplete(initialAnnotations, faceCoordinates)
      ? importedPatch.suggestionsRevealedAtUtc
      : null,
    mirrorIndices: uvMirror.mirrorIndices,
    mirrorResiduals: uvMirror.residuals,
    reprojectionMode: cli.reprojectionMode,
    screenVertices: screen.map(vertex => [vertex[0], vertex[1]]),
    suggestions,
    topologyFingerprint: captureTopologyFingerprint,
    triangles: payload.indices,
    uvResidualCap: UV_MIRROR_RESIDUAL_CAP,
  };
  const serializedReviewData = JSON.stringify(reviewData).replaceAll('<', '\\u003c');
  const captureNameHtml = escapeHtml(path.basename(captureDir));
  const workflowHintHtml = cli.reprojectionMode
    ? '<b>고정 patch 재투영 검수 모드입니다.</b> 정점을 다시 고르지 말고, 2D/3D에서 같은 해부 부위를 계속 덮는지만 확인한 뒤 registration과 coverage pass/fail을 기록하세요.'
    : '<b>자동 후보는 보조 레이어일 뿐 승인점이 아닙니다.</b> 먼저 2D에서 frame registration과 허용 해부 영역을 확인하고, 3D에서는 같은 local mesh를 회전해 topology 위치를 확인하세요. 3D 보기는 새 texture나 임상 정답을 만들지 않으므로 불명확하면 pitch-up/subnasal capture가 필요합니다.';

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="icon" href="data:,"/>
<title>Tier-2 시드 리뷰 · ${captureNameHtml}</title>
<style>
  :root{ color-scheme:dark; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:#0b0f16; color:#e9edf4; font-family:"Pretendard","Apple SD Gothic Neo",-apple-system,sans-serif; }
  header{ position:relative; z-index:10; background:#0d1421; border-bottom:1px solid #222d3d; padding:12px 16px; }
  h1{ font-size:17px; margin:0 0 5px; }
  .hint{ font-size:12.5px; line-height:1.5; color:#9fb0c7; margin:0 0 10px; }
  .warning{ color:#fbbf24; }
  .laterality{ display:inline-block; margin-top:4px; padding:4px 7px; border:1px solid #31506d; border-radius:6px; color:#bae6fd; }
  .ctls{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:6px 16px; }
  .ctl{ display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:6px; font-size:13px; cursor:pointer; }
  .ctl .sw{ width:12px; height:12px; border-radius:50%; }
  .ctl b{ white-space:nowrap; }
  .ctl .sg{ font-family:"SF Mono",Menlo,monospace; font-size:11px; color:#a5d8ff; white-space:nowrap; }
  body.blind-suggestions .ctl .sg{ display:none; }
  body.blind-suggestions .grp:not([data-g^="__"]){ display:none; }
  .ctl .nt{ grid-column:1/-1; font-size:11px; color:#7f8ea3; margin:0 0 3px 24px; }
  .bar,.row{ display:flex; gap:9px; align-items:center; flex-wrap:wrap; margin-top:8px; font-size:12.5px; }
  button,input,select{ font:inherit; }
  button,select,input[type=text],input[type=file]{ background:#1a2434; color:#dbe6f5; border:1px solid #2c3a4e; border-radius:7px; padding:5px 9px; }
  button{ cursor:pointer; }
  button:hover{ border-color:#4f6b91; }
  input[type=text]{ min-width:150px; }
  .bar input[type=range]{ width:140px; }
  .selbox{ margin-top:9px; padding:9px 10px; background:#111a29; border:1px solid #263349; border-radius:9px; font-size:12px; }
  .lists{ margin-top:7px; display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:5px 14px; font-family:"SF Mono",Menlo,monospace; font-size:11px; }
  .lists .card{ padding:5px 7px; border:1px solid #243148; border-radius:6px; overflow-wrap:anywhere; }
  .review-grid{ display:grid; grid-template-columns:minmax(420px,1.15fr) minmax(420px,0.85fr); gap:10px; padding:10px; align-items:start; }
  .pane{ min-width:0; border:1px solid #233047; border-radius:10px; overflow:hidden; background:#05080d; }
  .pane-title{ padding:7px 10px; background:#111827; font-size:12px; color:#cbd5e1; border-bottom:1px solid #233047; }
  .stage{ overflow:auto; height:70vh; min-height:520px; background:#000; }
  .canvas2d{ position:relative; transform-origin:top left; }
  .canvas2d img{ display:block; }
  .canvas2d svg{ position:absolute; inset:0; }
  .canvas2d svg text{ pointer-events:none; }
  .v{ cursor:crosshair; }
  .locked{ cursor:crosshair; }
  .annotation-point{ cursor:crosshair; pointer-events:all; }
  body.hide-ring .ring{ display:none; }
  .mesh-toolbar{ padding:7px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; background:#0f172a; }
  .mesh-wrap{ position:relative; min-height:520px; height:70vh; }
  #mesh3d{ display:block; width:100%; height:100%; touch-action:none; cursor:grab; }
  #mesh3d.dragging{ cursor:grabbing; }
  #meshTooltip{ position:absolute; left:8px; bottom:8px; padding:4px 7px; background:#020617cc; border:1px solid #334155; border-radius:5px; font:11px "SF Mono",monospace; pointer-events:none; }
  .validation{ margin-top:8px; padding:8px; border-radius:7px; border:1px solid #334155; background:#0b1220; max-height:140px; overflow:auto; }
  .validation.candidate_structural_pass{ border-color:#166534; background:#052e16; }
  .validation.complete_with_unsupported{ border-color:#a16207; background:#422006; }
  .validation.fail{ border-color:#991b1b; background:#3f0d12; }
  .validation ul{ margin:5px 0 0 18px; padding:0; }
  .validation code{ color:#e2e8f0; }
  #actionMsg{ color:#4ade80; }
  @media(max-width:980px){ .review-grid{ grid-template-columns:1fr; } .stage,.mesh-wrap{ height:62vh; } }
</style></head><body class="blind-suggestions">
<header>
  <h1>Tier-2 고정 시드 authoring review · ${captureNameHtml}</h1>
  <p class="hint">${workflowHintHtml}<br/>
  ${validatedCapture.captureFraming.fullMeshInFrame ? '' : `<span class="warning">이 캡처는 전체 mesh 중 ${validatedCapture.captureFraming.outOfFrameVertexCount}개가 frame 밖입니다. 중앙 target overlay는 검수할 수 있지만 전체-mesh framing 통과로 간주하지 마세요.</span><br/>`}
  <span class="laterality">거울 전면카메라 기준 · 해부학적 Left = 화면 왼쪽 = -local lateral · 해부학적 Right = 화면 오른쪽 = +local lateral</span></p>
  <div class="ctls">${controls.join('')}</div>
  <div class="bar">
    <button id="revealSuggestions">1차 해부 표시 완료 · 자동 후보 공개</button>
    <button id="all">후보 전체 켜기</button><button id="none">후보 전체 끄기</button>
    <label><input type="checkbox" id="ringToggle" checked/> 자동 후보 표시</label>
    <label><input type="checkbox" id="allVerts" checked/> 모든 free vertex</label>
    <label><input type="checkbox" id="g1Toggle" checked/> g1 reserved 표시</label>
    <label>2D 확대 <input type="range" id="zoom" min="1" max="6" step="0.25" value="1.4"/></label>
    <span id="zval">1.40×</span>
    <button id="center2d">2D 얼굴 중앙</button>
  </div>
  <div class="selbox">
    <div class="row">
      <label>Reviewer <input id="reviewerId" type="text" placeholder="reviewer-id"/></label>
      <label>Registration
        <select id="registration"><option value="pending">pending</option><option value="pass">pass</option><option value="fail">fail</option></select>
      </label>
      <label>대상 그룹 <select id="target"></select></label>
      <button id="soloTarget">대상 그룹 solo</button>
      <label>그룹 결론
        <select id="disposition"><option value="candidate_review">시드 검수 계속</option><option value="unsupported_null">unsupported / null</option></select>
      </label>
      <label>unsupported 사유 <input id="unsupportedReason" type="text" placeholder="왜 고정 시드를 확정할 수 없는지"/></label>
      <label>이 캡처 해부 범위
        <select id="coverageVerdict"><option value="pending">pending</option><option value="pass">pass · patch가 해부 영역을 덮음</option><option value="fail">fail · gross miss/관찰 불가</option></select>
      </label>
      <label>범위 판정 메모 <input id="coverageNote" type="text" placeholder="pass/fail의 육안 근거"/></label>
      <label>표시 종류
        <select id="annotationKind"><option value="allowedRegionIndices">허용 해부 영역</option><option value="targetIndex">대표 target 1점</option><option value="fixedPatchIndices">고정 patch</option></select>
      </label>
      <button id="applyBridgeFreePatch">콧대 G1 근거 → free runtime patch 적용</button>
      <button id="undo">실행 취소</button><button id="clear">현재 표시 비우기</button>
    </div>
    <div class="row">
      <label>고정 patch/검수 JSON 가져오기 <input type="file" id="patchFile" accept="application/json,.json"/></label>
      <button id="copy">임시 검수 JSON 복사</button><button id="download">임시 검수 JSON 저장</button>
      <span id="actionMsg"></span>
    </div>
    <div class="lists" id="annotationLists"></div>
    <div id="validation" class="validation fail"></div>
  </div>
</header>
<main class="review-grid">
  <section class="pane"><div class="pane-title">2D frame overlay · registration/해부 영역 확인</div>
    <div class="stage"><div class="canvas2d" id="canvas2d">
      <img src="${frameDataUri}" width="${width}" height="${height}"/>
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${groupSvg.join('')}${fixedReprojectionSvg}<g id="annotationOverlay" data-g="__annotations"></g></svg>
    </div></div>
  </section>
  <section class="pane"><div class="pane-title">3D local mesh · drag 회전 / wheel 확대 / click 선택</div>
    <div class="mesh-toolbar">
      <button data-view="front">정면</button><button data-view="left45">피사체 Left 쪽에서 45°</button>
      <button data-view="right45">피사체 Right 쪽에서 45°</button><button data-view="subnasal">아래서 보기 35° · subnasal</button>
      <span id="meshAngles"></span>
    </div>
    <div class="mesh-wrap"><canvas id="mesh3d"></canvas><div id="meshTooltip">vertex —</div></div>
  </section>
</main>
<script>
  'use strict';
  var DATA=${serializedReviewData};
  var GROUPS=DATA.groups;
  var GROUP_BY_KEY=Object.fromEntries(GROUPS.map(function(group){ return [group.key,group]; }));
  var canvas2d=document.getElementById('canvas2d');
  var stage2d=canvas2d.closest('.stage');
  var target=document.getElementById('target');
  var annotationKind=document.getElementById('annotationKind');
  var disposition=document.getElementById('disposition');
  var unsupportedReason=document.getElementById('unsupportedReason');
  var coverageVerdict=document.getElementById('coverageVerdict');
  var coverageNote=document.getElementById('coverageNote');
  var reviewerId=document.getElementById('reviewerId');
  var registration=document.getElementById('registration');
  var undoHistory=[];
  var lastValidation=null;
  var annotations=JSON.parse(JSON.stringify(DATA.initialAuthoringPayload.annotations));
  var evidence=[];
  var g1Set=new Set(DATA.g1Indices);
  var suggestionsRevealedAtUtc=DATA.initialSuggestionsRevealedAtUtc||null;

  GROUPS.forEach(function(group){ var option=document.createElement('option'); option.value=group.key; option.textContent=group.label; target.appendChild(option); });
  var initialActiveGroup=GROUPS.find(function(group){var state=annotations[group.key];return state.targetIndex!=null||state.allowedRegionIndices.length||state.fixedPatchIndices.length;});
  if(initialActiveGroup)target.value=initialActiveGroup.key;
  reviewerId.value=DATA.initialAuthoringPayload.reviewerId||'';
  registration.value=DATA.initialAuthoringPayload.registrationStatus||'pending';

  function syncDispositionControls(){var state=annotations[target.value],blind=!suggestionsRevealedAtUtc,isUnsupported=(state.disposition||'candidate_review')==='unsupported_null';disposition.value=state.disposition||'candidate_review';unsupportedReason.value=state.unsupportedReason||'';unsupportedReason.disabled=!isUnsupported;coverageVerdict.value=state.coverageVerdict||'pending';coverageNote.value=state.coverageNote||'';coverageVerdict.disabled=blind&&!isUnsupported;coverageNote.disabled=blind&&!isUnsupported;}
  target.onchange=function(){syncDispositionControls();renderAll();};
  disposition.onchange=function(){pushHistory();var state=annotations[target.value];state.disposition=disposition.value;if(disposition.value==='unsupported_null')state.fixedPatchIndices=[];syncDispositionControls();renderAll();};
  unsupportedReason.onchange=function(){pushHistory();annotations[target.value].unsupportedReason=unsupportedReason.value.trim();renderAll();};
  coverageVerdict.onchange=function(){pushHistory();annotations[target.value].coverageVerdict=coverageVerdict.value;renderAll();};
  coverageNote.onchange=function(){pushHistory();annotations[target.value].coverageNote=coverageNote.value.trim();renderAll();};
  syncDispositionControls();

  function sortedUnique(values){ return Array.from(new Set((values||[]).filter(Number.isInteger))).sort(function(a,b){return a-b;}); }
  function escapeHtmlText(value){return String(value).replace(/[&<>"']/g,function(character){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];});}
  function cloneState(){ return JSON.stringify({annotations:annotations,evidence:evidence,reviewerId:reviewerId.value,registration:registration.value,suggestionsRevealedAtUtc:suggestionsRevealedAtUtc}); }
  function restoreState(serialized){ var value=JSON.parse(serialized); annotations=value.annotations; evidence=value.evidence||[]; reviewerId.value=value.reviewerId||''; registration.value=value.registration||'pending'; suggestionsRevealedAtUtc=value.suggestionsRevealedAtUtc||null;syncBlindMode();syncDispositionControls(); }
  function pushHistory(){ undoHistory.push(cloneState()); if(undoHistory.length>100) undoHistory.shift(); }
  function showAction(message,isError){ var el=document.getElementById('actionMsg'); el.style.color=isError?'#fca5a5':'#4ade80'; el.textContent=message; clearTimeout(showAction.timer); showAction.timer=setTimeout(function(){el.textContent='';},2500); }
  function sideAllowed(group,index){ if(group.sideSign==null) return true; return DATA.faceVertices[index][0]*group.sideSign>1e-6; }
  function fixedOwner(index){ for(var i=0;i<GROUPS.length;i+=1){ var group=GROUPS[i]; if(annotations[group.key].fixedPatchIndices.includes(index)) return group.key; } return null; }

  function selectVertex(index,source){
    if(!Number.isInteger(index)||index<0||index>=DATA.faceVertices.length) return;
    if(DATA.reprojectionMode){showAction('재투영 검수에서는 정점을 변경하지 않습니다. coverage pass/fail만 기록하세요.',true);return;}
    var group=GROUP_BY_KEY[target.value];
    var state=annotations[group.key];
    if(!sideAllowed(group,index)){ showAction(group.key+'의 해부학적 반대쪽 vertex입니다: '+index,true); return; }
    var kind=annotationKind.value;
    if(kind==='fixedPatchIndices'){
      if(!suggestionsRevealedAtUtc){showAction('독립 ROI/target 표시를 먼저 완료한 뒤 고정 patch를 검수하세요.',true);return;}
      if(state.disposition==='unsupported_null'){showAction(group.key+'는 unsupported/null이므로 runtime 고정 patch를 만들 수 없습니다.',true);return;}
      if(g1Set.has(index)&&group.allowG1Overlap!==true){showAction('g1 reserved vertex '+index+' · ROI/target 증거에는 쓸 수 있지만 이 그룹의 고정 patch에는 쓸 수 없습니다.',true);return;}
      if(!state.allowedRegionIndices.includes(index)){showAction(index+'를 먼저 허용 해부 영역(ROI)에 표시하세요.',true);return;}
      var owner=fixedOwner(index);
      if(owner&&owner!==group.key){ showAction(index+'는 이미 '+owner+'에 속합니다.',true); return; }
    }
    pushHistory();
    if(kind==='targetIndex'){
      state.targetIndex=state.targetIndex===index?null:index;
    }else{
      var values=state[kind]; var at=values.indexOf(index);
      if(at>=0) values.splice(at,1); else values.push(index);
      state[kind]=sortedUnique(values);
    }
    state.selectionEvidence.push({index:index,kind:kind,source:source,yaw:+meshState.yaw.toFixed(4),elevation:+meshState.elevation.toFixed(4)});
    renderAll();
  }

  function applyLayers(){
    canvas2d.querySelectorAll('.grp').forEach(function(layer){
      if(layer.dataset.g==='__all'){ layer.style.display=document.getElementById('allVerts').checked?'':'none'; return; }
      if(layer.dataset.g==='__g1'){ layer.style.display=document.getElementById('g1Toggle').checked?'':'none'; return; }
      if(layer.dataset.g==='__annotations'){layer.style.display='';return;}
      if(!suggestionsRevealedAtUtc){layer.style.display='none';return;}
      var checkbox=document.querySelector('input[data-g="'+layer.dataset.g+'"]');
      layer.style.display=document.getElementById('ringToggle').checked&&checkbox&&checkbox.checked?'':'none';
    });
  }
  function blindEvidenceComplete(){return GROUPS.filter(function(group){return group.required;}).every(function(group){var state=annotations[group.key],allowed=state.allowedRegionIndices||[],evidenceOnSide=allowed.every(function(index){return sideAllowed(group,index);}),targetValid=state.targetIndex==null||allowed.includes(state.targetIndex);if(state.disposition==='unsupported_null')return state.coverageVerdict==='fail'&&Boolean((state.coverageNote||'').trim())&&Boolean((state.unsupportedReason||'').trim())&&evidenceOnSide&&targetValid;return allowed.length>0&&state.targetIndex!=null&&targetValid&&evidenceOnSide;});}
  function syncBlindMode(){var blind=!suggestionsRevealedAtUtc;document.body.classList.toggle('blind-suggestions',blind);document.querySelectorAll('input[data-g]').forEach(function(checkbox){checkbox.disabled=blind;});document.getElementById('ringToggle').disabled=blind;document.getElementById('copy').disabled=blind;document.getElementById('download').disabled=blind;document.getElementById('revealSuggestions').disabled=DATA.reprojectionMode||!blind;document.getElementById('revealSuggestions').textContent=DATA.reprojectionMode?'재투영 고정 patch 표시 중':(blind?'1차 해부 표시 완료 · 자동 후보 공개':'자동 후보 공개됨 · 되돌릴 수 없음');syncDispositionControls();if(DATA.reprojectionMode){annotationKind.disabled=true;disposition.disabled=true;document.getElementById('applyBridgeFreePatch').disabled=true;document.getElementById('clear').disabled=true;}applyLayers();}
  document.getElementById('revealSuggestions').onclick=function(){if(!blindEvidenceComplete()){showAction('필수 그룹마다 먼저 ROI+target을 표시하거나 unsupported fail 근거를 기록하세요.',true);return;}GROUPS.forEach(function(group){var state=annotations[group.key];if(state.disposition!=='unsupported_null'){state.coverageVerdict='pending';state.coverageNote='';}});suggestionsRevealedAtUtc=new Date().toISOString();undoHistory=[];document.querySelectorAll('input[data-g]').forEach(function(checkbox){checkbox.checked=true;});syncBlindMode();renderAll();showAction('독립 해부 표시가 기록되어 자동 후보를 공개했습니다. 이제 candidate coverage를 판정하세요.',false);};
  document.querySelectorAll('input[data-g]').forEach(function(checkbox){
    checkbox.addEventListener('change',function(){applyLayers();requestMeshDraw();});
    checkbox.closest('.ctl').querySelector('b').addEventListener('click',function(event){ event.preventDefault(); document.querySelectorAll('input[data-g]').forEach(function(other){other.checked=other===checkbox;}); applyLayers();requestMeshDraw(); });
  });
  document.getElementById('all').onclick=function(){if(!suggestionsRevealedAtUtc){showAction('먼저 독립 ROI/target 표시를 완료하세요.',true);return;}document.querySelectorAll('input[data-g]').forEach(function(value){value.checked=true;});applyLayers();requestMeshDraw();};
  document.getElementById('none').onclick=function(){document.querySelectorAll('input[data-g]').forEach(function(value){value.checked=false;});applyLayers();requestMeshDraw();};
  document.getElementById('soloTarget').onclick=function(){document.querySelectorAll('input[data-g]').forEach(function(value){value.checked=value.dataset.g===target.value;});applyLayers();requestMeshDraw();};
  document.getElementById('applyBridgeFreePatch').onclick=function(){
    var group=GROUP_BY_KEY[target.value],state=annotations[target.value];
    if(group.key!=='noseBridgeMidlineIndices'){showAction('대상 그룹을 noseBridgeMidline 콧대중앙선으로 바꾸세요.',true);return;}
    if(state.disposition==='unsupported_null'){showAction('콧대중앙선은 현재 unsupported/null입니다. 다시 검수하려면 그룹 결론을 시드 검수 계속으로 바꾸세요.',true);return;}
    var reservedEvidence=sortedUnique(state.allowedRegionIndices.concat(state.targetIndex==null?[]:[state.targetIndex])).filter(function(index){return g1Set.has(index);});
    if(!reservedEvidence.length){showAction('먼저 콧대 중앙의 G1 정점을 허용 해부 영역/target으로 표시하세요.',true);return;}
    var freeSuggestion=sortedUnique(group.suggestedIndices).filter(function(index){return !g1Set.has(index);});
    if(freeSuggestion.length<group.minimumCount){showAction('사용 가능한 free 콧대 후보가 최소 '+group.minimumCount+'개보다 적습니다.',true);return;}
    pushHistory();
    state.allowedRegionIndices=sortedUnique(state.allowedRegionIndices.concat(freeSuggestion));
    state.fixedPatchIndices=freeSuggestion;
    if(state.targetIndex==null)state.targetIndex=reservedEvidence[Math.floor(reservedEvidence.length/2)];
    freeSuggestion.forEach(function(index){state.selectionEvidence.push({index:index,kind:'fixedPatchIndices',source:'g1-evidence-to-free-suggestion',yaw:+meshState.yaw.toFixed(4),elevation:+meshState.elevation.toFixed(4)});});
    document.querySelectorAll('input[data-g]').forEach(function(checkbox){checkbox.checked=checkbox.dataset.g===group.key;});
    syncBlindMode();renderAll();showAction('G1은 해부 근거로 보존하고 free runtime patch ['+freeSuggestion.join(', ')+']를 적용했습니다.',false);
  };
  document.getElementById('ringToggle').onchange=function(){applyLayers();requestMeshDraw();};
  document.getElementById('allVerts').onchange=function(){applyLayers();requestMeshDraw();};
  document.getElementById('g1Toggle').onchange=function(){applyLayers();requestMeshDraw();};
  var zoom=document.getElementById('zoom'),zval=document.getElementById('zval');
  function center2d(){var scale=+zoom.value;stage2d.scrollLeft=Math.max(0,DATA.frameFocusPoint[0]*scale-stage2d.clientWidth/2);stage2d.scrollTop=Math.max(0,DATA.frameFocusPoint[1]*scale-stage2d.clientHeight/2);}
  function applyZoom(){canvas2d.style.transform='scale('+zoom.value+')';zval.textContent=(+zoom.value).toFixed(2)+'×';requestAnimationFrame(center2d);}
  zoom.oninput=applyZoom;
  document.getElementById('center2d').onclick=center2d;

  var adjacency=Array.from({length:DATA.faceVertices.length},function(){return new Set();});
  for(var triangleOffset=0;triangleOffset<DATA.triangles.length;triangleOffset+=3){
    var triangle=[DATA.triangles[triangleOffset],DATA.triangles[triangleOffset+1],DATA.triangles[triangleOffset+2]];
    [[0,1],[1,2],[2,0]].forEach(function(edge){var a=triangle[edge[0]],b=triangle[edge[1]];adjacency[a].add(b);adjacency[b].add(a);});
  }
  function components(values){ var remaining=new Set(values),count=0; while(remaining.size){count+=1;var seed=remaining.values().next().value;remaining.delete(seed);var stack=[seed];while(stack.length){var current=stack.pop();adjacency[current].forEach(function(neighbor){if(remaining.delete(neighbor))stack.push(neighbor);});}}return count; }
  function boundary(values){var selected=new Set(values);return values.filter(function(index){return Array.from(adjacency[index]).some(function(neighbor){return !selected.has(neighbor);});});}
  function winner(values,score){if(!values.length)return null;var maximum=Math.max.apply(null,values.map(score));return values.filter(function(index){return score(index)>=maximum-1e-6;}).sort(function(a,b){return a-b;})[0];}
  function intersection(left,right){var rightSet=new Set(right);return left.filter(function(value){return rightSet.has(value);});}
  function jaccard(left,right){var leftSet=new Set(left),rightSet=new Set(right),union=new Set(left.concat(right));if(!union.size)return 1;return Array.from(leftSet).filter(function(value){return rightSet.has(value);}).length/union.size;}
  function validateState(){
    var errors=[],warnings=[],diagnostics={},groups={},hasUnsupported=false;
    if(!reviewerId.value.trim())errors.push('reviewer ID가 없습니다.');
    if(registration.value!=='pass')errors.push('projected mesh ↔ frame registration이 pass가 아닙니다.');
    if(!DATA.captureFraming.fullMeshInFrame)errors.push('capture 전체 mesh framing이 불완전합니다: frame 밖 '+DATA.captureFraming.outOfFrameVertexCount+'개');
    GROUPS.forEach(function(group){
      var state=annotations[group.key]; var values=sortedUnique(state.fixedPatchIndices); groups[group.key]=values;
      var evidenceWrongSide=(state.allowedRegionIndices||[]).filter(function(index){return !sideAllowed(group,index);});
      if(evidenceWrongSide.length)errors.push(group.key+': ROI/target evidence의 반대쪽/정중선 ['+evidenceWrongSide.join(', ')+']');
      if(state.disposition==='unsupported_null'){
        hasUnsupported=true;
        if(values.length)errors.push(group.key+': unsupported/null 그룹은 고정 patch가 비어야 합니다.');
        if(!(state.unsupportedReason||'').trim())errors.push(group.key+': unsupported/null 사유가 필요합니다.');
        if(state.coverageVerdict!=='fail')errors.push(group.key+': unsupported/null은 이 캡처 coverage fail 판정이 필요합니다.');
        if(!(state.coverageNote||'').trim())errors.push(group.key+': coverage 판정 메모가 필요합니다.');
        if(state.targetIndex!=null&&!state.allowedRegionIndices.includes(state.targetIndex))errors.push(group.key+': target이 허용 영역 밖입니다.');
        diagnostics[group.key]={boundaryIndices:[],componentCount:0,count:values.length,coverageVerdict:state.coverageVerdict||'pending',disposition:'unsupported_null',winnerBoundaryHit:false,winnerIndex:null};
        return;
      }
      if(group.required&&!state.allowedRegionIndices.length)errors.push(group.key+': 허용 해부 영역 표시가 없습니다.');
      if(group.required&&state.targetIndex==null)errors.push(group.key+': 대표 target이 없습니다.');
      if((group.required||values.length)&&state.coverageVerdict!=='pass')errors.push(group.key+': 고정 candidate patch는 이 캡처 coverage pass 판정이 필요합니다.');
      if((group.required||values.length)&&!(state.coverageNote||'').trim())errors.push(group.key+': coverage 판정 메모가 필요합니다.');
      if(state.targetIndex!=null&&!state.allowedRegionIndices.includes(state.targetIndex))errors.push(group.key+': target이 허용 영역 밖입니다.');
      var outsideRoi=values.filter(function(index){return !state.allowedRegionIndices.includes(index);});if(outsideRoi.length)errors.push(group.key+': 고정 patch가 허용 영역 밖 vertex를 포함합니다 ['+outsideRoi.join(', ')+']');
      if(group.required&&!values.length)errors.push(group.key+': 필수 고정 patch가 비었습니다.');
      if(values.length){
        if(group.countRule==='exact'&&values.length!==group.minimumCount)errors.push(group.key+': 정확히 '+group.minimumCount+'개 필요, 현재 '+values.length+'개');
        if(group.countRule==='minimum'&&values.length<group.minimumCount)errors.push(group.key+': 최소 '+group.minimumCount+'개 필요, 현재 '+values.length+'개');
        var componentCount=components(values);if(componentCount!==1)errors.push(group.key+': mesh component '+componentCount+'개');
        var wrongSide=group.sideSign==null?[]:values.filter(function(index){return !sideAllowed(group,index);});
        if(wrongSide.length)errors.push(group.key+': 반대쪽/정중선 ['+wrongSide.join(', ')+']');
        var g1Overlap=values.filter(function(index){return g1Set.has(index);});if(g1Overlap.length&&group.allowG1Overlap!==true)errors.push(group.key+': g1 overlap ['+g1Overlap.join(', ')+']');
        var boundaries=boundary(values),win=null;
        if(group.winnerAxis==='lateral')win=winner(values,function(index){return DATA.faceVertices[index][0]*group.sideSign;});
        if(group.winnerAxis==='anterior')win=winner(values,function(index){return DATA.faceVertices[index][2];});
        var boundaryHit=win!=null&&boundaries.includes(win);if(boundaryHit)warnings.push(group.key+': runtime winner '+win+'가 patch boundary · 해부 coverage와 별도로 공식 재검토 필요');
        diagnostics[group.key]={boundaryIndices:boundaries,componentCount:componentCount,count:values.length,coverageVerdict:state.coverageVerdict||'pending',disposition:'candidate_review',winnerBoundaryHit:boundaryHit,winnerIndex:win};
      }else diagnostics[group.key]={boundaryIndices:[],componentCount:0,count:0,coverageVerdict:state.coverageVerdict||'pending',disposition:'candidate_review',winnerBoundaryHit:false,winnerIndex:null};
    });
    for(var leftIndex=0;leftIndex<GROUPS.length;leftIndex+=1){for(var rightIndex=leftIndex+1;rightIndex<GROUPS.length;rightIndex+=1){var overlap=intersection(groups[GROUPS[leftIndex].key],groups[GROUPS[rightIndex].key]);if(overlap.length)errors.push(GROUPS[leftIndex].key+' ↔ '+GROUPS[rightIndex].key+': overlap ['+overlap.join(', ')+']');}}
    [['alarLeftIndices','alarRightIndices','alar'],['malarApexLeftIndices','malarApexRightIndices','malar']].forEach(function(pair){var left=groups[pair[0]],right=groups[pair[1]];if(!left.length&&!right.length)return;if(!left.length||!right.length){errors.push(pair[2]+': 좌우 patch가 모두 필요');return;}var mirrored=left.map(function(index){return DATA.mirrorIndices[index];}).sort(function(a,b){return a-b;});var residual=Math.max.apply(null,left.concat(right).map(function(index){return DATA.mirrorResiduals[index];}));var score=jaccard(mirrored,right);var mutual=left.concat(right).every(function(index){return DATA.mirrorIndices[DATA.mirrorIndices[index]]===index;});if(left.length!==right.length||score!==1||!mutual||residual>DATA.uvResidualCap)errors.push(pair[2]+': UV mirror J='+score.toFixed(3)+', mutual='+mutual+', residual='+residual.toFixed(6));});
    var completionStatus=errors.length?'incomplete_or_error':(hasUnsupported?'complete_with_unsupported':'candidate_structural_pass');return {completionStatus:completionStatus,errors:errors,groupDiagnostics:diagnostics,result:errors.length?'fail':'pass',status:completionStatus,warnings:warnings};
  }

  function renderAnnotations(){
    var marks=[];
    GROUPS.forEach(function(group){if(!reviewGroupVisible(group))return;var state=annotations[group.key];state.allowedRegionIndices.forEach(function(index){var point=DATA.screenVertices[index],reserved=g1Set.has(index);marks.push('<circle class="annotation-point v" data-i="'+index+'" cx="'+point[0]+'" cy="'+point[1]+'" r="7" fill="none" stroke="#22d3ee" stroke-width="2.4" '+(reserved?'stroke-dasharray="3 2"':'')+'><title>'+group.key+' ROI '+index+(reserved?' · g1 reserved':'')+'</title></circle>');});if(state.targetIndex!=null){var targetPoint=DATA.screenVertices[state.targetIndex],targetReserved=g1Set.has(state.targetIndex);marks.push('<circle class="annotation-point v" data-i="'+state.targetIndex+'" cx="'+targetPoint[0]+'" cy="'+targetPoint[1]+'" r="10" fill="none" stroke="#fde047" stroke-width="4" '+(targetReserved?'stroke-dasharray="4 2"':'')+'><title>'+group.key+' target '+state.targetIndex+(targetReserved?' · g1 reserved':'')+'</title></circle>');}if(suggestionsRevealedAtUtc)state.fixedPatchIndices.forEach(function(index){var point=DATA.screenVertices[index];marks.push('<circle class="annotation-point v" data-i="'+index+'" cx="'+point[0]+'" cy="'+point[1]+'" r="8" fill="'+group.color+'" fill-opacity=".45" stroke="#4ade80" stroke-width="3"><title>'+group.key+' fixed '+index+'</title></circle>');});});
    document.getElementById('annotationOverlay').innerHTML=marks.join('');
    document.getElementById('annotationLists').innerHTML=GROUPS.map(function(group){var state=annotations[group.key],reservedEvidence=sortedUnique(state.allowedRegionIndices.concat(state.targetIndex==null?[]:[state.targetIndex])).filter(function(index){return g1Set.has(index);}),patchText=suggestionsRevealedAtUtc?'['+sortedUnique(state.fixedPatchIndices).join(', ')+']':(state.fixedPatchIndices.length?'[숨김 · 자동 후보 공개 후 표시]':'[]');return '<div class="card"><span style="color:'+group.color+'">●</span> '+group.key+' · '+(state.disposition||'candidate_review')+'<br/>coverage '+escapeHtmlText(state.coverageVerdict||'pending')+' · '+escapeHtmlText(state.coverageNote||'메모 없음')+'<br/>ROI ['+sortedUnique(state.allowedRegionIndices).join(', ')+']<br/>target '+(state.targetIndex==null?'—':state.targetIndex)+'<br/>patch '+patchText+(reservedEvidence.length?'<br/><span class="warning">g1 evidence ['+reservedEvidence.join(', ')+'] · 해부 근거로 정상 사용됨'+(group.allowG1Overlap===true?' · 이 그룹 runtime patch에서 controlled overlap 허용':' · runtime patch 자체에는 중복 금지')+'</span>':'')+(state.disposition==='unsupported_null'?'<br/>reason '+escapeHtmlText(state.unsupportedReason||'—'):'')+'</div>';}).join('');
  }
  function renderValidation(){lastValidation=validateState();var box=document.getElementById('validation');if(!suggestionsRevealedAtUtc){var remaining=GROUPS.filter(function(group){if(!group.required)return false;var state=annotations[group.key];return state.disposition==='unsupported_null'?!((state.unsupportedReason||'').trim()&&state.coverageVerdict==='fail'&&(state.coverageNote||'').trim()):(state.targetIndex==null||!state.allowedRegionIndices.length);}).map(function(group){return group.key;});box.className='validation';box.innerHTML='<b>BLIND ANATOMY REVIEW · 자동 후보/고정 patch 숨김</b><br/>'+(remaining.length?'남은 필수 그룹: '+remaining.map(escapeHtmlText).join(', '):'1차 해부 표시 완료 · 위 공개 버튼을 누르세요.');return;}box.className='validation '+lastValidation.completionStatus;if(lastValidation.completionStatus==='candidate_structural_pass'){box.innerHTML='<b>CANDIDATE STRUCTURAL PASS</b><br/><span class="warning">두 reviewer 합의와 17-capture batch gate 전에는 runtime 승인 아님.</span>'+(lastValidation.warnings.length?'<ul>'+lastValidation.warnings.map(function(warning){return '<li class="warning">'+escapeHtmlText(warning)+'</li>';}).join('')+'</ul>':'');}else if(lastValidation.completionStatus==='complete_with_unsupported'){box.innerHTML='<b>COMPLETE WITH UNSUPPORTED</b><br/><span class="warning">검수 기록은 완료됐지만 null 그룹이 있어 metric 후보 승인이 아닙니다.</span>';}else{box.innerHTML='<b>FAIL/PENDING · '+lastValidation.errors.length+'개</b><ul>'+lastValidation.errors.map(function(error){return '<li>'+escapeHtmlText(error)+'</li>';}).join('')+'</ul>';}}
  function renderAll(){renderAnnotations();renderValidation();applyLayers();requestMeshDraw();}

  canvas2d.addEventListener('click',function(event){var vertex=event.target.closest('.v');if(vertex){selectVertex(+vertex.dataset.i,'frame2d');return;}var locked=event.target.closest('.locked');if(locked)selectVertex(+locked.dataset.i,'frame2d-g1-reserved');});
  document.getElementById('undo').onclick=function(){var previous=undoHistory.pop();if(!previous)return;restoreState(previous);renderAll();};
  document.getElementById('clear').onclick=function(){var state=annotations[target.value],kind=annotationKind.value;if(kind==='fixedPatchIndices'&&!suggestionsRevealedAtUtc){showAction('독립 해부 표시 전에는 숨겨진 고정 patch를 변경할 수 없습니다.',true);return;}pushHistory();if(kind==='targetIndex')state.targetIndex=null;else state[kind]=[];renderAll();};
  reviewerId.oninput=renderValidation; registration.onchange=renderValidation;

  function importedIndexList(value,label){if(!Array.isArray(value))throw new Error(label+'는 vertex index 배열이어야 합니다.');var result=[];value.forEach(function(index){if(!Number.isInteger(index)||index<0||index>=DATA.faceVertices.length)throw new Error(label+' 범위 밖 index: '+index);if(result.includes(index))throw new Error(label+' 중복 index: '+index);result.push(index);});return result.sort(function(a,b){return a-b;});}
  function normalizeImported(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('patch JSON은 object여야 합니다.');
    var source=raw.groups||raw.selected||raw.suggestions||raw;
    if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('patch groups를 찾을 수 없습니다.');
    var fingerprint=typeof raw.topologyFingerprint==='string'?raw.topologyFingerprint:(raw.topologyFingerprint&&raw.topologyFingerprint.fingerprint);
    if(!fingerprint)throw new Error('topologyFingerprint가 없는 legacy JSON은 가져올 수 없습니다.');
    if(fingerprint!==DATA.topologyFingerprint.fingerprint)throw new Error('topology fingerprint mismatch');
    var sameCapture=raw.capturePairId===DATA.capturePairId,next={};
    GROUPS.forEach(function(group){
      var importedAnnotation=raw.annotations&&raw.annotations[group.key]||{};
      if(!importedAnnotation||typeof importedAnnotation!=='object'||Array.isArray(importedAnnotation))throw new Error('annotations.'+group.key+'는 object여야 합니다.');
      var fixed=source[group.key]==null?[]:importedIndexList(source[group.key],'groups.'+group.key);
      var allowed=importedAnnotation.allowedRegionIndices==null?[]:importedIndexList(importedAnnotation.allowedRegionIndices,'annotations.'+group.key+'.allowedRegionIndices');
      var annotationFixed=importedAnnotation.fixedPatchIndices==null?fixed:importedIndexList(importedAnnotation.fixedPatchIndices,'annotations.'+group.key+'.fixedPatchIndices');
      if(JSON.stringify(annotationFixed)!==JSON.stringify(fixed))throw new Error('annotations.'+group.key+'.fixedPatchIndices와 groups가 다릅니다.');
      var targetIndex=importedAnnotation.targetIndex==null?null:importedAnnotation.targetIndex;
      if(targetIndex!=null&&(!Number.isInteger(targetIndex)||targetIndex<0||targetIndex>=DATA.faceVertices.length))throw new Error('annotations.'+group.key+'.targetIndex 범위 오류');
      next[group.key]={allowedRegionIndices:sameCapture?allowed:[],coverageNote:sameCapture&&typeof importedAnnotation.coverageNote==='string'?importedAnnotation.coverageNote:'',coverageVerdict:sameCapture&&(importedAnnotation.coverageVerdict==='pass'||importedAnnotation.coverageVerdict==='fail')?importedAnnotation.coverageVerdict:'pending',disposition:sameCapture&&importedAnnotation.disposition==='unsupported_null'?'unsupported_null':'candidate_review',fixedPatchIndices:fixed,selectionEvidence:sameCapture&&Array.isArray(importedAnnotation.selectionEvidence)?importedAnnotation.selectionEvidence:[],targetIndex:sameCapture?targetIndex:null,unsupportedReason:sameCapture&&typeof importedAnnotation.unsupportedReason==='string'?importedAnnotation.unsupportedReason:''};
    });
    return {annotations:next,sameCapture:sameCapture};
  }
  function isCanonicalIsoUtcTimestamp(value){var parsed=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value;}
  document.getElementById('patchFile').onchange=function(event){var file=event.target.files&&event.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){try{pushHistory();var raw=JSON.parse(reader.result),normalized=normalizeImported(raw);annotations=normalized.annotations;evidence=[];reviewerId.value=normalized.sameCapture?(raw.reviewerId||''):'';registration.value=normalized.sameCapture?(raw.registrationStatus||'pending'):'pending';suggestionsRevealedAtUtc=normalized.sameCapture&&raw.blindReviewCompleted===true&&isCanonicalIsoUtcTimestamp(raw.suggestionsRevealedAtUtc)&&blindEvidenceComplete()?raw.suggestionsRevealedAtUtc:null;syncBlindMode();syncDispositionControls();renderAll();showAction(normalized.sameCapture?'같은 캡처 검수 상태를 복원했습니다.':'다른 캡처의 고정 patch만 가져왔습니다. registration/해부 증거는 초기화됐습니다.',false);}catch(error){undoHistory.pop();showAction('가져오기 실패: '+error.message,true);}};reader.readAsText(file);};

  function exportPayload(){var groups={},exportAnnotations={};GROUPS.forEach(function(group){var state=annotations[group.key],unsupported=state.disposition==='unsupported_null';groups[group.key]=unsupported?[]:sortedUnique(state.fixedPatchIndices);exportAnnotations[group.key]={allowedRegionIndices:sortedUnique(state.allowedRegionIndices),coverageNote:state.coverageNote||'',coverageVerdict:state.coverageVerdict||'pending',disposition:state.disposition||'candidate_review',targetIndex:state.targetIndex,fixedPatchIndices:unsupported?[]:sortedUnique(state.fixedPatchIndices),selectionEvidence:state.selectionEvidence||[],unsupportedReason:state.unsupportedReason||''};});return {schemaVersion:DATA.authoringSchemaVersion,reviewMode:DATA.reprojectionMode?'fixed_patch_reprojection':'blind_anatomy_authoring',reviewStatus:'provisional_human_review_required',reviewOutcome:lastValidation.completionStatus,reviewedAtUtc:new Date().toISOString(),reviewerId:reviewerId.value.trim(),registrationStatus:registration.value,capturePairId:DATA.capturePairId,captureShotKind:DATA.captureShotKind,captureFraming:DATA.captureFraming,topologyFingerprint:DATA.topologyFingerprint,blindReviewCompleted:DATA.reprojectionMode?false:Boolean(suggestionsRevealedAtUtc),suggestionsRevealedAtUtc:DATA.reprojectionMode?null:suggestionsRevealedAtUtc,groups:groups,annotations:exportAnnotations,validation:lastValidation};}
  function exportText(){return JSON.stringify(exportPayload(),null,2);}
  document.getElementById('copy').onclick=function(){var text=exportText();function done(){showAction('임시 검수 JSON 복사됨 ✓',false);}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done).catch(function(){fallbackCopy(text);done();});else{fallbackCopy(text);done();}};
  function fallbackCopy(text){var textarea=document.createElement('textarea');textarea.value=text;document.body.appendChild(textarea);textarea.select();document.execCommand('copy');textarea.remove();}
  document.getElementById('download').onclick=function(){var blob=new Blob([exportText()+'\\n'],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=DATA.capturePairId+'.tier2-authoring.json';anchor.click();setTimeout(function(){URL.revokeObjectURL(url);},0);showAction('임시 검수 JSON 저장됨 ✓',false);};

  // ── dependency-free Canvas local-mesh viewer ──
  var meshCanvas=document.getElementById('mesh3d'),meshContext=meshCanvas.getContext('2d'),meshTooltip=document.getElementById('meshTooltip');
  var meshState={yaw:0,elevation:0,zoom:1,projected:[],hover:null,drawPending:false,pointer:null,dragged:false};
  function vectorDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function vectorCross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function vectorUnit(value){var length=Math.hypot(value[0],value[1],value[2])||1;return [value[0]/length,value[1]/length,value[2]/length];}
  function cameraBasis(){var cosElevation=Math.cos(meshState.elevation),direction=[Math.sin(meshState.yaw)*cosElevation,Math.sin(meshState.elevation),Math.cos(meshState.yaw)*cosElevation],right=vectorUnit([direction[2],0,-direction[0]]),up=vectorUnit(vectorCross(direction,right));return {direction:direction,right:right,up:up};}
  function resizeMesh(){var dpr=Math.min(2,window.devicePixelRatio||1),rect=meshCanvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));if(meshCanvas.width!==width||meshCanvas.height!==height){meshCanvas.width=width;meshCanvas.height=height;}return {dpr:dpr,width:width,height:height};}
  function projectMesh(){var size=resizeMesh(),basis=cameraBasis(),scale=Math.min(size.width,size.height)*0.31*meshState.zoom;meshState.projected=DATA.faceVertices.map(function(point){return {x:size.width/2+vectorDot(point,basis.right)*scale,y:size.height/2-vectorDot(point,basis.up)*scale,depth:vectorDot(point,basis.direction),scale:scale};});return size;}
  function visibleGroup(group){var checkbox=document.querySelector('input[data-g="'+group.key+'"]');return checkbox&&checkbox.checked;}
  function reviewGroupVisible(group){return suggestionsRevealedAtUtc?visibleGroup(group):group.key===target.value;}
  function drawPoint(index,color,radius,stroke){var point=meshState.projected[index];if(!point)return;meshContext.beginPath();meshContext.arc(point.x,point.y,radius,0,Math.PI*2);meshContext.fillStyle=color;meshContext.fill();if(stroke){meshContext.strokeStyle=stroke;meshContext.lineWidth=2;meshContext.stroke();}}
  function drawMesh(){
    meshState.drawPending=false;var size=projectMesh();meshContext.clearRect(0,0,size.width,size.height);meshContext.fillStyle='#02050a';meshContext.fillRect(0,0,size.width,size.height);
    var triangles=[];for(var offset=0;offset<DATA.triangles.length;offset+=3){var a=DATA.triangles[offset],b=DATA.triangles[offset+1],c=DATA.triangles[offset+2];triangles.push({a:a,b:b,c:c,depth:(meshState.projected[a].depth+meshState.projected[b].depth+meshState.projected[c].depth)/3});}
    triangles.sort(function(left,right){return left.depth-right.depth;});triangles.forEach(function(triangle){var a=meshState.projected[triangle.a],b=meshState.projected[triangle.b],c=meshState.projected[triangle.c],shade=Math.max(25,Math.min(70,42+triangle.depth*25));meshContext.beginPath();meshContext.moveTo(a.x,a.y);meshContext.lineTo(b.x,b.y);meshContext.lineTo(c.x,c.y);meshContext.closePath();meshContext.fillStyle='rgb('+shade+','+(shade+5)+','+(shade+12)+')';meshContext.fill();meshContext.strokeStyle='rgba(148,163,184,.16)';meshContext.lineWidth=1;meshContext.stroke();});
    if(document.getElementById('g1Toggle').checked)DATA.g1Indices.forEach(function(index){drawPoint(index,'rgba(245,158,11,.75)',3*size.dpr);});
    if(document.getElementById('allVerts').checked)DATA.freeIndices.forEach(function(index){drawPoint(index,'rgba(148,163,184,.45)',1.5*size.dpr);});
    GROUPS.forEach(function(group){if(suggestionsRevealedAtUtc&&document.getElementById('ringToggle').checked&&visibleGroup(group))group.suggestedIndices.forEach(function(index){drawPoint(index,group.color,3*size.dpr);});if(!reviewGroupVisible(group))return;var state=annotations[group.key];state.allowedRegionIndices.forEach(function(index){drawPoint(index,'#22d3ee',3.5*size.dpr);});if(state.targetIndex!=null)drawPoint(state.targetIndex,'#fde047',6*size.dpr,'#111827');if(suggestionsRevealedAtUtc)state.fixedPatchIndices.forEach(function(index){drawPoint(index,group.color,5*size.dpr,'#4ade80');});});
    if(suggestionsRevealedAtUtc&&lastValidation)GROUPS.forEach(function(group){if(!reviewGroupVisible(group))return;var diagnostic=lastValidation.groupDiagnostics[group.key];if(diagnostic&&diagnostic.winnerIndex!=null)drawPoint(diagnostic.winnerIndex,diagnostic.winnerBoundaryHit?'#f59e0b':'#22c55e',7*size.dpr,'#fff');});
    if(meshState.hover!=null)drawPoint(meshState.hover,'#fff',7*size.dpr,'#22d3ee');document.getElementById('meshAngles').textContent='yaw '+(meshState.yaw*180/Math.PI).toFixed(1)+'° · elevation '+(meshState.elevation*180/Math.PI).toFixed(1)+'°';
  }
  function requestMeshDraw(){if(meshState.drawPending)return;meshState.drawPending=true;requestAnimationFrame(drawMesh);}
  function candidateIndicesForPick(){var values=[];if(document.getElementById('allVerts').checked)values=DATA.freeIndices.slice();GROUPS.forEach(function(group){if(suggestionsRevealedAtUtc&&document.getElementById('ringToggle').checked&&visibleGroup(group)&&!document.getElementById('allVerts').checked)values=values.concat(group.suggestedIndices);if(!reviewGroupVisible(group))return;var state=annotations[group.key];values=values.concat(state.allowedRegionIndices);if(suggestionsRevealedAtUtc)values=values.concat(state.fixedPatchIndices);if(state.targetIndex!=null)values.push(state.targetIndex);});var activeGroup=GROUP_BY_KEY[target.value];if(document.getElementById('g1Toggle').checked&&(annotationKind.value!=='fixedPatchIndices'||activeGroup.allowG1Overlap===true))values=values.concat(DATA.g1Indices);if(annotationKind.value==='fixedPatchIndices'&&activeGroup.allowG1Overlap!==true)values=values.filter(function(index){return !g1Set.has(index);});return sortedUnique(values);}
  function meshPosition(event){var rect=meshCanvas.getBoundingClientRect(),scaleX=meshCanvas.width/rect.width,scaleY=meshCanvas.height/rect.height;return {x:(event.clientX-rect.left)*scaleX,y:(event.clientY-rect.top)*scaleY};}
  function pickMeshVertex(position){var limit=Math.pow(12*Math.min(2,window.devicePixelRatio||1),2),best=null;candidateIndicesForPick().forEach(function(index){var point=meshState.projected[index],dx=point.x-position.x,dy=point.y-position.y,distance=dx*dx+dy*dy;if(distance>limit)return;var depthDelta=best?point.depth-best.depth:0;if(!best||depthDelta>1e-6||(Math.abs(depthDelta)<=1e-6&&distance<best.distance)||(Math.abs(depthDelta)<=1e-6&&distance===best.distance&&index<best.index))best={index:index,distance:distance,depth:point.depth};});return best&&best.index;}
  meshCanvas.addEventListener('pointerdown',function(event){meshCanvas.setPointerCapture(event.pointerId);meshState.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};meshState.dragged=false;meshCanvas.classList.add('dragging');});
  meshCanvas.addEventListener('pointermove',function(event){if(meshState.pointer&&meshState.pointer.id===event.pointerId){var dx=event.clientX-meshState.pointer.lastX,dy=event.clientY-meshState.pointer.lastY;if(Math.hypot(event.clientX-meshState.pointer.x,event.clientY-meshState.pointer.y)>4)meshState.dragged=true;meshState.yaw+=dx*0.008;meshState.elevation=Math.max(-1.3,Math.min(1.3,meshState.elevation-dy*0.008));meshState.pointer.lastX=event.clientX;meshState.pointer.lastY=event.clientY;requestMeshDraw();return;}var picked=pickMeshVertex(meshPosition(event));meshState.hover=picked==null?null:picked;meshTooltip.textContent=picked==null?'vertex —':'vertex '+picked+' · q '+DATA.faceVertices[picked][0].toFixed(3)+' · A '+DATA.faceVertices[picked][2].toFixed(3);requestMeshDraw();});
  meshCanvas.addEventListener('pointerup',function(event){if(meshState.pointer&&meshState.pointer.id===event.pointerId&&!meshState.dragged){var picked=pickMeshVertex(meshPosition(event));if(picked!=null)selectVertex(picked,'mesh3d');}meshState.pointer=null;meshCanvas.classList.remove('dragging');});
  meshCanvas.addEventListener('pointercancel',function(){meshState.pointer=null;meshCanvas.classList.remove('dragging');});
  meshCanvas.addEventListener('wheel',function(event){event.preventDefault();meshState.zoom=Math.max(.5,Math.min(4,meshState.zoom*Math.exp(-event.deltaY*.001)));requestMeshDraw();},{passive:false});
  document.querySelectorAll('[data-view]').forEach(function(button){button.onclick=function(){var view=button.dataset.view;if(view==='front'){meshState.yaw=0;meshState.elevation=0;}if(view==='left45'){meshState.yaw=-Math.PI/4;meshState.elevation=0;}if(view==='right45'){meshState.yaw=Math.PI/4;meshState.elevation=0;}if(view==='subnasal'){meshState.yaw=0;meshState.elevation=-35*Math.PI/180;}requestMeshDraw();};});
  window.addEventListener('resize',requestMeshDraw);
  syncBlindMode();applyZoom();renderAll();
</script></body></html>`;

  const outHtml = cli.outHtml ?? path.join(
    os.tmpdir(),
    'tier2-seed-analysis',
    `${path.basename(captureDir)}.tier2-seed-review.html`,
  );
  if (path.extname(outHtml).toLowerCase() !== '.html') {
    throw new Error(`출력 파일은 .html이어야 합니다: ${outHtml}`);
  }
  fs.mkdirSync(path.dirname(outHtml), {recursive: true});
  const suggestionsPath = outHtml.slice(0, -'.html'.length) + '.suggestions.json';
  fs.writeFileSync(outHtml, html, 'utf8');
  fs.writeFileSync(
    suggestionsPath,
    `${JSON.stringify({
      schemaVersion: 'aura.face3d-tier2-auto-suggestions.v2',
      capturePairId: payload.capturePairId,
      captureShotKind: payload.captureShotKind,
      captureFraming: validatedCapture.captureFraming,
      captureDir: path.basename(captureDir),
      coordinateSpaceValidated: payload.coordinateSpaceValidated === true,
      sideConvention: 'mirrored_selfie_subject_anatomical_left_negative_face_local_lateral',
      topologyFingerprint: captureTopologyFingerprint,
      reviewStatus: 'exploratory_only_not_runtime_approved',
      suggestions,
      diagnostics: autoSuggestionValidation,
    }, null, 2)}\n`,
  );
  console.log(`Tier-2 시드 리뷰(HTML) 생성: ${outHtml}`);
  console.log(`Tier-2 자동 후보(JSON, 보조 전용): ${suggestionsPath}`);
}

main();
