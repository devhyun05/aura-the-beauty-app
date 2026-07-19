// AURADIN — 확장형 첨부 프레임워크.
//
// 입력 자료(리포트·필터·향후 사진 등)를 kind 판별 유니온으로 표현하고, 레지스트리가
// 각 종류의 칩 라벨/글리프 + create 요청 기여(contribute)를 담는다. **새 자료 = 여기 1엔트리**.
// contribute는 검색 요청에 누적 기여한다:
//   - report → context.personalColor + skinType (+ reportId)
//   - filter → promptSuffix에 parse_intent가 이해하는 표준구 합성(백엔드 무변경)
//   - photo(향후) → context.lookPhotoUri 등

export type AuradinAttachment =
  | {kind: 'report'; id?: string; personalColor: string; skinType?: string}
  | {kind: 'filter'; attribute: 'category' | 'priceKrw' | 'channel'; value: string; label: string};

// 검색 요청에 누적되는 기여분.
export type AttachmentRequestParts = {
  promptSuffix: string;
  reportId?: string;
  // skinType은 백엔드 report_profile의 C4 finish(건성→글로시 등) soft 선호를 살린다.
  context: {personalColor?: string; skinType?: string};
};

type AttachmentKindSpec<A extends AuradinAttachment> = {
  glyph: string;
  chipLabel: (attachment: A) => string;
  contribute: (attachment: A, parts: AttachmentRequestParts) => void;
};

// 퍼스널컬러 문자열을 칩용으로 짧게 (예: "여름 쿨 라이트" → "여름 쿨").
function shortTone(personalColor: string): string {
  const words = personalColor.trim().split(/\s+/).slice(0, 2).join(' ');
  return words || '리포트';
}

const REPORT_SPEC: AttachmentKindSpec<Extract<AuradinAttachment, {kind: 'report'}>> = {
  glyph: '◆',
  chipLabel: (a) => `${shortTone(a.personalColor)} · 리포트`,
  contribute: (a, parts) => {
    if (a.personalColor) {
      parts.context.personalColor = a.personalColor;
    }
    if (a.skinType) {
      parts.context.skinType = a.skinType;
    }
    if (a.id) {
      parts.reportId = a.id;
    }
  },
};

const FILTER_SPEC: AttachmentKindSpec<Extract<AuradinAttachment, {kind: 'filter'}>> = {
  glyph: '#',
  chipLabel: (a) => a.label,
  // parse_intent가 파싱하는 표준구(예: "립", "2만원 이하", "올리브영")를 프롬프트에 덧붙임.
  contribute: (a, parts) => {
    parts.promptSuffix = `${parts.promptSuffix} ${a.value}`.trim();
  },
};

// kind → spec. 새 자료 종류는 여기에 한 줄 추가하면 트레이·칩·요청 합성에 자동 편입.
const REGISTRY = {
  report: REPORT_SPEC,
  filter: FILTER_SPEC,
} as const;

export function attachmentGlyph(attachment: AuradinAttachment): string {
  return REGISTRY[attachment.kind].glyph;
}

export function attachmentChipLabel(attachment: AuradinAttachment): string {
  const spec = REGISTRY[attachment.kind] as AttachmentKindSpec<AuradinAttachment>;
  return spec.chipLabel(attachment);
}

// 첨부 목록 → 검색 요청 기여분(프롬프트 접미구 + reportId + context) 합성.
export function buildRequestParts(attachments: AuradinAttachment[]): AttachmentRequestParts {
  const parts: AttachmentRequestParts = {promptSuffix: '', context: {}};
  for (const attachment of attachments) {
    const spec = REGISTRY[attachment.kind] as AttachmentKindSpec<AuradinAttachment>;
    spec.contribute(attachment, parts);
  }
  return parts;
}

// 필터 첨부 프리셋 (컴팩트 메뉴에서 노출). value = parse_intent 표준구.
export const FILTER_PRESETS: {group: string; items: Extract<AuradinAttachment, {kind: 'filter'}>[]}[] = [
  {
    group: '카테고리',
    items: [
      {kind: 'filter', attribute: 'category', value: '립', label: '립'},
      {kind: 'filter', attribute: 'category', value: '블러셔', label: '블러셔'},
      {kind: 'filter', attribute: 'category', value: '아이섀도우', label: '아이섀도우'},
    ],
  },
  {
    group: '가격',
    items: [
      {kind: 'filter', attribute: 'priceKrw', value: '1만원 이하', label: '1만원↓'},
      {kind: 'filter', attribute: 'priceKrw', value: '2만원 이하', label: '2만원↓'},
      {kind: 'filter', attribute: 'priceKrw', value: '3만원 이하', label: '3만원↓'},
    ],
  },
  {
    group: '구매처',
    items: [
      {kind: 'filter', attribute: 'channel', value: '올리브영', label: '올리브영'},
      {kind: 'filter', attribute: 'channel', value: '백화점', label: '백화점'},
    ],
  },
];
