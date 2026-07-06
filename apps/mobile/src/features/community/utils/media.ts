import type {ImageSourcePropType} from 'react-native';

import {getCommunityMockImageSource} from '../mocks/community.mock';
import type {CommunityMedia} from '../types';

export function resolveCommunityMediaSource(item: CommunityMedia): ImageSourcePropType {
  if (item.imageUrl || item.cdnUrl) {
    return {uri: item.imageUrl ?? item.cdnUrl ?? ''};
  }

  return getCommunityMockImageSource(item.id);
}
