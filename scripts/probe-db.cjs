// Probe PostgREST schema thật bằng anon key (chỉ read, không đổi DB).
// Chạy: node scripts/probe-db.cjs
const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const get = (name) => {
  const line = envText.split('\n').find((l) => l.startsWith(name + '='));
  return line ? line.split('=').slice(1).join('=').trim() : null;
};

const key = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const base = get('NEXT_PUBLIC_SUPABASE_URL');
if (!key || !base) {
  console.error('Thiếu env NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function probe(table, selectCols) {
  const url = `${base}/rest/v1/${table}?select=${encodeURIComponent(selectCols)}&limit=1`;
  try {
    const r = await fetch(url, { headers });
    const body = await r.text();
    if (r.ok) {
      console.log(`OK   ${table}: ${body.slice(0, 160)}`);
      return body;
    }
    console.log(`ERR  ${table}: [${r.status}] ${body.slice(0, 300)}`);
  } catch (e) {
    console.log(`FAIL ${table}: ${e.message}`);
  }
}

(async () => {
  console.log('=== 6 bảng hiện có ===');
  await probe('lessons', 'id,title,audio_url,passage,total_questions,order_number,is_active');
  await probe('profiles', 'id,full_name,msv,class_code,role');
  await probe('questions', 'id,lesson_id,question_number,correct_answer');
  await probe('submissions', 'id,user_id,lesson_id,correct_count,total_questions,score,percentage,listen_count,user_answer,submitted_at');
  await probe('submission_answers', 'id,submission_id,question_id,user_answer,is_correct');
  await probe('listen_attempts', 'id,user_id,lesson_id,expires_at');

  console.log('\n=== Cột mới (chưa migrate) ===');
  await probe('submissions', 'attempt_number');
  await probe('lesson_access', 'id');
  await probe('makeup_grants', 'id');
  await probe('practice_sessions', 'id');

  console.log('\n=== Data thực (reference) ===');
  const lessons = await probe('lessons', 'id,order_number,is_active');
  if (lessons) {
    // số bài is_active
    const r2 = await fetch(`${base}/rest/v1/lessons?select=id&is_active=eq.true&order=order_number`, { headers });
    const body2 = await r2.text();
    console.log('is_active=true:', body2);
    // số profiles student
    const r3 = await fetch(`${base}/rest/v1/profiles?select=class_code,role&role=eq.student&limit=100`, { headers });
    console.log('profiles student (mẫu, có thể bị RLS chặn):', await r3.text().then((b) => b.slice(0, 300)));
  }
})();
