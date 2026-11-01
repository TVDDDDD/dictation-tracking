'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassOption = {
  code: string
  name: string
  is_advanced: boolean
  sort_order: number
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Bạn chưa đăng nhập' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Chỉ admin được thao tác này' as const }
  }
  return { supabase, user }
}

/** Bật/tắt quyền làm bài của 1 lớp đối với 1 bài. */
export async function toggleLessonAccess(
  lessonId: number,
  classCode: string,
  open: boolean
) {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  const { supabase, user } = guard

  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return { success: false, message: 'Lesson id không hợp lệ' }
  }
  const trimmedClass = (classCode || '').trim()
  if (!trimmedClass) {
    return { success: false, message: 'Mã lớp không hợp lệ' }
  }

  if (open) {
    const { error } = await supabase
      .from('lesson_access')
      .insert({
        lesson_id: lessonId,
        class_code: trimmedClass,
        granted_by: user.id,
      })
    if (error && error.code !== '23505') {
      return { success: false, message: 'Không thể mở bài: ' + error.message }
    }
  } else {
    const { error } = await supabase
      .from('lesson_access')
      .delete()
      .eq('lesson_id', lessonId)
      .eq('class_code', trimmedClass)
    if (error) {
      return { success: false, message: 'Không thể đóng bài: ' + error.message }
    }
  }

  revalidatePath('/dashboard')
  return { success: true, message: open ? 'Đã mở bài' : 'Đã đóng bài' }
}

/** Cấp quyền làm lại (makeup) cho SV: insert grant + xóa listen_attempts để nghe lại 1 lần. */
export async function grantMakeup(studentId: string, lessonId: number) {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  const { supabase, user } = guard

  if (!studentId || !Number.isInteger(lessonId) || lessonId <= 0) {
    return { success: false, message: 'Tham số không hợp lệ' }
  }

  const { data: student, error: studentError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()
  if (studentError || !student) {
    return { success: false, message: 'Không tìm thấy sinh viên' }
  }

  const { error: grantError } = await supabase
    .from('makeup_grants')
    .insert({
      user_id: studentId,
      lesson_id: lessonId,
      granted_by: user.id,
    })
  if (grantError) {
    if (grantError.code === '23505') {
      return {
        success: false,
        message: 'Sinh viên này đã được cấp làm lại bài rồi',
      }
    }
    return { success: false, message: 'Không thể cấp grant: ' + grantError.message }
  }

  // Xóa listen_attempts để SV nghe lại đúng 1 lần ở chế độ exam
  const { error: delError } = await supabase
    .from('listen_attempts')
    .delete()
    .eq('user_id', studentId)
    .eq('lesson_id', lessonId)
  if (delError) {
    return {
      success: false,
      message: 'Grant đã lưu nhưng không xóa được listen attempt: ' + delError.message,
    }
  }

  revalidatePath('/dashboard')
  return { success: true, message: `Đã cấp làm lại cho ${student.full_name || studentId}` }
}

// ============================================================
// LESSON CRUD SERVER ACTIONS
// ============================================================

type QuestionInput = {
  question_number: number
  correct_answer: string
}

type LessonInput = {
  title: string
  order_number?: number
  is_active: boolean
  audio_url: string
  passage: string
  questions: QuestionInput[]
  class_codes?: string[]
}

type LessonAdminRow = {
  id: number
  title: string
  order_number: number
  audio_url: string
  total_questions: number
  is_active: boolean
  created_at: string
  updated_at?: string
  class_codes?: string[]
}

type LessonAdminDetail = LessonAdminRow & {
  passage: string
  questions: QuestionInput[]
}

// Validation helpers
function validateLessonInput(input: LessonInput): { valid: boolean; message?: string } {
  if (!input.title || input.title.trim().length === 0 || input.title.length > 200) {
    return { valid: false, message: 'Tên bài phải từ 1-200 ký tự' }
  }
  // order_number is optional now - will be auto-generated
  if (input.order_number !== undefined && (!Number.isInteger(input.order_number) || input.order_number <= 0)) {
    return { valid: false, message: 'Thứ tự bài phải là số nguyên dương' }
  }
  if (!input.audio_url || !/^audio\/lesson_\d+_[a-z0-9]+\.mp3$/.test(input.audio_url)) {
    return { valid: false, message: 'Audio key không đúng định dạng: audio/lesson_<timestamp>_<random>.mp3' }
  }
  if (!input.passage || input.passage.trim().length === 0) {
    return { valid: false, message: 'Đoạn văn không được rỗng' }
  }
  const blankMatches = input.passage.match(/\{\{(\d+)\}\}/g)
  const blankCount = blankMatches ? blankMatches.length : 0
  if (blankCount === 0) {
    return { valid: false, message: 'Đoạn văn phải có ít nhất 1 ô trống {{n}}' }
  }
  if (input.questions.length !== blankCount) {
    return { valid: false, message: `Số đáp án (${input.questions.length}) không khớp số ô trống (${blankCount})` }
  }
  // Check question_number sequence 1..N
  for (let i = 0; i < input.questions.length; i++) {
    const q = input.questions[i]
    if (q.question_number !== i + 1) {
      return { valid: false, message: `Question number phải liên tục từ 1 (thứ ${i + 1} thấy ${q.question_number})` }
    }
    const ans = (q.correct_answer ?? '').trim()
    if (!ans) {
      return { valid: false, message: `Đáp án câu ${q.question_number} không được rỗng` }
    }
  }
  return { valid: true }
}

async function checkOrderNumberUnique(supabase: SupabaseClient, orderNumber: number, excludeId?: number): Promise<boolean> {
  let query = supabase.from('lessons').select('id').eq('order_number', orderNumber)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query.maybeSingle()
  return !data
}

async function getNextOrderNumber(supabase: SupabaseClient, _classCodes: string[]): Promise<number> {
  // Global sequence: max order_number across all lessons + 1
  const { data } = await supabase
    .from('lessons')
    .select('order_number')
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.order_number ?? 0) + 1
}

