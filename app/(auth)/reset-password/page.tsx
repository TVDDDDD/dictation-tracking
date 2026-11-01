"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/app/components/BrandLogo";
import { AuthTransitionLink } from "@/app/components/AuthTransition";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  // Check if user has valid session (callback route already exchanged code)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (data.user) {
        setReady(true);
      } else {
        setMessage("Phiên đã hết hạn hoặc link không hợp lệ. Vui lòng yêu cầu link mới.");
      }
    });
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (password.length < 8) {
      setMessage("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage("Không thể cập nhật mật khẩu. Vui lòng thử lại.");
      setLoading(false);
    } else {
      setMessage("Mật khẩu đã được cập nhật. Đang chuyển về đăng nhập...");
      setLoading(false);
      setTimeout(() => router.push("/login"), 1500);
    }
  };

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <BrandLogo href="/" />
        <div className="auth-aside-copy">
          <span className="eyebrow">Thiết lập lại</span>
          <h1>Mật khẩu mới, khởi đầu mới.</h1>
          <p>
            Đặt mật khẩu mạnh để bảo vệ tài khoản và tiếp tục hành trình luyện nghe.
          </p>
        </div>
        <p className="auth-aside-foot">DICTATION TRACKING · LEARNING SPACE</p>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">Đặt lại mật khẩu</span>
          <h2>Mật khẩu mới</h2>
          <p className="auth-lead">
            Nhập mật khẩu mới (tối thiểu 8 ký tự).
          </p>

          {!ready && message && (
            <p className="auth-message" role="alert">
              {message}
              <br />
              <AuthTransitionLink href="/forgot-password" className="underline">
                Yêu cầu link mới
              </AuthTransitionLink>
            </p>
          )}

          {ready && (
            <form onSubmit={handleSubmit} className="auth-fields">
              {message && (
                <p className={`auth-message ${message.includes("cập nhật") ? "is-success" : ""}`} role="alert">
                  {message}
                </p>
              )}

              <div className="auth-field">
                <label htmlFor="new-password">Mật khẩu mới</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div className="auth-field">
                <label htmlFor="confirm-password">Xác nhận mật khẩu</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <button type="submit" disabled={loading} className="button button-primary auth-submit">
                {loading ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
              </button>
            </form>
          )}

          <p className="auth-switch">
            <AuthTransitionLink href="/login">Quay lại đăng nhập</AuthTransitionLink>
          </p>
        </div>
      </section>
    </main>
  );
}