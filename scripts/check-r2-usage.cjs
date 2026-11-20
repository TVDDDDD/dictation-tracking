// One-shot: đo dung lượng thật bucket R2 (list objects, tổng Size) + dự phóng egress.
// Chạy: node scripts/check-r2-usage.cjs
const fs = require('fs');
const path = require('path');

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const get = (name) => {
  const line = envText.split('\n').find((l) => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : null;
};
const endpoint = get('R2_ENDPOINT');
const ak = get('R2_ACCESS_KEY_ID');
const sk = get('R2_SECRET_ACCESS_KEY');
const bucket = get('R2_BUCKET_NAME');
if (!endpoint || !ak || !sk || !bucket) {
  console.error('Thiếu R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME trong .env.local');
  process.exit(1);
}

// Dự án đã có @aws-sdk/client-s3 (dùng ở getAudioPresignedPut) — tái dùng, không viết lại SigV4 tay
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: { accessKeyId: ak, secretAccessKey: sk },
  forcePathStyle: true,
});

(async () => {
  const s3Objects = [];
  let token;
  do {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    (out.Contents || []).forEach((o) => s3Objects.push({ key: o.Key, size: o.Size }));
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);

  const total = s3Objects.reduce((s, o) => s + o.size, 0);
  const mb = (x) => (x / 1048576).toFixed(1);
  console.log('Files: ' + s3Objects.length + ' | Total: ' + mb(total) + ' MB (' + (total / 1073741824).toFixed(2) + ' GB)');
  console.log('Largest 10:');
  [...s3Objects].sort((a, b) => b.size - a.size).slice(0, 10).forEach((f) => console.log('  ' + mb(f.size) + ' MB  ' + f.key));

  // R2: egress = MIEN PHÍ (chỉ storage + Class A/B ops tính tiền) → chỉ cần lo storage 10GB free
  const avgMb = total / Math.max(s3Objects.length, 1) / 1048576;
  // Class B ops = số lần GET (nghe audio)
  const worstReads = 300 * 6; // 300 SV x (1 exam + 5 practice)
  const moderateReads = 300 * 3;
  console.log('Avg file: ' + avgMb.toFixed(2) + ' MB');
  console.log('Class B reads worst-case: ' + worstReads.toLocaleString() + ' (free limit: 10M/mo)');
  console.log('Class B reads moderate: ' + moderateReads.toLocaleString() + ' (free limit: 10M/mo)');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
