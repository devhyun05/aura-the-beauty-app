// AURADIN — shared data types (verbatim from the port brief; field names match the backend).

export type AuradinReason = { matchedOn: string[]; inferred: string[]; caveat: string[] };

export type AuradinCandidateProduct = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  priceText: string; // always "18,000원" format, rendered in mono
  matchSummary: string;
  palette: string[];
  tags: string[];
  imageUrl?: string;
  purchaseUrl?: string;
  role?: 'anchor' | 'diverse' | 'discovery';
  source?: 'curated' | 'live_naver';
  reason?: AuradinReason;
  reasonCopy?: string;
  matchRate?: number;
};

export type AuradinQuestionOption = { id: string; label: string; swatch?: string };

/** App phases — drives the single PersistentOrb morph + ground darkness. */
export type AuradinPhase =
  | 'home'
  | 'searching'
  | 'question'
  | 'results'
  | 'detail'
  | 'saved'
  | 'failed';

export type ThinkingStepState = 'done' | 'active' | 'pending';
export type ThinkingStep = { label: string; state: ThinkingStepState };

export type RefineDial = 'more_similar' | 'more_diverse';
