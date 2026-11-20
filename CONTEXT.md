# DICTATION TRACKING - PROJECT CONTEXT
**Status:** In production (5-week course, start date không xác định chính xác)  
**Target:** Class NN1/D2026 (32 students) + 5 regular classes (~240 students total)  
**Domain:** `https://successful-listening.online`  
**Last Updated:** 2026-11-21

---

## 🎯 PROJECT OVERVIEW

| Aspect | Detail |
|--------|--------|
| **Purpose** | Thesis data collection - Dictation exercises for English listening practice |
| **Users** | ~240-300 students across 6 classes (1 advanced + 5 regular), admin team |
| **Timeline** | 5 weeks, lessons Mon/Wed/Fri/Sun, homework style (not simultaneous) |
| **Stack** | Next.js 16 (App Router) + Supabase (Auth/DB) + Cloudflare R2 (Audio) + Resend (Email) + Vercel (Hosting) |
| **Cost** | Free tier all services (except domain via Vietnix) |

---

## 🏗️ ARCHITECTURE & DATA FLOW

### Core Tables
```sql
profiles (id, role, full_name, msv, class_code)
lessons (id, title, order_number, class_codes[], is_active, audio_url, passage, total_questions)
questions (lesson_id, question_number, correct_answer)
lesson_access (lesson_id, class_code, granted_by, granted_at)  -- runtime grants
makeup_grants (user_id, lesson_id, granted_by, granted_at)     -- retake permission
listen_attempts (user_id, lesson_id, expires_at)               -- exam audio limit (PK: user_id, lesson_id)
submissions (user_id, lesson_id, attempt_number, score, user_answer, submitted_at)
practice_sessions (user_id, lesson_id, started_at)             -- practice limit tracking
classes (code, name, is_advanced, sort_order)
```

### Lesson Visibility Logic (Student Dashboard)
```
Lesson visible IF:
  lessons.class_codes = [] (all classes)
  OR lessons.class_codes CONTAINS student.class_code
  OR lesson_access HAS (lesson_id, student.class_code)
```

### Audio Access Control (`/api/audio/presign`)
| Mode | Check |
|------|-------|
| **Exam** | `lesson_access` for student's class OR unused `makeup_grant` + `listen_attempts` unique constraint |
| **Practice** | `submissions` exists for (user, lesson) - no `listen_attempts` insert |

---

## 🔐 AUTH & EMAIL FLOW

### Configuration
- **Provider:** Resend with custom domain `successful-listening.online`
- **Auth:** Email/password only (no OAuth)
- **Site URL:** `https://successful-listening.online` (production)
- **Token Hash Flow:** `/auth/confirm/route.ts` handles all types

### Email Templates (Supabase Dashboard → Auth → Email Templates)
All use `{{ .TokenHash }}` format:
1. **Confirm Signup** → redirect to `/dashboard`
2. **Reset Password** → redirect to `/reset-password`
3. **Invite User** → redirect to `/dashboard` (admin creates via Supabase Dashboard)
4. **Magic Link** → not used (security risk)

### Redirect URLs (Supabase → Auth → URL Configuration)
```
https://successful-listening.online/**
http://localhost:3000/**
https://successful-listening.vercel.app/**
```
Wildcard covers all auth callbacks.

---

## 📚 LESSON STRUCTURE & ACCESS CONTROL

### Class Codes (Migration `20261031000002_seed_real_classes.sql`)
| Code | Type | Sort |
|------|------|------|
| N196/77DCTD24 | Regular | 1 |
| N195/77DCTD23 | Regular | 2 |
| N224/77DCDT24 | Regular | 3 |
| N227/77DCDT22 | Regular | 4 |
| N185/77DCOH22 | Regular | 5 |
| **NN1/D2026** | **Advanced** | **6** |

> Seed có `name = code` (dropdown admin chỉ hiện code, tránh lặp "Name (code)").

### Lesson Assignment
| Lesson Set | Count | Class Codes | Visibility |
|------------|-------|-------------|------------|
| **Advanced** | 24 | `['NN1/D2026']` | Only NN1/D2026 students |
| **Regular** | 60 | 5 regular classes | 5 regular classes only |
| **Total** | < 84 (thay đổi, đang tạo dần) | | |

