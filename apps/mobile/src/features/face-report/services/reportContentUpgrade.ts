import type {ReportData} from '../reportTypes';

export function keepActivePageContent(
  current: ReportData,
  next: ReportData,
  pageId: string | null,
): ReportData {
  if (!pageId) return next;
  if (pageId === 'summary:generation') {
    return {
      ...next,
      generationStatus: current.generationStatus,
      generationError: current.generationError,
      s1: current.s1,
    };
  }
  if (pageId.startsWith('summary:')) {
    return {...next, s1: current.s1};
  }
  if (pageId === 'proportion:overview') {
    return {...next, s2: current.s2};
  }
  if (pageId.startsWith('features:')) {
    const key = pageId.slice('features:'.length);
    const currentCard = current.s3?.cards.find(card => card.key === key);
    if (!currentCard || !next.s3) return next;
    return {
      ...next,
      s3: {
        ...next.s3,
        cards: next.s3.cards.map(card =>
          card.key === key ? currentCard : card,
        ),
      },
    };
  }
  if (pageId === 'impression:overview') return {...next, s6: current.s6};
  if (pageId.startsWith('personal-color:')) return {...next, s4: current.s4};
  if (pageId === 'skin:overview') return {...next, s8: current.s8};
  if (pageId.startsWith('styling:')) {
    return {...next, s7: current.s7, s9: current.s9};
  }
  if (pageId === 'body:overview') return {...next, s5: current.s5};
  return next;
}
