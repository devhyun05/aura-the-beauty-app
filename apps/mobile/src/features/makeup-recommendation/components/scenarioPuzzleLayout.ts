export type ScenarioPuzzleItem = {id: string; columnSpan: number; rowSpan: number};
export type ScenarioPuzzlePlacement = ScenarioPuzzleItem & {column: number; row: number};

export function getPuzzleRowSpan({contentHeight, rowGap, rowHeight}: {
  contentHeight: number;
  rowGap: number;
  rowHeight: number;
}): number {
  return Math.max(1, Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap)));
}

export function packScenarioPuzzle({columnCount, items}: {
  columnCount: number;
  items: readonly ScenarioPuzzleItem[];
}): ScenarioPuzzlePlacement[] {
  if (columnCount <= 0 || items.length === 0) return [];

  const occupied: boolean[][] = [];
  const placements: ScenarioPuzzlePlacement[] = [];
  const fits = (row: number, column: number, item: ScenarioPuzzleItem) => {
    if (column + item.columnSpan > columnCount) return false;
    for (let y = row; y < row + item.rowSpan; y += 1) {
      for (let x = column; x < column + item.columnSpan; x += 1) {
        if (occupied[y]?.[x]) return false;
      }
    }
    return true;
  };
  for (const item of items) {
    const adjustedItem: ScenarioPuzzleItem = {
      ...item,
      columnSpan: Math.min(Math.max(1, item.columnSpan), columnCount),
      rowSpan: Math.max(1, item.rowSpan),
    };
    let row = 0;
    let placed = false;
    while (!placed) {
      for (let column = 0; column < columnCount; column += 1) {
        if (!fits(row, column, adjustedItem)) continue;
        for (let y = row; y < row + adjustedItem.rowSpan; y += 1) {
          occupied[y] ??= Array(columnCount).fill(false);
          for (let x = column; x < column + adjustedItem.columnSpan; x += 1) occupied[y][x] = true;
        }
        placements.push({...adjustedItem, column, row});
        placed = true;
        break;
      }
      if (!placed) row += 1;
    }
  }
  return placements;
}
