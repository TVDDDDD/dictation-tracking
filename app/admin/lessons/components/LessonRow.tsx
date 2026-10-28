'use client'

import { deleteLesson } from '@/app/admin/actions'

type LessonRowProps = {
  lesson: {
    id: number
    title: string
    order_number: number
    audio_url: string
    total_questions: number
    is_active: boolean
    created_at: string
  }
  index: number
}

export default function LessonRow({ lesson, index }: LessonRowProps) {
  const handleDelete = async () => {
    if (confirm(`Xóa vĩnh viễn bài "${lesson.title}"?\nSẽ xóa cả audio, đáp án, lịch sử làm bài của SV.`)) {
      const res = await deleteLesson(lesson.id)
      alert(res.success ? 'Đã xóa' : 'Lỗi: ' + res.message)
      window.location.reload()
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{lesson.title}</div>
        <div className="text-xs text-gray-400 font-mono">{lesson.audio_url}</div>
      </td>
      <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
        {lesson.order_number}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-block px-2 py-1 text-xs font-mono bg-gray-100 text-gray-600 rounded truncate max-w-[100px]">
          {lesson.audio_url || '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-center text-sm text-gray-600">
        {lesson.total_questions}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          lesson.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {lesson.is_active ? '✓ Đang mở' : 'Ẩn'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <a
            href={`/admin/lessons/${lesson.id}/edit`}
            className="button button-secondary button-small"
          >
            Sửa
          </a>
          <button
            onClick={handleDelete}
            className="button button-danger button-small"
          >
            Xóa
          </button>
        </div>
      </td>
    </tr>
  )
}