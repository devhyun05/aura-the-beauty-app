// colorLightingGreenlight: HARD는 awb_ae_not_settled 하나, soft는 비차단
import { evaluateColorLightingGreenlight } from './colorLightingGreenlight';

function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectFalse(value: boolean, label: string) {
  if (value) throw new Error(`${label}: expected false`);
}

export function runColorLightingTests() {
  // AWB 수렴 중 → hard block
  const adjusting = evaluateColorLightingGreenlight({ adjustingWhiteBalance: true, iso: 200 });
  expectFalse(adjusting.hardBlockClear, 'AWB adjusting → hard block');
  expectFalse(adjusting.finalColorGreenlight, 'adjusting → no greenlight');
  expectTrue(adjusting.message != null, 'adjusting → message');

  // AE 수렴 중 → hard block
  const exposureAdjusting = evaluateColorLightingGreenlight({ adjustingExposure: true, iso: 200 });
  expectFalse(exposureAdjusting.hardBlockClear, 'AE adjusting → hard block');

  // isStable/focus 단독은 색 게이트가 막지 않음 (흔들림은 base greenlight, focus는 데드엔드 회피)
  const focusOrShake = evaluateColorLightingGreenlight({
    isStable: false,
    adjustingFocus: true,
    iso: 200,
  });
  expectTrue(focusOrShake.hardBlockClear, 'isStable/focus alone → no color-gate block');

  // 수렴 완료 + 정상 조명 → greenlight, 경고 없음
  const ok = evaluateColorLightingGreenlight({
    iso: 200,
    exposureDurationMs: 16,
    whiteBalanceGains: { red: 1.9, green: 1.0, blue: 1.7 },
    isStable: true,
  });
  expectTrue(ok.hardBlockClear && ok.finalColorGreenlight, 'settled+normal → greenlight');
  expectTrue(ok.lightingWarnings.length === 0, 'normal → no warnings');

  // 어두움: 경고만, 차단 안 함 (soft)
  const dark = evaluateColorLightingGreenlight({ iso: 1600, isStable: true });
  expectTrue(dark.finalColorGreenlight, 'dark still greenlight (soft)');
  expectTrue(dark.lightingWarnings.includes('too_dark'), 'dark → too_dark warning');

  // 강한 색조 캐스트: 경고만, 차단 안 함
  const cast = evaluateColorLightingGreenlight({
    iso: 200,
    whiteBalanceGains: { red: 2.6, green: 1.0, blue: 1.2 },
    isStable: true,
  });
  expectTrue(cast.finalColorGreenlight, 'cast still greenlight (soft)');
  expectTrue(cast.lightingWarnings.includes('strong_color_cast'), 'cast → warning');

  console.log('[personal-color] colorLightingGreenlight tests passed');
}

runColorLightingTests();
