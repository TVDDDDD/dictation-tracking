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

type HighlightRange = {
  start: number
  end: number
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
  const [highlightMode, setHighlightMode] = useState(false)
  const [highlights, setHighlights] = useState<HighlightRange[]>([])
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  // Audio
  const audioRef = useRef<HTMLAudioElement>(null)
  const passageRef = useRef<HTMLDivElement>(null)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [gettingAudio, setGettingAudio] = useState(false)
  const [playAfterSourceReady, setPlayAfterSourceReady] = useState(false)

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

      // Lấy thông tin bài
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  // Gọi API lấy Presigned URL rồi phát
  const handlePlay = async () => {
    if (!lesson) return

    if (isSubmitted) return

    // Đang làm bài: chỉ cho nghe 1 lần
    if (hasPlayed) {
      alert('Bạn chỉ được nghe 1 lần trong lúc làm bài!')
      return
    }

    try {
      setGettingAudio(true)

      const res = await fetch('/api/audio/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Không lấy được file nghe')
        setGettingAudio(false)
        return
      }

      setHasPlayed(true)
      setPlayAfterSourceReady(true)
      setAudioSrc(data.url)
    } catch (err) {
      console.error(err)
      alert(
        'Có lỗi khi lấy file nghe: ' +
          (err instanceof Error ? err.message : 'Unknown')
      )
    } finally {
      setGettingAudio(false)
    }
  }

  const handleReviewAudio = async () => {
    if (!lesson) return

    try {
      setGettingAudio(true)

      const res = await fetch('/api/audio/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, mode: 'review' }),
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data.error || 'Không lấy được file nghe lại')
        return
      }

      setPlayAfterSourceReady(true)
      setAudioSrc(data.url)
    } catch (err) {
      console.error(err)
      alert('Có lỗi khi lấy file nghe lại')
    } finally {
      setGettingAudio(false)
    }
  }

  const handleAnswerChange = (num: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [num]: value }))
  }

  const addHighlightFromSelection = () => {
    if (isSubmitted) return

    const container = passageRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    if (
      !container.contains(range.startContainer) ||
      !container.contains(range.endContainer) ||
      !selection.toString().trim()
    ) {
      return
    }

    const getTextOffset = (node: Node, offset: number) => {
      const prefixRange = document.createRange()
      prefixRange.selectNodeContents(container)
      prefixRange.setEnd(node, offset)
      return prefixRange.toString().length
    }

    const start = getTextOffset(range.startContainer, range.startOffset)
    const end = getTextOffset(range.endContainer, range.endOffset)
    if (end <= start) return

    setHighlights((current) => {
      const sorted = [...current, { start, end }].sort((a, b) => a.start - b.start)
      const merged: HighlightRange[] = []

      for (const item of sorted) {
        const previous = merged[merged.length - 1]
        if (previous && item.start <= previous.end) {
          previous.end = Math.max(previous.end, item.end)
        } else {
          merged.push({ ...item })
        }
      }

      return merged
    })
    selection.removeAllRanges()
  }

  const selectWordAtPoint = (x: number, y: number) => {
    const container = passageRef.current
    if (!container) return

    const documentWithCaret = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null
    }

    let range = documentWithCaret.caretRangeFromPoint?.(x, y) ?? null
    if (!range && documentWithCaret.caretPositionFromPoint) {
      const position = documentWithCaret.caretPositionFromPoint(x, y)
      if (position) {
        range = document.createRange()
        range.setStart(position.offsetNode, position.offset)
        range.collapse(true)
      }
    }

    if (!range || !container.contains(range.startContainer)) return

    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) return

    const text = textNode.textContent || ''
    let wordIndex = range.startOffset
    const isWordCharacter = (character: string) =>
      /[\p{L}\p{M}\p{N}'’_-]/u.test(character)

    if (wordIndex === text.length && wordIndex > 0) wordIndex -= 1
    if (!isWordCharacter(text[wordIndex] || '') && wordIndex > 0) {
      wordIndex -= 1
    }
    if (!isWordCharacter(text[wordIndex] || '')) return

    let start = wordIndex
    let end = wordIndex + 1
    while (start > 0 && isWordCharacter(text[start - 1])) start -= 1
    while (end < text.length && isWordCharacter(text[end])) end += 1

    range.setStart(textNode, start)
    range.setEnd(textNode, end)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const handlePassageTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0]
    if (!touch) return

    if (highlightMode) {
      window.setTimeout(addHighlightFromSelection, 80)
      return
    }

    const now = Date.now()
    const previousTap = lastTouchTapRef.current
    const isDoubleTap =
      previousTap !== null &&
      now - previousTap.time < 400 &&
      Math.hypot(touch.clientX - previousTap.x, touch.clientY - previousTap.y) < 32

    if (isDoubleTap) {
      lastTouchTapRef.current = null
      selectWordAtPoint(touch.clientX, touch.clientY)
      window.setTimeout(addHighlightFromSelection, 50)
    } else {
      lastTouchTapRef.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY,
      }
    }
  }

  const renderHighlightedText = (text: string, offset: number) => {
    const ranges = highlights
      .filter((item) => item.end > offset && item.start < offset + text.length)
      .map((item) => ({
        start: Math.max(item.start - offset, 0),
        end: Math.min(item.end - offset, text.length),
      }))

    if (ranges.length === 0) return text

    const nodes: React.ReactNode[] = []
    let cursor = 0

    ranges.forEach((range, index) => {
      if (cursor < range.start) {
        nodes.push(<span key={`text-${index}`}>{text.slice(cursor, range.start)}</span>)
      }
      nodes.push(
        <mark className="passage-highlight" key={`highlight-${index}`}>
          {text.slice(range.start, range.end)}
        </mark>
      )
      cursor = range.end
    })

    if (cursor < text.length) {
      nodes.push(<span key="text-end">{text.slice(cursor)}</span>)
    }

    return nodes
  }

  const renderPassage = () => {
    if (!lesson?.passage) return null

    const parts = lesson.passage.split(/\{\{(\d+)\}\}/g)
    let textOffset = 0

    return (
      <div
        ref={passageRef}
        className={`leading-8 text-gray-800 text-[15px] ${highlightMode && !isSubmitted ? 'highlight-selection-mode' : ''}`}
        onDoubleClick={addHighlightFromSelection}
        onPointerUp={(event) => {
          if (highlightMode && event.pointerType !== 'touch') {
            window.setTimeout(addHighlightFromSelection, 0)
          }
        }}
        onTouchEnd={handlePassageTouchEnd}
      >
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
                    ${
                      isSubmitted
                        ? isCorrect
                          ? 'border-green-500 text-green-600 bg-green-50'
                          : 'border-red-500 text-red-600 bg-red-50'
                        : 'border-blue-400 text-blue-600 bg-blue-50'
                    }
                  `}
                  placeholder={`(${num})`}
                />
                {isSubmitted && !isCorrect && correctAnswersMap[num] && (
                  <span className="ml-1 text-xs text-green-700">
                    ({correctAnswersMap[num]})
                  </span>
                )}
              </span>
            )
          }
          const partOffset = textOffset
          textOffset += part.length
          return <span key={index}>{renderHighlightedText(part, partOffset)}</span>
        })}
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!lesson || questions.length === 0) return

    const unanswered = questions.filter(
      (q) => !answers[q.question_number]?.trim()
    )
    if (unanswered.length > 0) {
      if (
        !confirm(
          `Bạn còn ${unanswered.length} câu chưa trả lời. Bạn có chắc muốn nộp bài?`
        )
      ) {
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
        percentage: res.result.percentage,
      })
      setIsSubmitted(true)
    }

    setSubmitting(false)
    setPlayAfterSourceReady(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      setIsPlaying(false)
    }
    setAudioSrc(null)
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
        {/* Audio */}
        <div className="bg-white rounded-lg shadow p-6 h-fit">
          <h2 className="text-lg font-semibold mb-4">Nghe bài</h2>

          <audio
            ref={audioRef}
            src={audioSrc || undefined}
            onCanPlay={() => {
              if (!playAfterSourceReady) return

              setPlayAfterSourceReady(false)
              const audio = audioRef.current
              if (!audio) return

              audio
                .play()
                .then(() => setIsPlaying(true))
                .catch((error: unknown) => {
                  setIsPlaying(false)
                  if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                  ) {
                    return
                  }
                  console.error('Không thể phát audio:', error)
                })
            }}
            onEnded={() => setIsPlaying(false)}
            controls={isSubmitted && Boolean(audioSrc)}
            className={isSubmitted && audioSrc ? 'w-full' : 'hidden'}
          />

          {!isSubmitted ? (
            <div className="space-y-4">
              <button
                onClick={handlePlay}
                disabled={hasPlayed || isPlaying || gettingAudio}
                className={`w-full py-3 rounded-md font-medium text-white ${
                  hasPlayed
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {gettingAudio
                  ? 'Đang lấy file nghe...'
                  : hasPlayed
                  ? 'Đã nghe (chỉ 1 lần)'
                  : isPlaying
                  ? 'Đang phát...'
                  : '▶ Play'}
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
            <div className="space-y-3">
              <button
                onClick={handleReviewAudio}
                disabled={gettingAudio}
                className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {gettingAudio ? 'Đang lấy file nghe...' : 'Nghe lại bài (xem đáp án)'}
              </button>
              <p className="text-sm text-green-600 mt-3">
                ✓ Bạn có thể nghe lại và tua tự do để kiểm tra lỗi sai.
              </p>
            </div>
          )}
        </div>

        {/* Đoạn văn đục lỗ */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Điền vào chỗ trống</h2>

          <div className="mb-6 p-4 bg-gray-50 rounded-md border">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHighlightMode((enabled) => !enabled)}
                disabled={isSubmitted}
                aria-pressed={highlightMode}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  highlightMode
                    ? 'bg-amber-300 text-amber-950'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {highlightMode ? 'Đang bật tô sáng' : 'Bật chế độ tô sáng'}
              </button>
              {highlights.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHighlights([])}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                >
                  Xóa đánh dấu
                </button>
              )}
              <span className="text-xs text-gray-500">
                {highlightMode
                  ? 'Kéo chọn đoạn chữ để tô sáng.'
                  : 'Nhấp đúp vào một từ để tô sáng.'}
              </span>
            </div>
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
                  Bạn đúng{' '}
                  <span className="text-green-600">{result?.correct_count}</span> /{' '}
                  {result?.total_questions} câu
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Điểm quy đổi: <strong>{result?.score}/10</strong> (
                  {result?.percentage.toFixed(0)}%)
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