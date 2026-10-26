// Validate 2 migration file mới trên PGlite (Postgres nhúng) với stub auth.uid(),
// mô phỏng đúng hiện trạng DB thật (6 bảng ad-hoc + migration cũ 20260906).
// Chạy: node scripts/validate-migrations.cjs
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const sql = (f) =>
  fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8');

const MIG_OLD = sql('20260906000000_allow_users_to_read_own_submissions.sql');
const MIG_BASE = sql('20261026000000_base_schema.sql');
const MIG_FEAT = sql('20261026000001_feature_tables.sql');

// UUID cố định cho test
const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001';
const STUD_A = 'bbbbbbbb-0000-0000-0000-00000000000a';
const STUD_B = 'cccccccc-0000-0000-0000-00000000000b';
const Q1 = 'dddddddd-0000-0000-0000-000000000001';

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// Seed: mô phỏng DB thật (6 bảng ad-hoc, constraint unique theo guess tên)
const SEED = `
create table public.profiles (
  id uuid primary key, full_name text, msv text, class_code text,
  role text not null default 'student'
);
create table public.lessons (
  id integer primary key, title text, audio_url text, passage text,
  total_questions integer, order_number integer,
  is_active boolean not null default false
);
create table public.questions (
  id uuid primary key, lesson_id integer, question_number integer, correct_answer text
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(), user_id uuid, lesson_id integer,
  correct_count integer, total_questions integer, score numeric, percentage numeric,
  listen_count integer, user_answer json, submitted_at timestamptz not null default now(),
  constraint submissions_user_lesson_key unique (user_id, lesson_id)
);
create table public.submission_answers (
  id uuid primary key default gen_random_uuid(), submission_id uuid,
  question_id uuid, user_answer text, is_correct boolean
);
create table public.listen_attempts (
  id uuid primary key default gen_random_uuid(), user_id uuid,
  lesson_id integer, expires_at timestamptz,
  constraint listen_attempts_user_lesson_key unique (user_id, lesson_id)
);
insert into public.profiles values
  ('${ADMIN}', 'Admin Test', null, null, 'admin'),
  ('${STUD_A}', 'Sinh Vien A', 'MSV001', 'A', 'student'),
  ('${STUD_B}', 'Sinh Vien B', 'MSV002', 'B', 'student');
insert into public.lessons values
  (1, 'Lesson 1', 'audio/lesson_1.mp3', 'A {{1}} injury here', 1, 1, true);
insert into public.questions values ('${Q1}', 1, 1, 'injury');
`;

// RLS bypass để seed (superuser, trước khi bật RLS)
const SET_UID = (uid) =>
  `select set_config('request.jwt.claim.sub', '${uid}', false)`;

