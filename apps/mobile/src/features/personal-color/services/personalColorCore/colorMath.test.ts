// 실행: scripts/mobile/run-personal-color-contract.mjs (tsc → node)
import { deltaE00, labToLch, rgb8ToLab } from './colorMath';

function expectClose(actual: number, expected: number, epsilon: number, label: string) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}±${epsilon}, received ${actual}`);
  }
}
function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}

export function runColorMathTests() {
  // sRGB primary → Lab (bug #1 센터링 근거: 정확한 Lab 변환)
  const red = rgb8ToLab({ r: 255, g: 0, b: 0 });
  expectClose(red.L, 53.24, 0.1, 'red L*');
  expectClose(red.a, 80.09, 0.1, 'red a*');
  expectClose(red.b, 67.2, 0.1, 'red b*');

  const white = rgb8ToLab({ r: 255, g: 255, b: 255 });
  expectClose(white.L, 100, 0.05, 'white L*');
  expectClose(white.a, 0, 0.02, 'white a*');
  expectClose(white.b, 0, 0.02, 'white b*');

  // 중립 그레이 → a*≈b*≈0
  const gray = rgb8ToLab({ r: 119, g: 119, b: 119 });
  expectClose(gray.a, 0, 0.02, 'gray a*');
  expectClose(gray.b, 0, 0.02, 'gray b*');
  expectTrue(gray.L > 48 && gray.L < 52, 'gray L* near 50');

  // LCh
  const lch = labToLch(red);
  expectClose(lch.C, Math.sqrt(80.09 ** 2 + 67.2 ** 2), 0.2, 'red C*');

  // ΔE00 self = 0
  expectClose(deltaE00(red, red), 0, 1e-9, 'ΔE00 self');

  // Sharma 검증쌍
  const d = deltaE00({ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 });
  expectClose(d, 2.0425, 1e-3, 'ΔE00 Sharma pair');

  const d2 = deltaE00({ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 });
  expectClose(d2, 2.8615, 1e-3, 'ΔE00 Sharma pair 2');

  console.log('[personal-color] colorMath tests passed');
}

runColorMathTests();
