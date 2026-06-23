import type {
  FilterLocationState,
  FilterStyleState,
} from '../services/filterCustomizationService';

export const mockFilterLocationState: FilterLocationState = {
  selectedFacePartId: 'all',
  isOverlayVisible: true,
  landmarks: [
    {id: 'left-brow', x: 38, y: 31},
    {id: 'right-brow', x: 62, y: 31},
    {id: 'left-cheek', x: 34, y: 54},
    {id: 'right-cheek', x: 66, y: 54},
    {id: 'lip-top', x: 50, y: 68},
    {id: 'chin', x: 50, y: 82},
  ],
  adjustments: {
    horizontal: {
      label: '좌우 위치',
      min: -24,
      max: 24,
      step: 2,
      unit: 'px',
      value: 0,
    },
    vertical: {
      label: '상하 위치',
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

export const mockFilterStyleState: FilterStyleState = {
  selectedFacePartId: 'all',
  selectedOptionGroup: 'color',
  selectedColorId: 'rose',
  selectedTypeId: 'lipstick',
  selectedTextureId: 'semi-glow',
};
