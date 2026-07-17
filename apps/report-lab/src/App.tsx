import {FormEvent, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {
  ArrowsLeftRight,
  BookmarkSimple,
  CheckCircle,
  ClockCounterClockwise,
  Flask,
  Play,
  Stop,
  WarningCircle,
} from '@phosphor-icons/react';

import {parseFaceReportView} from '@aura/face-report-contract';
import {SYNTHETIC_FACE_REPORT_FIXTURE} from '@aura/face-report-contract/syntheticFixture';

import {
  FIXTURE_CATALOG,
  createLocalApiSession,
  effectiveBypassCache,
  getLabCommitSha,
  retireLocalApiSession,
  runDeterministicFixture,
  runLocalApiBatchRecoveringHistory,
  type LabRunRequest,
  type LabRunResult,
  type LabRunnerMode,
  type LabStage,
} from './api/reportLabClient';
import {ReportPreview} from './report/ReportPreview';
import {
  clampRepeatCount,
  diffNormalizedOutputs,
  initialLabState,
  labReducer,
  type LabDraft,
} from './state/labState';

type MobileTab = 'setup' | 'preview' | 'results';

const STAGES: Array<{value: LabStage; label: string; description: string}> = [
  {value: 'measure', label: 'Measure', description: '측정 결과 정규화'},
  {value: 'perceive', label: 'Perceive', description: '시각 특징 해석'},
  {value: 'consult', label: 'Consult', description: '보고서 문장 생성'},
];

const RUNNERS: Array<{value: LabRunnerMode; label: string}> = [
  {value: 'fixture', label: '결정적 Fixture'},
  {value: 'local-api', label: '로컬 API'},
];

const EMPTY_REPORT = parseFaceReportView(SYNTHETIC_FACE_REPORT_FIXTURE);
const LAB_COMMIT_SHA = getLabCommitSha();

function formatRunTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function resultStatusLabel(run: LabRunResult): string {
  if (run.status === 'cancelled') return '취소됨';
  if (run.status === 'failed') return '실행 실패';
  return run.validationErrors.length === 0 ? '검증 통과' : '검증 확인 필요';
}

export function App() {
  const [state, dispatch] = useReducer(labReducer, initialLabState);
  const [mobileTab, setMobileTab] = useState<MobileTab>('setup');
  const [bypassCache, setBypassCache] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const abortController = useRef<AbortController | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const activeRunner = useRef<LabRunnerMode | null>(null);

  useEffect(() => () => abortController.current?.abort(), []);

  const selectedRun = useMemo(
    () => state.runs.find(run => run.runId === state.selectedRunId) ?? null,
    [state.runs, state.selectedRunId],
  );
  const leftRun = state.runs.find(run => run.runId === state.leftRunId) ?? null;
  const rightRun = state.runs.find(run => run.runId === state.rightRunId) ?? null;
  const visibleReport = selectedRun?.normalizedOutput ?? EMPTY_REPORT;

  const updateDraft = (patch: Partial<LabDraft>) => dispatch({type: 'draft', patch});

  const handleRun = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    activeRunner.current = state.draft.runner;
    dispatch({type: 'run-start'});
    setAnnouncement('실행을 시작했어요.');

    const request: LabRunRequest = {
      fixtureId: state.draft.fixtureId,
      stage: state.draft.stage,
      overrides: {
        promptDeveloper: state.draft.promptDeveloper,
        promptUser: state.draft.promptUser,
        promptVersion: state.draft.promptVersion,
        model: state.draft.model,
        maxTokens: state.draft.maxTokens,
        temperature: state.draft.temperature,
      },
      bypassCache: effectiveBypassCache(state.draft.runner, bypassCache),
    };

    try {
      const repeatCount = clampRepeatCount(state.draft.repeatCount);
      let results: LabRunResult[];
      let recoveredFromHistory = false;
      if (state.draft.runner === 'fixture') {
        results = await Promise.all(
          Array.from({length: repeatCount}, () =>
            runDeterministicFixture(request, controller.signal),
          ),
        );
      } else {
        const sessionId = state.sessionId ?? await createLocalApiSession(controller.signal);
        activeSessionId.current = sessionId;
        if (state.sessionId !== sessionId) {
          dispatch({type: 'session-set', sessionId});
        }
        const outcome = await runLocalApiBatchRecoveringHistory(
          request,
          repeatCount,
          sessionId,
          controller.signal,
        );
        results = outcome.runs;
        recoveredFromHistory = outcome.recoveredFromHistory;
      }
      dispatch({type: 'run-success', runs: results});
      setMobileTab('preview');
      const allValid = results.every(result => result.validationErrors.length === 0);
      setAnnouncement(
        recoveredFromHistory
          ? `응답 유실 뒤 서버 실행 기록에서 ${results.length}개 결과를 복구했어요.`
          : allValid
          ? `${results.length}개 실행이 끝났고 정규화 검증을 통과했어요.`
          : `${results.length}개 실행이 끝났고 검증 확인이 필요해요.`,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        dispatch({type: 'run-error', message: '실행을 취소했어요.'});
        setAnnouncement('실행을 취소했어요.');
        return;
      }
      const message = error instanceof Error ? error.message : '알 수 없는 실행 오류가 발생했어요.';
      dispatch({type: 'run-error', message});
      setAnnouncement(message);
    } finally {
      if (abortController.current === controller) {
        abortController.current = null;
        activeSessionId.current = null;
        activeRunner.current = null;
      }
    }
  };

  const cancelRun = () => {
    abortController.current?.abort();
    const sessionId = activeSessionId.current ?? state.sessionId;
    if (activeRunner.current === 'local-api' && sessionId) {
      void retireLocalApiSession(sessionId, () => dispatch({type: 'session-clear'}))
        .catch(error => {
          const message = error instanceof Error ? error.message : '취소 상태를 확인하지 못했어요.';
          setAnnouncement(message);
        });
    }
  };

  return (
    <div className={`report-lab mobile-tab-${mobileTab}`}>
      <a className="skip-link" href="#report-preview">보고서 미리보기로 건너뛰기</a>
      <header className="lab-header">
        <div className="lab-brand">
          <span className="lab-brand-mark" aria-hidden><Flask size={19} weight="fill" /></span>
          <div>
            <strong>AURA Report Lab</strong>
            <span>Numeric-free face report workbench</span>
          </div>
        </div>
        <div className="local-only-badge"><span aria-hidden />127.0.0.1 · LOCAL ONLY · SHA {LAB_COMMIT_SHA}</div>
      </header>

      <nav className="mobile-tabs" aria-label="Report Lab 화면" role="tablist">
        {([
          ['setup', '설정'],
          ['preview', '미리보기'],
          ['results', '실행 기록'],
        ] as const).map(([value, label]) => (
          <button
            aria-controls={`panel-${value}`}
            aria-selected={mobileTab === value}
            key={value}
            onClick={() => setMobileTab(value)}
            role="tab"
            type="button">
            {label}
          </button>
        ))}
      </nav>

      <main className="lab-workspace">
        <section className="lab-column setup-column" id="panel-setup" aria-label="실행 설정" role="tabpanel">
          <form onSubmit={handleRun}>
            <div className="column-heading">
              <div><span>INPUT</span><h1>분석 실행 설정</h1></div>
              <span className="fixture-badge">결정적 JSON · 이미지 없음</span>
            </div>

            <fieldset className="control-section fixture-picker">
              <legend>Fixture</legend>
              {FIXTURE_CATALOG.map(fixture => (
                <label className="fixture-option" key={fixture.fixtureId}>
                  <input
                    checked={state.draft.fixtureId === fixture.fixtureId}
                    name="fixture"
                    onChange={() => updateDraft({fixtureId: fixture.fixtureId})}
                    type="radio"
                    value={fixture.fixtureId}
                  />
                  <span className="fixture-radio" aria-hidden />
                  <span>
                    <strong>{fixture.label}</strong>
                    <small>{fixture.description}</small>
                    <em>{fixture.provenance}</em>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="control-section">
              <legend>Stage</legend>
              <div className="stage-picker">
                {STAGES.map(stage => (
                  <button
                    aria-pressed={state.draft.stage === stage.value}
                    key={stage.value}
                    onClick={() => updateDraft({stage: stage.value})}
                    type="button">
                    <strong>{stage.label}</strong>
                    <span>{stage.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="control-section form-grid">
              <label>
                <span>Runner</span>
                <select
                  onChange={event => {
                    const runner = event.target.value as LabRunnerMode;
                    if (runner === 'fixture') setBypassCache(false);
                    updateDraft(runner === 'local-api'
                      ? {
                        runner,
                        model: 'disabled',
                        maxTokens: '2800',
                        temperature: '0',
                      }
                      : {
                        runner,
                        model: 'deterministic-fixture',
                        maxTokens: 'disabled',
                        temperature: 'disabled',
                      });
                  }}
                  value={state.draft.runner}>
                  {RUNNERS.map(runner => <option key={runner.value} value={runner.value}>{runner.label}</option>)}
                </select>
              </label>
              <label>
                <span>반복 실행</span>
                <select
                  onChange={event => updateDraft({repeatCount: event.target.value})}
                  value={state.draft.repeatCount}>
                  <option value="1">한 번</option>
                  <option value="2">두 번 비교</option>
                  <option value="3">세 번 비교</option>
                </select>
              </label>
            </div>

            <details className="prompt-details" open>
              <summary>Prompt overrides</summary>
              <div className="prompt-fields">
                <label>
                  <span>Developer prompt</span>
                  <textarea
                    onChange={event => updateDraft({promptDeveloper: event.target.value})}
                    rows={4}
                    value={state.draft.promptDeveloper}
                  />
                </label>
                <label>
                  <span>User prompt</span>
                  <textarea
                    onChange={event => updateDraft({promptUser: event.target.value})}
                    rows={3}
                    value={state.draft.promptUser}
                  />
                </label>
                <label>
                  <span>Prompt version</span>
                  <input
                    aria-describedby="prompt-version-help"
                    readOnly
                    value={state.draft.promptVersion}
                  />
                  <small id="prompt-version-help">프롬프트 문장을 편집하면 입력 해시에서 자동 갱신돼요.</small>
                </label>
                <div className="form-grid model-grid">
                  <label>
                    <span>Model</span>
                    <input
                      disabled
                      onChange={event => updateDraft({model: event.target.value})}
                      value={state.draft.model}
                    />
                  </label>
                  <label>
                    <span>Max tokens</span>
                    <input
                      disabled={state.draft.runner === 'fixture'}
                      onChange={event => updateDraft({maxTokens: event.target.value})}
                      value={state.draft.maxTokens}
                    />
                  </label>
                  <label>
                    <span>Temperature</span>
                    <input
                      disabled={state.draft.runner === 'fixture'}
                      inputMode="decimal"
                      onChange={event => updateDraft({temperature: event.target.value})}
                      value={state.draft.temperature}
                    />
                  </label>
                </div>
                <label className="toggle-row">
                  <input
                    checked={effectiveBypassCache(state.draft.runner, bypassCache)}
                    disabled={state.draft.runner !== 'local-api'}
                    onChange={event => setBypassCache(event.target.checked)}
                    type="checkbox"
                  />
                  <span aria-hidden />
                  로컬 API의 동일 입력 DB 캐시를 우회해 fixture 검증을 다시 실행
                </label>
              </div>
            </details>

            {state.requestError ? (
              <div className="run-error" role="alert"><WarningCircle aria-hidden size={17} />{state.requestError}</div>
            ) : null}
            <div className="run-actions">
              <button className="run-button" disabled={state.requestStatus === 'running'} type="submit">
                <Play aria-hidden size={16} weight="fill" />
                {state.requestStatus === 'running' ? '실행 중…' : '보고서 실행'}
              </button>
              {state.requestStatus === 'running' ? (
                <button className="cancel-button" onClick={cancelRun} type="button">
                  <Stop aria-hidden size={15} weight="fill" />취소
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="lab-column preview-column" id="panel-preview" aria-label="보고서 미리보기" role="tabpanel">
          <div className="preview-toolbar">
            <div>
              <span>PREVIEW</span>
                  <strong>{selectedRun ? `Run ${selectedRun.runId.slice(0, 8)}` : '결정적 기본 보고서'}</strong>
            </div>
            <div className="preview-status">
              <CheckCircle aria-hidden size={15} weight="fill" />
              {selectedRun ? resultStatusLabel(selectedRun) : 'Fixture 준비됨'}
            </div>
          </div>
          <div className="preview-scroll" id="report-preview" tabIndex={-1}>
            {selectedRun && selectedRun.normalizedOutput === null ? (
              <EmptyState copy="이 실행은 완료된 정규화 보고서가 없어 미리보기를 표시하지 않아요." />
            ) : (
              <div className="phone-preview-frame">
                <ReportPreview report={visibleReport} onAction={setAnnouncement} />
              </div>
            )}
          </div>
        </section>

        <aside className="lab-column results-column" id="panel-results" aria-label="비교 및 실행 기록" role="tabpanel">
          <section className="results-section compare-section">
            <div className="column-heading compact">
              <div><span>COMPARE</span><h2>실행 비교</h2></div>
              <ArrowsLeftRight aria-hidden size={19} />
            </div>
            <div className="compare-selectors">
              <RunSelect
                label="왼쪽 실행"
                onChange={runId => dispatch({type: 'compare-left', runId})}
                runs={state.runs}
                value={state.leftRunId}
              />
              <RunSelect
                label="오른쪽 실행"
                onChange={runId => dispatch({type: 'compare-right', runId})}
                runs={state.runs}
                value={state.rightRunId}
              />
            </div>
            {leftRun || rightRun ? (
              <div className="compare-cards">
                <ComparisonCard compareTo={rightRun} label="A" run={leftRun} />
                <ComparisonCard compareTo={leftRun} label="B" run={rightRun} />
              </div>
            ) : (
              <EmptyState copy="보고서를 실행하면 두 결과의 상태와 지연 시간을 나란히 볼 수 있어요." />
            )}
          </section>

          <section className="results-section history-section">
            <div className="column-heading compact">
              <div><span>HISTORY</span><h2>실행 기록</h2></div>
              <ClockCounterClockwise aria-hidden size={19} />
            </div>
            {state.runs.length ? (
              <ol className="run-history">
                {state.runs.map(run => {
                  const selected = run.runId === state.selectedRunId;
                  const bookmarked = state.bookmarkedRunIds.includes(run.runId);
                  return (
                    <li className={selected ? 'run-item run-item-selected' : 'run-item'} key={run.runId}>
                      <button
                        aria-current={selected ? 'true' : undefined}
                        className="run-select-button"
                        onClick={() => {
                          dispatch({type: 'select-run', runId: run.runId});
                          setMobileTab('preview');
                        }}
                        type="button">
                        <span><strong>{run.stage}</strong><small>{formatRunTime(run.createdAt)}</small></span>
                        <span><em>{run.latencyMs}</em><small>{run.runner}</small></span>
                      </button>
                      <button
                        aria-label={bookmarked ? '북마크 해제' : '북마크'}
                        aria-pressed={bookmarked}
                        className="bookmark-button"
                        onClick={() => dispatch({type: 'toggle-bookmark', runId: run.runId})}
                        type="button">
                        <BookmarkSimple aria-hidden size={16} weight={bookmarked ? 'fill' : 'regular'} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState copy="아직 실행 기록이 없어요. Fixture runner는 네트워크 없이 결과를 만듭니다." />
            )}
          </section>
        </aside>
      </main>

      <span className="sr-only" aria-live="polite">{announcement}</span>
    </div>
  );
}

export default App;

function RunSelect({
  label,
  onChange,
  runs,
  value,
}: {
  label: string;
  onChange: (runId: string | null) => void;
  runs: LabRunResult[];
  value: string | null;
}) {
  return (
    <label>
      <span>{label}</span>
      <select onChange={event => onChange(event.target.value || null)} value={value ?? ''}>
        <option value="">선택 안 함</option>
        {runs.map(run => (
          <option key={run.runId} value={run.runId}>
            {run.stage} · {run.runId.slice(0, 8)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ComparisonCard({
  compareTo,
  label,
  run,
}: {
  compareTo: LabRunResult | null;
  label: string;
  run: LabRunResult | null;
}) {
  if (!run) {
    return <div className="compare-card compare-card-empty"><strong>{label}</strong><span>선택 없음</span></div>;
  }
  const differences = compareTo
    ? diffNormalizedOutputs(run.normalizedOutput, compareTo.normalizedOutput)
    : [];
  return (
    <div className="compare-card">
      <strong>{label}</strong>
      <span>{run.normalizedOutput?.hero.headline ?? '정규화 출력 없음'}</span>
      <dl>
        <div><dt>Stage</dt><dd>{run.stage}</dd></div>
        <div><dt>Prompt</dt><dd title={run.promptVersion}>{run.promptVersion}</dd></div>
        <div><dt>Input</dt><dd title={run.inputHash}>{run.inputHash.slice(0, 12)}</dd></div>
        <div><dt>Cache</dt><dd>{run.cacheHit ? '재사용' : '새 검증'}</dd></div>
        <div><dt>지연</dt><dd>{run.latencyMs}</dd></div>
        <div><dt>검증</dt><dd>{resultStatusLabel(run)}</dd></div>
      </dl>
      {compareTo ? (
        <div className="normalized-diff">
          <b>정규화 diff · {differences.length}개</b>
          {differences.length ? (
            <ul>
              {differences.slice(0, 3).map(difference => (
                <li key={difference.path}>
                  <code>{difference.path}</code>
                  <span title={label === 'A' ? difference.left : difference.right}>
                    {label === 'A' ? difference.left : difference.right}
                  </span>
                </li>
              ))}
            </ul>
          ) : <small>두 실행의 정규화 출력이 동일해요.</small>}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({copy}: {copy: string}) {
  return <div className="empty-state"><Flask aria-hidden size={22} /><p>{copy}</p></div>;
}