> 2026-11-20 (R2 check): mới có **18** file audio trên R2. Tổng số bài trong khóa đã thay đổi (nhỏ hơn 84 ban đầu, chưa chốt con số) → nội dung đang tạo dần theo tuần.

### Two-Layer Access Control
| Layer | Table | Purpose | Who Manages |
|-------|-------|---------|-------------|
| **Config (Source of Truth)** | `lessons.class_codes` | Which classes CAN see this lesson | Admin via Wizard (Create/Edit Lesson) |
| **Runtime (Override)** | `lesson_access` | Which classes CAN ACCESS (open) NOW | Admin via LessonAccessPanel |

### Trigger: `sync_lesson_access()` (FIXED)
```sql
-- AFTER INSERT OR UPDATE ON lessons
-- Deletes old lesson_access, inserts from NEW.class_codes
-- Uses auth.uid() with FALLBACK to first admin in profiles
-- SECURITY DEFINER for Supabase Dashboard edits
```
⚠ **Hành động:** mỗi lần lưu bài qua wizard (create HOẶC update) → trigger **xóa + sinh lại** `lesson_access` của bài đó từ `class_codes` → mọi toggle Mở/Đóng thủ công trên panel sẽ bị **ghi đè im lặng** (đã có cảnh báo trong UI panel, 2026-11-20).

---

## 🎮 STUDENT FLOW

### Dashboard (`/dashboard`)
- Paginated lessons (10/page)
- Status badges: **Locked** → **Open** → **Done** → **Makeup**
- Exam mode: 1 listen attempt (`listen_attempts` PK enforces)
- Practice mode: unlimited listens after first submission, max 5 practice sessions

### Practice Page (`/practice/[id]`)
- **Layout:** 4/12 Audio panel | 8/12 Passage (reduces vertical scroll)
- **Line breaks:** `whitespace-pre-wrap` on passage spans
- **Modes:** Exam (first attempt) | Practice (after submit) | Result (review)
- **Audio:** Presigned R2 URL (2hr expiry), streamed via `<audio>`

### Grading — Multiple Acceptable Answers (`|` delimiter)
- Admin nhập `correct_answer` dạng `harbour|harbor` hoặc `eighteenth century|18th century` → SV nhập đúng biến thể nào cũng được điểm (case-insensitive + trim)
- Hiển thị kết quả: `formatCorrectAnswer()` (page practice) parse → "harbour / harbor" (không còn lộ raw `|` cho SV)
- ⚠️ Chỉ ảnh hưởng bài nộp **MỚI** sau deploy 11-04; 2 bài cũ đã được admin sửa đáp án qua UI → **không cần re-grade**

### Makeup Flow
1. Admin grants via LessonAccessPanel → inserts `makeup_grants` + deletes `listen_attempts` (→ SV **được nghe lại 1 lần** ở chế độ thi)
2. Student sees "Làm lại" badge → clicks → new `listen_attempts` created
3. Submits → `submissions.attempt_number = 2`
4. Grant persists for audit, cannot grant twice (PK: user_id, lesson_id)

---

## 👨‍🏫 ADMIN FEATURES

### Lesson Wizard (4 Steps)
1. **Info:** Title, class multi-select (từ bảng `classes`); **để trống = hiển thị tất cả lớp** (không phải bắt buộc)
2. **Audio:** Drag-drop MP3 → R2 presigned PUT (URL 10 phút) → key stored; file không phải MP3 sẽ bom khi lưu
3. **Passage:** Editor `{{n}}` blanks, auto-generates answer inputs; đáp án hỗ trợ `|` variants
4. **Preview & Save:** "💾 Lưu nháp" (ẩn) / "✅ Lưu & Mở ngay" (hiện + cho làm) — `is_active` chỉ quyết định ở đây (checkbox step-1 đã bỏ, 2026-11-20)

### `updateLesson` (Option B, 11-04)
- Bài **đã có submissions** → chỉ được sửa `correct_answer` (upsert per `question_number`); chặn thêm/xóa câu hỏi + không đổi passage
- Bài chưa có submissions → xóa/insert questions toàn bộ

