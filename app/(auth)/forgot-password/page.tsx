"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/app/components/BrandLogo";
import { AuthTransitionLink } from "@/app/components/AuthTransition";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setMessage("Không thể gửi email. Vui lòng thử lại.");
      setLoading(false);
    } else {
      setMessage("Nếu email tồn tại, link đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư (kể cả spam).");
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <BrandLogo href="/" />
        <div className="auth-aside-copy">
          <span className="eyebrow">Khôi phục truy cập</span>
          <h1>Đừng lo, chúng tôi giúp bạn.</h1>
          <p>
            Nhập email để nhận link đặt lại mật khẩu và quay lại luyện nghe
            ngay hôm nay.
          </p>
        </div>
        <p className="auth-aside-foot">DICTATION TRACKING · LEARNING SPACE</p>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">Quên mật khẩu</span>
          <h2>Đặt lại mật khẩu</h2>
          <p className="auth-lead">
            Nhập email tài khoản của bạn. Chúng tôi sẽ gửi link khôi phục.
          </p>

          <form onSubmit={handleSubmit} className="auth-fields">
            <div className="auth-field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {message && (
              <p className={`auth-message ${message.includes("thành công") || message.includes("đã được gửi") ? "is-success" : ""}`} role="alert">
                {message}
              </p>
            )}

            <button type="submit" disabled={loading} className="button button-primary auth-submit">
              {loading ? "Đang gửi..." : "Gửi link đặt lại"}
            </button>
          </form>

          <p className="auth-switch">
            Nhớ mật khẩu?{" "}
            <AuthTransitionLink href="/login">Đăng nhập</AuthTransitionLink>
          </p>
        </div>
      </section>
    </main>
  );
}