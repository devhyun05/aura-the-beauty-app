#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readJson(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source);
}

function parseIndices(value, vertexCount) {
  const selected = new Set();
  for (const token of value.split(',')) {
    const [startValue, endValue] = token.split(':');
    const start = Number(startValue);
    const end = endValue === undefined ? start : Number(endValue);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= vertexCount || end < start) {
      throw new Error(`잘못된 정점 범위: ${token}`);
    }
    for (let index = start; index <= end; index += 1) selected.add(index);
  }
  return [...selected];
}

function main() {
  const captureDirectory = path.resolve(process.argv[2] ?? '');
  if (!fs.existsSync(captureDirectory)) {
    throw new Error(`캡처 폴더가 없습니다: ${captureDirectory}`);
  }
  const payload = readJson(path.join(captureDirectory, 'arface_export.json'));
  const framePath = path.join(captureDirectory, payload.framePath ?? 'frame.png');
  const indices = parseIndices(process.argv[3] ?? '0:36', payload.localVertices.length);
  const outputPath = path.resolve(
    process.argv[4] ?? path.join(captureDirectory, `vertex-index-overlay-${indices[0]}-${indices.at(-1)}.svg`),
  );
  const [width, height] = payload.display.videoFrameSize;
  const frameDataUri = `data:image/png;base64,${fs.readFileSync(framePath).toString('base64')}`;
  const marks = indices.map((index, order) => {
    const [x, y] = payload.screenVertices[index];
    const color = order % 2 === 0 ? '#ff3b30' : '#64d2ff';
    return `<g><circle cx="${x}" cy="${y}" fill="${color}" r="5" stroke="white" stroke-width="1.5"/><text x="${x + 7}" y="${y - 5}" fill="white" font-family="monospace" font-size="13" font-weight="700" paint-order="stroke" stroke="black" stroke-width="3">${index}</text></g>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${frameDataUri}" width="${width}" height="${height}"/>
  <g>${marks}</g>
  <rect x="8" y="8" width="285" height="38" rx="10" fill="black" fill-opacity="0.72"/>
  <text x="22" y="33" fill="white" font-size="16">ARKit vertex index diagnostic · ${indices[0]}…${indices.at(-1)}</text>
</svg>`;
  fs.writeFileSync(outputPath, svg, 'utf8');
  console.log(`정점 번호 오버레이 생성 완료: ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(`정점 번호 오버레이 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
