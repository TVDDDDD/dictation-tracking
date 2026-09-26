'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { submitPractice } from './actions'

type Question = {
  id: string
  question_number: number
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
  const [resultsMap, setResultsMap] = useState<Record<number, boolean>>({})
  const [correctAnswersMap, setCorrectAnswersMap] = useState<Record<number, string>>({})

  // Audio
  const audioRef = useRef<HTMLAudioElement>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  const router = useRouter()
  const params = useParams()
  const lessonId = Number(params.id)
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Kiểm tra đã làm bài chưa
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

      // Lấy thông tin bài (không lấy đáp án đúng)
      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .select('id, title, audio_url, passage, total_questions')
        .eq('id', lessonId)
        .single()

      if (lessonError || !lessonData) {
        alert('Không tìm thấy bài học')
        router.push('/dashboard')
        return
      }

      // Chỉ lấy id + question_number (không lấy correct_answer)
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, question_number')
        .eq('lesson_id', lessonId)
        .order('question_number', { ascending: true })

      setLesson(lessonData)
      setQuestions(questionsData || [])
      setLoading(false)
    }

    fetchData()
  }, [lessonId])

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

  // Render đoạn văn đục lỗ
  const renderPassage = () => {
    if (!lesson?.passage) return null

    const parts = lesson.passage.split(/\{\{(\d+)\}\}/g)

    return (
      <div className="leading-8 text-gray-800 text-[15px]">
        {parts.map((part, index) => {
          if (/^\d+$/.test(part)) {
            const num = parseInt(part)
            const isCorrect = resultsMap[num]
            const userValue = answers[num] || ''

            return (
              <span key={index} className="inline-block mx-1">
                <input
                  type="text"
                  value={userValue}
                  onChange={(e) => handleAnswerChange(num, e.target.value)}
                  disabled={isSubmitted}
                  className={`
                    inline-block px-2 py-0.5 border-b-2 min-w-[110px] text-center
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
                {/* Hiện đáp án đúng nếu sai */}
                {isSubmitted && !isCorrect && correctAnswersMap[num] && (
                  <span className="ml-1 text-xs text-green-700">
                    ({correctAnswersMap[num]})
                  </span>
                )}
              </span>
            )
          }
          return <span key={index}>{part}</span>
        })}
      </div>
    )
  }

  // Nộp bài - gọi Server Action
  const handleSubmit = async () => {
    if (!lesson || questions.length === 0) return

    const unanswered = questions.filter(q => !answers[q.question_number]?.trim())
    if (unanswered.length > 0) {
      if (!confirm(`Bạn còn ${unanswered.length} câu chưa trả lời. Bạn có chắc muốn nộp bài?`)) {
        return
      }
    }

    setSubmitting(true)

    const res = await submitPractice(lesson.id, answers, hasPlayed ? 1 : 0)

    if (!res.success) {
      alert(res.message || 'Có lỗi xảy ra khi nộp bài')
      setSubmitting(false)
      return
    }

    // Xử lý kết quả từ server
    if (res.result) {
      const newResultsMap: Record<number, boolean> = {}
      const newCorrectMap: Record<number, string> = {}

      res.result.details.forEach((item) => {
        newResultsMap[item.question_number] = item.is_correct
        newCorrectMap[item.question_number] = item.correct_answer
      })

      setResultsMap(newResultsMap)
      setCorrectAnswersMap(newCorrectMap)
      setResult({
        correct_count: res.result.correct_count,
        total_questions: res.result.total_questions,
        score: res.result.score,
        percentage: res.result.percentage
      })
      setIsSubmitted(true)
    }

    setSubmitting(false)

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
                    if (audioRef.current) {
                      audioRef.current.volume = parseFloat(e.target.value)
                    }
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
            <div>
              <audio controls src={lesson?.audio_url} className="w-full" />
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