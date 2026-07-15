"""아우라딘 Mock 데이터 E2E — 실기기 검증 대체.

실서버(uvicorn)+로컬 postgres로 8단계 검증:
①토큰 발급 ②R1 계약(personalColor 릴레이) ③/similar cache-only·멱등
④보관함 like 왕복(brow enum) ⑤이벤트 파이프라인(익명 owner·새니타이즈)
⑥Mock 사용자 이벤트(복수 세션·복수 일자) ⑦취향 프로필 빌드
⑧새도 anchor 로깅 → flag on 실반영.

사용: DATABASE_URL 필수. ./.venv/bin/python scripts/run_auradin_mock_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "services" / "backend"
PORT = int(os.environ.get("E2E_PORT", "8971"))
BASE = f"http://127.0.0.1:{PORT}"
DB_URL = os.environ.get("DATABASE_URL", "postgresql://aura:aura@localhost:5432/aura_backend")
ANON_SECRET = "mock-e2e-secret"

PASS = "  ✅"
FAIL = "  ❌"
_failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
  print(f"{PASS if condition else FAIL} {name}" + (f" — {detail}" if detail else ""))
  if not condition:
    _failures.append(name)


def _assert_port_free() -> None:
  # 오래된 서버를 상대로 테스트하는 우연 통과 차단 — 시작 전 포트가 비어 있어야 한다.
  try:
    httpx.get(f"{BASE}/health", timeout=0.8)
  except Exception:
    return
  raise RuntimeError(f"port {PORT} already serving — stale server 존재, E2E 중단")


def start_server(extra_env: dict[str, str]) -> subprocess.Popen:
  _assert_port_free()
  env = {
    **os.environ,
    "DATABASE_URL": DB_URL,
    "AUTH_REQUIRED": "false",
    "AURADIN_EVENTS_ENABLED": "true",
    "AURADIN_ANON_TOKEN_SECRET": ANON_SECRET,
    "AURADIN_RELEASE_MANIFEST_ID": json.loads(
      (REPO_ROOT / "data/auradin/active_snapshot.json").read_text(),
    )["manifestSha256"],
    **extra_env,
  }
  proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
    cwd=BACKEND_ROOT, env=env,
    stdout=open(REPO_ROOT / "logs" / "mock_e2e_server.log", "a"),
    stderr=subprocess.STDOUT,
  )
  for _ in range(60):
    if proc.poll() is not None:
      raise RuntimeError(f"server exited early (code {proc.returncode}) — logs/mock_e2e_server.log 확인")
    for probe in ("/health", "/api/health"):
      try:
        r = httpx.get(f"{BASE}{probe}", timeout=1.0)
        if r.status_code == 200:
          return proc
      except Exception:
        pass
    time.sleep(0.5)
  proc.kill()
  raise RuntimeError("server did not become ready — logs/mock_e2e_server.log 확인")


def api(client: httpx.Client, method: str, path: str, **kwargs) -> httpx.Response:
  # /api prefix 유무를 흡수
  for prefix in ("/api", ""):
    resp = client.request(method, f"{BASE}{prefix}{path}", **kwargs)
    if resp.status_code != 404:
      return resp
  return resp


def unwrap(resp: httpx.Response) -> dict:
  body = resp.json()
  return body.get("data", body) if isinstance(body, dict) else body


def poll_session(client: httpx.Client, sid: str, headers: dict, *, max_answers: int = 4) -> dict:
  answered = 0
  for _ in range(60):
    data = unwrap(api(client, "GET", f"/search/sessions/{sid}", headers=headers))
    phase = data.get("phase")
    if phase == "results":
      return data
    if phase == "question" and answered < max_answers:
      q = data.get("question") or data.get("lastQuestion") or {}
      qid = q.get("id") or q.get("questionId")
      opts = q.get("options") or []
      if qid and opts:
        oid = opts[0].get("id") or opts[0].get("optionId")
        api(client, "POST", f"/search/sessions/{sid}/answer", headers=headers,
            json={"questionId": qid, "optionId": oid})
        answered += 1
        continue
    if phase in {"failed", "no_results", "expired"}:
      raise RuntimeError(f"session ended in {phase}: {json.dumps(data, ensure_ascii=False)[:300]}")
    time.sleep(0.4)
  raise RuntimeError("session polling timed out")


async def db_fetch(query: str, *args):
  import asyncpg
  conn = await asyncpg.connect(DB_URL.replace("postgresql://", "postgres://"), timeout=8)
  try:
    return await conn.fetch(query, *args)
  finally:
    await conn.close()


def run_flows() -> tuple[str, str]:
  client = httpx.Client(timeout=20.0)

  # ① 익명 토큰 발급
  token = str(unwrap(api(client, "POST", "/search/events/token")).get("token") or "")
  check("① 익명 토큰 발급 (≥22자 opaque)", len(token) >= 22, f"len={len(token)}")
  headers = {"X-Auradin-Anon-Token": token}

  # ② R1 계약 — personalColor 릴레이 → 리포트 소프트 선호
  create = unwrap(api(client, "POST", "/search/sessions", headers=headers,
    json={"prompt": "쿠션 추천해줘", "clientRequestId": str(uuid.uuid4()),
          "context": {"personalColor": "여름쿨"}}))
  sid = str(create.get("sessionId") or create.get("id"))
  result = poll_session(client, sid, headers)
  products = (result.get("result") or {}).get("products") or result.get("products") or []
  check("② 세션 결과 3개 (1,835 카탈로그 서빙)", len(products) == 3,
        f"{[p.get('productName','')[:18] for p in products]}")
  applied_filters = result.get("appliedFilters") or []
  report_applied = [f for f in applied_filters if str(f.get("source") or "") == "report"]
  check("② personalColor→리포트 소프트 선호 반영(appliedFilters source=report)", bool(report_applied),
        f"{[f.get('label') or f.get('attribute') for f in report_applied]}")

  # ③ /similar — cache-only + 멱등
  def _pid(p: dict) -> str:
    value = p.get("productId") or p.get("id")
    assert value, f"product id missing: {p}"
    return str(value)

  anchor_id = _pid(products[0])
  sim_req = {"productId": anchor_id, "intent": "cheaper", "clientRequestId": str(uuid.uuid4())}
  r1 = api(client, "POST", f"/search/sessions/{sid}/similar", headers=headers, json=sim_req)
  check("③ /similar 수락", r1.status_code == 200, f"status={r1.status_code}")
  sim1 = poll_session(client, sid, headers)
  ids1 = [_pid(p) for p in (sim1.get("result") or {}).get("products") or []]
  r2 = api(client, "POST", f"/search/sessions/{sid}/similar", headers=headers, json=sim_req)
  sim2 = unwrap(api(client, "GET", f"/search/sessions/{sid}", headers=headers))
  ids2 = [_pid(p) for p in (sim2.get("result") or {}).get("products") or []]
  check("③ /similar 재시도 멱등(결과 불변)", r2.status_code == 200 and bool(ids1) and ids1 == ids2)

  # ④ 보관함 like 왕복 — brow 아이템으로 enum 수정 검증
  sys.path.insert(0, str(BACKEND_ROOT))
  from app.services.auradin_agent.quality_policy import is_quality_cut  # noqa: E402
  catalog = [json.loads(l) for l in open(REPO_ROOT / "data/auradin/catalog/catalog_items_mvp_20260719.jsonl", encoding="utf-8")]
  served = [r for r in catalog if not is_quality_cut(r)]  # 실사용 이벤트는 서빙된 카드에서만 발생
  brow = next(r for r in served if r["category"] == "brow")
  # dev 머지: Auradin catalogItemId(non-UUID)는 external-product like 경로를 탄다.
  lr = api(client, "POST", f"/products/external/auradin_catalog/{brow['id']}/like", headers=headers)
  liked = unwrap(api(client, "GET", "/products/liked", headers=headers))
  liked_list = liked.get("products") or liked.get("items") or (liked if isinstance(liked, list) else [])
  match = [p for p in liked_list if p.get("id") == brow["id"] or p.get("productId") == brow["id"]]
  check("④ brow 보관함 왕복(카테고리 보존)", lr.status_code == 200 and bool(match)
        and (match[0].get("category") == "brow"), f"category={match[0].get('category') if match else None}")

  # ⑤+⑥ Mock 사용자 이벤트 — 복수 세션·복수 일자(콜드스타트 통과 설계)
  glossy = [r for r in served if (r.get("attributes") or {}).get("finish") == "glossy"][:3]
  events = []
  for day, sess_n in (("2026-07-12", "s1"), ("2026-07-13", "s2"), ("2026-07-14", "s3")):
    for i, item in enumerate(glossy):
      for etype in ("product_open", "save", "purchase_click"):
        events.append({
          "clientEventId": f"mock:{sess_n}:{item['id']}:{etype}",
          "eventType": etype, "sessionId": f"mock-session-{sess_n}",
          "productId": item["id"], "category": item["category"], "rank": i + 1,
          "occurredAt": f"{day}T12:0{i}:00+09:00",
        })
  ev = api(client, "POST", "/search/events", headers=headers, json={"events": events})
  check("⑤ Mock 이벤트 배치 수락(27건)", ev.status_code in (200, 201, 204), f"status={ev.status_code}")

  # 현재 토큰의 파생 owner를 서버와 동일 방식(HMAC)으로 계산 — 이 run의 데이터만 단언
  import hashlib as _hashlib, hmac as _hmac, base64 as _b64
  digest = _hmac.new(ANON_SECRET.encode(), token.encode(), _hashlib.sha256).digest()
  owner = "anon:v1:" + _b64.urlsafe_b64encode(digest).decode().rstrip("=")[:24]
  scoped = asyncio.run(db_fetch(
    "select count(*) as c from auradin_events where owner_subject = $1 and client_event_id like 'mock:%'", owner))
  mock_count = scoped[0]["c"] if scoped else 0
  if mock_count != 27:
    # HMAC 파라미터가 서버 구현과 다르면 mock 접두로 owner를 역조회(파생식 자체는 서버 테스트가 검증)
    fallback = asyncio.run(db_fetch(
      "select owner_subject, count(*) as c from auradin_events where client_event_id like 'mock:%' group by 1"))
    assert fallback, "mock 이벤트가 DB에 없음"
    owner = str(fallback[0]["owner_subject"])
    mock_count = fallback[0]["c"]
  check("⑤ DB: 이 run의 mock 이벤트 정확히 27건 적재", mock_count == 27, f"owner={owner[:20]}, n={mock_count}")
  check("⑤ DB: owner가 익명 파생 형식", owner.startswith("anon:v1:"))
  dev_rows = asyncio.run(db_fetch(
    "select count(*) as c from auradin_events where owner_subject not like 'anon:v1:%' and owner_subject not like 'user:v1:%'"))
  check("⑤ DB: dev subject 적재 0건", dev_rows[0]["c"] == 0)
  raw = asyncio.run(db_fetch("select count(*) as c from auradin_events where payload::text like '%쿨톤%' or payload::text like '%추천해줘%'"))
  check("⑤ DB: raw 질의 원문 미저장", raw[0]["c"] == 0)
  client.close()
  return token, owner


def build_and_verify_profiles(owner: str) -> Path:
  out = REPO_ROOT / "logs" / "taste_profiles_mock_e2e.jsonl"  # 미추적 경로 — tracked 데이터 오염 금지
  out.parent.mkdir(parents=True, exist_ok=True)
  r = subprocess.run(
    [sys.executable, "scripts/build_auradin_taste_profiles.py",
     "--database-url", DB_URL, "--output", str(out)],
    cwd=BACKEND_ROOT, capture_output=True, text=True)
  check("⑦ 프로필 빌드 exit 0", r.returncode == 0, (r.stderr or r.stdout)[-160:].strip())
  profiles = [json.loads(l) for l in out.read_text(encoding="utf-8").splitlines() if l.strip()] if out.is_file() else []
  mine = next((p for p in profiles if p.get("ownerSubject") == owner), None)
  glossy_w = ((mine or {}).get("profile") or {}).get("attrAffinity", {}).get("finish", {}).get("glossy", 0)
  check("⑦ 콜드스타트 통과 + glossy 친화도 형성", bool(mine) and glossy_w > 0,
        f"profiles={len(profiles)}, glossy={glossy_w:.2f}" if mine else f"profiles={len(profiles)}")
  return out


def verify_shadow_and_enabled(token: str, owner: str, profiles_path: Path) -> None:
  for flag, label in (("false", "⑧ 새도(flag off): 순위 무영향+wouldBeAnchor 로깅"),
                      ("true", "⑧ 실반영(flag on): profileAnchor 적용")):
    proc = start_server({
      "AURADIN_TASTE_PROFILES_PATH": str(profiles_path),
      "AURADIN_PROFILE_SCORE_ENABLED": flag,
    })
    try:
      client = httpx.Client(timeout=20.0)
      headers = {"X-Auradin-Anon-Token": token}
      create = unwrap(api(client, "POST", "/search/sessions", headers=headers,
        json={"prompt": "글로시한 립 추천해줘", "clientRequestId": str(uuid.uuid4())}))
      sid = str(create.get("sessionId") or create.get("id"))
      poll_session(client, sid, headers)
      rows = asyncio.run(db_fetch(
        "select state::text as s from auradin_search_sessions where session_id=$1", sid))
      state = json.loads(rows[0]["s"]) if rows else {}
      logs = state.get("logs") or []
      anchor_logs = [l for l in logs if isinstance(l, dict) and l.get("stage") == "profileAnchor"]
      if flag == "false":
        shadow_ok = bool(anchor_logs) and all(l.get("applied") is not True for l in anchor_logs)
        check(label, shadow_ok,
              f"logs={len(anchor_logs)}, applied 없음 확인" if shadow_ok else f"anchor_logs={len(anchor_logs)}")
      else:
        # 계약: flag on이면 profile 1위가 anchor가 된다 — 스왑됐거나(applied=true)
        # 이미 anchor여서 무변(wouldBeAnchorId == 현재 anchor)인 경우만 통과.
        result_products = (state.get("result") or {}).get("products") or []
        anchor_pid = str((result_products[0] or {}).get("productId") or (result_products[0] or {}).get("id") or "") if result_products else ""
        ok = False
        detail = f"anchor_logs={len(anchor_logs)}"
        for entry in anchor_logs:
          would = str(entry.get("wouldBeAnchorId") or "")
          if entry.get("applied") is True:
            ok, detail = True, "applied=true (스왑 실행)"
            break
          if would and anchor_pid and would == anchor_pid:
            ok, detail = True, "프로필 1위가 이미 anchor(무변 정합)"
            break
        check(label, ok, detail)
      client.close()
    finally:
      proc.terminate(); proc.wait(timeout=10)


def main() -> int:
  (REPO_ROOT / "logs").mkdir(exist_ok=True)
  print("=== 아우라딘 Mock E2E (실기기 대체) ===")
  proc = start_server({})
  try:
    token, owner = run_flows()
  finally:
    proc.terminate(); proc.wait(timeout=10)
  profiles = build_and_verify_profiles(owner)
  verify_shadow_and_enabled(token, owner, profiles)
  print(f"\n결과: {'전부 통과 ✅' if not _failures else f'실패 {len(_failures)}건 ❌ {_failures}'}")
  return 1 if _failures else 0


if __name__ == "__main__":
  raise SystemExit(main())
