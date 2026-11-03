# DICTATION TRACKING - PROJECT CONTEXT
**Production Deployment for Monday Launch**  
**Target:** Class NN1/D2026 (32 students) + 5 regular classes (~240 students total)  
**Domain:** `https://successful-listening.online`  
**Last Updated:** 2026-11-02

---

## 🎯 PROJECT OVERVIEW

| Aspect | Detail |
|--------|--------|
| **Purpose** | Thesis data collection - Dictation exercises for English listening practice |
| **Users** | ~240-300 students across 6 classes (1 advanced + 5 regular), admin team |
| **Timeline** | 4-5 weeks, lessons Mon/Wed/Fri/Sun, homework style (not simultaneous) |
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
| Code | Name | Type | Sort |
|------|------|------|------|
| N196/77DCTD24 | N196/77DCTD24 | Regular | 1 |
| N195/77DCTD23 | N195/77DCTD23 | Regular | 2 |
| N224/77DCDT24 | N224/77DCDT24 | Regular | 3 |
| N227/77DCDT22 | N227/77DCDT22 | Regular | 4 |
| N185/77DCOH22 | N185/77DCOH22 | Regular | 5 |
| **NN1/D2026** | **NN1/D2026** | **Advanced** | **6** |

### Lesson Assignment
| Lesson Set | Count | Class Codes | Visibility |
|------------|-------|-------------|------------|
| **Advanced** | 24 | `['NN1/D2026']` | Only NN1/D2026 students |
| **Regular** | 60 | `['N196/77DCTD24','N195/77DCTD23','N224/77DCDT24','N227/77DCDT22','N185/77DCOH22']` | 5 regular classes only |
| **Total** | 84 | | |

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

---

## 🎮 STUDENT FLOW

### Dashboard (`/dashboard`)
- Paginated lessons (10/page)
- Status badges: **Locked** → **Open** → **Done** → **Makeup**
- Exam mode: 1 listen attempt (`listen_attempts` PK enforces)
- Practice mode: Unlimited after first submission, max 5 practice sessions

### Practice Page (`/practice/[id]`)
- **Layout:** 4/12 Audio panel | 8/12 Passage (reduces vertical scroll)
- **Line breaks:** `whitespace-pre-wrap` on passage spans
- **Modes:** Exam (first attempt) | Practice (after submit) | Result (review)
- **Audio:** Presigned R2 URL (2hr expiry), streamed via `<audio>`

### Makeup Flow
1. Admin grants via LessonAccessPanel → inserts `makeup_grants` + deletes `listen_attempts`
2. Student sees "Làm lại" badge → clicks → new `listen_attempts` created
3. Submits → `submissions.attempt_number = 2`
4. Grant persists for audit, cannot grant twice (PK: user_id, lesson_id)

---

## 👨‍🏫 ADMIN FEATURES

### Lesson Wizard (4 Steps)
1. **Info:** Title, class multi-select (from `classes` table), draft/active
2. **Audio:** Drag-drop MP3 → R2 presigned PUT → key stored
3. **Passage:** Editor with `{{n}}` blanks, auto-generates answer inputs
4. **Preview:** Wide layout (max-w-7xl), passage full-width with line breaks

### LessonAccessPanel (`/admin` page)
- Dropdown select class → table of all lessons with Open/Close toggles
- Bulk Open/Close all for selected class
- Direct `lesson_access` inserts/deletes (bypasses trigger)
- Audit trail: `granted_by` (admin), `granted_at`

### Makeup Grant Panel
- Search student by name/MSV
- Select lesson → Grant Makeup
- Shows grant status: "Chưa cấp" / "Grant: chưa dùng" / "Grant: đã dùng"

### Progress Tracking (`/admin/progress`)
- **Filters:** Class dropdown + MSV search (client-side)
- **Student count badge:** Updates live with filter
- **Per-student visibility:** Only lessons for their class (via `class_codes` + `lesson_access`)
- **Metrics:** Completed/Total, Completion Rate, Avg Score

---

## 🎨 UI/LAYOUT CHANGES (2026-11-02)

| Page | Change |
|------|--------|
| `/practice/[id]` | Grid 6/6 → 4/8 (lg:col-span-4 / lg:col-span-8) |
| `/admin/lessons/new` Step 4 | max-w-3xl → max-w-7xl, 12-col grid, passage full-width |
| `/admin/lessons/[id]/edit` Step 4 | Same as new |
| Passage rendering | Added `whitespace-pre-wrap` to passage spans (line breaks) |
| `/admin/lessons` table | Added `overflow-x-auto` for mobile horizontal scroll |

