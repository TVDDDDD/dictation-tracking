'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { submitPractice, getPracticeAnswers, checkPracticeLimit } from './actions'
import BrandLogo from '@/app/components/BrandLogo'

type Question = {
  id: string
  question_number: number
  correct_answer?: string
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

type PostSubmitMode = 'result' | 'practice' | null
type PracticePhase = 'answering' | 'checked'

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
  const [reviewAttempt, setReviewAttempt] = useState<number | null>(null)
  const [makeupAttempt, setMakeupAttempt] = useState<number | null>(null)
  const practiceSessionLoggedRef = useRef<number | null>(null)
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  // Post-submit UX states
  const [postMode, setPostMode] = useState<PostSubmitMode>('result')
  const [practicePhase, setPracticePhase] = useState<PracticePhase>('answering')
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({})
  const [practiceLimit, setPracticeLimit] = useState<{ count: number; allowed: boolean; remaining: number } | null>(null)
  const [practiceAnswersFetched, setPracticeAnswersFetched] = useState(false)

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
  const searchParams = useSearchParams()
  const lessonId = Number(params.id)
  const supabase = createClient()

  // Parse URL params for mode and attempt
  const urlMode = searchParams.get('mode')
  const urlAttempt = searchParams.get('attempt')

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const [profileResult, existingResults, lessonResult, questionsResult, accessResult, grantResult] =
        await Promise.all([
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
            .from('lessons')
            .select('id, title, audio_url, passage, total_questions')
            .eq('id', lessonId)
            .single(),
          supabase
            .from('questions')
            .select('id, question_number')
            .eq('lesson_id', lessonId)
            .order('question_number', { ascending: true }),
          supabase
            .from('lesson_access')
            .select('id, class_code')
            .eq('lesson_id', lessonId),
          supabase
            .from('makeup_grants')
            .select('id')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonId)
            .maybeSingle(),
        ])

      const lessonData = lessonResult.data
      const lessonError = lessonResult.error
      if (lessonError || !lessonData) {
        alert('Không tìm thấy bài học')
        router.push('/dashboard')
        return
      }

      const submissions = existingResults.data || []
      const hasSubmission = submissions.length > 0
      const classCode = (profileResult.data?.class_code || '').trim()
      const lessonOpenForClass = (accessResult.data || []).some(
        (a) => a.class_code === classCode
      )
      const hasUnusedGrant =
        Boolean(grantResult.data) && submissions.length < 2

      // Guard: chưa làm + bài chưa mở cho lớp + không có grant dùng được
      if (!hasSubmission && !lessonOpenForClass && !hasUnusedGrant) {
        alert('Bài chưa mở cho lớp của bạn')
        router.push('/dashboard')
        return
      }

      setQuestions(questionsResult.data || [])
      setLesson(lessonData)

      // Check practice limit for UI
      const limitRes = await checkPracticeLimit(lessonId)
      if (limitRes.success && limitRes.count !== undefined) {
        setPracticeLimit({ count: limitRes.count, allowed: limitRes.allowed ?? false, remaining: limitRes.remaining ?? 0 })
      }

      // Handle URL mode/attempt params
      if (urlMode === 'result' && hasSubmission) {
        setPostMode('result')
        setPracticePhase('answering')
      } else if (urlMode === 'practice' && hasSubmission) {
        setPostMode('practice')
        setPracticePhase('answering')
      }

      // Ưu tiên: grant chưa dùng → EXAM mode (làm lại, attempt mới)
      // Còn hasSubmission → REVIEW mode (ôn tập, không tạo submission)
      if (hasUnusedGrant) {
        setIsSubmitted(false)
        setMakeupAttempt(submissions.length + 1)
        setPostMode(null) // đang làm bài lần đầu/làm lại
      } else if (hasSubmission) {
        // CHẾ ĐỘ ÔN: đã nộp bài → vào ôn tập, không chấm lại
        setIsSubmitted(true)
        // Lấy kết quả gần nhất (attempt cuối) để hiển thị điểm + đáp án
        const { data: latestSub } = await supabase
          .from('submissions')
          .select('score, percentage, correct_count, total_questions, user_answer, attempt_number')
          .eq('user_id', user.id)
          .eq('lesson_id', lessonId)
          .order('attempt_number', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestSub) {
          setResult({
            correct_count: Number(latestSub.correct_count ?? 0),
            total_questions: Number(latestSub.total_questions ?? 0),
            score: Number(latestSub.score ?? 0),
            percentage: Number(latestSub.percentage ?? 0),
          })
          const rawAnswers: unknown = latestSub.user_answer
          const userAnswers: Record<string, string> =
            typeof rawAnswers === 'string'
              ? JSON.parse(rawAnswers)
              : rawAnswers && typeof rawAnswers === 'object'
              ? (rawAnswers as Record<string, string>)
              : {}
          setAnswers(userAnswers)
          if (Number(latestSub.attempt_number ?? 1) > 1) {
            setReviewAttempt(Number(latestSub.attempt_number ?? 1))
          }

          // Pre-fill tô màu đúng/sai + đáp án từ submission_answers
          const { data: latestSubmissionId } = await supabase
            .from('submissions')
            .select('id')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonId)
            .order('attempt_number', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (latestSubmissionId) {
            const { data: savedAnswers } = await supabase
              .from('submission_answers')
              .select('question_id, user_answer, is_correct, questions ( correct_answer )')
              .eq('submission_id', latestSubmissionId)

            const questionNumberById: Record<string, number> = {}
            for (const q of questionsResult.data || []) {
              questionNumberById[q.id] = q.question_number
            }

            const rMap: Record<number, boolean> = {}
            const cMap: Record<number, string> = {}
            for (const sa of savedAnswers || []) {
              const qn = questionNumberById[sa.question_id]
              if (qn == null) continue
              rMap[qn] = Boolean(sa.is_correct)
              const correct = Array.isArray(sa.questions)
                ? sa.questions[0]?.correct_answer
                : undefined
              if (correct) cMap[qn] = correct
            }
            setResultsMap((prev) => ({ ...prev, ...rMap }))
            setCorrectAnswersMap((prev) => ({ ...prev, ...cMap }))
          }
        }

        // Log practice_session 1 lần khi vào chế độ ôn
        if (practiceSessionLoggedRef.current !== lessonId) {
          practiceSessionLoggedRef.current = lessonId
          const { data: recentSessions } = await supabase
            .from('practice_sessions')
            .select('started_at')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonId)
            .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
            .limit(1)
          if ((recentSessions || []).length === 0) {
            await supabase.from('practice_sessions').insert({
              user_id: user.id,
              lesson_id: lessonId,
            })
          }
        }
      } else {
        // Đang làm bài lần đầu (chưa nộp, chưa có grant)
        setIsSubmitted(false)
        setPostMode(null)
      }

      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, urlMode, urlAttempt])

  // Gọi API lấy Presigned URL rồi phát
  const handlePlay = async () => {
    if (!lesson) return

    if (isSubmitted) return

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
        className={`leading-8 text-gray-800 text-[15px] ${highlightMode ? 'highlight-selection-mode' : ''}`}
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

            const isPracticeMode = postMode === 'practice'
            const isExamMode = postMode === null && !isSubmitted // first attempt or makeup
            const disabled = isSubmitted && !isPracticeMode && !isExamMode // disabled in result view, editable in practice/exam
            const isChecked = isPracticeMode && practicePhase === 'checked'
            const practiceDisabled = isChecked // locked in checked phase

            const isAnswering = (isPracticeMode && practicePhase === 'answering') || isExamMode
            return (
              <span key={index} className="inline-block mx-1">
                <input
                  type="text"
                  value={isAnswering ? answers[num] || '' : userValue}
                  onChange={isAnswering ? (e) => handleAnswerChange(num, e.target.value) : undefined}
                  readOnly={!isAnswering}
                  disabled={disabled || practiceDisabled}
                  className={`inline-block px-2 py-0.5 border-b-2 min-w-[110px] text-center focus:outline-none ${
                    isSubmitted && !isPracticeMode
                      ? isCorrect
                        ? 'border-green-500 text-green-600 bg-green-50'
                        : 'border-red-500 text-red-600 bg-red-50'
                      : isPracticeMode
                      ? practicePhase === 'checked'
                        ? isCorrect
                          ? 'border-green-500 text-green-600 bg-green-50'
                          : 'border-red-500 text-red-600 bg-red-50'
                        : 'border-blue-400 text-blue-600 bg-blue-50'
                      : 'border-blue-400 text-blue-600 bg-blue-50'
                  }`}
                  placeholder={`(${num})`}
                />
                {(isSubmitted && !isPracticeMode && !isCorrect && correctAnswersMap[num]) || (isPracticeMode && isChecked && !isCorrect && practiceAnswers[num]) ? (
                  <span className="ml-1 text-xs text-green-700">
                    ({(isSubmitted && !isPracticeMode) ? correctAnswersMap[num] : practiceAnswers[num]})
                  </span>
                ) : null}
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

  // Count unanswered questions
  const countUnanswered = () => {
    if (!questions.length) return { answered: 0, total: 0 }
    const answered = questions.filter(q => answers[q.question_number]?.trim()).length
    return { answered, total: questions.length }
  }

  const handleSubmit = async () => {
    if (!lesson || questions.length === 0) return

    const { answered, total } = countUnanswered()
    if (answered < total) {
      if (!confirm(`Bạn đã điền ${answered}/${total} câu. Bạn có chắc muốn nộp bài?`)) {
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
      setPostMode('result') // chuyển sang xem kết quả
      if (makeupAttempt) {
        setReviewAttempt(makeupAttempt)
        setMakeupAttempt(null)
      }
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

  // Practice mode handlers
  const enterPracticeMode = async () => {
    if (!practiceLimit?.allowed) return

    // Fetch correct answers once for practice mode
    if (!practiceAnswersFetched) {
      const res = await getPracticeAnswers(lessonId)
      if (res.success && res.answers) {
        setPracticeAnswers(res.answers)
        setPracticeAnswersFetched(true)
      }
    }

    setPostMode('practice')
    setPracticePhase('answering')
    setAnswers({}) // reset answers for practice
    setResultsMap({})
    setCorrectAnswersMap({})
    // Log practice session (guard 10 phút already handled in initial load)
  }

  const exitPracticeMode = () => {
    setPostMode('result')
    setPracticePhase('answering')
    setAnswers({}) // clear practice answers
    setResultsMap({})
    setCorrectAnswersMap({})
  }

  const checkPracticeAnswers = () => {
    if (!questions.length) return

    const newResultsMap: Record<number, boolean> = {}
    const newCorrectMap: Record<number, string> = {}

    for (const q of questions) {
      const userAns = (answers[q.question_number] || '').trim().toLowerCase()
      const correctAns = (practiceAnswers[q.question_number] || '').trim().toLowerCase()
      const isCorrect = userAns === correctAns

      newResultsMap[q.question_number] = isCorrect
      newCorrectMap[q.question_number] = practiceAnswers[q.question_number] || ''
    }

    setResultsMap(newResultsMap)
    setCorrectAnswersMap(newCorrectMap)
    setPracticePhase('checked')
    // No alert — inline UI shows results (green/red, correct answers next to wrong)
  }

  const resetPractice = () => {
    setAnswers({})
    setResultsMap({})
    setCorrectAnswersMap({})
    setPracticePhase('answering')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Đang tải bài học...</p>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Không tìm thấy bài học</p>
      </div>
    )
  }

  const showResultView = postMode === 'result' || (isSubmitted && postMode !== 'practice')
  const showPracticeAnswering = postMode === 'practice' && practicePhase === 'answering'
  const showPracticeChecked = postMode === 'practice' && practicePhase === 'checked'
  const isExamMode = !isSubmitted && postMode === null

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="practice-header">
        <div className="practice-header-inner">
          <div className="practice-header-brand">
            <BrandLogo
              href="/dashboard"
              kicker={
                reviewAttempt
                  ? 'REVIEW SESSION · LẦN ' + reviewAttempt
                  : makeupAttempt
                  ? 'MAKEUP SESSION · LẦN ' + makeupAttempt
                  : showPracticeAnswering || showPracticeChecked
                  ? 'PRACTICE MODE'
                  : isExamMode
                  ? 'PRACTICE SESSION'
                  : 'REVIEW RESULT'
              }
            />
            <div className="practice-header-lesson">
              <Link href="/dashboard" className="back-link">
                ← Dashboard
              </Link>
              <h1 className="practice-title">{lesson.title}</h1>
            </div>
          </div>

          {showResultView && result && (
            <div className="result-summary">
              <p className="result-summary-label">Kết quả</p>
              <p className="result-summary-value">
                {result.correct_count}/{result.total_questions} câu · {result.score}/10
              </p>
            </div>
          )}

          {showPracticeChecked && (
            <div className="result-summary">
              <p className="result-summary-label">Kết quả ôn tập</p>
              <p className="result-summary-value">
                {Object.values(resultsMap).filter(Boolean).length}/{questions.length} câu đúng
              </p>
            </div>
          )}
        </div>
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
            controls={(showResultView || showPracticeAnswering || showPracticeChecked) && Boolean(audioSrc)}
            className={(showResultView || showPracticeAnswering || showPracticeChecked) && audioSrc ? 'w-full' : 'hidden'}
          />

          {!isSubmitted && postMode === null ? (
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
                {gettingAudio ? 'Đang lấy file nghe...' : 'Nghe lại bài (tự do tua)'}
              </button>
              <p className="text-sm text-green-600 mt-3">
                ✓ Bạn có thể nghe lại và tua tự do.
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
                  className="button button-danger button-small"
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

          {/* Exam mode: submit button */}
          {isExamMode ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {submitting ? 'Đang nộp bài...' : 'Nộp bài & Xem kết quả'}
            </button>
          ) : null}

          {/* Post-submit: Result view */}
          {showResultView ? (
            <div className="space-y-3 mt-4">
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
                {reviewAttempt && (
                  <p className="text-sm text-gray-500 mt-1">
                    Lượt làm: <strong>{reviewAttempt}</strong>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={enterPracticeMode}
                  disabled={!practiceLimit?.allowed}
                  className={`flex-1 min-w-[180px] bg-amber-600 text-white py-3 rounded-md font-medium hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed ${
                    !practiceLimit?.allowed ? 'opacity-70' : ''
                  }`}
                  title={!practiceLimit?.allowed ? `Đã ôn tối đa 5 lần bài này` : undefined}
                >
                  Ôn tập
                </button>
                <Link
                  href="/dashboard"
                  className="flex-1 min-w-[180px] bg-gray-200 text-gray-700 py-3 rounded-md text-center font-medium hover:bg-gray-300"
                >
                  ← Quay lại danh sách bài
                </Link>
              </div>
            </div>
          ) : null}

          {/* Practice mode: Answering phase */}
          {showPracticeAnswering ? (
            <div className="space-y-3 mt-4">
              <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded">
                Chế độ ôn tập: điền tự do, nghe tự do. Không lưu kết quả.
              </p>
              <button
                onClick={checkPracticeAnswers}
                className="w-full bg-green-600 text-white py-3 rounded-md hover:bg-green-700 font-medium"
              >
                Kiểm tra kết quả
              </button>
              <button
                onClick={exitPracticeMode}
                className="w-full bg-gray-200 text-gray-700 py-2 rounded-md hover:bg-gray-300 text-sm"
              >
                Thoát ôn tập
              </button>
            </div>
          ) : null}

          {/* Practice mode: Checked phase */}
          {showPracticeChecked ? (
            <div className="space-y-3 mt-4">
              <div className="p-4 bg-green-50 rounded-md">
                <p className="font-medium text-green-700">
                  Kết quả ôn tập: {Object.values(resultsMap).filter(Boolean).length}/{questions.length} câu đúng
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={resetPractice}
                  className="flex-1 min-w-[180px] bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700"
                >
                  Làm lại ôn tập
                </button>
                <button
                  onClick={exitPracticeMode}
                  className="flex-1 min-w-[180px] bg-gray-200 text-gray-700 py-3 rounded-md font-medium hover:bg-gray-300"
                >
                  Thoát ôn tập
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}