(async () => {
  const db = new PGlite();

  // --- Stub môi trường Supabase ---
  await db.exec(`
    create role authenticated nologin;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
      language sql stable as
    $$ select (select nullif(current_setting('request.jwt.claim.sub', true), ''))::uuid $$;
  `);

  // --- seed hiện trạng ---
  await db.exec(SEED);
  console.log('== Seed hiện trạng: 6 bảng + data OK ==');

  // --- Cấp quyền mặc định (Supabase thực hiện khi tạo project; không nằm trong migration) ---
  // Bảng seed (trước migration): grant trực tiếp
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all privileges on all tables in schema public to authenticated;
  `);
  // Bảng mới do migration tạo: default privileges (Supabase cấp sẵn cho postgres)
  await db.exec(`
    alter default privileges in schema public grant all on tables to authenticated;
  `);

  // --- Migration cũ (đã chạy trên DB thật) ---
  await db.exec(MIG_OLD);
  console.log('== Migration 20260906 OK ==');

  // --- Migration base ---
  await db.exec(MIG_BASE);
  console.log('== Migration base (20261026000000) OK ==');

  // --- Migration feature ---
  await db.exec(MIG_FEAT);
  console.log('== Migration feature (20261026000001) OK ==');

  // --- Idempotent: chạy lại cả 3 lần nữa, không được lỗi ---
  try {
    await db.exec(MIG_OLD);
    await db.exec(MIG_BASE);
    await db.exec(MIG_FEAT);
    check('idempotent: chạy lại 3 migration không lỗi', true);
  } catch (e) {
    check('idempotent: chạy lại 3 migration không lỗi', false, e.message);
  }

  // --- Kiểm tra structural ---
  const tables = await db.query(
    `select tablename from pg_tables where schemaname='public' and tablename in ('lesson_access','practice_sessions','makeup_grants')`
  );
  check('3 bảng mới tồn tại', tables.rows.length === 3, JSON.stringify(tables.rows));

  const attemptCol = await db.query(
    `select column_name, column_default, is_nullable from information_schema.columns
     where table_schema='public' and table_name='submissions' and column_name='attempt_number'`
  );
  check(
    'cột attempt_number (int, default 1, not null)',
    attemptCol.rows.length === 1 &&
      attemptCol.rows[0].column_default === '1' &&
      attemptCol.rows[0].is_nullable === 'NO',
    JSON.stringify(attemptCol.rows)
  );

  const uniq = await db.query(
    `select c.conname from pg_constraint c
     join pg_class t on t.oid=c.conrelid
     where t.relname='submissions' and c.contype='u'`
  );
  check(
    'unique mới = (user_id, lesson_id, attempt_number)',
    uniq.rows.length === 1 &&
      uniq.rows[0].conname === 'submissions_user_lesson_attempt_key',
    JSON.stringify(uniq.rows)
  );

  // ============================================================
  // RLS tests (simulate từng role bằng set_config + SET ROLE authenticated)
  // ============================================================
  // PGlite: chạy query dưới role authenticated để RLS apply
  const as = async (uid, q, params) => {
    await db.query(SET_UID(uid));
    await db.query(`set role authenticated`);
    const r = await db.query(q, params);
    await db.query(`reset role`);
    return r;
  };

  const rows = (q) => q.rows;

  // RLS block là IM LẶNG (rowCount=0, không throw) → dùng tryRun để nhận cả
  // silent block lẫn hard error (unique constraint v.v.)
  const tryRun = async (uid, q) => {
    try {
      const r = await as(uid, q);
      return { ok: true, rowCount: r.rowCount, error: null };
    } catch (e) {
      return { ok: false, rowCount: 0, error: e };
    }
  };
  // 0. Admin mở L1 cho lớp A (điều kiện của attempt 1)
  try {
    await as(
      ADMIN,
      `insert into public.lesson_access (lesson_id, class_code, granted_by)
       values (1, 'A', '${ADMIN}')`
    );
    check('RLS: admin insert lesson_access OK', true);
  } catch (e) {
    check('RLS: admin insert lesson_access OK', false, e.message);
  }

  // 1. Student A (lớp A, bài đã mở): insert attempt 1 → OK
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.submissions (user_id, lesson_id, correct_count, total_questions, score, user_answer, attempt_number)
       values ('${STUD_A}', 1, 1, 1, 10, '{}'::json, 1)`
    );
    check('RLS: SV A insert attempt 1 (bài mở cho lớp mình) OK', r.rowCount === 1, r.error ? r.error.code : `rowCount=${r.rowCount}`);
  }

  // 1a. Student B (lớp B chưa mở, không grant): insert attempt 1 → CHẶN
  // (anti bypass REST: SV không thể tự tạo submission bài chưa mở)
  {
    const r = await tryRun(
      STUD_B,
      `insert into public.submissions (user_id, lesson_id, attempt_number)
       values ('${STUD_B}', 1, 1)`
    );
    check(
      'RLS: SV B insert attempt 1 bài chưa mở BỊ CHẶN (anti bypass REST)',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  // 2. Student A: insert attempt 2 KHÔNG có grant → CHẶN (silent, rowCount=0)
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.submissions (user_id, lesson_id, attempt_number)
       values ('${STUD_A}', 1, 2)`
    );
    check(
      'RLS: SV A insert attempt 2 không grant BỊ CHẶN',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  // 3. Admin: tạo makeup_grant cho SV A (chỉ admin insert được)
  try {
    await as(
      ADMIN,
      `insert into public.makeup_grants (user_id, lesson_id, granted_by)
       values ('${STUD_A}', 1, '${ADMIN}')`
    );
    check('RLS: admin insert makeup_grant OK', true);
  } catch (e) {
    check('RLS: admin insert makeup_grant OK', false, e.message);
  }

  // 3a. SV B tự insert grant cho mình → CHẶN
  {
    const r = await tryRun(
      STUD_B,
      `insert into public.makeup_grants (user_id, lesson_id, granted_by)
       values ('${STUD_B}', 1, '${STUD_B}')`
    );
    check(
      'RLS: SV B tự insert grant BỊ CHẶN',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  // 3b. Grant duplicate (cặp user+lesson) → unique chặn
  {
    const r = await tryRun(
      ADMIN,
      `insert into public.makeup_grants (user_id, lesson_id, granted_by)
       values ('${STUD_A}', 1, '${ADMIN}')`
    );
    check(
      'unique: grant trùng cặp user+lesson BỊ CHẶN',
      r.rowCount === 0 || (r.error && r.error.code === '23505'),
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  // 3c. Privilege escalation: SV A tự PATCH role='admin' → CHẶN (không có
  // student update policy trên profiles). RLS block = rowCount 0, KHÔNG throw.
  {
    const rRole = await as(
      STUD_A,
      `update public.profiles set role='admin' where id='${STUD_A}'`
    );
    check(
      'escalation: SV A tự đổi role BỊ CHẶN (0 dòng bị update)',
      rRole.rowCount === 0,
      `rowCount=${rRole.rowCount}`
    );
    const rMsv = await as(
      STUD_A,
      `update public.profiles set msv='HACK' where id='${STUD_A}'`
    );
    check(
      'escalation: SV A tự sửa msv BỊ CHẶN',
      rMsv.rowCount === 0,
      `rowCount=${rMsv.rowCount}`
    );
    // admin vẫn sửa được profile SV (spec: sửa class_code)
    const rAdmin = await as(
      ADMIN,
      `update public.profiles set msv='MSV001-X' where id='${STUD_A}'`
    );
    check('admin update profile SV OK (1 dòng)', rAdmin.rowCount === 1, `rowCount=${rAdmin.rowCount}`);
    // restore
    await as(ADMIN, `update public.profiles set msv='MSV001' where id='${STUD_A}'`);
  }

  // 4. Sau khi có grant: SV A insert attempt 2 → OK (rowCount=1)
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.submissions (user_id, lesson_id, attempt_number)
       values ('${STUD_A}', 1, 2)`
    );
    check('RLS: SV A insert attempt 2 có grant OK', r.rowCount === 1, r.error ? r.error.code : `rowCount=${r.rowCount}`);
  }

  // 5. attempt 3 (RLS chặn: grant chỉ mở attempt = 2) + unique chặn trùng
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.submissions (user_id, lesson_id, attempt_number)
       values ('${STUD_A}', 1, 3)`
    );
    check(
      'RLS: SV A insert attempt 3 BỊ CHẶN (chỉ makeup 1 lần)',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.submissions (user_id, lesson_id, attempt_number)
       values ('${STUD_A}', 1, 2)`
    );
    check(
      'unique: attempt 2 lần 2 BỊ CHẶN',
      r.rowCount === 0 || (r.error && r.error.code === '23505'),
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  // 6. lesson_access: đã insert ở test 0; kiểm tra đọc + audit join
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.lesson_access (lesson_id, class_code, granted_by) values (1, 'B', '${STUD_A}')`
    );
    check(
      'RLS: SV A tự insert lesson_access BỊ CHẶN',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  const laA = rows(await as(STUD_A, `select class_code from public.lesson_access where lesson_id = 1`));
  check('RLS: SV A đọc lesson_access lớp mình (A)', laA.length === 1 && laA[0].class_code === 'A', JSON.stringify(laA));
  const laB = rows(await as(STUD_B, `select class_code from public.lesson_access where lesson_id = 1`));
  check('RLS: SV B không thấy dòng lớp A', laB.length === 0, JSON.stringify(laB));
  const laAdmin = rows(
    await as(
      ADMIN,
      `select la.class_code, p.full_name from public.lesson_access la
       left join public.profiles p on p.id = la.granted_by where la.lesson_id = 1`
    )
  );
  check(
    'audit: admin join profiles ra tên admin mở bài',
    laAdmin.length === 1 && laAdmin[0].full_name === 'Admin Test',
    JSON.stringify(laAdmin)
  );

  // 7. practice_sessions: SV insert dòng của mình; không đọc dòng người khác
  try {
    await as(STUD_A, `insert into public.practice_sessions (user_id, lesson_id) values ('${STUD_A}', 1)`);
    await as(STUD_A, `insert into public.practice_sessions (user_id, lesson_id) values ('${STUD_A}', 1)`);
    check('RLS: SV A insert practice_sessions OK', true);
  } catch (e) {
    check('RLS: SV A insert practice_sessions OK', false, e.message);
  }
  {
    const r = await tryRun(
      STUD_A,
      `insert into public.practice_sessions (user_id, lesson_id) values ('${STUD_B}', 1)`
    );
    check(
      'RLS: SV A giả insert session của SV B BỊ CHẶN',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }  const psB = rows(await as(STUD_B, `select count(*)::int as n from public.practice_sessions where user_id='${STUD_A}'`));
  check('RLS: SV B không đọc session của SV A', psB.length === 1 && psB[0].n === 0, String(psB[0] && psB[0].n));
  const psA = rows(await as(STUD_A, `select count(*)::int as n from public.practice_sessions where user_id='${STUD_A}'`));
  check('SV A đọc session của mình (2 dòng)', psA.length === 1 && psA[0].n === 2, String(psA[0] && psA[0].n));

  // 8. listen_attempts: SV insert + admin delete (quy trình makeup)
  await db.query(SET_UID(STUD_A));
  await db.query(`set role authenticated`);
  const insA = await db.query(
    `insert into public.listen_attempts (user_id, lesson_id, expires_at)
     values ('${STUD_A}', 1, now() + interval '2 hours') returning id`
  );
  await db.query(`reset role`);
  check('listen_attempts: SV A insert của mình OK', insA.rows.length === 1);

  {
    const r = await tryRun(
      STUD_A,
      `insert into public.listen_attempts (user_id, lesson_id)
       values ('${STUD_B}', 1)`
    );
    check(
      'listen_attempts: SV A giả insert cho SV B BỊ CHẶN',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  {
    const r = await tryRun(
      ADMIN,
      `insert into public.listen_attempts (user_id, lesson_id)
       values ('${STUD_A}', 1)`
    );
    check(
      'listen_attempts: admin insert BỊ CHẶN (SV tự tạo khi presign)',
      r.rowCount === 0,
      r.error ? r.error.code : `rowCount=${r.rowCount}`
    );
  }

  const delAdmin = await as(
    ADMIN,
    `delete from public.listen_attempts where user_id='${STUD_A}' and lesson_id=1`
  );
  check('listen_attempts: admin delete OK (makeup xóa để nghe lại)', delAdmin.rowCount === 1, String(delAdmin.rowCount));

  // 9. submissions: SV A không đọc submission của SV B
  const subsB = rows(await as(STUD_B, `select count(*)::int as n from public.submissions where user_id='${STUD_A}'`));
  check('RLS: SV B không đọc submissions của SV A', subsB.length === 1 && subsB[0].n === 0, String(subsB[0] && subsB[0].n));
  const subsA = rows(await as(STUD_A, `select count(*)::int as n from public.submissions where user_id='${STUD_A}'`));
  check('SV A đọc submissions của mình (2 dòng attempt 1+2)', subsA.length === 1 && subsA[0].n === 2, String(subsA[0] && subsA[0].n));

  // 10. Data có sẵn không bị phá (lessons/question)
  const lessonsCount = await db.query(`select count(*)::int as n from public.lessons`);
  check('data lessons giữ nguyên (1 dòng)', lessonsCount.rows[0].n === 1);

  // Guard practice_sessions 10 phút (logic app-layer, mô phỏng SQL-side)
  const recent = await db.query(
    `select count(*)::int as n from public.practice_sessions
     where user_id='${STUD_A}' and lesson_id=1
       and started_at >= now() - interval '10 minutes'`
  );
  check('guard: query 10 phút bắt được session vừa tạo', recent.rows[0].n >= 1, String(recent.rows[0].n));

  await db.close();

  console.log(`\n==== KẾT QUẢ: ${passed} pass, ${failed} fail ====`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
