'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createLesson, getAudioPresignedPut } from '@/app/admin/actions'
import PassageEditor from '@/app/admin/components/PassageEditor'
import BrandLogo from '@/app/components/BrandLogo'

type QuestionInput = {
  question_number: number
  correct_answer: string
}

type LessonFormData = {
  title: string
  order_number: number
  is_active: boolean
  audio_url: string
  passage: string
  questions: QuestionInput[]
}

const initialFormData: LessonFormData = {
  title: '',
  order_number: 1,
  is_active: false,
  audio_url: '',
  passage: '',
  questions: [],
}

const stepLabels = [
  '1. Thông tin',
  '2. Audio',
  '3. Đoạn văn',
  '4. Xem trước',
]

export default function CreateLessonPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<LessonFormData>(initialFormData)

  const [errors, setErrors] = useState<Partial<Record<keyof LessonFormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [audioUploading, setAudioUploading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [audioKey, setAudioKey] = useState('')

  const validateStep = useCallback((currentStep: number): boolean => {
    const newErrors: Partial<Record<keyof LessonFormData, string>> = {}

    if (currentStep >= 1) {
      if (!formData.title.trim()) newErrors.title = 'Tên bài không được rỗng'
      else if (formData.title.length > 200) newErrors.title = 'Tên bài tối đa 200 ký tự'
      if (!Number.isInteger(formData.order_number) || formData.order_number <= 0) {
        newErrors.order_number = 'Thứ tự bài phải là số nguyên dương'
      }
    }

    if (currentStep >= 2) {
      if (!formData.audio_url) newErrors.audio_url = 'Chưa tải lên file audio'
    }

    if (currentStep >= 3) {
      if (!formData.passage.trim()) newErrors.passage = 'Đoạn văn không được rỗง'
      const blankMatches = formData.passage.match(/\{\{(\d+)\}\}/g)
      const blankCount = blankMatches ? blankMatches.length : 0
      if (blankCount === 0) newErrors.passage = 'Đoạn văn phải có ít nhất 1 ô trống {{n}}'
      if (formData.questions.length !== blankCount) {
        newErrors.questions = `Số đáp án (${formData.questions.length}) không khớp số ô trống (${blankCount})`
      }
      const hasEmptyAnswer = formData.questions.some(q => !q.correct_answer.trim())
      if (hasEmptyAnswer) newErrors.questions = 'Tất cả đáp án phải được điền'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleBack = () => {
    setStep(s => Math.max(s - 1, 1))
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, title: e.target.value }))
  }

  const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, order_number: parseInt(e.target.value) || 1 }))
  }

  const handleActiveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, is_active: e.target.checked }))
  }

  const handleAudioUpload = async (file: File) => {
    setAudioUploading(true)
    setAudioError('')

    const res = await getAudioPresignedPut(file.name)
    if (!res.success || !res.url) {
      setAudioError(res.message || 'Không lấy được presigned URL')
      setAudioUploading(false)
      return
    }

    try {
      const uploadRes = await fetch(res.url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mpeg',
        },
        body: file,
      })

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`)
      }

      const newKey = res.key!
      setAudioKey(newKey)
      setFormData(prev => ({ ...prev, audio_url: newKey }))
    } catch (e) {
      setAudioError('Upload thất bại: ' + (e instanceof Error ? e.message : 'Unknown'))
    } finally {
      setAudioUploading(false)
    }
  }

  const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('audio/')) {
      handleAudioUpload(file)
    } else {
      setAudioError('Chỉ chấp nhận file audio')
    }
  }

  const handleAudioDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleAudioUpload(file)
  }

  const removeAudio = () => {
    setAudioKey('')
    setFormData(prev => ({ ...prev, audio_url: '' }))
  }

  const handlePassageChange = (passage: string, questions: QuestionInput[]) => {
    setFormData(prev => ({ ...prev, passage, questions }))
  }

  const handleSubmit = async (publish: boolean) => {
    if (!validateStep(4)) return

    setSubmitting(true)
    const finalData = { ...formData, is_active: publish }

    const res = await createLesson(finalData)
    setSubmitting(false)

    if (res.success) {
      alert(publish ? 'Tạo bài & Mở ngay thành công!' : 'Lưu nháp thành công!')
      router.push('/admin/lessons')
      router.refresh()
    } else {
      alert('Lỗi: ' + res.message)
    }
  }

  const blankCount = formData.questions.length
  
  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-4">
            <Link href="/admin/lessons" className="button button-subtle">
              ← Danh sách bài
            </Link>
            <BrandLogo
              href="/admin"
              kicker="LESSON MANAGEMENT"
              name="Tạo bài nghe mới"
            />
          </div>
        </div>
      </header>

      <main className="content-wrap">
        {/* Progress Steps */}
        <div className="wizard-progress mb-6">
          <div className="flex items-center">
            {stepLabels.map((label, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center">
                  <div
                    className={`wizard-step ${idx + 1 < step ? 'completed' : idx + 1 === step ? 'active' : ''}`}
                  >
                    {idx + 1}
                  </div>
                  <span className={`wizard-step-label ${idx + 1 === step ? 'active' : ''}`}>
                    {label}
                  </span>
                </div>
                {idx < stepLabels.length - 1 && (
                  <div
                    className={`wizard-connector ${idx + 1 < step ? 'completed' : ''}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {/* Step 1: Thông tin */}
          {step === 1 && (
            <div className="space-y-6 max-w-2xl">
              <h2 className="text-xl font-semibold">Bước 1: Thông tin cơ bản</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên bài <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={handleTitleChange}
                  className={`field-control w-full max-w-md ${errors.title ? 'border-red-400' : ''}`}
                  placeholder="VD: Bài 1 - Unit 1 Listening"
                  maxLength={200}
                />
                {errors.title && <p className="mt-1 text-sm text-red-500">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thứ tự hiển thị <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.order_number}
                    onChange={handleOrderChange}
                    min={1}
                    className={`field-control w-full max-w-xs ${errors.order_number ? 'border-red-400' : ''}`}
                  />
                  {errors.order_number && <p className="mt-1 text-sm text-red-500">{errors.order_number}</p>}
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={handleActiveChange}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Mở bài ngay sau khi lưu (is_active)</span>
                  </label>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Thứ tự bài quyết định vị trí hiển thị trên Dashboard SV. Số nhỏ hơn = hiển thị trước.
              </p>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={() => validateStep(1) && setStep(2)}
                  className="button button-primary"
                >
                  Tiếp theo →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Audio */}
          {step === 2 && (
            <div className="space-y-6 max-w-2xl">
              <h2 className="text-xl font-semibold">Bước 2: Tải lên file Audio</h2>

              <div
                className={`drop-zone border-2 border-dashed rounded-lg p-8 text-center transition ${
                  audioUploading ? 'border-blue-400 bg-blue-50' : audioKey ? 'border-green-400 bg-green-50' : 'border-gray-300'
                }`}
                onDragOver={handleAudioDragOver}
                onDrop={handleAudioDrop}
              >
                <input
                  type="file"
                  id="audio-file"
                  accept="audio/*"
                  onChange={handleAudioFileSelect}
                  className="hidden"
                  disabled={audioUploading}
                />
                {audioUploading ? (
                  <div className="space-y-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                    <p className="text-gray-600">Đang tải lên...</p>
                  </div>
                ) : audioKey ? (
                  <div className="space-y-3">
                    <p className="text-green-700 font-medium">✓ Đã tải lên thành công</p>
                    <p className="text-sm text-gray-500 font-mono">{audioKey}</p>
                    <button
                      type="button"
                      onClick={removeAudio}
                      className="button button-danger button-small"
                    >
                      Xóa audio
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 15a4 4 0 01-4-4V5a2 2 0 012-2h6a2 2 0 012 2v6a4 4 0 01-4 4zm0 0H5M7 15h10M7 15l2.5-2.5M7 15l-2.5-2.5" />
                    </svg>
                    <p className="text-gray-600">Kéo thả file MP3 vào đây hoặc click để chọn</p>
                    <p className="text-xs text-gray-400">Tối đa 50MB · Định dạng: audio/mpeg (MP3)</p>
                    <label htmlFor="audio-file" className="button button-secondary button-small mt-2 inline-block">
                      Chọn file
                    </label>
                  </div>
                )}
              </div>

              {audioError && (
                <p className="text-sm text-red-500" role="alert">⚠ {audioError}</p>
              )}

              {errors.audio_url && (
                <p className="text-sm text-red-500" role="alert">⚠ {errors.audio_url}</p>
              )}

              {!audioKey && (
                <p className="text-sm text-gray-500">
                  File audio sẽ được upload trực tiếp lên R2 (không qua server). Key lưu vào DB: <code>audio/lesson_&#60;timestamp&#62;_&#60;random&#62;.mp3</code>
                </p>
              )}

              <div className="flex justify-between pt-4 border-t">
                <button onClick={handleBack} className="button button-secondary">
                  ← Quay lại
                </button>
                <button
                  onClick={() => validateStep(2) && setStep(3)}
                  className="button button-primary"
                >
                  Tiếp theo →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Đoạn văn */}
          {step === 3 && (
            <div className="space-y-6 max-w-4xl">
              <h2 className="text-xl font-semibold">Bước 3: Đoạn văn & Đáp án</h2>

              <PassageEditor
                passage={formData.passage}
                questions={formData.questions}
                onChange={handlePassageChange}
              />

              {(errors.passage || errors.questions) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {errors.passage && <p>⚠ {errors.passage}</p>}
                  {errors.questions && <p>⚠ {errors.questions}</p>}
                </div>
              )}

              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                <h4 className="font-medium text-blue-800 mb-2">Hướng dẫn:</h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>Gõ đoạn văn vào khung trái. Ô trống dùng cú pháp <code>&#123;&#123;1&#125;&#125;</code>, <code>&#123;&#123;2&#125;&#125;</code>...</li>
                  <li>Dùng toolbar để chèn/xóa blank. Số thứ tự tự động.</li>
                  <li>Bên phải nhập đáp án đúng cho từng blank. Không được để trống.</li>
                  <li>Số đáp án phải bằng số ô trống trong đoạn văn.</li>
                </ul>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <button onClick={handleBack} className="button button-secondary">
                  ← Quay lại
                </button>
                <button
                  onClick={() => validateStep(3) && setStep(4)}
                  className="button button-primary"
                >
                  Tiếp theo →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Xem trước */}
          {step === 4 && (
            <div className="space-y-6 max-w-3xl">
              <h2 className="text-xl font-semibold">Bước 4: Xem trước & Lưu</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">Thông tin bài</h4>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Tên bài:</dt>
                      <dd className="font-medium">{formData.title || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Thứ tự:</dt>
                      <dd className="font-medium">{formData.order_number}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Trạng thái:</dt>
                      <dd className="font-medium">{formData.is_active ? 'Mở (Active)' : 'Ẩn (Draft)'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Audio key:</dt>
                      <dd className="font-mono text-xs">{formData.audio_url || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Số câu:</dt>
                      <dd className="font-medium">{blankCount}</dd>
                    </div>
                  </dl>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-700 mb-2">Audio Preview</h4>
                  {formData.audio_url ? (
                    <>
                      <audio controls className="w-full" src={`/api/audio/presign?key=${encodeURIComponent(formData.audio_url)}&mode=review`} controlsList="nodownload">
                        Trình duyệt không hỗ trợ phát audio.
                      </audio>
                      <p className="text-xs text-gray-500 mt-1">File audio: <code className="text-xs">{formData.audio_url}</code></p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Chưa có audio. Tải lên ở Bước 2.</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">Đoạn văn Preview</h4>
                <div className="prose max-w-none text-sm leading-relaxed">
                  {formData.passage
                    .split(/\{\{(\d+)\}\}/)
                    .map((part, idx) => {
                      if (/^\d+$/.test(part)) {
                        const _num = parseInt(part)
                        return (
                          <span key={idx} className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-mono mx-1">
                            ___({_num})___
                          </span>
                        )
                      }
                      return <span key={idx}>{part}</span>
                    })}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">Đáp án</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 px-2">#</th>
                      <th className="text-left py-1 px-2">Đáp án đúng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.questions.map(q => (
                      <tr key={q.question_number} className="border-b border-gray-200">
                        <td className="py-1 px-2 font-mono text-gray-500">&#123;&#123;{q.question_number}&#125;&#125;</td>
                        <td className="py-1 px-2">{q.correct_answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={handleBack}
                  className="button button-secondary"
                >
                  ← Quay lại
                </button>
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                  className="button button-secondary"
                >
                  {submitting ? 'Đang lưu...' : '💾 Lưu nháp'}
                </button>
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="button button-primary"
                >
                  {submitting ? 'Đang lưu...' : '✅ Lưu & Mở ngay'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}