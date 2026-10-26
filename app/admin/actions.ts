'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
