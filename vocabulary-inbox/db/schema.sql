-- Vocabulary Inbox / スキーマ（設計書14章）
--
-- 素の PostgreSQL 15+ で流せる範囲だけをここに置く。
-- Supabase の Auth と RLS に依存する部分は rls.sql に分けてある。
--
--   psql "$DATABASE_URL" -f db/schema.sql
--   psql "$DATABASE_URL" -f db/rls.sql     -- Supabase の場合のみ
--
-- gen_random_uuid() は PostgreSQL 13 以降の組み込みなので拡張は要らない。

-- ── 列挙 ────────────────────────────────────────────────

create type ingestion_status as enum ('pending', 'processing', 'completed', 'failed');
create type vocabulary_status as enum ('learning', 'known', 'ignored');
create type vocabulary_type as enum ('word', 'phrase', 'idiom');
create type cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
create type card_type as enum ('recognition', 'recall');
create type review_rating as enum ('again', 'hard', 'good', 'easy');

-- ── 共通トリガ ──────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ──────────────────────────────────────────────
-- Supabase Auth を使う場合、id には auth.users.id をそのまま入れる。

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- ── learning_profiles ──────────────────────────────────
-- MVPは es/ja の1プロファイルだけだが、言語を増やせる形にしておく（設計書3章）。

create table learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  target_language text not null,
  native_language text not null,
  level text not null default 'intermediate',
  max_items_per_ingestion integer check (max_items_per_ingestion > 0),
  created_at timestamptz not null default now(),
  unique (user_id, target_language)
);

-- ── ingestions ─────────────────────────────────────────
-- 貼り付けられた文章そのもの。

create table ingestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  target_language text not null,
  raw_text text not null,
  source_type text not null default 'paste',
  source_url text,
  title text,
  status ingestion_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index ingestions_user_recent_idx on ingestions (user_id, created_at desc);

-- 未処理を拾うジョブ用（設計書21章）。完了分が増えても軽いまま。
create index ingestions_pending_idx on ingestions (status, created_at)
  where status in ('pending', 'processing');

-- ── vocabulary_items ───────────────────────────────────
-- 単語帳の1エントリ。同じ語は何度遭遇しても1行のまま（設計書12章）。

create table vocabulary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  target_language text not null,
  lemma text not null,

  -- 設計書11章の正規化をDB側で保証する。
  -- NFC → 小文字 → 前後空白除去 → 連続空白の圧縮。アクセント記号は落とさない。
  normalized_lemma text generated always as (
    lower(regexp_replace(btrim(normalize(lemma, nfc)), '\s+', ' ', 'g'))
  ) stored,

  type vocabulary_type not null default 'word',
  part_of_speech text,
  meaning_ja text not null,
  cefr cefr_level,
  status vocabulary_status not null default 'learning',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  encounter_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 設計書11章の重複判定キー。
  unique (user_id, target_language, normalized_lemma)
);

create index vocabulary_items_user_status_idx
  on vocabulary_items (user_id, status, last_seen_at desc);

-- 一覧画面の前方一致検索（設計書17章）。部分一致まで要るようになったら pg_trgm を足す。
create index vocabulary_items_prefix_idx
  on vocabulary_items (user_id, normalized_lemma text_pattern_ops);

create trigger vocabulary_items_set_updated_at
  before update on vocabulary_items
  for each row execute function set_updated_at();

-- ── occurrences ────────────────────────────────────────
-- 「いつ・どの文章で・どんな形で遭遇したか」。このアプリの肝（設計書12章）。

create table occurrences (
  id uuid primary key default gen_random_uuid(),
  vocabulary_item_id uuid not null references vocabulary_items (id) on delete cascade,
  ingestion_id uuid references ingestions (id) on delete cascade,
  surface_form text not null,
  source_sentence text not null,
  sentence_ja text,
  created_at timestamptz not null default now()
);

create index occurrences_item_recent_idx
  on occurrences (vocabulary_item_id, created_at desc);
create index occurrences_ingestion_idx on occurrences (ingestion_id);

-- 同じ文章から同じ語を二重に記録しない（設計書12章のまとめ方をDB側でも担保）。
create unique index occurrences_unique_per_ingestion
  on occurrences (vocabulary_item_id, ingestion_id, surface_form)
  where ingestion_id is not null;

-- 遭遇回数と初出・最新をトリガで持つ。アプリ側で数え忘れても崩れないようにする。
create or replace function bump_encounter_counters() returns trigger
language plpgsql as $$
begin
  update vocabulary_items
     set encounter_count = encounter_count + 1,
         first_seen_at = least(coalesce(first_seen_at, new.created_at), new.created_at),
         last_seen_at = greatest(coalesce(last_seen_at, new.created_at), new.created_at),
         updated_at = now()
   where id = new.vocabulary_item_id;
  return new;
end;
$$;

-- Undo（設計書24章）で occurrence が消えたときに数を戻す。
create or replace function drop_encounter_counters() returns trigger
language plpgsql as $$
begin
  update vocabulary_items vi
     set encounter_count = greatest(0, vi.encounter_count - 1),
         last_seen_at = (
           select max(o.created_at) from occurrences o
            where o.vocabulary_item_id = vi.id and o.id <> old.id
         ),
         updated_at = now()
   where vi.id = old.vocabulary_item_id;
  return old;
end;
$$;

create trigger occurrences_bump_counters
  after insert on occurrences
  for each row execute function bump_encounter_counters();

create trigger occurrences_drop_counters
  after delete on occurrences
  for each row execute function drop_encounter_counters();

-- ── cards ──────────────────────────────────────────────
-- MVPでは card_type = recognition だけ（設計書14章）。

create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  vocabulary_item_id uuid not null references vocabulary_items (id) on delete cascade,
  card_type card_type not null default 'recognition',
  due_at timestamptz not null default now(),
  fsrs_state jsonb not null default '{}'::jsonb,

  -- known / ignored にした語のカードを復習から外すための印（設計書13章）。
  -- due_at を書き換えないのは、そこは FSRS が持つ値だから。learning に戻したときに
  -- 元のスケジュールがそのまま復活する。
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vocabulary_item_id, card_type)
);

-- GET /api/reviews/today（設計書20章）が叩くのはここだけ。
create index cards_due_idx on cards (user_id, due_at) where suspended_at is null;

create trigger cards_set_updated_at
  before update on cards
  for each row execute function set_updated_at();

-- known / ignored にしたら復習対象から外す（設計書13章）。
-- カードも FSRS の状態も消さない。learning に戻したら元のスケジュールで再開する。
create or replace function suspend_cards_for_non_learning() returns trigger
language plpgsql as $$
begin
  if new.status <> 'learning' and old.status = 'learning' then
    update cards set suspended_at = now()
     where vocabulary_item_id = new.id and suspended_at is null;
  elsif new.status = 'learning' and old.status <> 'learning' then
    update cards set suspended_at = null
     where vocabulary_item_id = new.id and suspended_at is not null;
  end if;
  return new;
end;
$$;

create trigger vocabulary_items_suspend_cards
  after update of status on vocabulary_items
  for each row execute function suspend_cards_for_non_learning();

-- ── review_logs ────────────────────────────────────────

create table review_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards (id) on delete cascade,
  rating review_rating not null,
  reviewed_at timestamptz not null default now(),
  fsrs_log jsonb not null default '{}'::jsonb
);

create index review_logs_card_idx on review_logs (card_id, reviewed_at desc);

-- 継続日数・復習数の集計用（設計書28章で見る数字）。
create index review_logs_reviewed_at_idx on review_logs (reviewed_at desc);
