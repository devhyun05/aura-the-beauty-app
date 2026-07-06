// AURADIN 재디자인 스코프 가드
//
// AURADIN(색으로 찾는 메이크업) 추천 화면의 새 비주얼(꿈꾸는 블루 + 솜사탕 핑크 +
// 마젠타)은 "추천 기능 전용"이다. 전역 테마(apps/mobile/src/shared/theme)는 앱의
// 거의 모든 화면(home / face-analysis / auth / navigation / AR ...)이 공유하므로,
// 그 팔레트를 전역 테마에 넣으면 앱 전체 색이 바뀐다.
//
// 이 스크립트는 전역 shared/theme 소스에 AURADIN 재디자인 팔레트가 섞여 들어왔는지
// 검사하고, 발견되면 실패(exit 1)한다. AURADIN 전용 색은 features/recommendation
// 로컬 토큰으로 두어야 한다. (참고: "# AURADIN 첫 진입 화면 디자인/DESIGN.md")
//
// 실행: (apps/mobile 에서) npm run test:auradin-theme-scope

import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const themeDir = join(repoRoot, 'apps/mobile/src/shared/theme');

// AURADIN 재디자인 전용 팔레트 — 전역 테마에 절대 들어오면 안 되는 색.
// (DESIGN.md / 워크플로우 디자인시스템에서 추출)
const FORBIDDEN = {
  '#e0489c': 'AURADIN 마젠타 (Entry v2)',
  '#e4409a': 'AURADIN 마젠타',
  '#b81e74': 'AURADIN 마젠타 딥',
  '#c85ae0': 'AURADIN 칩 활성 퍼플',
  '#b06cf0': 'AURADIN 전송 버튼 퍼플',
  '#a8cef5': 'AURADIN 스카이블루',
  '#cfe6fb': 'AURADIN 스카이 하이',
  '#dcebff': 'AURADIN Sky Top',
  '#c3dbff': 'AURADIN Sky Mid',
  '#a9c7fb': 'AURADIN Sky Deep',
  '#b9c4ff': 'AURADIN Periwinkle',
  '#f6cfe0': 'AURADIN 솜사탕 핑크',
  '#fbe3ee': 'AURADIN 핑크 하이',
  '#ffd9ec': 'AURADIN Cotton Pink',
  '#fbc7df': 'AURADIN Blush',
  '#0b1026': 'AURADIN Focus Night (다크 몰입)',
  '#131a38': 'AURADIN Focus Deep (다크 몰입)',
};

function themeSourceFiles(dir) {
  return readdirSync(dir, {withFileTypes: true})
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts'),
    )
    .map((entry) => join(dir, entry.name));
}

const violations = [];
for (const file of themeSourceFiles(themeDir)) {
  const text = readFileSync(file, 'utf8').toLowerCase();
  for (const [hex, label] of Object.entries(FORBIDDEN)) {
    if (text.includes(hex)) {
      violations.push({file: file.replace(`${repoRoot}/`, ''), hex, label});
    }
  }
}

if (violations.length > 0) {
  console.error('\n✗ AURADIN theme scope guard 실패\n');
  console.error(
    'AURADIN 재디자인 팔레트가 전역 테마(shared/theme)에 유입됐습니다.',
  );
  console.error(
    'shared/theme 은 앱 전역(home·face-analysis·auth·AR 등 다수 화면)이 공유하므로,',
  );
  console.error('여기에 넣으면 AURADIN이 아닌 화면들의 색까지 전부 바뀝니다.');
  console.error(
    '→ 이 색들은 features/recommendation 기능 로컬 토큰으로 옮기세요.\n',
  );
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.hex}  (${v.label})`);
  }
  console.error('');
  process.exit(1);
}

console.log(
  '✓ AURADIN theme scope guard 통과 — 전역 테마에 AURADIN 재디자인 팔레트 없음',
);
