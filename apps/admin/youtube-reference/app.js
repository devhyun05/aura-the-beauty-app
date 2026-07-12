(function () {
  "use strict";

  const VIDEO_ID = "51N580mF6fE";
  const STORAGE_KEY = "aura.youtube-reference.51N580mF6fE.v2";
  const AUTO_ANALYSIS = window.AURA_YOUTUBE_REFERENCE_ANALYSIS || {};
  const AUTO_METADATA = AUTO_ANALYSIS.metadata || {};
  const AUTO_NOTES = AUTO_ANALYSIS.notes || {};

  const DEFAULT_STATE = {
    metadata: {
      title: AUTO_METADATA.title || "자동 분석 대기",
      channel: AUTO_METADATA.channel || "",
      duration: AUTO_METADATA.duration || "",
      status: AUTO_METADATA.status || "unverified",
      assumption:
        AUTO_METADATA.assumption ||
        "현재 실행 환경에서 YouTube metadata/transcript를 안전하게 가져오지 못했습니다. 아래 분석은 영상 원문 검증 전의 회의용 프레임이며, 팀이 직접 영상을 보며 타임코드와 발화 근거를 채워야 합니다.",
    },
    notes: {
      overviewPurpose:
        AUTO_NOTES.overviewPurpose ||
        "목적: 최종 발표 전 팀 회의에서 이 영상을 함께 보며, 우리 발표의 첫 화면, 메시지 순서, 데모 진입 방식, 마무리 문장을 결정한다.\n\n사용법: 확인된 장면은 타임코드와 함께 기록하고, 확인하지 못한 내용은 가정으로 남긴다.",
      designInsights:
        AUTO_NOTES.designInsights ||
        "확인할 항목\n- 첫 화면에서 발표 주제와 기대 효과가 즉시 보이는가\n- 슬라이드 텍스트가 발표자의 말을 반복하지 않고 보완하는가\n- 핵심 장면 또는 데모 화면이 충분히 크게 보이는가\n- 색, 타이포, 여백이 메시지 우선순위를 만든는가",
      deliveryAnalysis:
        AUTO_NOTES.deliveryAnalysis ||
        "확인할 항목\n- 발표자가 한 문장으로 문제를 고정하는가\n- 기술 설명 전에 청중 관점의 필요성을 먼저 말하는가\n- 전환 문장이 다음 슬라이드의 이유를 만들어 주는가\n- 반복되는 핵심 표현이 있는가",
      structureAnalysis:
        AUTO_NOTES.structureAnalysis ||
        "확인할 항목\n- 도입부가 문제를 빠르게 제시하는가\n- 중반부에서 근거와 예시가 번갈아 나오는가\n- 데모 또는 결과가 너무 늦게 등장하지 않는가\n- 결론이 다음 행동 또는 기억할 메시지로 닫히는가",
      discussionNotes: AUTO_NOTES.discussionNotes || "",
    },
    transcript: AUTO_ANALYSIS.transcript || "",
    timecodes: AUTO_ANALYSIS.timecodes || [
      {
        id: "tc-opening",
        time: "00:00",
        title: "[예시] 오프닝 확인",
        evidence: "검증 전 예시: 첫 화면, 첫 문장, 주제 소개 방식을 직접 보며 기록",
        apply: "예시 적용안: 우리 발표 첫 30초에 문제와 AURA의 약속을 한 문장으로 고정",
        verified: false,
      },
      {
        id: "tc-problem",
        time: "01:00",
        title: "[예시] 문제 제기 구조",
        evidence: "검증 전 예시: 청중이 공감할 문제를 어떤 순서로 설명하는지 확인",
        apply: "예시 적용안: 기술 설명 전에 사용자 불편과 시장 맥락을 먼저 배치",
        verified: false,
      },
      {
        id: "tc-evidence",
        time: "03:00",
        title: "[예시] 증거/데모 배치",
        evidence: "검증 전 예시: 실제 화면, 비교, 수치, 장면 전환의 위치 확인",
        apply: "예시 적용안: 우리 데모 화면은 설명 이후가 아니라 핵심 주장 직후에 노출",
        verified: false,
      },
      {
        id: "tc-closing",
        time: "05:00",
        title: "[예시] 마무리 메시지",
        evidence: "검증 전 예시: 끝 문장이 어떤 기억 포인트를 남기는지 확인",
        apply: "예시 적용안: 최종 슬라이드는 기능 목록 대신 AURA가 만드는 변화로 마감",
        verified: false,
      },
    ],
    actions: AUTO_ANALYSIS.actions || [
      {
        id: "act-opening",
        label: "[예시] 첫 슬라이드에 서비스명, 핵심 문제, 발표의 약속을 함께 배치한다.",
        owner: "발표/디자인",
        done: false,
      },
      {
        id: "act-demo",
        label: "[예시] 데모 진입 전 한 문장으로 사용자가 왜 이 기능을 원하는지 말한다.",
        owner: "발표자",
        done: false,
      },
      {
        id: "act-proof",
        label: "[예시] 기술 구현 설명마다 사용자 가치 또는 검증 근거를 하나씩 연결한다.",
        owner: "개발/발표",
        done: false,
      },
      {
        id: "act-close",
        label: "[예시] 마지막 슬라이드의 기억 문장을 팀 전체가 같은 표현으로 합의한다.",
        owner: "전체",
        done: false,
      },
    ],
  };

  const statusText = {
    auto_metadata: "자동 metadata 분석 완료 / transcript 미검증",
    auto_transcript: "자동 transcript 분석 완료",
    unverified: "메타데이터/자막 수동 확인 필요",
    manual: "팀이 수동 입력 중",
    verified: "팀이 영상 확인 완료",
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  let state = loadState();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    const fallback = clone(DEFAULT_STATE);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        metadata: { ...fallback.metadata, ...(parsed.metadata || {}) },
        notes: { ...fallback.notes, ...(parsed.notes || {}) },
        timecodes: Array.isArray(parsed.timecodes) ? parsed.timecodes : fallback.timecodes,
        actions: Array.isArray(parsed.actions) ? parsed.actions : fallback.actions,
        transcript: typeof parsed.transcript === "string" ? parsed.transcript : fallback.transcript,
      };
    } catch (error) {
      console.warn("Failed to load saved reference notes.", error);
      return fallback;
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to save reference notes.", error);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function parseTimeToSeconds(value) {
    const trimmed = String(value).trim();
    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }

    if (!/^\d{1,2}:\d{2}$/.test(trimmed) && !/^\d+:\d{2}:\d{2}$/.test(trimmed)) {
      return null;
    }

    const parts = trimmed.split(":").map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part) || part < 0)) {
      return null;
    }

    const seconds = parts[parts.length - 1];
    const minutes = parts[parts.length - 2];
    if (seconds >= 60 || minutes >= 60) {
      return null;
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + minutes * 60 + seconds;
    }

    return minutes * 60 + seconds;
  }

  function secondsFromTime(value) {
    return parseTimeToSeconds(value) ?? 0;
  }

  function normalizeTime(value) {
    const total = parseTimeToSeconds(value);
    if (total === null) {
      return null;
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function setTimeInputError(message) {
    const input = $("#timeInput");
    input.setCustomValidity(message);
    input.reportValidity();
  }

  function youtubeTimeUrl(time) {
    return `https://youtu.be/${VIDEO_ID}?t=${secondsFromTime(time)}`;
  }

  function setPlayerStart(time) {
    const seconds = secondsFromTime(time);
    $("#videoFrame").src = `https://www.youtube.com/embed/${VIDEO_ID}?start=${seconds}&autoplay=1&rel=0`;
  }

  function setReadyStatus(message, isError = false) {
    const status = $("#appReadyStatus");
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function bindVideoStatus() {
    const iframe = $("#videoFrame");
    const status = $("#videoStatus");
    if (!iframe || !status) {
      return;
    }

    iframe.addEventListener("load", () => {
      status.textContent =
        "영상 영역을 불러왔습니다. 재생이 막히면 YouTube에서 열기 버튼으로 영상을 보고, 분석 메모는 이 페이지에서 계속 작성하세요.";
    });
  }

  function syncFields() {
    $$("[data-metadata]").forEach((field) => {
      const key = field.dataset.metadata;
      field.value = state.metadata[key] || "";
    });

    $$("[data-note]").forEach((field) => {
      const key = field.dataset.note;
      field.value = state.notes[key] || "";
    });

    $("#transcriptInput").value = state.transcript || "";
  }

  function updateStatus() {
    const status = state.metadata.status || "unverified";
    $("#statusLabel").textContent = statusText[status] || statusText.unverified;
  }

  function renderSourceSummary() {
    const container = $("#sourceSummary");
    if (!container) {
      return;
    }

    const source = AUTO_ANALYSIS.source || {};
    const rows = [
      ["영상", state.metadata.title || AUTO_METADATA.title || "확인 필요"],
      ["채널", state.metadata.channel || AUTO_METADATA.channel || "확인 필요"],
      ["길이", state.metadata.duration || AUTO_METADATA.duration || "확인 필요"],
      ["분석 방식", source.method || "수동/자동 혼합"],
      ["자막 상태", source.transcript || "확인 필요"],
    ];

    container.innerHTML = rows
      .map(
        ([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `,
      )
      .join("");
  }

  function updateTranscriptStats() {
    const transcript = state.transcript || "";
    const characters = transcript.length;
    const lines = transcript.trim() ? transcript.trim().split(/\n+/).length : 0;
    $("#transcriptStats").textContent = `${characters.toLocaleString("ko-KR")}자 / ${lines}줄`;
  }

  function renderTimecodes() {
    const container = $("#timecodeList");
    const sorted = [...state.timecodes].sort((a, b) => secondsFromTime(a.time) - secondsFromTime(b.time));

    container.innerHTML = sorted
      .map((item) => {
        const verifiedClass = item.verified ? " checked" : "";
        const sourceLabel = item.verified ? "확인됨" : "확인 전";

        return `
          <article class="timecode-card" data-id="${escapeHtml(item.id)}">
            <a class="time-pill" href="${youtubeTimeUrl(item.time)}" target="_blank" rel="noreferrer">${escapeHtml(item.time)}</a>
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p><strong>확인 포인트:</strong> ${escapeHtml(item.evidence)}</p>
              <p><strong>우리 발표 적용:</strong> ${escapeHtml(item.apply)}</p>
              <label class="verified-toggle">
                <input data-verify-timecode type="checkbox"${verifiedClass} />
                ${sourceLabel}
              </label>
            </div>
            <div class="card-actions">
              <button class="button" type="button" data-jump-timecode>플레이어 이동</button>
              <button class="button danger" type="button" data-delete-timecode>삭제</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderActions() {
    const container = $("#actionList");
    container.innerHTML = state.actions
      .map((item) => {
        const doneClass = item.done ? " done" : "";
        const checked = item.done ? " checked" : "";

        return `
          <article class="action-row${doneClass}" data-id="${escapeHtml(item.id)}">
            <input data-action-done type="checkbox" aria-label="액션 완료"${checked} />
            <span class="action-label">${escapeHtml(item.label)}</span>
            <input class="action-owner" data-action-owner type="text" value="${escapeHtml(item.owner || "")}" placeholder="담당" />
            <button class="button danger" type="button" data-delete-action>삭제</button>
          </article>
        `;
      })
      .join("");
  }

  function renderAll() {
    updateStatus();
    renderSourceSummary();
    updateTranscriptStats();
    renderTimecodes();
    renderActions();
  }

  function handleMetadataInput(event) {
    const key = event.target.dataset.metadata;
    state.metadata[key] = event.target.value;
    saveState();
    updateStatus();
  }

  function handleNoteInput(event) {
    const key = event.target.dataset.note;
    state.notes[key] = event.target.value;
    saveState();
  }

  function handleTranscriptInput(event) {
    state.transcript = event.target.value;
    saveState();
    updateTranscriptStats();
  }

  function handleTimecodeSubmit(event) {
    event.preventDefault();
    const time = normalizeTime($("#timeInput").value);
    const title = $("#timeTitleInput").value.trim();
    const evidence = $("#timeEvidenceInput").value.trim();
    const apply = $("#timeApplyInput").value.trim();

    if (!time) {
      setTimeInputError("타임코드는 초 단위 숫자, MM:SS, 또는 H:MM:SS 형식으로 입력하세요.");
      return;
    }
    $("#timeInput").setCustomValidity("");

    if (!title || !evidence || !apply) {
      return;
    }

    state.timecodes.push({
      id: makeId("tc"),
      time,
      title,
      evidence,
      apply,
      verified: false,
    });

    saveState();
    event.currentTarget.reset();
    renderTimecodes();
  }

  function handleTimecodeListClick(event) {
    const card = event.target.closest("[data-id]");
    if (!card) {
      return;
    }

    const id = card.dataset.id;
    const item = state.timecodes.find((timecode) => timecode.id === id);
    if (!item) {
      return;
    }

    if (event.target.matches("[data-jump-timecode]")) {
      setPlayerStart(item.time);
    }

    if (event.target.matches("[data-delete-timecode]")) {
      state.timecodes = state.timecodes.filter((timecode) => timecode.id !== id);
      saveState();
      renderTimecodes();
    }
  }

  function handleTimecodeListChange(event) {
    if (!event.target.matches("[data-verify-timecode]")) {
      return;
    }

    const card = event.target.closest("[data-id]");
    const item = state.timecodes.find((timecode) => timecode.id === card.dataset.id);
    if (!item) {
      return;
    }

    item.verified = event.target.checked;
    saveState();
    renderTimecodes();
  }

  function handleActionSubmit(event) {
    event.preventDefault();
    const label = $("#actionLabelInput").value.trim();
    const owner = $("#actionOwnerInput").value.trim();

    if (!label) {
      return;
    }

    state.actions.push({
      id: makeId("act"),
      label,
      owner,
      done: false,
    });

    saveState();
    event.currentTarget.reset();
    renderActions();
  }

  function handleActionListClick(event) {
    if (!event.target.matches("[data-delete-action]")) {
      return;
    }

    const card = event.target.closest("[data-id]");
    state.actions = state.actions.filter((item) => item.id !== card.dataset.id);
    saveState();
    renderActions();
  }

  function handleActionListChange(event) {
    const row = event.target.closest("[data-id]");
    if (!row) {
      return;
    }

    const item = state.actions.find((action) => action.id === row.dataset.id);
    if (!item) {
      return;
    }

    if (event.target.matches("[data-action-done]")) {
      item.done = event.target.checked;
    }

    if (event.target.matches("[data-action-owner]")) {
      item.owner = event.target.value;
      saveState();
      return;
    }

    saveState();
    renderActions();
  }

  function exportState() {
    const payload = {
      exportedAt: new Date().toISOString(),
      sourceUrl: `https://youtu.be/${VIDEO_ID}`,
      ...state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aura-youtube-reference-${VIDEO_ID}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetState() {
    const ok = window.confirm("저장된 로컬 메모를 기본 회의 템플릿으로 되돌릴까요?");
    if (!ok) {
      return;
    }

    state = clone(DEFAULT_STATE);
    saveState();
    syncFields();
    renderAll();
  }

  function bindEvents() {
    $$("[data-metadata]").forEach((field) => field.addEventListener("input", handleMetadataInput));
    $$("[data-note]").forEach((field) => field.addEventListener("input", handleNoteInput));
    $("#transcriptInput").addEventListener("input", handleTranscriptInput);
    $("#timeInput").addEventListener("input", () => $("#timeInput").setCustomValidity(""));
    $("#timecodeForm").addEventListener("submit", handleTimecodeSubmit);
    $("#timecodeList").addEventListener("click", handleTimecodeListClick);
    $("#timecodeList").addEventListener("change", handleTimecodeListChange);
    $("#actionForm").addEventListener("submit", handleActionSubmit);
    $("#actionList").addEventListener("click", handleActionListClick);
    $("#actionList").addEventListener("input", handleActionListChange);
    $("#actionList").addEventListener("change", handleActionListChange);
    $("#exportButton").addEventListener("click", exportState);
    $("#resetButton").addEventListener("click", resetState);
  }

  syncFields();
  renderAll();
  bindEvents();
  bindVideoStatus();
  setReadyStatus("앱 준비됨: 메모 저장, 타임코드 추가, 액션 체크 기능이 활성화됐습니다.");
})();
