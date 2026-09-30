"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    // Đăng nhập thành công → chuyển hướng
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark">D</span>
          <span className="brand-copy">
            <span className="brand-kicker">LISTEN · LEARN</span>
            <span className="brand-name">Dictation Studio</span>
          </span>
        </Link>
        <div className="auth-aside-copy">
          <span className="eyebrow">Phòng luyện nghe</span>
          <h1>Nghe kỹ hơn. Tiến bộ mỗi ngày.</h1>
          <p>
            Hoàn thành bài nghe, xem lại kết quả và theo dõi hành trình học tập
            của bạn trong một không gian tập trung.
          </p>
        </div>
        <p className="auth-aside-foot">DICTATION TRACKING · LEARNING SPACE</p>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">Chào mừng trở lại</span>
          <h2>Đăng nhập</h2>
          <p className="auth-lead">
            Đăng nhập để tiếp tục các bài luyện nghe của bạn.
          </p>
          <form onSubmit={handleLogin} className="auth-fields">
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Mật khẩu</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {message && (
              <p className="auth-message" role="alert">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="button button-primary auth-submit"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>
          <p className="auth-switch">
            Chưa có tài khoản?{" "}
            <Link href="/register">Tạo tài khoản học viên</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
