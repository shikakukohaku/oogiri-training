/**
 * schema.sql の回帰テスト。
 *
 * PGlite（ブラウザ/Node で動く PostgreSQL）があるときだけ走る。
 *   npm i -D @electric-sql/pglite
 * 入っていなければ skip されるので、CI や他の環境で落ちることはない。
 *
 * rls.sql は auth スキーマが要るのでここでは検証できない。Supabase 上で確認する。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaSql = await readFile(join(here, 'schema.sql'), 'utf8');

const PGlite = await import('@electric-sql/pglite')
  .then((mod) => mod.PGlite)
  .catch(() => null);

const skip = PGlite ? false : '@electric-sql/pglite が無いので skip';

async function withDb(run) {
  const db = new PGlite();
  try {
    await db.exec(schemaSql);
    await db.exec(`
      insert into users (id, email)
        values ('11111111-1111-1111-1111-111111111111', 'me@example.com');
      insert into ingestions (id, user_id, target_language, raw_text)
        values ('22222222-2222-2222-2222-222222222222',
                '11111111-1111-1111-1111-111111111111', 'es', 'No me atrevo a decirlo.');
    `);
    await run(db);
  } finally {
    await db.close();
  }
}

const USER = '11111111-1111-1111-1111-111111111111';
const INGESTION = '22222222-2222-2222-2222-222222222222';

async function insertItem(db, lemma, overrides = {}) {
  const { rows } = await db.query(
    `insert into vocabulary_items (user_id, target_language, lemma, meaning_ja, type)
     values ($1, 'es', $2, $3, $4) returning id, normalized_lemma, encounter_count`,
    [USER, lemma, overrides.meaningJa ?? '意味', overrides.type ?? 'word'],
  );
  return rows[0];
}

async function insertOccurrence(db, itemId, surfaceForm, ingestionId = INGESTION) {
  const { rows } = await db.query(
    `insert into occurrences (vocabulary_item_id, ingestion_id, surface_form, source_sentence)
     values ($1, $2, $3, 'No me atrevo a decirlo.') returning id`,
    [itemId, ingestionId, surfaceForm],
  );
  return rows[0].id;
}

test('schema.sql がそのまま流せる', { skip }, async () => {
  await withDb(async (db) => {
    const { rows } = await db.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    );
    assert.deepEqual(
      rows.map((row) => row.table_name),
      [
        'cards',
        'ingestions',
        'learning_profiles',
        'occurrences',
        'review_logs',
        'users',
        'vocabulary_items',
      ],
    );
  });
});

test('normalized_lemma は設計書11章どおりに生成される', { skip }, async () => {
  await withDb(async (db) => {
    const spaced = await insertItem(db, '  Darse   Cuenta ');
    assert.equal(spaced.normalized_lemma, 'darse cuenta');

    // アクセント記号は落とさない
    const accented = await insertItem(db, 'Atrevió');
    assert.equal(accented.normalized_lemma, 'atrevió');

    // NFD で入れても NFC に揃う
    const decomposed = await insertItem(db, 'café');
    assert.equal(decomposed.normalized_lemma, 'café');
  });
});

test('user + language + normalized_lemma は重複できない', { skip }, async () => {
  await withDb(async (db) => {
    await insertItem(db, 'atreverse');
    await assert.rejects(() => insertItem(db, '  ATREVERSE '), /duplicate key|unique/i);
    // 言語が違えば別エントリ
    await db.query(
      `insert into vocabulary_items (user_id, target_language, lemma, meaning_ja)
       values ($1, 'en', 'atreverse', '別言語')`,
      [USER],
    );
  });
});

test('遭遇を足すと encounter_count と first/last_seen_at が動く', { skip }, async () => {
  await withDb(async (db) => {
    const item = await insertItem(db, 'atreverse');
    assert.equal(item.encounter_count, 0);

    await insertOccurrence(db, item.id, 'me atrevo');
    const second = await insertOccurrence(db, item.id, 'se atrevió');

    let { rows } = await db.query('select * from vocabulary_items where id = $1', [item.id]);
    assert.equal(rows[0].encounter_count, 2);
    assert.ok(rows[0].first_seen_at instanceof Date);
    assert.ok(rows[0].last_seen_at >= rows[0].first_seen_at);

    // Undo で遭遇を取り消したら数も戻る（設計書24章）
    await db.query('delete from occurrences where id = $1', [second]);
    ({ rows } = await db.query('select * from vocabulary_items where id = $1', [item.id]));
    assert.equal(rows[0].encounter_count, 1);
  });
});

test('同じ ingestion の同じ surface_form は二重に記録されない', { skip }, async () => {
  await withDb(async (db) => {
    const item = await insertItem(db, 'atreverse');
    await insertOccurrence(db, item.id, 'me atrevo');
    await assert.rejects(
      () => insertOccurrence(db, item.id, 'me atrevo'),
      /duplicate key|unique/i,
    );
  });
});

test('ingestion を消すと、その遭遇も消えて数が戻る', { skip }, async () => {
  await withDb(async (db) => {
    const item = await insertItem(db, 'atreverse');
    await insertOccurrence(db, item.id, 'me atrevo');
    await db.query('delete from ingestions where id = $1', [INGESTION]);
    const { rows } = await db.query('select encounter_count from vocabulary_items where id = $1', [
      item.id,
    ]);
    assert.equal(rows[0].encounter_count, 0);
  });
});

test('known にするとカードが復習対象から外れ、learning に戻すと戻る', { skip }, async () => {
  await withDb(async (db) => {
    const item = await insertItem(db, 'atreverse');
    const { rows: created } = await db.query(
      `insert into cards (user_id, vocabulary_item_id, due_at)
       values ($1, $2, now() - interval '1 day') returning due_at`,
      [USER, item.id],
    );

    await db.query(`update vocabulary_items set status = 'known' where id = $1`, [item.id]);
    let { rows } = await db.query(
      'select due_at, suspended_at from cards where vocabulary_item_id = $1',
      [item.id],
    );
    assert.ok(rows[0].suspended_at instanceof Date);
    // FSRS が持つ due_at は触らない
    assert.deepEqual(rows[0].due_at, created[0].due_at);

    await db.query(`update vocabulary_items set status = 'learning' where id = $1`, [item.id]);
    ({ rows } = await db.query(
      'select due_at, suspended_at from cards where vocabulary_item_id = $1',
      [item.id],
    ));
    assert.equal(rows[0].suspended_at, null);
    assert.deepEqual(rows[0].due_at, created[0].due_at);
  });
});

test('今日の復習は cards だけで引け、known のカードは出てこない', { skip }, async () => {
  await withDb(async (db) => {
    const learning = await insertItem(db, 'atreverse');
    const known = await insertItem(db, 'darse cuenta');
    for (const item of [learning, known]) {
      await db.query(
        `insert into cards (user_id, vocabulary_item_id, due_at)
         values ($1, $2, now() - interval '1 day')`,
        [USER, item.id],
      );
    }
    await db.query(`update vocabulary_items set status = 'known' where id = $1`, [known.id]);

    const { rows } = await db.query(
      `select c.vocabulary_item_id from cards c
        where c.user_id = $1 and c.suspended_at is null and c.due_at <= now()
        order by c.due_at limit 50`,
      [USER],
    );
    assert.deepEqual(rows.map((row) => row.vocabulary_item_id), [learning.id]);
  });
});