/** CREATE: transaction lessons + questions */
export async function createLesson(input: LessonInput): Promise<{ success: boolean; lessonId?: number; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { supabase, user: _user } = guard

  const validation = validateLessonInput(input)
  if (!validation.valid) return { success: false, message: validation.message }

  // Auto-generate order_number if not provided
  const classCodes = input.class_codes || []
  const orderNumber = input.order_number ?? (await getNextOrderNumber(supabase, classCodes))

  if (!(await checkOrderNumberUnique(supabase, orderNumber))) {
    return { success: false, message: `Thứ tự bài ${orderNumber} đã tồn tại` }
  }

  // Insert lesson
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .insert({
      title: input.title.trim(),
      order_number: orderNumber,
      is_active: input.is_active,
      audio_url: input.audio_url,
      passage: input.passage,
      total_questions: input.questions.length,
      class_codes: classCodes,
    })
    .select('id')
    .single()

  if (lessonError || !lesson) {
    return { success: false, message: 'Tạo bài thất bại: ' + (lessonError?.message || 'Unknown') }
  }

  // Insert questions - đảm bảo correct_answer không null
  const questionsToInsert = input.questions.map(q => ({
    lesson_id: lesson.id,
    question_number: q.question_number,
    correct_answer: (q.correct_answer ?? '').trim(),
  }))
    const { error: qError } = await supabase.from('questions').insert(questionsToInsert)
  if (qError) {
    // Rollback lesson
    await supabase.from('lessons').delete().eq('id', lesson.id)
    return { success: false, message: 'Tạo đáp án thất bại: ' + qError.message }
  }

  revalidatePath('/admin/lessons')
  return { success: true, lessonId: lesson.id, message: 'Tạo bài thành công' }
}

