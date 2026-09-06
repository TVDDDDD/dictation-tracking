'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function PracticePage() {
  type Lesson = {
  id: number
  title: string
  audio_url: string
  correct_answer: string
  order_number: number
  is_active: boolean
}

const [lesson, setLesson] = useState<Lesson | null>(null)
  const [userAnswer, setUserAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; message: string } | null>(null)
  const [listenCount, setListenCount] = useState(0)

  const router = useRouter()
  const params = useParams()
  const lessonId = params.id
  const supabase = createClient()

  useEffect(() => {
    const fetchLesson = async () => {
      // Kiểm tra đăng nhập
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Lấy thông tin bài học
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', lessonId)
        .single()

      if (error || !data) {
        alert('Không tìm thấy bài học')
        router.push('/dashboard')
        return
      }

      setLesson(data)
      setLoading(false)
    }

    fetchLesson()
  }, [lessonId])

  const handleSubmit = async () => {
  if (!lesson) return

  if (!userAnswer.trim()) {
    alert('Vui lòng nhập đáp án trước khi nộp bài')
    return
  }

  setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Chấm điểm đơn giản (so khớp chính xác, không phân biệt hoa thường)
    const correct = lesson.correct_answer.trim().toLowerCase()
    const answer = userAnswer.trim().toLowerCase()
    
    let score = 0
    if (answer === correct) {
      score = 10
    } else if (correct.includes(answer) || answer.includes(correct)) {
      score = 7
    } else {
      // Tính độ giống nhau đơn giản
      const correctWords = correct.split(/\s+/)
      const answerWords = answer.split(/\s+/)
      const matched = correctWords.filter((w: string) => answerWords.includes(w)).length
      score = Math.round((matched / correctWords.length) * 10)
    }

    // Lưu vào database
    const { error } = await supabase.from('submissions').insert({
      user_id: user.id,
      lesson_id: lesson.id,
      user_answer: userAnswer,
      score: score,
      listen_count: listenCount,
    })

    if (error) {
      alert('Lỗi khi lưu bài làm: ' + error.message)
    } else {
      setResult({
        score,
        message: score >= 8 ? 'Xuất sắc!' : score >= 5 ? 'Khá tốt!' : 'Cần cố gắng thêm!'
      })
    }

    setSubmitting(false)
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
      </header>

      {/* Giao diện chia đôi */}
      <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Bên trái: Audio Player */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Nghe bài</h2>
          
          <audio
            controls
            className="w-full mb-4"
            onPlay={() => setListenCount(prev => prev + 1)}
          >
            <source src={lesson?.audio_url} type="audio/mpeg" />
            Trình duyệt không hỗ trợ audio.
          </audio>

          <p className="text-sm text-gray-500">
            Số lần nghe: <strong>{listenCount}</strong>
          </p>

          <div className="mt-6 p-4 bg-yellow-50 rounded text-sm text-yellow-800">
            <strong>Hướng dẫn:</strong> Nghe audio và gõ lại nội dung bạn nghe được vào ô bên phải. 
            Bạn có thể nghe lại nhiều lần.
          </div>
        </div>

        {/* Bên phải: Nhập đáp án */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Nhập đáp án</h2>

          <textarea
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Gõ nội dung bạn nghe được vào đây..."
            className="w-full h-64 p-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            disabled={!!result}
          />

          {!result ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-4 w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {submitting ? 'Đang nộp bài...' : 'Nộp bài & Chấm điểm'}
            </button>
          ) : (
            <div className="mt-4 p-4 bg-blue-50 rounded-md">
              <p className="text-2xl font-bold text-blue-700">
                Điểm: {result.score}/10
              </p>
              <p className="text-blue-600 mt-1">{result.message}</p>
              <Link
                href="/dashboard"
                className="inline-block mt-4 text-sm text-blue-600 hover:underline"
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