'use client'

import { useState } from 'react'

type CheckState = 'idle' | 'checking' | 'ok' | 'db-error' | 'site-down'

export default function HealthCheckButton() {
  const [state, setState] = useState<CheckState>('idle')

  const check = async () => {
    setState('checking')
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const res = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      clearTimeout(timer)
      const body = await res.json().catch(() => null)
      if (res.ok && body && body.db === 'connected') setState('ok')
      else setState('db-error')
    } catch {
      setState('site-down')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h2 className="text-lg font-semibold mb-1">🩺 Kiểm tra hệ thống</h2>
      <p className="text-sm text-gray-500 mb-3">
        Nút này kiểm tra: <strong>site có mở được</strong> + <strong>database có kết nối</strong>.
        KHÔNG kiểm tra audio, email, đăng nhập — nên xanh ≠ mọi thứ ổn.
      </p>
      <button
        onClick={check}
        disabled={state === 'checking'}
        className="button button-primary"
      >
        {state === 'checking' ? 'Đang kiểm tra…' : '🩺 Kiểm tra hệ thống'}
      </button>

      {state === 'ok' && (
        <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3" role="status">
          ✅ Hệ thống bình thường (database kết nối được).
          Nếu sinh viên vẫn gặp lỗi, tra triệu chứng trong bảng sự cố bên dưới và làm theo bước &ldquo;tự kiểm tra&rdquo;.
        </p>
      )}
      {state === 'db-error' && (
        <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3" role="alert">
          ⚠️ Trang web mở được nhưng database không kết nối được.
          Đừng bắt sinh viên bấm thử tiếp. Báo dev ngay (kèm kết quả này + giờ).
          Chờ 15–30 phút rồi bấm kiểm tra lại; vẫn đỏ thì báo dev lần 2.
        </p>
      )}
      {state === 'site-down' && (
        <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3" role="alert">
          🔴 Không kiểm tra được hệ thống từ đây. Thường do <strong>mạng của bạn</strong> (thử mở google.com)
          hoặc hệ thống đang có sự cố lớn. Chờ vài phút rồi bấm lại. Nếu nhiều người cùng báo lỗi,
          đây KHÔNG phải việc của bạn — báo dev.
        </p>
      )}
    </div>
  )
}
