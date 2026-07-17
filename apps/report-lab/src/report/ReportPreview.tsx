import {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  DotsThree,
  ImageBroken,
  Play,
} from '@phosphor-icons/react';

import {shouldRenderReportSpectrumScale} from '@aura/face-report-contract';
import type {
  FaceReportViewV1,
  ReportBlend,
  ReportPosition,
  ReportSpectrum,
  ReportStatefulBlend,
  StylingDirection,
} from '@aura/face-report-contract';

const POSITION_PERCENT: Record<ReportPosition, string> = {
  'far-left': '8%',
  left: '24%',
  'center-left': '38%',
  center: '50%',
  'center-right': '62%',
  right: '76%',
  'far-right': '92%',
};

const POSITION_ORDER: ReportPosition[] = [
  'far-left',
  'left',
  'center-left',
  'center',
  'center-right',
  'right',
  'far-right',
];

type ReportPreviewProps = {
  report: FaceReportViewV1;
  onAction?: (message: string) => void;
};

function MediaUnavailable({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      aria-label="검증된 출처의 예시 이미지가 없어 표시하지 않음"
      className={`media-unavailable ${compact ? 'media-unavailable-compact' : ''} ${className}`.trim()}
      role="img">
      <ImageBroken aria-hidden size={compact ? 22 : 28} weight="regular" />
      <span>{compact ? '이미지 없음' : '검증된 예시 이미지를 포함하지 않았어요.'}</span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="report-section-heading">
      <span className="report-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function StatusBadge({judgement}: {judgement: ReportSpectrum['judgement']}) {
  if (judgement === 'boundary') {
    return <span className="status-badge status-boundary">경계 유보</span>;
  }
  if (judgement === 'withheld') {
    return <span className="status-badge status-withheld">판정 보류</span>;
  }
  if (judgement === 'unavailable') {
    return <span className="status-badge status-unavailable">측정 불가</span>;
  }
  return null;
}

function SpectrumRail({
  onAction,
  spectrum,
}: {
  onAction?: (message: string) => void;
  spectrum: ReportSpectrum;
}) {
  const initialIndex = Math.max(0, POSITION_ORDER.indexOf(spectrum.position ?? 'center'));
  const [whatIfIndex, setWhatIfIndex] = useState<number | null>(null);
  const isWhatIf = spectrum.id === 'eye-tail' && spectrum.judgement === 'firm';
  const activePosition = whatIfIndex === null
    ? spectrum.position
    : POSITION_ORDER[whatIfIndex];
  const rangeStart = spectrum.rangeStart
    ? POSITION_PERCENT[spectrum.rangeStart]
    : POSITION_PERCENT.center;
  const rangeEnd = spectrum.rangeEnd
    ? POSITION_PERCENT[spectrum.rangeEnd]
    : POSITION_PERCENT.center;
  const showsVisualScale = shouldRenderReportSpectrumScale(spectrum.judgement);

  return (
    <div className={`spectrum spectrum-${spectrum.judgement}`}>
      <div className="spectrum-title-row">
        <strong>{spectrum.label}</strong>
        <StatusBadge judgement={spectrum.judgement} />
      </div>
      {showsVisualScale ? (
        <>
          <div className="spectrum-labels" aria-hidden="true">
            <span>{spectrum.leftLabel}</span>
            <span>{spectrum.rightLabel}</span>
          </div>
          <div
            aria-label={`${spectrum.label}: ${spectrum.description}`}
            className="spectrum-track"
            role="img">
            <span className="spectrum-center" />
            {spectrum.judgement === 'firm' && activePosition ? (
              <span
                className={whatIfIndex === null ? 'spectrum-marker' : 'spectrum-marker spectrum-marker-ghost'}
                style={{left: POSITION_PERCENT[activePosition]}}
              />
            ) : null}
            {spectrum.judgement === 'boundary' ? (
              <span
                className="spectrum-range"
                style={{left: rangeStart, right: `calc(100% - ${rangeEnd})`}}
              />
            ) : null}
          </div>
        </>
      ) : null}
      {isWhatIf ? (
        <div className="what-if-control">
          <label htmlFor={`what-if-${spectrum.id}`}>만약에 위치 보기</label>
          <input
            id={`what-if-${spectrum.id}`}
            aria-describedby={`what-if-copy-${spectrum.id}`}
            max={POSITION_ORDER.length - 1}
            min="0"
            onChange={event => setWhatIfIndex(Number(event.target.value))}
            type="range"
            value={whatIfIndex ?? initialIndex}
          />
          {whatIfIndex !== null ? (
            <button className="text-button" onClick={() => setWhatIfIndex(null)} type="button">
              <ArrowCounterClockwise aria-hidden size={14} weight="bold" />
              원래대로
            </button>
          ) : null}
        </div>
      ) : null}
      <p aria-live={isWhatIf ? 'polite' : undefined} id={`what-if-copy-${spectrum.id}`}>
        {whatIfIndex === null
          ? spectrum.reason ?? spectrum.description
          : whatIfIndex < 3
            ? '더 부드럽고 순한 인상으로 읽혔을 거예요.'
            : whatIfIndex === 3
              ? '평균 구간이라 단정하고 차분한 인상에 가까웠을 거예요.'
              : '또렷한 인상이 더 선명하게 느껴졌을 거예요.'}
      </p>
      {spectrum.retryLabel ? (
        <button
          className="text-button"
          onClick={() => onAction?.('재촬영은 모바일 앱에서 진행해 주세요.')}
          type="button">
          {spectrum.retryLabel}
        </button>
      ) : null}
    </div>
  );
}

function BlendBar({blend}: {blend: ReportBlend}) {
  return (
    <div className={`blend-bar blend-${blend.dominance}`}>
      <div className="blend-segments" aria-label={blend.description} role="img">
        <span>{blend.primaryLabel}</span>
        <span>{blend.secondaryLabel}</span>
      </div>
      <p>{blend.description}</p>
    </div>
  );
}

function StatefulBlendBar({blend}: {blend: ReportStatefulBlend}) {
  if (blend.judgement === 'withheld' || blend.judgement === 'unavailable') {
    return (
      <div className="report-notice">
        <strong>{blend.primaryLabel} · {blend.secondaryLabel}</strong>
        <StatusBadge judgement={blend.judgement} />
        <p>{blend.description}</p>
        <p>{blend.reason}</p>
      </div>
    );
  }
  return (
    <div className={`stateful-blend stateful-blend-${blend.judgement}`}>
      <StatusBadge judgement={blend.judgement} />
      <BlendBar
        blend={{
          primaryLabel: blend.primaryLabel,
          secondaryLabel: blend.secondaryLabel,
          dominance: blend.dominance!,
          description: blend.description,
        }}
      />
      {blend.reason ? <p>{blend.reason}</p> : null}
    </div>
  );
}

function SummarySection({report}: {report: FaceReportViewV1}) {
  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(report.analyzedAt));

  return (
    <section className="summary-section" aria-labelledby="report-title">
      <div className="hero-avatar-ring">
        <MediaUnavailable className="hero-avatar" compact />
      </div>
      <div className="summary-copy">
        <span>{formattedDate} · {report.analysisOrdinalLabel}</span>
        <h1 id="report-title">{report.hero.headline}</h1>
        <p>{report.hero.summary}</p>
      </div>
      {report.hero.legacyNotice ? (
        <div className="legacy-notice">{report.hero.legacyNotice}</div>
      ) : null}
      <dl className="fact-grid">
        {report.hero.facts.map(fact => (
          <div key={fact.key}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProportionSection({
  onAction,
  report,
}: {
  onAction?: (message: string) => void;
  report: FaceReportViewV1;
}) {
  const [selectedBand, setSelectedBand] = useState<'upper' | 'middle' | 'lower' | null>(null);
  const selected = report.proportion.bands.find(item => item.key === selectedBand);

  return (
    <section className="report-section" aria-labelledby="proportion-title">
      <SectionHeading
        description="검증된 사진은 표시하지 않고 구획 설명만 확인할 수 있어요."
        eyebrow="PROPORTION"
        title="얼굴의 구획부터 볼게요"
      />
      <MediaUnavailable className="proportion-media" />
      <div className="proportion-band-picker" aria-label="얼굴 구획 설명 선택">
        {report.proportion.bands.map(band => (
          <button
            aria-pressed={selectedBand === band.key}
            key={band.key}
            onClick={() => setSelectedBand(current => current === band.key ? null : band.key)}
            type="button">
            {band.label}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="band-detail" aria-live="polite">
          <strong>{selected.label}</strong>
          <span>{selected.description}</span>
        </div>
      ) : null}
      {report.proportion.hairlineStatus === 'missing' ? (
        <div className="report-notice">
          <strong>헤어라인이 확인되지 않았어요</strong>
          <p>{report.proportion.missingReason}</p>
          <button
            className="text-button"
            onClick={() => onAction?.('재촬영은 모바일 앱에서 진행해 주세요.')}
            type="button">
            {report.proportion.retryLabel}
          </button>
        </div>
      ) : null}
      <p className="section-narrative">{report.proportion.narrative}</p>
    </section>
  );
}

function FeatureSection({
  onAction,
  report,
}: {
  onAction?: (message: string) => void;
  report: FaceReportViewV1;
}) {
  return (
    <section className="report-section feature-section" aria-labelledby="feature-title">
      <SectionHeading
        description="확대 사진과 스펙트럼은 수치 대신 경향과 판정 상태를 보여줘요."
        eyebrow="FEATURES"
        title="이목구비, 하나씩 설명할게요"
      />
      {report.features.cards.map(card => (
        <article className="feature-card" key={card.key}>
          <header>
            <span>{card.eyebrow}</span>
            <h3>{card.title}</h3>
          </header>
          {card.media ? (
            <MediaUnavailable className="feature-image" />
          ) : (
            <div className="report-notice"><p>{card.unavailableMediaReason}</p></div>
          )}
          {card.blend ? <BlendBar blend={card.blend} /> : null}
          <div className="spectrum-list">
            {card.spectrums.map(spectrum => (
              <SpectrumRail key={spectrum.id} onAction={onAction} spectrum={spectrum} />
            ))}
          </div>
          <p className="section-narrative">{card.narrative}</p>
        </article>
      ))}
    </section>
  );
}

function PersonalColorSection({report}: {report: FaceReportViewV1}) {
  const allSwatches = useMemo(
    () => [
      ...report.personalColor.goodSwatches.map(swatch => ({...swatch, good: true})),
      ...report.personalColor.avoidSwatches.map(swatch => ({...swatch, good: false})),
    ],
    [report],
  );
  const [selectedSwatchId, setSelectedSwatchId] = useState(report.personalColor.goodSwatches[0]?.id ?? '');
  const selectedSwatch = allSwatches.find(item => item.id === selectedSwatchId) ?? allSwatches[0];
  const drapeCopy = selectedSwatch?.good
    ? report.personalColor.goodDrapeDescription
    : report.personalColor.avoidDrapeDescription;

  return (
    <section className="report-section personal-color-section" aria-labelledby="personal-color-title">
      <SectionHeading eyebrow="PERSONAL COLOR" title="색은 이렇게 어울려요" />
      <article className="report-card color-axis-card">
        <h3>{report.personalColor.headline}</h3>
        <StatefulBlendBar blend={report.personalColor.seasonBlend} />
        <div className="color-axis-list">
          {report.personalColor.axes.map(axis => (
            <SpectrumRail
              key={axis.key}
              spectrum={{
                id: `personal-color-${axis.key}`,
                label: axis.label,
                leftLabel: axis.leftLabel,
                rightLabel: axis.rightLabel,
                judgement: axis.judgement,
                description: axis.description,
                position: axis.position,
                rangeStart: axis.rangeStart,
                rangeEnd: axis.rangeEnd,
                reason: axis.reason,
              }}
            />
          ))}
        </div>
      </article>
      <article className="report-card drape-card">
        <header>
          <h3>직접 입혀 보세요</h3>
          <p>색을 선택하면 설명이 함께 바뀌어요.</p>
        </header>
        <div className="drape-stage" style={{backgroundColor: selectedSwatch?.color ?? '#c98a9b'}}>
          <MediaUnavailable className="drape-image" />
          <strong>{selectedSwatch?.name}</strong>
          <p aria-live="polite">{drapeCopy}</p>
        </div>
        <SwatchGroup
          label="잘 어울리는 색"
          onSelect={setSelectedSwatchId}
          selectedId={selectedSwatchId}
          swatches={report.personalColor.goodSwatches}
        />
        <SwatchGroup
          label="피하면 좋은 색"
          onSelect={setSelectedSwatchId}
          selectedId={selectedSwatchId}
          swatches={report.personalColor.avoidSwatches}
        />
        <p className="report-caveat">{report.personalColor.lightingCaveat}</p>
      </article>
    </section>
  );
}

function SwatchGroup({
  label,
  onSelect,
  selectedId,
  swatches,
}: {
  label: string;
  onSelect: (id: string) => void;
  selectedId: string;
  swatches: Array<{id: string; name: string; color: string}>;
}) {
  return (
    <div className="swatch-group">
      <h4>{label}</h4>
      <div className="swatch-grid">
        {swatches.map(swatch => (
          <button
            aria-label={`${swatch.name} 선택`}
            aria-pressed={selectedId === swatch.id}
            key={swatch.id}
            onClick={() => onSelect(swatch.id)}
            type="button">
            <span style={{backgroundColor: swatch.color}} />
            <small>{swatch.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function BodyProfileSection({
  onAction,
  report,
}: {
  onAction?: (message: string) => void;
  report: FaceReportViewV1;
}) {
  const body = report.bodyProfile;
  return (
    <section className="report-section" aria-labelledby="body-profile-title">
      <SectionHeading eyebrow="BODY TYPE" title="체형은 설문으로 봤어요" />
      {body.status === 'locked' ? (
        <article className="report-card locked-card">
          <h3>{body.title}</h3>
          <p>{body.description}</p>
          <button
            className="secondary-button"
            onClick={() => onAction?.('체형 설문은 모바일 앱에서 진행해 주세요.')}
            type="button">
            {body.actionLabel}
          </button>
        </article>
      ) : (
        <article className="report-card body-card">
          <div className="body-summary">
            <dl>
              <div><dt>실루엣 타입</dt><dd>{body.silhouetteLabel}</dd></div>
              <div><dt>골격 타입</dt><dd>{body.frameLabel}</dd></div>
              <button
                className="text-button"
                onClick={() => onAction?.('체형 설문은 모바일 앱에서 진행해 주세요.')}
                type="button">
                {body.retakeLabel}
              </button>
            </dl>
          </div>
          <RecommendationList items={body.recommendations} title="이렇게 입어보세요" />
          <RecommendationList avoided items={body.avoid} title="이건 피해도 좋아요" />
          <p className="report-caveat">{body.caveat}</p>
        </article>
      )}
    </section>
  );
}

function RecommendationList({
  avoided = false,
  items,
  title,
}: {
  avoided?: boolean;
  items: string[];
  title: string;
}) {
  return (
    <div className="recommendation-list">
      <h4>{title}</h4>
      <ul className={avoided ? 'avoid-list' : ''}>
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ImpressionSection({report}: {report: FaceReportViewV1}) {
  const [gazeStep, setGazeStep] = useState<'idle' | 'first' | 'second'>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(timer => window.clearTimeout(timer)), []);

  const play = () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setGazeStep('first');
    if (reducedMotion) {
      setGazeStep('second');
      return;
    }
    timers.current = [
      window.setTimeout(() => setGazeStep('second'), 850),
      window.setTimeout(() => setGazeStep('idle'), 1800),
    ];
  };

  return (
    <section className="report-section" aria-labelledby="impression-title">
      <SectionHeading eyebrow="IMPRESSION" title="모아 보면 이런 인상이에요" />
      <article className="report-card impression-card">
        <div className="gaze-layout">
          <MediaUnavailable className="gaze-map" />
          <div className="gaze-copy">
            <div className="gaze-title-row">
              <h3>시선이 머무는 순서</h3>
              <button onClick={play} type="button">
                <Play aria-hidden size={14} weight="fill" />
                {gazeStep === 'idle' ? '순서 재생' : '재생 중'}
              </button>
            </div>
            {report.impression.gazeOrder.map(item => (
              <p
                className={
                  gazeStep === 'first' && item === report.impression.gazeOrder[0]
                    ? 'gaze-copy-active'
                    : gazeStep === 'second' && item === report.impression.gazeOrder[1]
                      ? 'gaze-copy-active'
                      : ''
                }
                key={item.key}>
                <strong>{item.orderLabel} · {item.regionLabel}</strong>{item.description}
              </p>
            ))}
          </div>
        </div>
        <div className="tag-list">{report.impression.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <p className="section-narrative">{report.impression.narrative}</p>
      </article>
    </section>
  );
}

function StylingSection({report}: {report: FaceReportViewV1}) {
  const [mix, setMix] = useState(0);
  const activeKey: StylingDirection['key'] = mix < 50 ? 'natural' : 'glam';

  return (
    <section className="report-section styling-section" aria-labelledby="styling-title">
      <SectionHeading
        description="측정 근거와 아티스트 제안을 나눠서 확인할 수 있어요."
        eyebrow="STYLING"
        title="같은 얼굴, 두 가지 방향"
      />
      <article className="report-card style-mixer">
        <div className="style-mix-labels"><strong>내추럴</strong><span>{mix < 35 ? '내추럴에 가까움' : mix > 65 ? '글램에 가까움' : '두 무드의 중간'}</span><strong>글램</strong></div>
        <label className="sr-only" htmlFor="style-mix">스타일링 방향</label>
        <input id="style-mix" max="100" min="0" onChange={event => setMix(Number(event.target.value))} type="range" value={mix} />
        <div className="style-map">
          <MediaUnavailable compact />
          <div><strong>{activeKey === 'natural' ? '결을 살린 은은한 정돈' : '대비를 한 단계 끌어올리는 무드'}</strong><p>슬라이더를 움직이면 추천 방향과 강조 카드가 함께 바뀌어요.</p></div>
        </div>
      </article>
      {report.styling.directions.map(direction => (
        <StylingDirectionCard active={direction.key === activeKey} direction={direction} key={direction.key} />
      ))}
    </section>
  );
}

function StylingDirectionCard({
  active,
  direction,
}: {
  active: boolean;
  direction: StylingDirection;
}) {
  return (
    <article className={`report-card styling-card styling-card-${direction.key} ${active ? 'styling-card-active' : ''}`}>
      <header><span>{direction.badge}</span><h3>{direction.title}</h3><p>{direction.description}</p></header>
      <dl>
        {direction.items.map(item => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd>
              <strong>{item.guidance}</strong>
              <span className={`basis-badge basis-${item.basis}`}>{item.basis === 'measurement' ? '측정 근거' : '아티스트 제안'}</span>
              <p>{item.rationale}</p>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function ReportPreview({report, onAction}: ReportPreviewProps) {
  const [topBarMessage, setTopBarMessage] = useState('');
  const announce = (message: string) => {
    setTopBarMessage(message);
    onAction?.(message);
  };

  return (
    <article className="face-report" aria-label="얼굴 분석 보고서 미리보기">
      <nav className="report-topbar" aria-label="보고서 메뉴">
        <button aria-label="보고서 목록으로 돌아가기" onClick={() => announce('로컬 미리보기에서는 보고서 목록 이동을 생략해요.')} type="button">
          <ArrowLeft aria-hidden size={18} weight="bold" />
        </button>
        <strong>얼굴 분석 보고서</strong>
        <button aria-label="보고서 옵션 열기" onClick={() => announce('공유와 저장은 제품 연결 단계에서 활성화돼요.')} type="button">
          <DotsThree aria-hidden size={22} weight="bold" />
        </button>
      </nav>
      <span className="sr-only" aria-live="polite">{topBarMessage}</span>
      <SummarySection report={report} />
      <ProportionSection onAction={announce} report={report} />
      <FeatureSection onAction={announce} report={report} />
      <PersonalColorSection report={report} />
      <BodyProfileSection onAction={announce} report={report} />
      <ImpressionSection report={report} />
      <StylingSection report={report} />
      <footer className="report-footer">
        <p>{report.footer.disclaimer}</p>
        <button onClick={() => announce('재촬영은 모바일 앱에서 진행해 주세요.')} type="button">{report.footer.primaryActionLabel}</button>
      </footer>
    </article>
  );
}
