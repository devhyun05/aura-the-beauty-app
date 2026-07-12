# Project Guidelines

## Agent Completion
- This repository does not use `agentctl complete` as a required completion or notification step.
- Do not run `.agents/bin/agentctl.py complete` or mention its absence in task handoffs unless the user explicitly asks for that command.

## Mobile
- For mobile frontend work, read `docs/mobile/FRONTEND_WORK_GUIDE.md` first.
- Follow the existing Expo React Native, TypeScript, React Navigation, and Tamagui patterns.

## Backend And DB
- Keep FastAPI routes under `services/backend/app/api` and use the existing `success()` envelope with camelCase responses.
- Writes must enforce the existing authentication and database requirements.
- Update both `docs/backend/schema.sql` and `docs/backend/aws-postgresql-schema.dbml` for schema changes.
- Keep schema SQL idempotent with the existing `create table if not exists` style.

## Quality
- Prefer existing patterns and helpers over new abstractions.
- Avoid unrelated refactors, temporary logs, broad `any`, and unused code.
- Add focused tests for changed contracts, behavior, mapping, validation, and navigation.
- Run mobile typecheck when mobile code changes.
- Do not revert user changes unless explicitly asked.