### Responsive Breakpoints (globals.css)
| Breakpoint | Target |
|------------|--------|
| ≤ 900px | lesson-grid 3→2, filter-grid 5→3, progress-grid 6→4 |
| ≤ 680px | lesson-grid 1, stats-grid 1, filter-grid 2, practice-layout stacks |
| ≤ 390px | filter-grid 1, progress-grid 2 |

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

### Supabase Connection Pooling
- **Mode:** Transaction (not Session)
- **Pool Size:** 20
- **Max Client Connections:** 200 (fixed)
- **Current Usage:** ~5 pooled connections (13 total)
- **Projected Peak:** 15-25 (300 SV homework style) → **Safe**

---

## 📊 MONITORING & ALERTING

### UptimeRobot (Free Tier)
| Monitor | URL | Interval |
|---------|-----|----------|
| Main Site | `https://successful-listening.online` | 5 min |
| Health Check | `https://successful-listening.online/api/health` | 5 min |

**Health Endpoint:** `app/api/health/route.ts` - GET, public, checks DB connectivity, returns `{status:"ok", db:"connected"}`

### Vercel Analytics
- Enabled in dashboard (free)
- Tracks: visitors, page load, function errors, bandwidth

### Supabase Logs
- Bookmark: Dashboard → Logs → Database/Auth/Realtime/Storage
- Filter: `error` level, auth failures, storage errors

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

## 📋 DEPLOYMENT CHECKLIST (PRE-MONDAY)

| Task | Status | Notes |
|------|--------|-------|
| Migration `20261031000002_seed_real_classes.sql` | ✅ Done | 6 classes seeded |
| Email templates (3) updated | ✅ Done | Confirm signup, Reset password, Invite user |
| Redirect URLs configured | ✅ Done | Wildcard covers production |
| R2 CORS configured | ✅ Done | Includes production domain |
| Vercel env vars complete | ✅ Done | Including R2_ENDPOINT |
| Site URL → production | ✅ Done | `https://successful-listening.online` |
| Trigger `auth.uid()` fallback fix | ✅ Done | SQL run in Supabase |
| Connection pooling (Transaction, 20) | ✅ Done | Verified via `pg_stat_activity` |
| Health endpoint deployed | ✅ Done | `/api/health` |
| UptimeRobot monitors | ✅ Done | Main + Health |
| Vercel Analytics enabled | ✅ Done | Free tier |
| Full flow test (prod) | ✅ Done | Register → Confirm → Login → Practice → Submit |
| Admin flow test | ✅ Done | Create lesson, upload audio, open for NN1/D2026 |

---

## 📅 WEEKLY OPERATIONS (MANUAL)

### Before Each Lesson Day (Mon/Wed/Fri/Sun)
1. Admin creates lesson via `/admin/lessons/new` (4-step wizard)
2. Uploads audio MP3 in Step 2
3. Sets `class_codes` in Step 1 (auto-syncs to `lesson_access` via trigger)
4. **After creation:** Goes to `/admin` → LessonAccessPanel → Opens lesson for target class
5. Students see lesson on dashboard with "Đã mở" badge

### Monitoring Daily (First 2 Weeks)
- Check UptimeRobot alerts (email/Discord)
- Vercel Analytics: errors, bandwidth
- Supabase Logs: Database errors, auth failures
- Connection pooling: Dashboard → Reports → Connection Pooling chart

---

## 🔑 KEY FILES & LOCATIONS

| Area | Files |
|------|-------|
| **Auth Confirm** | `app/auth/confirm/route.ts` |
| **Auth Error** | `app/auth/auth-code-error/page.tsx` |
| **Register** | `app/(auth)/register/page.tsx` |
| **Login/Forgot/Reset** | `app/(auth)/login|forgot-password|reset-password/page.tsx` |
| **Dashboard** | `app/dashboard/page.tsx` |
| **Practice** | `app/practice/[id]/page.tsx` |
| **Admin Lessons** | `app/admin/lessons/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx` |
| **LessonAccessPanel** | `app/admin/LessonAccessPanel.tsx` |
| **Progress** | `app/admin/progress/page.tsx`, `ProgressClient.tsx` |
| **Audio Presign** | `app/api/audio/presign/route.ts` |
| **Health Check** | `app/api/health/route.ts` |
| **Server Actions** | `app/admin/actions.ts` |
| **Supabase Client/Server** | `lib/supabase/client.ts`, `server.ts` |
| **Migrations** | `supabase/migrations/*.sql` |
| **Global Styles** | `app/globals.css` |

