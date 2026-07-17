import type {ImageSourcePropType} from 'react-native';

import type {MakeupSituationKey} from '../../types';

export const MAKEUP_SITUATION_ASSETS: Record<MakeupSituationKey, ImageSourcePropType> = {
  daily: require('../../../../assets/images/makeup-recommendation/situations/daily.webp'),
  work: require('../../../../assets/images/makeup-recommendation/situations/work.webp'),
  date: require('../../../../assets/images/makeup-recommendation/situations/date.webp'),
  social: require('../../../../assets/images/makeup-recommendation/situations/social.webp'),
  formal_event: require('../../../../assets/images/makeup-recommendation/situations/formal-event.webp'),
  travel_outdoor: require('../../../../assets/images/makeup-recommendation/situations/travel-outdoor.webp'),
  camera_content: require('../../../../assets/images/makeup-recommendation/situations/camera-content.webp'),
  festival_performance: require('../../../../assets/images/makeup-recommendation/situations/festival-performance.webp'),
};