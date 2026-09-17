-- Vocabulary Inbox / Row Level Security（Supabase 用）
--
-- schema.sql を流した後に実行する。auth スキーマがある環境でしか動かない。
-- users.id には auth.users.id を入れる前提。

alter table users enable row level security;
alter table learning_profiles enable row level security;
alter table ingestions enable row level security;
alter table vocabulary_items enable row level security;
alter table occurrences enable row level security;
alter table cards enable row level security;
alter table review_logs enable row level security;

create policy users_self on users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy learning_profiles_owner on learning_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ingestions_owner on ingestions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy vocabulary_items_owner on vocabulary_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cards_owner on cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- occurrences と review_logs は user_id を持たないので親を辿る。
create policy occurrences_owner on occurrences
  for all using (
    exists (
      select 1 from vocabulary_items vi
       where vi.id = occurrences.vocabulary_item_id and vi.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from vocabulary_items vi
       where vi.id = occurrences.vocabulary_item_id and vi.user_id = auth.uid()
    )
  );

create policy review_logs_owner on review_logs
  for all using (
    exists (
      select 1 from cards c
       where c.id = review_logs.card_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from cards c
       where c.id = review_logs.card_id and c.user_id = auth.uid()
    )
  );
