# 제품추천 V2 운영·보안·활성화 가이드

이 문서는 구현된 기능을 외부 데이터가 준비됐을 때 설정만으로 활성화하기 위한 운영 계약이다. 실제 상품 사용권, 실제 사용자 모수, 법무 승인, production 배포 승인을 코드가 대신하지 않는다. 준비되지 않은 기능은 빈 상태 또는 비활성 상태로 유지하며 fixture 상품·사용자를 운영 추천으로 대체하지 않는다.

## 기본 안전 상태

- `LEGACY_NAVER_PRODUCT_SEARCH=false`: Naver Shopping Search 결과를 신규 catalog 상품으로 사용하지 않는다.
- staging/production에서는 `LEGACY_NAVER_PRODUCT_SEARCH=true` 설정을 거부한다. 로컬 회귀용 seed catalog가 운영 추천으로 노출될 수 없도록 시작 단계에서 차단한다.
- AURADIN의 Naver 라이브 발견 슬롯도 같은 legacy flag가 없으면 `trusted_catalog_only`로 종료한다. 운영 AURADIN은 권리 검증 DB catalog 밖의 title-inferred 상품을 결과에 합치지 않는다.
- `ENGAGEMENT_PERSONALIZATION_V1=false`, `COHORT_RECOMMENDATIONS_V1=false`: 실제 사용자 이벤트와 cohort 기능은 기본 비활성이다.
- `EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE`는 비워 둔다. `1`은 개발 빌드(`__DEV__`)에서만 명시적 화면 fixture를 허용한다.
- AR·시즌 flag가 켜져 있어도 권리·유효기간·shade evidence를 통과한 catalog가 없으면 정직한 empty state를 반환한다.
- 얼굴 thumbnail은 저장하지 않는다. 저장 AR 룩의 기본 표현은 recipe 색상에서 서버가 재작성한 `saved_ar_swatch_mosaic_v1`이다.

## 필요한 환경 변수

전체 키와 기본값은 `services/backend/.env.example`과 `apps/mobile/.env.example`을 따른다.

- 상품 경계: `PRODUCT_CATALOG_ALLOWED_SELLER_DOMAINS`, `PRODUCT_CATALOG_ALLOWED_IMAGE_DOMAINS`
- 서명: `PRODUCT_CATALOG_MANIFEST_SIGNING_SECRET`, `PRODUCT_SEASONAL_MANIFEST_SIGNING_SECRET`, `PRODUCT_EVENT_SIGNING_SECRET`
- rollout: `PRODUCT_HUB_V2`, `SEASONAL_RECOMMENDATIONS_V1`, `AR_RECIPE_PERSISTENCE_V1`, `AR_PRODUCT_RECOMMENDATIONS_V1`, `ENGAGEMENT_PERSONALIZATION_V1`, `COHORT_RECOMMENDATIONS_V1`
- AR 색상 gate: `PRODUCT_AR_MAX_DELTA_E`는 “선택한 AR 색과 가까워요”로 노출할 CIEDE2000 상한이다. 기본값은 `18.0`이며 전문가 relevance 검수 결과에 따라 설정으로 낮출 수 있다. 상한 밖 후보는 순위만 낮추지 않고 제외한다.
- freshness: `PRODUCT_OFFER_MAX_AGE_HOURS`와 `PRODUCT_SEASONAL_SOURCE_MAX_AGE_DAYS`를 공급 주기에 맞춘다. 미래 시점이나 기준보다 오래된 가격·재고·trend source는 import/publish 및 catalog 감사를 통과하지 못한다.
- privacy/abuse: retention 기간, cohort 최소 크기, 실험 비율, endpoint별 분당 rate limit
- `PRODUCT_COHORT_MIN_SIZE`는 운영에서 100 이상, `PRODUCT_COHORT_MIN_ITEM_SUPPORT`는 5 이상이어야 한다. 집단 크기뿐 아니라 제품별 서로 다른 지지 사용자 수도 기준을 통과해야 공개한다.
- Naver Insight를 실제 trend signal로 쓰는 경우에만 `NAVER_SHOPPING_INSIGHT_ENABLED=true`와 `https://openapi.naver.com/...` endpoint/credential을 secret manager에 설정한다. 어댑터는 HTTPS와 `openapi.naver.com` 경계를 통과하기 전에 credential을 전송하지 않는다.

Domain allowlist에는 wildcard, IP, URL, public suffix만 넣을 수 없다. 예: `shop.partner.example`, `cdn.partner.example`. Secret은 manifest 파일, 로그, PR, 채팅에 기록하지 않는다.

## DB 적용과 확인

로컬 compose는 schema가 요구하는 `pgvector/pgvector:pg16`을 사용한다.

```bash
cd services/backend
docker compose up -d postgres
DATABASE_URL=postgresql://aura:aura@127.0.0.1:5432/aura_backend ../../.venv/bin/python -m app.db.init_db
DATABASE_URL=postgresql://aura:aura@127.0.0.1:5432/aura_backend ../../.venv/bin/python -m app.db.check_schema
```

