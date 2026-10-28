# NHIỆM VỤ: CRUD Bài nghe cho Admin (Lesson Management)

Repo: dictation-tracking (Next.js 16 + Supabase + R2 + Vercel free tier).
Đã có: migration vòng 2 (lesson_access, practice_sessions, makeup_grants, attempt_number), Round 3 UX.
Mục tiêu: Admin tạo/sửa/xóa bài nghe **không cần code**, UX cho giáo viên non-technical.

---

## 1. Data Model (đã có trong DB)

```sql
-- lessons
id (int, PK, auto), title (text), audio_url (text = R2 object key),
passage (text, chứa {{1}} {{2}}...), total_questions (int),
order_number (int), is_active (bool), created_at, updated_at

-- questions
id (uuid, PK), lesson_id (FK), question_number (int), correct_answer (text)
```

---

## 2. Server Actions (thêm vào `app/admin/actions.ts`)

```ts
// types
type LessonInput = {
  title: string
  order_number: number
  is_active: boolean
  audio_url: string          // R2 object key
  passage: string            // raw text với {{1}} {{2}}...
  questions: { question_number: number; correct_answer: string }[]
}

// CREATE: transaction lessons + questions
export async function createLesson(input: LessonInput): Promise<{ success: boolean; lessonId?: number; message?: string }>

// READ: list cho admin (có join questions count)
export async function getLessonsAdmin(): Promise<LessonAdminRow[]>

// READ ONE: cho edit page
export async function getLessonAdmin(lessonId: number): Promise<LessonAdminDetail | null>

// UPDATE: transaction (xóa questions cũ, insert mới)
export async function updateLesson(lessonId: number, input: LessonInput): Promise<{ success: boolean; message?: string }>

// DELETE: xóa lesson + questions + (optional) R2 audio object
export async function deleteLesson(lessonId: number): Promise<{ success: boolean; message?: string }>

// R2 PRESIGNED POST: client upload thẳng R2
export async function getAudioPresignedPost(filename: string): Promise<{ url: string; key: string; fields: Record<string, string> }>
```

**Validation (Zod):**
- `title`: 1-200 chars
- `order_number`: int > 0, unique (check trùng khi create/update)
- `audio_url`: required, match `^audio/lesson_\d+\.mp3$`
- `passage`: required, có ≥1 blank `{{n}}`
- `questions`: length = số blank trong passage, `question_number` liên tục 1..N, `correct_answer` không rỗng

---

## 3. R2 Presigned POST Route (mới: `app/api/admin/audio/presign-post/route.ts`)

```ts
POST { filename: string } → { url: string; key: string; fields: Record<string, string> }

// Policy: 
// - bucket: R2_BUCKET_NAME
// - key: audio/lesson_${timestamp}_${random}.mp3
// - content-type: audio/mpeg
// - max size: 50MB
// - expiry: 10 phút
```

**Client dùng:** `FormData` append tất cả `fields` + `file` → `fetch(url, {method:'POST', body: formData})` → thành công → nhận `key` → điền vào form.

---

## 4. Passage Editor Component (mới: `app/admin/components/PassageEditor.tsx`)

**Props:**
```ts
type PassageEditorProps = {
  passage: string
  questions: { question_number: number; correct_answer: string }[]
  onChange: (passage: string, questions: QuestionInput[]) => void
}
```

**UI: 2 cột (desktop) / stack (mobile)**

| Cột trái (70%) | Cột phải (30%) |
|----------------|----------------|
| `textarea` (h: 300px) | Danh sách blank: mỗi dòng `Blank {{n}}` + `input` đáp án đúng |
| Toolbar: **[Chèn blank]** **[Xóa blank cuối]** **[Xóa tất cả]** | Nút **[+ Thêm blank]** (append vào cuối passage) |

**Logic:**
- `textarea` value = passage raw (`{{1}} {{2}}...`)
- Parse blanks: regex `/\{\{(\d+)\}\}/g` → lấy max number = `nextBlankNum`
- **"Chèn blank"**: tại cursor position insert `{{nextBlankNum}}`, nextBlankNum++
- **"Xóa blank cuối"**: xóa `{{max}}` khỏi passage + xóa đáp án dòng cuối
- **Sync 2 cột**: passage change → parse → cập nhật questions array (giữ đáp án cũ theo question_number, thêm dòng mới rỗng)
- **Validation**: đáp án không rỗng, question_number liên tục 1..N

**Không dùng contenteditable** — dùng `textarea` + toolbar đơn giản, tránh bug cursor/paste/mobile.

---

## 5. Admin Pages

### 5.1 List: `/admin/lessons` (Server Component)
- Bảng: STT | Tên | Thứ tự | Audio | Số câu | Trạng thái | Thao tác
- Trạng thái: badge "Đang mở" (xanh) / "Đang ẩn" (xám) — toggle `is_active` server action
- Thao tác: **[Sửa]** (link `/admin/lessons/[id]/edit`) **[Xem]** **[Xóa]** (confirm)
- Nút **"+ Thêm bài mới"** → `/admin/lessons/new`

### 5.2 Create Wizard: `/admin/lessons/new` (Client Component, 4 bước)

**State:** `step: 1|2|3|4`, `formData: LessonInput`

