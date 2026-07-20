#!/usr/bin/env python
"""FLUX.1 Kontext dev — 수염 제거 상주 추론 서버.

목적: 매 요청마다 12B 모델을 재로드(~4~5분)하던 것을 없앤다. 서버가 뜰 때 모델을
GPU에 1회 로드해 상주시키고, 이후 요청은 로드 비용 없이 순수 추론(~20초대)만 한다.

- systemd(beard-kontext.service)가 인스턴스 부팅(기상)마다 자동 기동 → 모델 로드.
- run_on_instance.sh(경량 클라이언트)가 /ready 대기 후 POST /infer 로 요청.
- S3 다운/업로드는 서버가 `aws s3 cp` 서브프로세스로 수행(venv에 boto3 불필요).
- GPU는 1장뿐 → 추론은 Lock으로 직렬화(동시 요청은 큐잉).

엔드포인트:
  GET  /ready  -> 200 {"ready":true} | 503 {"ready":false,"stage":...}
  POST /infer  {bucket, input_key, output_key} -> 200 {"status":"ok"} | 500 {"status":"error"}

env: BEARD_SERVE_PORT(기본 8077)
"""
import json
import os
import subprocess
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "/home/ubuntu")
import run_kontext  # noqa: E402  (load_pipe / infer 재사용)

PORT = int(os.environ.get("BEARD_SERVE_PORT", "8077"))
WORKDIR = "/home/ubuntu"

_pipe = None
_load_error = None
_stage = "loading"          # loading -> warming -> ready | error
_gpu_lock = threading.Lock()  # GPU 1장 → 추론 직렬화


def _load_model():
    """백그라운드에서 모델 로드 + 워밍(첫 추론 커널 초기화)."""
    global _pipe, _load_error, _stage
    try:
        t0 = time.time()
        pipe = run_kontext.load_pipe()
        print(f"[serve] 모델 로드 완료 {time.time() - t0:.0f}s", flush=True)
        # 워밍: 첫 추론은 CUDA 커널 초기화로 느리므로 미리 1회 돌려 상태를 ready로.
        _stage = "warming"
        try:
            warm = os.path.join(WORKDIR, "_warm.jpg")
            if os.path.exists(warm):
                run_kontext.infer(pipe, warm, os.path.join(WORKDIR, "_warm_out.png"))
                print("[serve] 워밍 추론 완료", flush=True)
        except Exception as e:  # 워밍 실패는 치명적 아님
            print(f"[serve] 워밍 스킵: {e}", flush=True)
        _pipe = pipe
        _stage = "ready"
        print("[serve] READY", flush=True)
    except Exception as e:
        _load_error = f"{type(e).__name__}: {e}"
        _stage = "error"
        print(f"[serve] 모델 로드 실패: {_load_error}\n{traceback.format_exc()}", flush=True)


def _s3(args):
    subprocess.run(["aws", "s3"] + args, check=True, capture_output=True, text=True)


def _do_infer(bucket, input_key, output_key, prompt=None, guidance=None, steps=None):
    in_path = os.path.join(WORKDIR, "_serve_in")
    out_path = os.path.join(WORKDIR, "_serve_out.png")
    _s3(["cp", f"s3://{bucket}/{input_key}", in_path])
    with _gpu_lock:                      # GPU 직렬화
        run_kontext.infer(_pipe, in_path, out_path, prompt=prompt, guidance=guidance, steps=steps)
    _s3(["cp", out_path, f"s3://{bucket}/{output_key}"])


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):           # 액세스 로그 억제(journald가 stdout만)
        pass

    def do_GET(self):
        if self.path.rstrip("/") == "/ready":
            if _stage == "ready":
                return self._send(200, {"ready": True})
            return self._send(503, {"ready": False, "stage": _stage, "error": _load_error})
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/infer":
            return self._send(404, {"error": "not found"})
        if _stage != "ready":
            return self._send(503, {"status": "warming", "stage": _stage})
        try:
            n = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, TypeError):
            return self._send(400, {"status": "error", "detail": "bad json"})
        bucket = body.get("bucket"); ik = body.get("input_key"); ok = body.get("output_key")
        if not (bucket and ik and ok):
            return self._send(400, {"status": "error", "detail": "bucket/input_key/output_key required"})
        try:
            t0 = time.time()
            # prompt/guidance/steps는 선택적 튜닝 override(앱은 안 보냄 → 확정 기본값 사용).
            _do_infer(bucket, ik, ok,
                      prompt=body.get("prompt"), guidance=body.get("guidance"), steps=body.get("steps"))
            return self._send(200, {"status": "ok", "output_key": ok, "seconds": round(time.time() - t0, 1)})
        except subprocess.CalledProcessError as e:
            return self._send(500, {"status": "error", "detail": f"s3: {e.stderr[-300:] if e.stderr else e}"})
        except Exception as e:
            print(f"[serve] infer 실패: {traceback.format_exc()}", flush=True)
            return self._send(500, {"status": "error", "detail": f"{type(e).__name__}: {e}"})


def main():
    threading.Thread(target=_load_model, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[serve] listening on 127.0.0.1:{PORT} (모델 로딩 백그라운드)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