호스트의 5432 포트를 다른 PostgreSQL이 사용 중이면 기존 프로세스를 종료하지 않고
`AURA_POSTGRES_PORT=5434 docker compose up -d postgres`로 포트만 바꾼다. 이 경우 위
`DATABASE_URL`의 포트도 5434로 맞춘다.

동일 schema 명령을 두 번 실행했을 때 두 번째는 marker 기반으로 skip되거나 미적용 post migration만 적용돼야 한다. Staging/production migration, rollback window, backup 확인은 별도 승인 후 수행한다.

기존 DB의 `schema.sql:product-shade-parent-integrity-v1`, `schema.sql:user-product-like-shade-parent-v1`, `schema.sql:product-event-shade-parent-v1` 복합 FK는 과거 행 때문에 배포 자체가 중단되지 않도록 `NOT VALID`로 추가된다. 새 쓰기는 즉시 product–shade 불일치를 거부한다. Catalog·좋아요·이벤트 무결성 감사를 통과하고 불일치가 0건임을 확인한 maintenance window에서 다음 검증을 수행한다.

```sql
alter table product_assets validate constraint fk_product_assets_shade_product;
alter table product_offers validate constraint fk_product_offers_shade_product;
alter table product_seasonal_collection_items validate constraint fk_product_seasonal_items_shade_product;
alter table user_product_likes validate constraint fk_user_product_likes_shade_product;
alter table product_engagement_events validate constraint fk_product_engagement_shade_product;
```

새 DB를 전체 `schema.sql`로 만드는 경우에는 같은 FK가 처음부터 validated 상태로 생성된다.

## Catalog import·감사·rollback

1. 자체·제휴·정식 라이선스 원천에서 product/shade/packshot/offer별 source reference, 허용 용도, 만료일, 검수 evidence를 채운다.
2. `product_catalog_manifest_v1` canonical JSON에 운영 secret으로 HMAC-SHA256 서명한다.
3. DBA가 승인한 운영자만 `product_recommendation_operators`에 최소 역할을 부여한다. 일반 앱 사용자 UUID만으로는 운영 작업을 실행할 수 없다.
4. 활성 `catalog_admin` actor UUID를 필수로 지정해 import·quarantine·rollback한다. grant가 없거나 비활성/삭제 계정이면 DB 쓰기 전에 거부한다.

```sql
insert into product_recommendation_operators (user_id,roles,granted_by)
values (<CATALOG_ADMIN_UUID>,array['catalog_admin'],<GRANTER_UUID>)
on conflict (user_id) do update set roles=excluded.roles,is_active=true,granted_by=excluded.granted_by,updated_at=now();
```

```bash
python -m app.ops.import_product_catalog catalog.json --signature-file catalog.sig --actor-user-id <UUID>
python -m app.ops.audit_product_catalog
python -m app.ops.audit_product_catalog --fail-on-invalid
python -m app.ops.audit_product_catalog --apply-quarantine --actor-user-id <UUID>
python -m app.ops.rollback_product_catalog <MANIFEST_UUID> --actor-user-id <UUID> --reason '<사유>'
```

감사는 published 상품의 권리, asset, seller URL, 재고·가격 freshness를 다시 검증한다. `--fail-on-invalid`는 invalid 또는 관계 불일치가 있으면 exit code `2`를 반환하므로 운영 monitor에서 alert gate로 사용한다. 이 명령은 `PRODUCT_OFFER_MAX_AGE_HOURS`보다 짧은 주기(권장 1시간)로 실행한다. 실패 상품은 활성 actor를 지정한 `--apply-quarantine`에서만 product/shade/asset/offer와 함께 차단한다. 공개 검색·상세·좋아요·AURADIN·AR·시즌·개인화·cohort query도 같은 configurable freshness window를 재검증하므로 monitor 사이의 stale offer를 노출하지 않는다. Naver Shopping Search는 manifest source로 거부된다.
복합 FK를 `VALIDATE CONSTRAINT` 하기 전에는 감사 결과의 `relationshipMismatches`에서 `assets`, `offers`, `seasonalItems`, `likes`, `events`가 모두 `0`인지 확인한다. 이 값은 자동 삭제하지 않으므로 과거 불일치 행의 처리 근거를 별도 변경 기록으로 남긴다.

## 시즌 publish·suspend·rollback

- `product_seasonal_manifest_v1`은 서로 분리된 creator/reviewer/publisher, source 갱신 시점, content review reference, 기간, 상품 position, 협찬 유형을 요구한다.
- creator/reviewer/publisher는 각각 활성 `seasonal_editor`/`seasonal_reviewer`/`seasonal_publisher` grant가 있어야 한다. 수동 suspend/rollback은 `seasonal_operator` 또는 `seasonal_publisher`만 가능하다.
- 공개 API는 현재 유효한 마지막 승인 revision만 읽고 ETag 및 `stale-if-error` 캐시 지시자를 제공한다.
- 공급자 trend 호출 실패가 임의 상품 생성으로 이어지지 않는다. DB의 유효한 승인 collection이 없으면 empty state다.