---

## ⚠️ KNOWN EDGE CASES & MITIGATIONS

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Admin non-tech edits lesson in Supabase Dashboard | Trigger `auth.uid()` = NULL | **FIXED:** Trigger fallback to first admin |
| 300 SV simultaneous login | Pool exhaustion (20) | Transaction mode + homework pattern = safe |
| Audio > 50MB | R2 upload timeout | Current files < 20MB, IELTS segments |
| Concurrent submissions | Race condition | DB unique constraint `(user_id, lesson_id, attempt_number)` |
| SV registers wrong class | Wrong lesson visibility | Admin edits `profiles.class_code` → auto-recaclulates |
| Vercel/Supabase downtime | No SLA free tier | UptimeRobot alerts, rollback plan documented |
| R2 CORS misconfig | Audio won't play | Verified config includes all origins |

---

## 👥 TEAM & CONTACTS

| Role | Name | Access |
|------|------|--------|
| **Lead Developer** | You | Full (Vercel, Supabase, Cloudflare, Resend, GitHub) |
| **Admin (Non-tech)** | Colleague | Supabase Dashboard (Table Editor), Admin UI |
| **Students** | 240-300 | Self-register via `/register` |

---

## 📝 FUTURE IMPROVEMENTS (Post-Thesis)

1. **Automated lesson scheduling** (cron + `lesson_access` inserts)
2. **Export progress to CSV/Excel** (admin request)
3. **Email notifications** when lesson opened for class
4. **Analytics dashboard** (completion rates by class, question difficulty)
5. **Mobile PWA** (offline practice sync)
6. **Load testing** for concurrent exam scenarios

---

## 🎯 LAUNCH CONFIRMATION

**All systems green for Monday launch.**

- ✅ Infrastructure validated on production domain
- ✅ Auth flow tested end-to-end
- ✅ Admin workflows verified
- ✅ Monitoring active
- ✅ Rollback plan documented
- ✅ Free tier capacity confirmed for 300 SV / 5 weeks

**Next action:** `git push` any final changes → Monitor UptimeRobot/Vercel day 1.

---

## 📝 RECENT FIXES (2026-11-04)

### Timestamp Display Fix (UTC+7 Việt Nam)
| File | Change |
|------|--------|
| `lib/admin-utils.ts` | Added `utcToVietnamTime()` utility (fixed UTC+7, không dùng `toLocaleString("vi-VN")`) |
| `app/admin/page.tsx` | Submission timestamps dùng `utcToVietnamTime()` |
| `app/history/page.tsx` | Submission timestamps dùng `utcToVietnamTime()` |
| `app/admin/LessonAccessPanel.tsx` | `granted_at` timestamps dùng `utcToVietnamTime()` (2 chỗ) |

**Vấn đề gốc:** DB lưu `timestamptz` (UTC), hiển thị dùng `toLocaleString("vi-VN")` → phụ thuộc timezone browser → sai khi SV/admin ở múi giờ khác.

### Grading Logic: Multiple Acceptable Answers (`|` delimiter)
| File | Change |
|------|--------|
| `app/practice/[id]/actions.ts` (`submitPractice`) | Split `correct_answer` by `\|`, check `includes(userAns)` |
| `app/practice/[id]/actions.ts` (`getPracticeAnswers`) | Trả về `{ display, variants[] }` cho practice mode |
| `app/practice/[id]/page.tsx` | `checkPracticeAnswers` dùng `variants` để chấm, hiển thị `display` (biến thể đầu) |

**Cách dùng:** Admin nhập `correct_answer` dạng `harbour|harbor` hoặc `eighteenth century|18th century` → SV nhập bất kỳ biến thể nào → được điểm.

> ⚠️ Chỉ ảnh hưởng bài nộp **MỚI** (sau deploy). Bài cũ cần chạy SQL script re-grade riêng (chỉ `UPDATE`, không DDL).

### Lint & TypeScript Fixes
| File | Issue | Fix |
|------|-------|-----|
| `app/auth/verify-loading/page.tsx` | `setState` trong effect (error) | Bỏ state, đọc `window.location.search` trực tiếp trong render (sau hydration) |
| `app/admin/actions.ts` | Unused param `_classCodes` (warning) | Xoá param khỏi `getNextOrderNumber` + call site |

### Verification
- ✅ `npm run lint` — 0 errors, 0 warnings
- ✅ `npm run build` — TypeScript pass, compile success (`.next/` updated 1:49 AM)