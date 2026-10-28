'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ===== Lấy đáp án đúng cho chế độ ôn tập (chỉ cho phép khi đã có submission HOẶC là admin) =====
export async function getPracticeAnswers(lessonId: number) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, message: 'Bạn chưa đăng nhập' }
  }

  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.role === 'admin'

  // Guard: chỉ cho phép khi đã có submission (đã nộp bài ít nhất 1 lần) HOẶC là admin
  if (!isAdmin) {
    const { data: subs, error: subError } = await supabase
      .from('submissions')
      .select('id')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .limit(1)

    if (subError || !subs || subs.length === 0) {
      return { success: false, message: 'Chưa có bài làm nào, không thể xem đáp án ôn tập' }
    }
  }

  // Lấy đáp án đúng từ questions
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, question_number, correct_answer')
    .eq('lesson_id', lessonId)
    .order('question_number')

  if (qError || !questions || questions.length === 0) {
    return { success: false, message: 'Không tìm thấy câu hỏi của bài này' }
  }

  const answersMap: Record<number, string> = {}
  for (const q of questions) {
    answersMap[q.question_number] = q.correct_answer
  }

  return { success: true, answers: answersMap }
}

// ===== Kiểm tra giới hạn ôn tập (tối đa 5 lần, admin unlimited) =====
export async function checkPracticeLimit(lessonId: number) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, message: 'Bạn chưa đăng nhập', count: 0 }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.role === 'admin'

  if (isAdmin) {
    return { success: true, count: 0, allowed: true, remaining: 999 }
  }

  const { count, error } = await supabase
    .from('practice_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)

  if (error) {
    return { success: false, message: 'Lỗi kiểm tra giới hạn', count: 0 }
  }

  const currentCount = count || 0
  return {
    success: true,
    count: currentCount,
    allowed: currentCount < 5,
    remaining: Math.max(0, 5 - currentCount)
  }
}

export async function submitPractice(
  lessonId: number,
  answers: Record<number, string>, // { 1: "câu trả lời", 2: "..." }
  listenCount: number
) {
  const supabase = await createClient()

  // 1. Kiểm tra đăng nhập
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, message: 'Bạn chưa đăng nhập' }
  }

  // Check if admin
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = adminProfile?.role === 'admin'

  // 2. Kiểm tra quyền làm bài: lesson_access (attempt 1) / makeup_grant (attempt >= 2)
  // Admin bypass all checks
  if (!isAdmin) {
    const [profileResult, subsResult, grantResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('class_code')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('submissions')
        .select('id')
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId),
      supabase
        .from('makeup_grants')
        .select('id')
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId)
        .maybeSingle(),
    ])

    const existingCount = (subsResult.data || []).length
    const attemptNumber = existingCount + 1

    if (attemptNumber === 1) {
      // Lần đầu: bài phải mở cho lớp của sinh viên, HOẶC có makeup grant
      // chưa dùng (admin cấp trước khi SV làm) — defense in depth,
      // chống gọi thẳng server action khi dashboard đã chặn
      const classCode = (profileResult.data?.class_code || '').trim()
      const grantUnused = Boolean(grantResult.data) && existingCount < 2
      if (!grantUnused) {
        if (!classCode) {
          return {
            success: false,
            message: 'Bạn chưa có mã lớp, không thể làm bài này',
          }
        }
        const { data: access } = await supabase
          .from('lesson_access')
          .select('id')
          .eq('lesson_id', lessonId)
          .eq('class_code', classCode)
          .maybeSingle()
        if (!access) {
          return { success: false, message: 'Bài chưa mở cho lớp của bạn' }
        }
      }
    } else {
      // Làm lại (makeup): cần grant chưa dùng. "Chưa dùng" = số submissions
      // hiện có cho cặp (user, lesson) < 2 (chưa có attempt 2).
      const grantUnused = Boolean(grantResult.data) && existingCount < 2
      if (!grantResult.data) {
        return {
          success: false,
          message: 'Bạn chưa được cấp quyền làm lại bài này',
        }
      }
      if (!grantUnused) {
      return {
        success: false,
        message: 'Bạn đã sử dụng quyền làm lại của bài này rồi',
      }
    }
  }
}

  let attemptNumber = 1

  // Admin: tự động set attemptNumber = 1 (hoặc count existing + 1)
  if (isAdmin) {
    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
    attemptNumber = (count || 0) + 1
  }

  // 3. Lấy đáp án đúng từ database (chỉ server mới lấy được)
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, question_number, correct_answer')
    .eq('lesson_id', lessonId)
    .order('question_number')

  if (qError || !questions || questions.length === 0) {
    return { success: false, message: 'Không tìm thấy câu hỏi của bài này' }
  }

  // 4. Chấm điểm
  let correctCount = 0
  const answerDetails: {
    question_id: string
    user_answer: string
    is_correct: boolean
  }[] = []

  questions.forEach((q) => {
    const userAns = (answers[q.question_number] || '').trim().toLowerCase()
    const correctAns = q.correct_answer.trim().toLowerCase()
    const isCorrect = userAns === correctAns

    if (isCorrect) correctCount++

    answerDetails.push({
      question_id: q.id,
      user_answer: answers[q.question_number] || '',
      is_correct: isCorrect
    })
  })

  const totalQuestions = questions.length
  const percentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0
  const score = Math.round((correctCount / totalQuestions) * 10 * 10) / 10 // thang 10

  // 5. Lưu submission (attempt_number = số submissions hiện có + 1)
  const { data: submission, error: subError } = await supabase
    .from('submissions')
    .insert({
      user_id: user.id,
      lesson_id: lessonId,
      correct_count: correctCount,
      total_questions: totalQuestions,
      score: score,
      percentage: percentage,
      listen_count: listenCount,
      user_answer: JSON.stringify(answers),
      attempt_number: attemptNumber
    })
    .select()
    .single()

  if (subError) {
    // Nếu bị lỗi unique constraint
    if (subError.code === '23505') {
      return { success: false, message: 'Bạn đã làm bài này rồi' }
    }
    return { success: false, message: 'Lỗi khi lưu bài làm: ' + subError.message }
  }

  // 6. Lưu từng câu trả lời
  const answerRows = answerDetails.map((item) => ({
    submission_id: submission.id,
    question_id: item.question_id,
    user_answer: item.user_answer,
    is_correct: item.is_correct
  }))

  const { error: ansError } = await supabase
    .from('submission_answers')
    .insert(answerRows)

  if (ansError) {
    console.error('Lỗi lưu submission_answers:', ansError)
    // Vẫn trả về thành công vì submission đã lưu
  }

  // 7. Trả kết quả về client
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/history')

  return {
    success: true,
    result: {
      correct_count: correctCount,
      total_questions: totalQuestions,
      score,
      percentage,
      details: answerDetails.map((d, index) => ({
        question_number: questions[index].question_number,
        is_correct: d.is_correct,
        user_answer: d.user_answer,
        correct_answer: questions[index].correct_answer // chỉ trả về sau khi đã nộp
      }))
    }
  }
}