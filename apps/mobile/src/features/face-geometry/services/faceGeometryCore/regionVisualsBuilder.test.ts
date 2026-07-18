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
  // 이마(상안부 상단 확장, B4) 10/151/9/67/297 — 눈썹(y340) 위
  [[10,500,250],[151,500,290],[9,500,330],[67,400,280],[297,600,280]].forEach(([i,x,y]) => put(i,x,y));
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
// B4: 상안부 크롭은 이마까지(눈썹 위로), 외곽 크롭은 광대(faceWidth)까지 포함
{
  const rv = regionVisualsBuilder(synthMap(), 1000, 1000);
  // 이마 점(10=y250)이 있으니 상안부 크롭 상단이 눈썹(y340=0.34) 위로 올라간다
  assert(rv.upper!.cropRect.y < 0.3, 'upper crop extends up to forehead');
  // 광대 점(234/454=y500)이 있으니 외곽 크롭 상단이 하악(y650=0.65) 위 광대 레벨까지
  assert(rv.jaw!.cropRect.y < 0.55, 'jaw crop extends up to cheekbones');
}
// 이마 점이 전혀 없어도(앞머리 가림) 상안부는 눈썹까지로 폴백 — 여전히 산출
{
  const m = synthMap();
  [10, 151, 9, 67, 297].forEach(i => m.delete(i));
  const rv = regionVisualsBuilder(m, 1000, 1000);
  assert(!!rv.upper, 'upper still present without forehead points');
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
// 립 생존점이 세로 중앙선(0/17, 같은 x)뿐 → bbox 폭이 0 → 퇴화 크롭이라 lower 생략
{
  const m = synthMap();
  [61, 40, 39, 37, 267, 269, 270, 291, 375, 321, 405, 314, 84, 181, 91, 146].forEach(i => m.delete(i));
  const rv = regionVisualsBuilder(m, 1000, 1000);
  assert(rv.lower === undefined, 'lower omitted when surviving lip points are axis-aligned (degenerate width)');
}
// 하악 실루엣 생존점이 1개뿐(최소 2점 미달) → jaw 생략
{
  const m = synthMap();
  [172, 148, 377, 397].forEach(i => m.delete(i));
  const rv = regionVisualsBuilder(m, 1000, 1000);
  assert(rv.jaw === undefined, 'jaw omitted when fewer than 2 contour points survive');
}

// eslint-disable-next-line no-console
console.log('regionVisualsBuilder.test.ts OK');
