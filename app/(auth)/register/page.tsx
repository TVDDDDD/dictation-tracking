"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [msv, setMsv] = useState("");
  const [classCode, setClassCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          msv: msv,
          class_code: classCode,
          role: "student",
        },
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Đăng ký thành công! Bạn có thể đăng nhập ngay.");
      // Có thể tự chuyển sang trang login sau 1.5 giây
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    }
    setLoading(false);
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
          <span className="eyebrow">Bắt đầu hành trình</span>
          <h2>Mỗi bài nghe là một bước tiến.</h2>
          <p>
            Tạo tài khoản để làm bài, lưu kết quả và theo dõi quá trình luyện
            tập.
          </p>
        </div>
        <p className="auth-aside-foot">DICTATION TRACKING · LEARNING SPACE</p>
      </aside>
      <section className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">Hồ sơ học viên</span>
          <h1>Tạo tài khoản</h1>
          <p className="auth-lead">
            Điền thông tin để tham gia lớp luyện nghe.
          </p>

          <form onSubmit={handleRegister} className="auth-fields">
            <div className="auth-field">
              <label className="block text-sm font-medium mb-1">
                Họ và tên
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="auth-field">
              <label className="block text-sm font-medium mb-1">
                Mã sinh viên (MSV)
              </label>
              <input
                type="text"
                value={msv}
                onChange={(e) => setMsv(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="auth-field">
              <label className="block text-sm font-medium mb-1">Mã lớp</label>
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                placeholder="Ví dụ: AV2024A, K28-01..."
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="auth-field">
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="auth-field">
              <label className="block text-sm font-medium mb-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>

            {message && (
              <p
                className={`auth-message ${message.includes("thành công") ? "is-success" : ""}`}
                role="status"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="button button-primary auth-submit"
            >
              {loading ? "Đang xử lý..." : "Đăng ký"}
            </button>
          </form>

          <p className="auth-switch">
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