### LessonAccessPanel (`/admin` page)
- Dropdown class (hiện code) → bảng TẤT CẢ bài active với Open/Close toggles + bulk
- Direct `lesson_access` inserts/deletes (bypass trigger) + audit (`granted_by`, `granted_at`)
- ⚠ UI cảnh báo: lưu bài qua wizard sẽ ghi đè toggle thủ công (trigger, xem mục LESSON STRUCTURE)

### Makeup Grant Panel
- Search student by name/MSV → select lesson → Grant Makeup (chặn cấp 2 lần, PK)
- Status: "Chưa cấp" / "Grant: chưa dùng" / "Grant: đã dùng" (dùng = SV đã có 2 submissions)

### Progress Tracking (`/admin/progress`)
- **Filters:** Class dropdown + MSV search (client-side), student count badge live
- **Per-student visibility:** only lessons for their class (`class_codes` + `lesson_access`)
- **Metrics:** Completed/Total, Completion Rate, Avg Score

### Troubleshooting Handbook (`/admin/troubleshooting`, mới 2026-11-20)
- Nút "🩺 Kiểm tra hệ thống" (fetch `/api/health`): **DB ok / DB lỗi (web vẫn mở) / không kiểm tra được (mạng admin)**. Case site sập hoàn toàn admin KHÔNG mở được trang → do UptimeRobot lo
- 8 sự cố dạng `<details>` collapsible: triệu chứng → bước tự kiểm tra → escalate (admin liên hệ dev trực tiếp, không ép kênh)
- Vùng xanh (admin tự làm: toggle, makeup, tạo bài) / Vùng đỏ (CẤM: Supabase Dashboard, Vercel, Resend, CORS, sửa DB/`class_code` — dev tự làm)
- ✅ Admin đã test pass

---

## 🎨 UI/LAYOUT (reference)

| Page | Note |
|------|------|
| `/practice/[id]` | Grid 4/8 (lg:col-span-4 / lg:col-span-8) |
| `/admin/lessons/new` + `[id]/edit` Step 4 | max-w-7xl, 12-col grid, passage full-width |
| Passage rendering | `whitespace-pre-wrap` on passage spans (giữ line breaks) |
| `/admin/lessons` table | `overflow-x-auto` (mobile) |

### Responsive Breakpoints (globals.css)
| Breakpoint | Target |
|------------|--------|
| ≤ 900px | lesson-grid 3→2, filter-grid 5→3, progress-grid 6→4 |
| ≤ 680px | lesson-grid 1, stats-grid 1, filter-grid 2, practice-layout stacks |
| ≤ 390px | filter-grid 1, progress-grid 2 |

### Dark Mode (11-05)
- `globals.css` (block cuối): `html[data-theme="dark"]` — nền xanh rêu mid-tone (KHÔNG đen), map ~50 utilities + component classes
- `ThemeToggle.tsx`: `useSyncExternalStore`, nút fixed góc phải-dưới; default Light, nhớ `localStorage`
- `layout.tsx`: inline script trước render (chống flash) + `suppressHydrationWarning`
- ⚠ Chưa visual test contrast bằng mắt; nếu pastel lệch → bổ sung rule trong block dark (không đụng code)

---

## 🔧 INFRASTRUCTURE CONFIG

### Vercel Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
RESEND_API_KEY=
EMAIL_FROM=dictation@successful-listening.online
```

### Cloudflare R2 CORS
```json
{
  "AllowedOrigins": [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://successful-listening.vercel.app",
    "https://successful-listening.online"
  ],
  "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "ETag"],
  "MaxAgeSeconds": 3600
}
```

### Cloudflare R2 Capacity (verify 2026-11-20)
- **Egress: MIỄN PHÍ, không giới hạn** (docs Cloudflare) → không lo bandwidth
- Free tier: 10 GB storage + 10M Class B reads + 1M Class A ops/tháng (vượt = pay-as-you-go, không chặn)
- Usage: 18 files, **322 MB** storage; file lớn nhất **25.2 MB**; worst-case reads ~1,800/tháng (300 SV × 6 lượt) ≈ 0.02% limit
- Re-check bất kỳ lúc nào: `node scripts/check-r2-usage.cjs`

### Supabase Connection Pooling
- **Mode:** Transaction (not Session), **Pool Size:** 20, Max Client Connections: 200 (fixed)
- Peak dự kiến 15-25 (300 SV homework style) → **Safe**

---

## 📊 MONITORING & ALERTING

### UptimeRobot (Free Tier)
| Monitor | URL | Interval |
|---------|-----|----------|
| Main Site | `https://successful-listening.online` | 5 min |
| Health Check | `https://successful-listening.online/api/health` | 5 min |

