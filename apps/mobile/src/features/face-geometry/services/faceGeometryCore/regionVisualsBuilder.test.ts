import {regionVisualsBuilder} from './regionVisualsBuilder';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// 합성 랜드마크: 필요한 인덱스에 픽셀 좌표를 심는다(1000x1000 이미지).
function synthMap(): Map<number, {x: number; y: number}> {
  const m = new Map<number, {x: number; y: number}>();
  const put = (i: number, x: number, y: number) => m.set(i, {x, y});
  // 눈/눈썹(상): outer 33/263, inner 133/362, lids 159/145/386/374
  [[33, 380, 400], [263, 620, 400], [133, 450, 400], [362, 550, 400],
   [159, 440, 380], [145, 440, 420], [386, 560, 380], [374, 560, 420]].forEach(([i,x,y]) => put(i,x,y));
  // 눈썹 코어(상) 최저 y 근사 — 몇 점만
  [[46,380,340],[300,620,340]].forEach(([i,x,y]) => put(i,x,y));
  // 코 능선(중) 168..1
  [[168,500,410],[6,500,440],[197,500,470],[195,500,500],[5,500,530],[4,500,560],[1,500,590]].forEach(([i,x,y]) => put(i,x,y));
  [[98,470,600],[327,530,600]].forEach(([i,x,y]) => put(i,x,y)); // alae
  // 얼굴 폭 234/454
  put(234, 300, 500); put(454, 700, 500);
  // 외곽 립(하) — 대표 몇 점
  [[61,430,700],[291,570,700],[0,500,670],[17,500,740]].forEach(([i,x,y]) => put(i,x,y));
  // 하악(외곽) 172/152/397 등
  [[172,340,650],[148,420,820],[152,500,870],[377,580,820],[397,660,650]].forEach(([i,x,y]) => put(i,x,y));
  return m;
}

// 정상 입력 → 4부위 모두 산출, 정규화 범위, crop가 부위 점들을 포함
{
  const rv = regionVisualsBuilder(synthMap(), 1000, 1000);
  (['upper','mid','lower','jaw'] as const).forEach(k => {
    const r = rv[k];
    assert(!!r, `${k} present`);
    if (r) {
      assert(r.cropRect.x >= 0 && r.cropRect.y >= 0, `${k} rect origin >=0`);
      assert(r.cropRect.w > 0 && r.cropRect.w <= 1, `${k} rect w in (0,1]`);
      assert(r.cropRect.h > 0 && r.cropRect.h <= 1, `${k} rect h in (0,1]`);
      assert(r.cropRect.x + r.cropRect.w <= 1.0001, `${k} rect within right edge`);
      assert(r.guide.points.length >= 2, `${k} guide has a line`);
      r.guide.points.forEach(p => assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${k} guide pt normalized`));
    }
  });
}
// mid 가이드는 콧대 중심선(세로) — 첫/끝 점의 x가 거의 같음
{
  const rv = regionVisualsBuilder(synthMap(), 1000, 1000);
  const mid = rv.mid!;
  const xs = mid.guide.points.map(p => p.x);
  assert(Math.max(...xs) - Math.min(...xs) < 0.05, 'mid guide is a vertical midline');
}
// 필수 인덱스 부재 → 그 부위 생략(키 없음), 다른 부위는 유지
{
  const m = synthMap(); m.delete(168); m.delete(6); m.delete(197); m.delete(195); m.delete(5); m.delete(4); m.delete(1);
  const rv = regionVisualsBuilder(m, 1000, 1000);
  assert(rv.mid === undefined, 'mid omitted when nose indices missing');
  assert(!!rv.lower, 'lower still present');
}
// 잘못된 이미지 크기 → 빈 결과
{
  assert(Object.keys(regionVisualsBuilder(synthMap(), 0, 1000)).length === 0, 'imageW<=0 -> empty');
}

// eslint-disable-next-line no-console
console.log('regionVisualsBuilder.test.ts OK');
