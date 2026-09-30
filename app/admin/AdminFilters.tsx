'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type Props = {
  classList: string[]
  lessons: { id: number; title: string; order_number: number }[]
  currentParams: { [key: string]: string | undefined }
}

export default function AdminFilters({ classList, lessons, currentParams }: Props) {
  const router = useRouter()
  const [classCode, setClassCode] = useState(currentParams.class || '')
  const [lesson, setLesson] = useState(currentParams.lesson || '')
  const [search, setSearch] = useState(currentParams.search || '')
  const [fromDate, setFromDate] = useState(currentParams.from || '')
  const [toDate, setToDate] = useState(currentParams.to || '')

  const applyFilter = () => {
    const params = new URLSearchParams()
    if (classCode) params.set('class', classCode)
    if (lesson) params.set('lesson', lesson)
    if (search) params.set('search', search)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)

    router.push(`/admin?${params.toString()}`)
  }

  const clearFilter = () => {
    setClassCode('')
    setLesson('')
    setSearch('')
    setFromDate('')
    setToDate('')
    router.push('/admin')
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Lớp */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Lớp</label>
          <select
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Tất cả lớp</option>
            {classList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Bài */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bài nghe</label>
          <select
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Tất cả bài</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                Bài {l.order_number} - {l.title}
              </option>
            ))}
          </select>
        </div>

        {/* Tìm kiếm */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">MSV / Tên</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập MSV hoặc tên..."
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>

        {/* Từ ngày */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>

        {/* Đến ngày */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={applyFilter}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          Áp dụng lọc
        </button>
        <button
          onClick={clearFilter}
          className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-300"
        >
          Xóa bộ lọc
        </button>
      </div>
    </div>
  )
}