/** READ: list cho admin (có join questions count) */
export async function getLessonsAdmin(): Promise<LessonAdminRow[]> {
  const guard = await assertAdmin()
  if (guard.error) return []
  const { supabase } = guard

  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, order_number, audio_url, total_questions, is_active, created_at, updated_at, class_codes')
    .order('order_number', { ascending: true })

  if (error) {
    console.error('getLessonsAdmin error:', JSON.stringify(error, null, 2), error?.message, error?.code, error?.details, error?.hint)
    return []
  }
  return (data as LessonAdminRow[]) || []
}

/** READ ONE: cho edit page */
export async function getLessonAdmin(lessonId: number): Promise<LessonAdminDetail | null> {
  const guard = await assertAdmin()
  if (guard.error) return null
  const { supabase } = guard

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, title, order_number, audio_url, passage, total_questions, is_active, created_at, updated_at, class_codes')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) return null

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('question_number, correct_answer')
    .eq('lesson_id', lessonId)
    .order('question_number', { ascending: true })

  if (qError) return null

  return {
    ...lesson,
    questions: (questions as QuestionInput[]) || [],
  }
}

/** UPDATE: transaction (xóa questions cũ, insert mới) */
export async function updateLesson(lessonId: number, input: LessonInput): Promise<{ success: boolean; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { supabase, user: _user } = guard

  const validation = validateLessonInput(input)
  if (!validation.valid) return { success: false, message: validation.message }

  // Get existing lesson to preserve order_number if not provided
  const { data: existing } = await supabase
    .from('lessons')
    .select('order_number')
    .eq('id', lessonId)
    .maybeSingle()

  if (!existing) {
    return { success: false, message: 'Bài không tồn tại' }
  }

  // Use provided order_number, or keep existing one (don't auto-generate on update)
  const orderNumber = input.order_number ?? existing.order_number
  const classCodes = input.class_codes || []

  if (!(await checkOrderNumberUnique(supabase, orderNumber, lessonId))) {
    return { success: false, message: `Thứ tự bài ${orderNumber} đã tồn tại` }
  }

  // Check for existing submissions - nếu đã có submissions thì không cho sửa questions/passage
  // (để bảo toàn dữ liệu thesis, giống deleteLesson)
  const { count: subCount, error: countError } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_id', lessonId)

  if (countError) {
    return { success: false, message: 'Kiểm tra submissions thất bại: ' + countError.message }
  }

  const hasSubmissions = (subCount ?? 0) > 0

  // Update lesson (luôn cho sửa title, order_number, is_active, audio_url, class_codes)
  const { error: lessonError } = await supabase
    .from('lessons')
    .update({
      title: input.title.trim(),
      order_number: orderNumber,
      is_active: input.is_active,
      audio_url: input.audio_url,
      total_questions: input.questions.length,
      class_codes: classCodes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId)

  if (lessonError) {
    return { success: false, message: 'Cập nhật bài thất bại: ' + lessonError.message }
  }

  // Nếu đã có submissions → KHÔNG cho sửa passage/questions (bảo toàn đáp án chấm đã nộp)
  if (hasSubmissions) {
    revalidatePath('/admin/lessons')
    return { success: true, message: 'Cập nhật bài thành công (đã có submissions → không thay đổi đáp án/đoạn văn)' }
  }

  // Delete old questions
  const { error: delQError } = await supabase
    .from('questions')
    .delete()
    .eq('lesson_id', lessonId)
  if (delQError) {
    return { success: false, message: 'Xóa đáp án cũ thất bại: ' + delQError.message }
  }

  // Insert new questions - đảm bảo correct_answer không null
  const questionsToInsert = input.questions.map(q => ({
    lesson_id: lessonId,
    question_number: q.question_number,
    correct_answer: (q.correct_answer ?? '').trim(),
  }))
  const { error: qError } = await supabase.from('questions').insert(questionsToInsert)
  if (qError) {
    return { success: false, message: 'Tạo đáp án mới thất bại: ' + qError.message }
  }

  revalidatePath('/admin/lessons')
  return { success: true, message: 'Cập nhật bài thành công' }
}

/** DELETE: xóa lesson + questions + (optional) R2 audio object
 *  Chặn xóa nếu bài đã có submissions (bảo toàn dữ liệu thesis) */
export async function deleteLesson(lessonId: number): Promise<{ success: boolean; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { supabase, user: _user } = guard

  // Check for existing submissions
  const { count: subCount, error: countError } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('lesson_id', lessonId)

  if (countError) {
    return { success: false, message: 'Kiểm tra submissions thất bại: ' + countError.message }
  }

  if ((subCount ?? 0) > 0) {
    return {
      success: false,
      message: `Không thể xóa: bài này đã có ${subCount} lượt làm. Hãy dùng "Vô hiệu hóa" (is_active = false) để ẩn bài thay vì xóa.`
    }
  }

  // Get audio_url for optional R2 delete
  const { data: lesson } = await supabase
    .from('lessons')
    .select('audio_url, title')
    .eq('id', lessonId)
    .maybeSingle()

  // Delete questions (no submissions exist, so no submission_answers FK conflict)
  const { error: qError } = await supabase
    .from('questions')
    .delete()
    .eq('lesson_id', lessonId)
  if (qError) {
    return { success: false, message: 'Xóa đáp án thất bại: ' + qError.message }
  }

  // Delete lesson
  const { error: lessonError } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)
  if (lessonError) {
    return { success: false, message: 'Xóa bài thất bại: ' + lessonError.message }
  }

  // Optional: delete R2 audio object (best effort)
  if (lesson?.audio_url) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: true,
      })
            await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: lesson.audio_url }))
    } catch (e) {
      console.warn('Failed to delete R2 audio:', e)
    }
  }

  revalidatePath('/admin/lessons')
  return { success: true, message: `Đã xóa bài "${lesson?.title || lessonId}"` }
}

