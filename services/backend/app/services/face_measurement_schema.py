from app.db.session import Database


FACE_MEASUREMENT_SCHEMA_VERSION = "schema.sql:face-measurement-phase4-v2"

FACE_MEASUREMENT_SCHEMA_SQL = """
create table if not exists face_measurement_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  self_selected_locale text,
  locale_selection_source text not null default 'unset',
  locale_selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_face_measurement_preferences_source
    check (locale_selection_source in ('unset', 'self_selected')),
  constraint chk_face_measurement_preferences_locale_format
    check (
      self_selected_locale is null
      or self_selected_locale ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$'
    ),
  constraint chk_face_measurement_preferences_selection_state
    check (
      (
        self_selected_locale is null
        and locale_selection_source = 'unset'
        and locale_selected_at is null
      )
      or (
        self_selected_locale is not null
        and locale_selection_source = 'self_selected'
        and locale_selected_at is not null
      )
    )
);

comment on table face_measurement_preferences is
  'Explicit user selection only. Device locale, network, profile, and face inference must never populate this row.';

create table if not exists face_length_measurement_snapshots (
  report_id uuid primary key references analysis_reports(id) on delete cascade,
  measurement_capture_id text not null,
  measurement_contract_id text not null,
  face_length_ratio double precision not null,
  estimate_low double precision not null,
  estimate_high double precision not null,
  captured_at timestamptz not null,
  evidence_provenance text not null default 'client_observed_unverified',
  norm_training_eligible boolean not null default false,
  norm_attestation_id text,
  created_at timestamptz not null default now(),
  constraint chk_face_length_snapshot_capture_id
    check (char_length(btrim(measurement_capture_id)) between 1 and 160),
  constraint chk_face_length_snapshot_contract_id
    check (char_length(btrim(measurement_contract_id)) between 1 and 160),
  constraint chk_face_length_snapshot_finite_positive check (
    face_length_ratio > 0
    and face_length_ratio < 'Infinity'::double precision
    and estimate_low > 0
    and estimate_low < 'Infinity'::double precision
    and estimate_high > 0
    and estimate_high < 'Infinity'::double precision
  ),
  constraint chk_face_length_snapshot_band check (
    estimate_low <= face_length_ratio
    and face_length_ratio <= estimate_high
  ),
  constraint chk_face_length_snapshot_client_observed_only check (
    evidence_provenance = 'client_observed_unverified'
    and norm_training_eligible = false
    and norm_attestation_id is null
  )
);

alter table face_length_measurement_snapshots
  add column if not exists evidence_provenance text not null
    default 'client_observed_unverified',
  add column if not exists norm_training_eligible boolean not null default false,
  add column if not exists norm_attestation_id text;

alter table face_length_measurement_snapshots
  drop constraint if exists chk_face_length_snapshot_client_observed_only;
alter table face_length_measurement_snapshots
  add constraint chk_face_length_snapshot_client_observed_only check (
    evidence_provenance = 'client_observed_unverified'
    and norm_training_eligible = false
    and norm_attestation_id is null
  );

create index if not exists idx_face_length_snapshots_contract_captured
  on face_length_measurement_snapshots (
    measurement_contract_id,
    captured_at desc,
    report_id
  );

comment on table face_length_measurement_snapshots is
  'Unverified client-observed face-length history for same-user comparisons only. Norm training and activation are prohibited. Raw images and landmarks are prohibited.';
"""


FACE_MEASUREMENT_MIGRATION_SQL = FACE_MEASUREMENT_SCHEMA_SQL + """
drop trigger if exists trg_face_measurement_preferences_updated_at
  on face_measurement_preferences;
create trigger trg_face_measurement_preferences_updated_at
before update on face_measurement_preferences
for each row execute function set_updated_at();
"""


async def ensure_face_measurement_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(FACE_MEASUREMENT_SCHEMA_SQL)
