'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Question = {
  id: string
  question_number: number
  correct_answer: string
}

type Lesson = {
  id: number
  title: string
  audio_url: string
  passage: string
  total_questions: number
}

export default function PracticePage() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [result, setResult] = useState<{
    correct_count: number
    total_questions: number
    score: number
    percentage: number
  } | null>(null)
  const [resultsMap, setResultsMap] = useState<Record<number, boolean>>({}) // true = đúng

  // Audio control
  const audioRef = useRef<HTMLAudioElement>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const router = useRouter()
  const params = useParams()
  const lessonId = params.id
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Kiểm tra đã làm bài này chưa
      const { data: existing } = await supabase
        .from('submissions')
        .select('id')
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId)
        .maybeSingle()

      if (existing) {
        alert('Bạn đã làm bài này rồi!')
        router.push('/dashboard')
        return
      }

      // Lấy bài học
      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .single()

      if (lessonError || !lessonData) {
        alert('Không tìm thấy bài học')
        router.push('/dashboard')
        return
      }

      // Lấy danh sách câu hỏi
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('question_number', { ascending: true })

      setLesson(lessonData)
      setQuestions(questionsData || [])
      setLoading(false)
    }

    fetchData()
  }, [lessonId])

  // Xử lý Play (chỉ cho phép 1 lần khi chưa nộp bài)
  const handlePlay = () => {
    if (!audioRef.current) return

    if (!isSubmitted && hasPlayed) {
      alert('Bạn chỉ được nghe 1 lần trong lúc làm bài!')
      return
    }

    audioRef.current.play()
    setIsPlaying(true)

    if (!isSubmitted) {
      setHasPlayed(true)
    }
  }

  const handleAnswerChange = (num: number, value: string) => {
    setAnswers(prev => ({ ...prev, [num]: value }))
  }

  // Render đoạn văn thành các ô input
  const renderPassage = () => {
    if (!lesson?.passage) return null

    const parts = lesson.passage.split(/\{\{(\d+)\}\}/g)

    return (
      <div className="leading-8 text-gray-800 text-[15px]">
        {parts.map((part, index) => {
          // Nếu là số (đánh dấu chỗ trống)
          if (/^\d+$/.test(part)) {
            const num = parseInt(part)
            const isCorrect = resultsMap[num]
            const userValue = answers[num] || ''

            return (
              <input
                key={index}
                type="text"
                value={userValue}
                onChange={(e) => handleAnswerChange(num, e.target.value)}
                disabled={isSubmitted}
                className={`
                  inline-block mx-1 px-2 py-0.5 border-b-2 min-w-[100px] text-center
                  focus:outline-none
                  ${isSubmitted
                    ? isCorrect
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : 'border-red-500 text-red-600 bg-red-50'
                    : 'border-blue-400 text-blue-600 bg-blue-50'
                  }
                `}
                placeholder={`(${num})`}
              />
            )
          }
          // Phần text bình thường
          return <span key={index}>{part}</span>
        })}
      </div>
    )
  }

  // Nộp bài
  const handleSubmit = async () => {
    if (!lesson || questions.length === 0) return

    const unanswered = questions.filter(q => !answers[q.question_number]?.trim())
    if (unanswered.length > 0) {
      if (!confirm(`Bạn còn ${unanswered.length} câu chưa trả lời. Bạn có chắc muốn nộp bài?`)) {
        return
      }
    }

    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Chấm điểm
    let correctCount = 0
    const newResultsMap: Record<number, boolean> = {}

    questions.forEach(q => {
      const userAns = (answers[q.question_number] || '').trim().toLowerCase()
      const correctAns = q.correct_answer.trim().toLowerCase()
      const isCorrect = userAns === correctAns
      newResultsMap[q.question_number] = isCorrect
      if (isCorrect) correctCount++
    })

    const total = questions.length
    const percentage = total > 0 ? (correctCount / total) * 100 : 0
    const score = Math.round((correctCount / total) * 10 * 10) / 10 // thang 10, 1 chữ số thập phân

    // Lưu submission
    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .insert({
        user_id: user.id,
        lesson_id: lesson.id,
        correct_count: correctCount,
        total_questions: total,
        score: score,
        percentage: percentage,
        listen_count: hasPlayed ? 1 : 0,
        user_answer: JSON.stringify(answers) // tạm lưu
      })
      .select()
      .single()

    if (subError) {
      alert('Lỗi khi nộp bài: ' + subError.message)
      setSubmitting(false)
      return
    }

    // Lưu từng câu trả lời
    const answerRows = questions.map(q => ({
      submission_id: submission.id,
      question_id: q.id,
      user_answer: answers[q.question_number] || '',
      is_correct: newResultsMap[q.question_number]
    }))

    await supabase.from('submission_answers').insert(answerRows)

    setResultsMap(newResultsMap)
    setResult({ correct_count: correctCount, total_questions: total, score, percentage })
    setIsSubmitted(true)
    setSubmitting(false)

    // Sau khi nộp thì cho phép nghe lại tự do
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Đang tải bài học...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
        <div>
          <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
            ← Quay lại Dashboard
          </Link>
          <h1 className="text-xl font-bold mt-1">{lesson?.title}</h1>
        </div>
        {isSubmitted && result && (
          <div className="text-right">
            <p className="text-sm text-gray-600">Kết quả</p>
            <p className="text-2xl font-bold text-blue-700">
              {result.correct_count}/{result.total_questions} câu đúng
            </p>
            <p className="text-lg font-semibold text-green-600">
              Điểm: {result.score}/10
            </p>
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bên trái: Audio */}
        <div className="bg-white rounded-lg shadow p-6 h-fit">
          <h2 className="text-lg font-semibold mb-4">Nghe bài</h2>

          <audio
            ref={audioRef}
            src={lesson?.audio_url}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          {!isSubmitted ? (
            // Chế độ làm bài: chỉ Play 1 lần
            <div className="space-y-4">
              <button
                onClick={handlePlay}
                disabled={hasPlayed || isPlaying}
                className={`w-full py-3 rounded-md font-medium text-white ${
                  hasPlayed
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {hasPlayed ? 'Đã nghe (chỉ 1 lần)' : isPlaying ? 'Đang phát...' : '▶ Play'}
              </button>

              <div>
                <label className="text-sm text-gray-600">Âm lượng</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  defaultValue="1"
                  onChange={(e) => {
                    if (audioRef.current) audioRef.current.volume = parseFloat(e.target.value)
                  }}
                  className="w-full"
                />
              </div>

              <p className="text-sm text-orange-600 bg-orange-50 p-3 rounded">
                ⚠ Trong lúc làm bài bạn chỉ được nghe <strong>1 lần duy nhất</strong>. 
                Không thể tạm dừng hoặc tua.
              </p>
            </div>
          ) : (
            // Sau khi nộp: cho nghe tự do
            <div>
              <audio
                controls
                src={lesson?.audio_url}
                className="w-full"
              />
              <p className="text-sm text-green-600 mt-3">
                ✓ Bạn có thể nghe lại và tua tự do để kiểm tra lỗi sai.
              </p>
            </div>
          )}
        </div>

        {/* Bên phải: Đoạn văn đục lỗ */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Điền vào chỗ trống</h2>

          <div className="mb-6 p-4 bg-gray-50 rounded-md border">
            {renderPassage()}
          </div>

          {!isSubmitted ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {submitting ? 'Đang nộp bài...' : 'Nộp bài & Xem kết quả'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 rounded-md">
                <p className="font-medium">
                  Bạn đúng <span className="text-green-600">{result?.correct_count}</span> / {result?.total_questions} câu
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Điểm quy đổi: <strong>{result?.score}/10</strong> ({result?.percentage.toFixed(0)}%)
                </p>
              </div>
              <Link
                href="/dashboard"
                className="block text-center text-blue-600 hover:underline"
              >
                ← Quay lại danh sách bài
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}