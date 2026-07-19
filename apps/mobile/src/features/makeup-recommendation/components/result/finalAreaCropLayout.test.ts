import type {PartKey} from '../../screens/recommendationResultTypes';
import type {MakeupRecommendationCropBox} from '../../types';
import {
  computeRegionFrameHeight,
  computeRegionImageLayout,
} from './finalAreaCropLayout';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectClose(actual: number, expected: number, label: string, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const SOURCE_WIDTH = 1440;
const SOURCE_HEIGHT = 2937;
const PAIR_FRAME_WIDTH = 156;
const SINGLE_FRAME_WIDTH = 322;

const ACTUAL_CAPTURE_BOXES: Readonly<Record<PartKey, readonly MakeupRecommendationCropBox[]>> = {
  base: [{left: 0.339166, top: 0.247177, right: 0.685668, bottom: 0.446913}],
  brow: [
    {left: 0.363999, top: 0.275821, right: 0.487334, bottom: 0.293219},
    {left: 0.55268, top: 0.277929, right: 0.670357, bottom: 0.296655},
  ],
  eye: [
    {left: 0.392826, top: 0.297363, right: 0.481412, bottom: 0.318336},
    {left: 0.552111, top: 0.299271, right: 0.639637, bottom: 0.320243},
  ],
  cheek: [
    {left: 0.362288, top: 0.332278, right: 0.480099, bottom: 0.388204},
    {left: 0.549346, top: 0.335044, right: 0.667156, bottom: 0.39097},
  ],
  lip: [{left: 0.432082, top: 0.379439, right: 0.59615, bottom: 0.417389}],
};

function assertBoxIsFullyVisible(
  area: PartKey,
  box: MakeupRecommendationCropBox,
  frameHeight: number,
  frameWidth: number,
) {
  const layout = computeRegionImageLayout({
    area,
    box,
    frameHeight,
    frameWidth,
    sourceHeight: SOURCE_HEIGHT,
    sourceWidth: SOURCE_WIDTH,
  });
  const scale = layout.width / SOURCE_WIDTH;
  const projectedLeft = layout.left + box.left * SOURCE_WIDTH * scale;
  const projectedTop = layout.top + box.top * SOURCE_HEIGHT * scale;
  const projectedRight = layout.left + box.right * SOURCE_WIDTH * scale;
  const projectedBottom = layout.top + box.bottom * SOURCE_HEIGHT * scale;

  if (projectedLeft < -0.01 || projectedRight > frameWidth + 0.01) {
    throw new Error(`${area} horizontal crop escaped its frame`);
  }
  if (projectedTop < -0.01 || projectedBottom > frameHeight + 0.01) {
    throw new Error(`${area} vertical crop escaped its frame`);
  }
}

const expectedHeights: Readonly<Record<PartKey, number>> = {
  base: 270,
  brow: 64,
  eye: 76,
  cheek: 146,
  lip: 140,
};

for (const area of ['base', 'brow', 'eye', 'cheek', 'lip'] as const) {
  const boxes = ACTUAL_CAPTURE_BOXES[area];
  const frameWidth = boxes.length > 1 ? PAIR_FRAME_WIDTH : SINGLE_FRAME_WIDTH;
  const frameHeight = computeRegionFrameHeight({
    area,
    boxes,
    frameWidth,
    sourceHeight: SOURCE_HEIGHT,
    sourceWidth: SOURCE_WIDTH,
  });

  expectEqual(frameHeight, expectedHeights[area], `${area} aspect-aware frame height`);
  boxes.forEach(box => assertBoxIsFullyVisible(area, box, frameHeight, frameWidth));
}

const firstBrow = ACTUAL_CAPTURE_BOXES.brow[0];
const browLayout = computeRegionImageLayout({
  area: 'brow',
  box: firstBrow,
  frameHeight: expectedHeights.brow,
  frameWidth: PAIR_FRAME_WIDTH,
  sourceHeight: SOURCE_HEIGHT,
  sourceWidth: SOURCE_WIDTH,
});
const browScale = browLayout.width / SOURCE_WIDTH;
const projectedBrowTop = browLayout.top + firstBrow.top * SOURCE_HEIGHT * browScale;
const projectedBrowBottom = browLayout.top + firstBrow.bottom * SOURCE_HEIGHT * browScale;
expectClose(projectedBrowTop, 16.7, 'brow context remains mostly above the feature', 0.2);
expectClose(projectedBrowBottom, 61.7, 'brow keeps minimal context below the feature', 0.2);

expectEqual(
  ACTUAL_CAPTURE_BOXES.brow[0].left < ACTUAL_CAPTURE_BOXES.brow[1].left,
  true,
  'screen-left brow remains first',
);
expectEqual(
  ACTUAL_CAPTURE_BOXES.eye[0].left < ACTUAL_CAPTURE_BOXES.eye[1].left,
  true,
  'screen-left eye remains first',
);