import { Metadata } from 'next'
import Link from 'next/link'
import BrandLogo from '@/app/components/BrandLogo'

export const metadata: Metadata = {
  title: 'Link không hợp lệ | Dictation Studio',
}

export default function AuthCodeErrorPage() {
  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <BrandLogo href="/" />
        <div className="auth-aside-copy">
          <span className="eyebrow">Lỗi xác thực</span>
          <h1>Link đã hết hạn hoặc không hợp lệ</h1>
          <p>
            Link xác thực này không còn hiệu lực. Vui lòng yêu cầu link mới
            hoặc thử lại từ đầu.
          </p>
        </div>
        <p className="auth-aside-foot">DICTATION STUDIO · LEARNING SPACE</p>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">Xác thực thất bại</span>
          <h2>Link không hợp lệ</h2>
          <p className="auth-lead">
            Link này có thể đã được sử dụng, hết hạn, hoặc không đúng định dạng.
          </p>

          <div className="auth-message" role="alert">
            <strong>Có thể nguyên nhân:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Link đã hết hạn (hạn 24h cho reset password, 7 ngày cho invite)</li>
              <li>Link đã được sử dụng trước đó</li>
              <li>Sai token hoặc type parameter</li>
            </ul>
          </div>

          <div className="space-y-3 mt-6">
            <Link href="/forgot-password" className="button button-primary w-full text-center">
              Yêu cầu link đặt lại mật khẩu mới
            </Link>
            <Link href="/login" className="button button-secondary w-full text-center">
              Quay lại đăng nhập
            </Link>
            <Link href="/register" className="button button-subtle w-full text-center">
              Tạo tài khoản mới
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}