// 얼굴 분석 완료 WS 이벤트(analysis_report_completed)를 폴링 루프에 연결하는 가벼운
// reportId별 pub/sub. 알림 코디네이터가 이벤트 수신 시 notify를, 폴링 루프가 대기 중
// subscribe를 걸어 다음 폴을 기다리지 않고 즉시 재조회하도록 깨운다(감지지연 ≈0).
// WS는 "가속기"일 뿐이라, 신호가 안 와도 기존 폴링이 그대로 완료를 보장한다(가산적).
type ReadyListener = () => void;

const listeners = new Map<string, Set<ReadyListener>>();

export function notifyAnalysisReportReady(reportId: string): void {
  const set = listeners.get(reportId);
  if (!set) {
    return;
  }
  // 스냅샷 복사 — 리스너가 구독 해제 중에 순회가 깨지지 않게.
  for (const listener of [...set]) {
    listener();
  }
}

export function subscribeAnalysisReportReady(
  reportId: string,
  listener: ReadyListener,
): () => void {
  let set = listeners.get(reportId);
  if (!set) {
    set = new Set();
    listeners.set(reportId, set);
  }
  set.add(listener);

  return () => {
    const current = listeners.get(reportId);
    if (!current) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(reportId);
    }
  };
}