/** R2 PRESIGNED PUT: client upload thẳng R2 (dùng putObject presigned URL - không cần dependency mới) */
export async function getAudioPresignedPut(filename: string): Promise<{ success: boolean; url?: string; key?: string; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }

  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = filename.split('.').pop()?.toLowerCase() || 'mp3'
  const key = `audio/lesson_${timestamp}_${random}.${ext}`

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  })

  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: 'audio/mpeg',
    })

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 }) // 10 phút

    return { success: true, url: signedUrl, key }
  } catch (e) {
    console.error('Presigned PUT error:', e)
    return { success: false, message: 'Không tạo được presigned PUT: ' + (e instanceof Error ? e.message : 'Unknown') }
  }
}

/** Get all classes for dropdown/checkbox selection */
export async function getClasses(): Promise<{ success: boolean; data?: ClassOption[]; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  const { supabase } = guard

  const { data, error } = await supabase
    .from('classes')
    .select('code, name, is_advanced, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    return { success: false, message: 'Lấy danh sách lớp thất bại: ' + error.message }
  }
  return { success: true, data: (data as ClassOption[]) || [] }
}

/** RE-SEQUENCE: gán lại order_number toàn cục 1,2,3... theo created_at */
export async function resequenceLessons(): Promise<{ success: boolean; message?: string }> {
  const guard = await assertAdmin()
  if (guard.error) return { success: false, message: guard.error }
  const { supabase } = guard

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, created_at')
    .order('created_at', { ascending: true })

  if (error || !lessons) {
    return { success: false, message: 'Lấy danh sách bài thất bại: ' + (error?.message || 'Unknown') }
  }

  for (let i = 0; i < lessons.length; i++) {
    const { error: upErr } = await supabase
      .from('lessons')
      .update({ order_number: i + 1 })
      .eq('id', lessons[i].id)
    if (upErr) {
      return { success: false, message: `Cập nhật bài ${lessons[i].id} thất bại: ` + upErr.message }
    }
  }

  revalidatePath('/admin/lessons')
  return { success: true, message: `Đã cấp lại thứ tự cho ${lessons.length} bài (1..${lessons.length})` }
}
