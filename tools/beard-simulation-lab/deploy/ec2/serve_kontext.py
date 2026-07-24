#!/usr/bin/env python
"""FLUX Kontext 수염 제거 상주 추론 서버.

모델은 프로세스당 한 번만 로드한다. HTTP 요청은 로컬호스트에서만 받고,
프로덕션 프롬프트·guidance·steps는 run_kontext의 고정 정본만 사용한다.
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, "/home/ubuntu")
import run_kontext  # noqa: E402


PORT = int(os.environ.get("BEARD_SERVE_PORT", "8077"))
WORKDIR = "/home/ubuntu"

_pipe = None
_load_error = None
_stage = "loading"
_gpu_lock = threading.Lock()


def _load_model():
    global _pipe, _load_error, _stage
    try:
        started_at = time.time()
        pipe = run_kontext.load_pipe()
        print(f"[serve] 모델 로드 완료 {time.time() - started_at:.0f}s", flush=True)
        _stage = "warming"
        try:
            warm_input = os.path.join(WORKDIR, "_warm.jpg")
            if os.path.exists(warm_input):
                run_kontext.infer(
                    pipe,
                    warm_input,
                    os.path.join(WORKDIR, "_warm_out.png"),
                    seed=0,
                )
                print("[serve] 워밍 추론 완료", flush=True)
        except Exception as exc:
            print(f"[serve] 워밍 스킵: {exc}", flush=True)
        _pipe = pipe
        _stage = "ready"
        print(
            f"[serve] READY prompt={run_kontext.PROMPT_VERSION} "
            f"promptSha256={run_kontext.PROMPT_SHA256}",
            flush=True,
        )
    except Exception as exc:
        _load_error = f"{type(exc).__name__}: {exc}"
        _stage = "error"
        print(f"[serve] 모델 로드 실패: {_load_error}\n{traceback.format_exc()}", flush=True)


def _s3(args):
    subprocess.run(["aws", "s3", *args], check=True, capture_output=True, text=True)


def _do_infer(
    bucket,
    input_key,
    output_key,
    *,
    raw_output_key=None,
    seed=None,
    diagnostic_steps=None,
    diagnostic_guidance=None,
    diagnostic_space_compat=False,
):
    # 요청마다 고유 디렉터리를 사용한다. 다운로드·업로드는 GPU lock 밖에서 병렬로
    # 진행해도 서로의 _serve_in/_serve_out 파일을 덮어쓰지 않는다.
    with tempfile.TemporaryDirectory(prefix="beard-infer-", dir=WORKDIR) as request_dir:
        input_path = os.path.join(request_dir, "input")
        output_path = os.path.join(request_dir, "output.png")
        raw_output_path = (
            os.path.join(request_dir, "raw-output.png")
            if raw_output_key is not None
            else None
        )
        _s3(["cp", f"s3://{bucket}/{input_key}", input_path])
        with _gpu_lock:
            run_kontext.infer(
                _pipe,
                input_path,
                output_path,
                raw_out=raw_output_path,
                seed=seed,
                steps=diagnostic_steps,
                guidance=diagnostic_guidance,
                space_compat=diagnostic_space_compat,
            )
        _s3(["cp", output_path, f"s3://{bucket}/{output_key}"])
        if raw_output_key is not None:
            _s3(["cp", raw_output_path, f"s3://{bucket}/{raw_output_key}"])


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.rstrip("/") != "/ready":
            return self._send(404, {"error": "not found"})
        payload = {
            "ready": _stage == "ready",
            "stage": _stage,
            "error": _load_error,
            "promptVersion": run_kontext.PROMPT_VERSION,
            "promptSha256": run_kontext.PROMPT_SHA256,
        }
        return self._send(200 if _stage == "ready" else 503, payload)

    def do_POST(self):
        if self.path.rstrip("/") != "/infer":
            return self._send(404, {"error": "not found"})
        if _stage != "ready":
            return self._send(503, {"status": "warming", "stage": _stage})
        try:
            content_length = int(self.headers.get("content-length", 0))
            body = json.loads(self.rfile.read(content_length) or b"{}")
        except (ValueError, TypeError):
            return self._send(400, {"status": "error", "detail": "bad json"})

        # 제품 경로에서 검수 정본을 우회하지 못하게 한다.
        forbidden_overrides = {"prompt", "guidance", "steps"} & set(body)
        if forbidden_overrides:
            return self._send(
                400,
                {
                    "status": "error",
                    "detail": f"production overrides forbidden: {sorted(forbidden_overrides)}",
                },
            )

        bucket = body.get("bucket")
        input_key = body.get("input_key")
        output_key = body.get("output_key")
        raw_output_key = body.get("raw_output_key")
        requested_seed = body.get("seed")
        seed = (
            run_kontext.DEFAULT_SEED
            if requested_seed is None
            else requested_seed
        )
        diagnostic_steps = body.get("diagnostic_steps")
        diagnostic_guidance = body.get("diagnostic_guidance")
        diagnostic_space_compat = body.get("diagnostic_space_compat", True)
        if not (bucket and input_key and output_key):
            return self._send(
                400,
                {"status": "error", "detail": "bucket/input_key/output_key required"},
            )
        if seed is not None and (
            not isinstance(seed, int)
            or isinstance(seed, bool)
            or seed < 0
            or seed > 2**63 - 1
        ):
            return self._send(400, {"status": "error", "detail": "seed must be a non-negative int"})
        if diagnostic_steps is not None and (
            not isinstance(diagnostic_steps, int)
            or isinstance(diagnostic_steps, bool)
            or diagnostic_steps < 1
            or diagnostic_steps > 50
        ):
            return self._send(
                400,
                {"status": "error", "detail": "diagnostic_steps must be an int from 1 to 50"},
            )
        if diagnostic_guidance is not None and (
            not isinstance(diagnostic_guidance, (int, float))
            or isinstance(diagnostic_guidance, bool)
            or diagnostic_guidance < 1.0
            or diagnostic_guidance > 10.0
        ):
            return self._send(
                400,
                {
                    "status": "error",
                    "detail": "diagnostic_guidance must be a number from 1.0 to 10.0",
                },
            )
        if not isinstance(diagnostic_space_compat, bool):
            return self._send(
                400,
                {"status": "error", "detail": "diagnostic_space_compat must be a bool"},
            )

        try:
            started_at = time.time()
            _do_infer(
                bucket,
                input_key,
                output_key,
                raw_output_key=raw_output_key,
                seed=seed,
                diagnostic_steps=diagnostic_steps,
                diagnostic_guidance=diagnostic_guidance,
                diagnostic_space_compat=diagnostic_space_compat,
            )
            return self._send(
                200,
                {
                    "status": "ok",
                    "output_key": output_key,
                    "raw_output_key": raw_output_key,
                    "seconds": round(time.time() - started_at, 1),
                    "promptVersion": run_kontext.PROMPT_VERSION,
                    "promptSha256": run_kontext.PROMPT_SHA256,
                    "seed": seed,
                    "steps": (
                        diagnostic_steps
                        if diagnostic_steps is not None
                        else run_kontext.STEPS
                    ),
                    "guidance": (
                        diagnostic_guidance
                        if diagnostic_guidance is not None
                        else run_kontext.GUIDANCE
                    ),
                    "spaceCompat": diagnostic_space_compat,
                },
            )
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr[-300:] if exc.stderr else str(exc)
            return self._send(500, {"status": "error", "detail": f"s3: {detail}"})
        except Exception as exc:
            print(f"[serve] infer 실패: {traceback.format_exc()}", flush=True)
            return self._send(
                500,
                {"status": "error", "detail": f"{type(exc).__name__}: {exc}"},
            )


def main():
    threading.Thread(target=_load_model, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[serve] listening on 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