**Health Endpoint:** `app/api/health/route.ts` — GET, public, query `profiles` 1 row, trả `{status:"ok", db:"connected"}`

### Vercel Analytics
- Enabled (free): visitors, page load, function errors, bandwidth

### Supabase Logs
- Dashboard → Logs: filter `error` level, auth failures, storage errors

---

## 🚨 ROLLBACK PLAN

| Level | Trigger | Action | Time |
|-------|---------|--------|------|
| **L1 - Code** | UI bug, logic error | `git revert` → push → Vercel auto deploy | 2-3 min |
| **L2 - Config** | Wrong env var, CORS, policy | Fix in Vercel/Supabase/Cloudflare dashboard | 1-2 min |
| **L3 - Nuclear** | Data corruption, bad migration | Vercel: Promote previous deployment + Supabase: PITR (7-day retention) | 5-10 min |

### Vercel Rollback
```
Dashboard → Deployments → "..." on working deployment → "Promote to Production"
```

### Supabase PITR
```
Settings → Database → Backups → Point-in-time recovery → Restore to timestamp
```
Creates new project ref → update Vercel env vars → redeploy.

---

## 📅 WEEKLY OPERATIONS (MANUAL)

### Before Each Lesson Day (Mon/Wed/Fri/Sun)
1. Admin creates lesson via `/admin/lessons/new` (4-step wizard, upload MP3 at step 2)
2. `class_codes` at step 1 auto-syncs to `lesson_access` via trigger
3. **After creation:** `/admin` → LessonAccessPanel → confirm lesson is Open for target class
4. Students see lesson on dashboard with "Đã mở" badge

### Monitoring Daily
- UptimeRobot alerts (email) · Vercel Analytics errors · Supabase Logs · Connection Pooling chart
- Sự cố giữa buổi SV làm bài: admin mở `/admin/troubleshooting` (sổ tay + nút check hệ thống)

---

## 🔑 KEY FILES & LOCATIONS

| Area | Files |
|------|-------|
| **Auth Confirm** | `app/auth/confirm/route.ts` |
| **Auth Error** | `app/auth/auth-code-error/page.tsx` |
| **Register / Login / Reset** | `app/(auth)/register|login|forgot-password|reset-password/page.tsx` |
| **Dashboard** | `app/dashboard/page.tsx` |
| **Practice** | `app/practice/[id]/page.tsx` + `actions.ts` (submit, chấm `\|`, `formatCorrectAnswer`) |
| **Admin Lessons** | `app/admin/lessons/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`, `components/LessonRow.tsx` |
| **LessonAccessPanel** | `app/admin/LessonAccessPanel.tsx` |
| **Progress** | `app/admin/progress/page.tsx`, `ProgressClient.tsx` |
| **Troubleshooting** | `app/admin/troubleshooting/page.tsx`, `HealthCheckButton.tsx` |
| **Audio Presign** | `app/api/audio/presign/route.ts` |
| **Health Check** | `app/api/health/route.ts` |
| **Server Actions** | `app/admin/actions.ts` (create/update/delete/toggle/makeup/presign PUT) |
| **Supabase Client/Server** | `lib/supabase/client.ts`, `server.ts` |
| **Migrations** | `supabase/migrations/*.sql` |
| **Global Styles / Theme** | `app/globals.css` (kèm dark block), `app/ThemeToggle.tsx` |
| **R2 usage check** | `scripts/check-r2-usage.cjs` |

