# 백엔드 테스트의 Settings(database_url=None)는 .env를 읽지 않는다 — enrich가 테스트에서 자동 OFF

`get_settings()`만 `_env_file=ENV_FILES`로 `.env`(실 AWS/Naver 자격증명)를 로드한다.
테스트가 쓰는 `Settings(database_url=None, ...)` 직접 생성은 프로세스 env var만 본다 →
로컬 `.env`에 실크레덴셜이 있어도 테스트는 자격증명 없음으로 돌고, enrich(라이브 Naver·Bedrock 카피)는
"턴키: 크레덴셜 없으면 graceful fallback" 경로로 자동 비활성화된다.

- 결정성: 외부 네트워크를 부르는 테스트를 만들려면 명시적으로 `naver_shopping_client_id=...` 등
  가짜 값을 넣고 fetch/클라이언트를 monkeypatch 한다 (`tests/test_auradin_enrichment.py` 패턴).
- 반대로 실서버 기동(`uvicorn`)은 `.env`를 읽으므로 enrich가 자동 ON — 라이브 검증은 WS5 하네스로.