| Bước | UI | Validation trước khi Next |
|------|-----|---------------------------|
| **1. Thông tin** | Title, Order number, Trạng thái (radio) | Title không rỗng, Order > 0, không trùng |
| **2. Audio** | Drag-drop zone + progress → upload R2 via presigned POST → hiển thị key + nút "Xóa audio" | Có audio key |
| **3. Đoạn văn** | **PassageEditor** component | ≥1 blank, tất cả đáp án không rỗng |
| **4. Xem trước** | Audio player, Passage render (blank → `___(n)___`), Số câu | - |

**Nút điều hướng:** `← Quay lại` | `Tiếp →` (bước 4: **💾 Lưu nháp** / **✅ Lưu & Mở ngay**)
- Lưu nháp: `is_active=false`
- Lưu & Mở: `is_active=true`
- Gọi `createLesson` → toast success → redirect `/admin/lessons`

### 5.3 Edit: `/admin/lessons/[id]/edit` (Client Component)
- Giống Create Wizard nhưng pre-fill data từ `getLessonAdmin(id)`
- Bước 2: hiển thị audio hiện tại + nút "Thay audio" (upload mới → thay key)
- Nút: **💾 Cập nhật** (gọi `updateLesson`) / **🗑️ Xóa** (confirm → `deleteLesson`)

### 5.4 Delete Confirm
- Modal confirm: "Xóa vĩnh viễn bài '[title]'? Sẽ xóa cả audio, đáp án, lịch sử làm bài của SV."
- Nút "Xóa" → `deleteLesson` → toast → redirect list.

---

## 6. Integration với hệ thống hiện có

- Sau tạo bài (`is_active=true`): tự động xuất hiện trong `LessonAccessPanel` dropdown → admin bật cho lớp
- `order_number` quyết định thứ tự hiển thị dashboard SV
- `audio_url` = R2 object key (format `audio/lesson_<id>.mp3` hoặc timestamp)
- `total_questions` = `questions.length` (tự tính, không nhập tay)

---

## 7. Files to Create/Modify

| File | Action |
|------|--------|
| `app/admin/actions.ts` | Thêm 5 server actions + Zod schemas |
| `app/api/admin/audio/presign-post/route.ts` | **MỚI** presigned POST R2 |
| `app/admin/components/PassageEditor.tsx` | **MỚI** editor component |
| `app/admin/lessons/page.tsx` | **MỚI** list page (Server Component) |
| `app/admin/lessons/new/page.tsx` | **MỚI** create wizard (Client) |
| `app/admin/lessons/[id]/edit/page.tsx` | **MỚI** edit page (Client) |
| `app/admin/lessons/[id]/page.tsx` | **MỚI** (optional) view detail |
| `app/globals.css` | Thêm styles cho wizard steps, drag-drop zone, passage editor |

---

## 8. Acceptance Criteria (Test checklist)

| # | Test | Pass |
|---|------|------|
| 1 | `/admin/lessons` load list, toggle active, nút thêm/sửa/xóa | |
| 2 | Create wizard bước 1-4: validation từng bước, không cho next nếu lỗi | |
| 3 | Bước 2: drag-drop mp3 → upload R2 → nhận key → hiển thị | |
| 4 | Bước 3: gõ passage, chèn blank {{1}} {{2}}, nhập đáp án → sync 2 cột | |
| 5 | "Chèn blank" tại cursor, auto numbering {{1}} {{2}}... | |
| 6 | "Xóa blank cuối" xóa blank + đáp án dòng cuối | |
| 7 | Bước 4: xem trước audio, passage render, số câu đúng | |
| 8 | "Lưu & Mở ngay" → bài xuất hiện list, `is_active=true`, redirect | |
| 9 | Edit: pre-fill data, thay audio được, cập nhật questions | |
| 10 | Xóa: confirm modal → xóa lesson + questions + (optional) R2 object | |
| 11 | Bài mới xuất hiện trong `LessonAccessPanel` dropdown | |
| 12 | SV dashboard thấy bài theo `order_number`, chỉ khi admin mở lớp | |
| 13 | Build ✅ Lint ✅ Typecheck ✅ | |

---

## 9. Ràng buộc

- **Không migration DB** (schema đã sẵn)
- **Không dependency mới** (chỉ Zod nếu chưa có — đã có trong project)
- **Reuse patterns**: server action style như `toggleLessonAccess`, `grantMakeup`; R2 presigned như `/api/audio/presign` (GET) nhưng đổi sang POST policy
- **Free-tier**: R2 presigned POST client-direct (không qua server bandwidth)
- **MVP scope**: textarea + toolbar, không contenteditable, không preview real-time, không drag-drop reorder, không versioning

---

## 10. Thứ tự implement gợi ý

1. **Server actions + Zod** (`actions.ts`) — test qua script/console
2. **R2 presigned POST route** — test upload file tạm
3. **PassageEditor component** — test isolated (Storybook hoặc page tạm)
4. **List page** (`/admin/lessons`) — hiển thị dữ liệu thật
5. **Create wizard** (4 bước) — wiring actions + PassageEditor
6. **Edit page** — reuse wizard logic
7. **Delete + integration** (LessonAccessPanel, SV dashboard)
8. **Polish**: toast, loading, error handling, mobile responsive

---

**Ước lượng:** ~20k tokens, ~2.5h (MVP scope). Opencode chạy liên tục, bạn review diff sau phase 1, 3, 5, 7.