import {auradinDraftMock} from '../mocks/auradin.mock';
import type {AuradinDraftData} from '../types';

export async function getAuradinDraftData(): Promise<AuradinDraftData> {
  return auradinDraftMock;
}