```bash
python -m app.ops.publish_product_seasonal seasonal.json --signature-file seasonal.sig
python -m app.ops.expire_product_seasonal
python -m app.ops.expire_product_seasonal --apply
python -m app.ops.suspend_product_seasonal <COLLECTION_UUID> --actor-user-id <UUID> --reason '<사유>'
python -m app.ops.rollback_product_seasonal <COLLECTION_UUID> --actor-user-id <UUID> --reason '<사유>'
```

역할 grant는 DBA 승인 변경으로만 적용하며 애플리케이션 공개 API에서는 생성·수정하지 않는다. 한 사람이 여러 역할을 가질 수 있어도 manifest validation이 publisher와 creator/reviewer의 인적 분리를 별도로 강제한다.

`expire_product_seasonal`은 기본 dry-run이며 `--apply`에서 유효기간이 끝난 published/suspended revision을 `expired`로 전이하고 system audit log를 같은 transaction에 기록한다. 최소 1시간 주기로 실행한다. 즉시 중단 조건(권리 만료, 품절·가격 stale, 협찬 미표시)이 발생하면 활성 내부 actor로 collection을 suspend하고 feature flag를 내린다. suspend와 rollback은 상태 변경·audit log를 같은 transaction에서 기록한다.

## 개인정보·retention

- engagement와 color cohort는 목적별 별도 opt-in이다. 만 14세 이상 확인 전에는 수락할 수 없다.
- 비동의 계정에서는 client event, server-side 검색/좋아요/판매처 event, derived profile을 만들지 않는다.
- 철회 즉시 해당 event/profile/run/cohort를 삭제한다. “전체 제품 개인화 데이터 삭제”는 두 동의의 철회 이력도 함께 남긴다.
- 이벤트 queue는 계정 전환 시 삭제되고, 최대 100개·10분·2회 시도로 제한된다.
- AURADIN context는 `personalColor`만 허용하며, 만료된 검색 세션과 사용자 prompt는 동일 cleanup job에서 물리 삭제한다.
- 원본 얼굴, landmark, source frame metadata, identity embedding은 recipe/event에 저장하지 않는다.

```bash
python -m app.ops.cleanup_product_recommendation_data
python -m app.ops.cleanup_product_recommendation_data --apply
python -m app.ops.refresh_product_color_cohorts
```

Cohort는 별도 동의, 넓은 bucket, 사용자별 기여도 100 cap, rare bucket merge, `k >= PRODUCT_COHORT_MIN_SIZE`를 모두 통과해야 한다. 응답은 정확한 인원 대신 크기 band만 제공한다.

## Secret rotation과 incident

1. 새 secret version을 secret manager에 생성한다.
2. catalog/seasonal import를 일시 정지한다.
3. 새 secret으로 backend를 재시작하고, 이전 서명 manifest의 신규 제출이 거부되는지 확인한다.
4. event signing secret을 바꾸면 기존 exposure token은 즉시 무효화된다는 점을 rollout 공지에 포함한다.
5. 의심 상품은 catalog audit quarantine 또는 import rollback, 시즌은 suspend/rollback한다.
6. 영향 범위와 actor/action/entity audit log를 보존하고 incident owner가 법무·개인정보 담당자에게 전달한다.

운영 owner 이름, on-call 채널, rotation 주기는 조직이 채워야 하는 외부 승인 항목이다.

## Release gate

```bash
cd services/backend && ../../.venv/bin/python -m pytest -q
cd services/backend && AURA_PRODUCT_RECOMMENDATION_TEST_DATABASE_URL=<test-dsn> ../../.venv/bin/python -m pytest -q tests/test_product_recommendation_postgres.py
cd apps/mobile && npm run typecheck
cd apps/mobile && npm run test:product-recommendation
cd apps/mobile && npm run test:auradin-theme-scope
```

추가로 실제 PostgreSQL schema/check를 확인한다. iOS 사용자 흐름은 사용자가 실기기 연결 완료를 명시적으로 알린 뒤, 그 승인된 실기기에서 홈→제품추천→검색→상세→좋아요→AURADIN→뒤로가기, AR 저장 완료→`arStyleId` 허브, empty/error/offline/Reduce Motion/Dynamic Type 순서로 확인한다. 사용자의 연결 완료 알림 전에는 Simulator를 부팅하거나 실기기에 빌드·설치·실행하지 않는다. Production DB migration, 앱 release, 실제 사용자 event flag 활성화, 외부 유료 API 호출은 별도 release approval 없이는 수행하지 않는다.
