'use client'

import { useState, useEffect, useRef } from 'react'

type QuestionInput = {
  question_number: number
  correct_answer: string
}

type PassageEditorProps = {
  passage: string
  questions: QuestionInput[]
  onChange: (passage: string, questions: QuestionInput[]) => void
}

export default function PassageEditor({ passage: initialPassage, questions: initialQuestions, onChange }: PassageEditorProps) {
  const [passage, setPassage] = useState(initialPassage)
  const [questions, setQuestions] = useState<QuestionInput[]>(initialQuestions)
  const [nextBlankNum, setNextBlankNum] = useState(1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Parse passage for blanks and sync questions
  const prevPassageRef = useRef<string>(passage)
  useEffect(() => {
    // Only run when passage actually changes (not on initial mount or questions change)
    if (prevPassageRef.current === passage) return
    prevPassageRef.current = passage

    const blankMatches = passage.match(/\{\{(\d+)\}\}/g)
    const blankNumbers = blankMatches
      ? blankMatches.map(m => parseInt(m.replace(/\{\{(\d+)\}\}/, '$1')))
      : []
    const maxBlank = blankNumbers.length > 0 ? Math.max(...blankNumbers) : 0
    // Defer setState to avoid React warning
    setTimeout(() => setNextBlankNum(maxBlank + 1), 0)

    // Sync questions: keep existing answers by question_number, add new blanks with empty answers
    const newQuestions: QuestionInput[] = []
    for (let i = 1; i <= maxBlank; i++) {
      const existing = questions.find(q => q.question_number === i)
      newQuestions.push({
        question_number: i,
        correct_answer: existing?.correct_answer || '',
      })
    }
    // Defer setState to avoid React warning
    setTimeout(() => setQuestions(newQuestions), 0)
  }, [passage, questions])

  const handlePassageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPassage = e.target.value
    setPassage(newPassage)
    onChange(newPassage, questions)
  }

  const insertBlankAtCursor = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const blankText = `{{${nextBlankNum}}}`
    const newPassage = passage.slice(0, start) + blankText + passage.slice(end)

    setPassage(newPassage)
    setNextBlankNum(n => n + 1)

    // Restore cursor position after blank
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + blankText.length, start + blankText.length)
    }, 0)
  }

  const removeLastBlank = () => {
    const blankMatches = passage.match(/\{\{(\d+)\}\}/g)
    if (!blankMatches || blankMatches.length === 0) return

    const lastBlankNum = Math.max(...blankMatches.map(m => parseInt(m.replace(/\{\{(\d+)\}\}/, '$1'))))
    const lastBlankText = `{{${lastBlankNum}}}`
    const lastIndex = passage.lastIndexOf(lastBlankText)

    if (lastIndex === -1) return

    const newPassage = passage.slice(0, lastIndex) + passage.slice(lastIndex + lastBlankText.length)
    setPassage(newPassage)
  }

  const removeAllBlanks = () => {
    const newPassage = passage.replace(/\{\{\d+\}\}/g, '')
    setPassage(newPassage)
    setNextBlankNum(1)
  }

  const addBlankAtEnd = () => {
    const textarea = textareaRef.current
    const blankText = `{{${nextBlankNum}}}`
    const newPassage = passage + (passage.endsWith('\n') || passage === '' ? '' : ' ') + blankText

    setPassage(newPassage)
    setNextBlankNum(n => n + 1)

    setTimeout(() => {
      textarea?.focus()
      textarea!.setSelectionRange(newPassage.length, newPassage.length)
    }, 0)
  }

  const handleAnswerChange = (index: number, value: string) => {
    const newQuestions = [...questions]
    newQuestions[index] = { ...newQuestions[index], correct_answer: value }
    setQuestions(newQuestions)
    onChange(passage, newQuestions)
  }

  const blankCount = questions.length
  const hasErrors = questions.some(q => !q.correct_answer.trim())

  return (
    <div className="passage-editor">
      <div className="passage-editor-toolbar mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={insertBlankAtCursor}
          className="button button-secondary button-small"
          title="Chèn ô trống tại vị trí con trỏ"
        >
          ➕ Chèn blank
        </button>
        <button
          type="button"
          onClick={addBlankAtEnd}
          className="button button-secondary button-small"
          title="Thêm ô trống vào cuối đoạn văn"
        >
          ➕ Thêm blank cuối
        </button>
        <button
          type="button"
          onClick={removeLastBlank}
          disabled={blankCount === 0}
          className="button button-secondary button-small"
          title="Xóa ô trống cuối cùng"
        >
          🗑️ Xóa blank cuối
        </button>
        <button
          type="button"
          onClick={removeAllBlanks}
          disabled={blankCount === 0}
          className="button button-danger button-small"
          title="Xóa tất cả ô trống"
        >
          🗑️ Xóa tất cả blank
        </button>
        <span className="text-sm text-gray-500 self-center ml-2">
          Số ô trống: <strong>{blankCount}</strong>
          {hasErrors && <span className="text-red-500 ml-2">⚠ Còn đáp án rỗng</span>}
        </span>
      </div>

      <div className="passage-editor-grid grid gap-4" style={{ gridTemplateColumns: '1fr' }}>
        {/* Cột trái: Textarea */}
        <div className="passage-editor-passage">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Đoạn văn (raw với &#123;&#123;1&#125;&#125; &#123;&#123;2&#125;&#125;...)
          </label>
          <textarea
            ref={textareaRef}
            value={passage}
            onChange={handlePassageChange}
            className="w-full h-[300px] font-mono text-sm p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            placeholder="Nhập đoạn văn... Sử dụng toolbar để chèn ô trống {{n}}"
            spellCheck={false}
          />
          <p className="text-xs text-gray-500 mt-1">
            Mẹo: Click vào vị trí muốn chèn blank → bấm &apos;Chèn blank&apos;. Blank được đánh số tự động.
          </p>
        </div>

        {/* Cột phải: Danh sách đáp án */}
        <div className="passage-editor-answers">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Đáp án đúng ({blankCount})
          </label>
          <div className="space-y-2 max-h-[300px] overflow-y-auto p-3 bg-gray-50 rounded-lg border">
            {questions.map((q, idx) => (
              <div key={q.question_number} className="flex items-center gap-2">
                <span className="w-10 text-xs text-gray-500 font-mono bg-white px-2 py-1 rounded border">
                  Blank &#123;&#123;{q.question_number}&#125;&#125;
                </span>
                <input
                  type="text"
                  value={q.correct_answer}
                  onChange={e => handleAnswerChange(idx, e.target.value)}
                  className={`flex-1 text-sm px-3 py-1.5 border rounded ${
                    !q.correct_answer.trim() ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder={`Đáp án câu ${q.question_number}`}
                />
              </div>
            ))}
            {blankCount === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Chưa có ô trống nào. Bấm &apos;Chèn blank&apos; hoặc &apos;Thêm blank cuối&apos;.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}