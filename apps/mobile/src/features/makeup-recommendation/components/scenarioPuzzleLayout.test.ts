import {getPuzzleRowSpan, packScenarioPuzzle} from './scenarioPuzzleLayout';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(getPuzzleRowSpan({contentHeight: 40, rowHeight: 48, rowGap: 8}), 1, 'one row');
expectEqual(getPuzzleRowSpan({contentHeight: 72, rowHeight: 48, rowGap: 8}), 2, 'two rows');

const placements = packScenarioPuzzle({
  columnCount: 12,
  items: [
    {id: 'tall', columnSpan: 7, rowSpan: 2},
    {id: 'short', columnSpan: 5, rowSpan: 1},
    {id: 'gap-filler', columnSpan: 5, rowSpan: 1},
    {id: 'next', columnSpan: 4, rowSpan: 1},
  ],
});

expectEqual(
  JSON.stringify(packScenarioPuzzle({columnCount: 0, items: [{id: 'empty', columnSpan: 2, rowSpan: 1}]})),
  '[]',
  'zero columns return no placements',
);
const clamped = packScenarioPuzzle({columnCount: 3, items: [{id: 'wide', columnSpan: 99, rowSpan: 0}]});
expectEqual(JSON.stringify(clamped[0]), JSON.stringify({id: 'wide', columnSpan: 3, rowSpan: 1, column: 0, row: 0}), 'invalid spans are clamped');
const byId = Object.fromEntries(placements.map(item => [item.id, item]));
expectEqual(byId['gap-filler'].row, 1, 'short-card gap is filled');
expectEqual(byId['gap-filler'].column, 7, 'gap filler uses right-side hole');

for (let index = 0; index < placements.length; index += 1) {
  for (let otherIndex = index + 1; otherIndex < placements.length; otherIndex += 1) {
    const a = placements[index];
    const b = placements[otherIndex];
    const separated =
      a.column + a.columnSpan <= b.column ||
      b.column + b.columnSpan <= a.column ||
      a.row + a.rowSpan <= b.row ||
      b.row + b.rowSpan <= a.row;
    expectEqual(separated, true, `${a.id} and ${b.id} do not overlap`);
  }
}
