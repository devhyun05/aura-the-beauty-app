import type {
  FilterShapeState,
  MakeupFilterOptionState,
} from '../services/filterCustomizationService';

export const mockFilterShapeState: FilterShapeState = {
  selectedMakeupArea: 'all',
  isOverlayVisible: true,
  shapePoints: [
    {id: 'left-brow', position: {x: 38, y: 31}, offset: {x: 0, y: 0}},
    {id: 'right-brow', position: {x: 62, y: 31}, offset: {x: 0, y: 0}},
    {id: 'left-cheek', position: {x: 34, y: 54}, offset: {x: 0, y: 0}},
    {id: 'right-cheek', position: {x: 66, y: 54}, offset: {x: 0, y: 0}},
    {id: 'lip-top', position: {x: 50, y: 68}, offset: {x: 0, y: 0}},
    {id: 'chin', position: {x: 50, y: 82}, offset: {x: 0, y: 0}},
  ],
  adjustments: {
    horizontal: {
      label: '좌우 이동',
      min: -24,
      max: 24,
      step: 2,
      unit: 'px',
      value: 0,
    },
    vertical: {
      label: '상하 이동',
      min: -24,
      max: 24,
      step: 2,
      unit: 'px',
      value: 0,
    },
    scale: {
      label: '크기',
      min: -20,
      max: 20,
      step: 2,
      unit: '%',
      value: 0,
    },
    rotation: {
      label: '각도',
      min: -15,
      max: 15,
      step: 1,
      unit: '°',
      value: 0,
    },
  },
};

export const mockMakeupFilterOptionState: MakeupFilterOptionState = {
  selectedMakeupArea: 'all',
  selectedOptionGroup: 'color',
  selectedColorId: 'rose',
  selectedTypeId: 'lipstick',
  selectedTextureId: 'semi-glow',
};