---

## ⚠️ KNOWN EDGE CASES & MITIGATIONS

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Admin non-tech edits lesson in Supabase Dashboard | Trigger `auth.uid()` = NULL | **FIXED:** trigger fallback to first admin |
| 300 SV simultaneous login | Pool exhaustion (20) | Transaction mode + homework pattern = safe |
| Audio file size | R2 upload | File ~25 MB max (verify 11-20), IELTS segments |
| Concurrent submissions | Race condition | DB unique constraint `(user_id, lesson_id, attempt_number)` |
| SV registers wrong class | Wrong lesson visibility | **Dev** sửa `profiles.class_code` qua Supabase Dashboard. Admin nontech KHÔNG tự làm (vùng đỏ, sổ tay) — panel đổi class chủ đích bỏ qua (11-20) |
| Vercel/Supabase downtime | No SLA free tier | UptimeRobot alerts + rollback plan + sổ tay sự cố |
| R2 CORS misconfig | Audio won't play | Verified config includes all origins |
| Lưu bài qua wizard | Toggle Mở/Đóng thủ công bị trigger ghi đè | Cảnh báo UI trong LessonAccessPanel (11-20) |

---

## 👥 TEAM & CONTACTS

| Role | Name | Access |
|------|------|--------|
| **Lead Developer** | You | Full (Vercel, Supabase, Cloudflare, Resend, GitHub) |
| **Admin (Non-tech)** | Colleague | Admin UI (kể cả `/admin/troubleshooting`). KHÔNG tự vào Supabase/Vercel — escalation trực tiếp dev |
| **Students** | 240-300 | Self-register via `/register` |

---

## 📝 FUTURE IMPROVEMENTS (Post-Thesis)

1. **Panel quản lý sinh viên** (đổi `class_code` trong app + audit) — chủ đích bỏ qua đợt này (dev sửa tay khi cần)
2. **Automated lesson scheduling** (cron + `lesson_access` inserts)
3. **Export progress to CSV/Excel** (tạm dùng nút "Xuất CSV" có sẵn ở `/admin`)
4. **Email notifications** when lesson opened for class
5. **Analytics dashboard** (completion rates, question difficulty)
6. **Load testing** for concurrent exam scenarios
7. **Dark mode:** visual contrast pass (bổ sung rule pastel nếu thiếu)

---

## 📋 CURRENT STATUS (2026-11-20)

| Area | Status |
|------|--------|
| Production | ✅ Running, UptimeRobot + Vercel Analytics active |
| Lint / Build | ✅ 0 errors / pass |
| Pre-launch checks (13 items) | ✅ Done (lịch sử, đã xóa khỏi file) |
| R2 capacity | ✅ Verified (egress free, 322MB/10GB) |
| Text audit user + admin | ✅ 22 fixes, 9 files (11-20) |
| Sổ tay sự cố cho nontech admin | ✅ Admin đã test |
| **Mở (open items)** | ⚠ (1) Dark mode chưa visual test contrast; (2) tổng số bài chưa chốt (< 84), mới có 18 audio — đang tạo dần theo weekly ops |

---

## 🕘 CHANGELOG

- **2026-11-04** UTC+7 timestamps (`lib/admin-utils.ts` → admin/history/LessonAccessPanel); chấm điểm `|` multi-variant (submit + practice + display); `updateLesson` Option B (bài có submissions chỉ sửa được đáp án); 2 bài cũ đã sửa qua UI, không re-grade. Deploy prod.
- **2026-11-05** Dark mode (`globals.css` + `ThemeToggle.tsx` + script `layout.tsx`); admin nav link → `/admin/lessons`.
- **2026-11-20** `scripts/check-r2-usage.cjs` (egress free, storage an toàn); audit text toàn bộ trang → 22 fixes (9 files: `|` display, presign 403 messages, wizard dead checkbox, delete-lesson confirm, min-password 8, trigger-overwrite warning…); sổ tay sự cố `/admin/troubleshooting` (health button + 8 incidents `<details>` + vùng xanh/đỏ); `.codegraph/` vào `.gitignore`.
