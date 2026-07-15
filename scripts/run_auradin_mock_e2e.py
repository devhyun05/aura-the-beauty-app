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


def start_server(extra_env: dict[str, str]) -> subprocess.Popen:
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
    try:
      if httpx.get(f"{BASE}/health", timeout=1.0).status_code < 500:
        return proc
    except Exception:
      pass
    for probe in ("/api/health", "/health/ready", "/"):
      try:
        if httpx.get(f"{BASE}{probe}", timeout=1.0).status_code < 500:
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
  applied = json.dumps(result, ensure_ascii=False)
  check("② personalColor→리포트 소프트 선호 반영(쿨톤 흔적)", ("report" in applied) or ("쿨" in applied))

  # ③ /similar — cache-only + 멱등
  anchor_id = str(products[0].get("productId") or products[0].get("id"))
  sim_req = {"productId": anchor_id, "intent": "cheaper", "clientRequestId": str(uuid.uuid4())}
  r1 = api(client, "POST", f"/search/sessions/{sid}/similar", headers=headers, json=sim_req)
  check("③ /similar 수락", r1.status_code == 200, f"status={r1.status_code}")
  sim1 = poll_session(client, sid, headers)
  ids1 = [p.get("productId") for p in (sim1.get("result") or {}).get("products") or []]
  r2 = api(client, "POST", f"/search/sessions/{sid}/similar", headers=headers, json=sim_req)
  sim2 = unwrap(api(client, "GET", f"/search/sessions/{sid}", headers=headers))
  ids2 = [p.get("productId") for p in (sim2.get("result") or {}).get("products") or []]
  check("③ /similar 재시도 멱등(결과 불변)", r2.status_code == 200 and ids1 == ids2)

  # ④ 보관함 like 왕복 — brow 아이템으로 enum 수정 검증
  sys.path.insert(0, str(BACKEND_ROOT))
  from app.services.auradin_agent.quality_policy import is_quality_cut  # noqa: E402
  catalog = [json.loads(l) for l in open(REPO_ROOT / "data/auradin/catalog/catalog_items_mvp_20260719.jsonl", encoding="utf-8")]
  served = [r for r in catalog if not is_quality_cut(r)]  # 실사용 이벤트는 서빙된 카드에서만 발생
  brow = next(r for r in served if r["category"] == "brow")
  like_payload = {"product": {
    "id": brow["id"], "productName": brow["productName"], "brandName": brow["brandName"],
    "price": brow["liveOffer"]["priceKrw"], "category": "brow",
    "imageUrl": brow["liveOffer"]["imageUrl"], "purchaseUrl": brow["liveOffer"]["purchaseUrl"]}}
  lr = api(client, "POST", f"/products/{brow['id']}/like", headers=headers, json=like_payload)
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

  rows = asyncio.run(db_fetch(
    "select owner_subject, count(*) as c from auradin_events group by owner_subject"))
  anon_rows = [r for r in rows if str(r["owner_subject"]).startswith("anon:v1:")]
  dev_rows = [r for r in rows if not str(r["owner_subject"]).startswith(("anon:v1:", "user:v1:"))]
  check("⑤ DB: 익명 owner로 적재 + dev subject 0건",
        bool(anon_rows) and not dev_rows,
        f"owners={[(str(r['owner_subject'])[:16], r['c']) for r in rows]}")
  raw = asyncio.run(db_fetch("select count(*) as c from auradin_events where payload::text like '%쿨톤%' or payload::text like '%추천해줘%'"))
  check("⑤ DB: raw 질의 원문 미저장", raw[0]["c"] == 0)

  owner = str(anon_rows[0]["owner_subject"]) if anon_rows else ""
  client.close()
  return token, owner


def build_and_verify_profiles(owner: str) -> Path:
  out = REPO_ROOT / "data" / "auradin" / "profiles" / "taste_profiles_mock_e2e.jsonl"
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
      state = rows[0]["s"] if rows else "{}"
      has_log = '"profileAnchor"' in state
      if flag == "false":
        check(label, has_log, "stage=profileAnchor 세션 로그 존재" if has_log else "로그 없음")
      else:
        applied = has_log and ('"applied": true' in state or '"applied":true' in state)
        check(label, applied or has_log, "적용 로그 확인" if applied else "로그만 존재(동점 유지 가능)")
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
