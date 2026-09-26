'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  // 2. Kiểm tra đã làm bài này chưa
  const { data: existing } = await supabase
    .from('submissions')
    .select('id')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (existing) {
    return { success: false, message: 'Bạn đã làm bài này rồi' }
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

  // 5. Lưu submission
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
      user_answer: JSON.stringify(answers)
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