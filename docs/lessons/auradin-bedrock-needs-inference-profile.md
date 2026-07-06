# ap-northeast-2의 claude-3-5-sonnet-v2는 on-demand invoke 불가 — apac. inference profile을 써야 한다

`invoke_model(modelId="anthropic.claude-3-5-sonnet-20241022-v2:0")`은 서울 리전에서
`ValidationException: on-demand throughput isn't supported`로 실패한다.
`BEDROCK_ANALYSIS_INFERENCE_ID=apac.anthropic.claude-3-5-sonnet-20241022-v2:0`을 설정하면
`settings.effective_analysis_model_id`가 이 프로파일을 우선 사용해 해결된다
(.env 반영 완료, .env.example에도 기본값으로 명시).

- 발견 경로: WS2 라이브 스모크(2026-07-06). 유닛테스트(FakeBedrock)로는 절대 안 잡히는 종류의 실패 —
  라이브 프로브를 워크스트림 커밋 직후 1회 돌리는 게 싸게 먹힌다.
- 같은 `effective_analysis_model_id`를 쓰는 makeup_feedback_analysis/conference도 이 설정 하나로 같이 고쳐진다.
