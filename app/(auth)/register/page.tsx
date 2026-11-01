"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import BrandLogo from "@/app/components/BrandLogo";
import { AuthTransitionLink } from "@/app/components/AuthTransition";

type ClassOption = { code: string; name: string };

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [msv, setMsv] = useState("");
  const [classCode, setClassCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const router = useRouter();
  const supabase = createClient();

  // Load classes for dropdown
  useEffect(() => {
    supabase
      .from("classes")
      .select("code, name")
      .order("sort_order")
      .then(({ data }: { data: ClassOption[] | null }) => setClasses(data || []));
  }, [supabase]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!classCode.trim()) {
      setMessage("Mã lớp là bắt buộc. Vui lòng chọn lớp của bạn.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          msv: msv,
          class_code: classCode.trim(),
          role: "student",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
    } else {
      setMessage("Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản, sau đó đăng nhập.");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <BrandLogo href="/" />
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
              <label className="block text-sm font-medium mb-1">Lớp</label>
              <select
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
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
            Đã có tài khoản? <AuthTransitionLink href="/login">Đăng nhập</AuthTransitionLink>
          </p>
          <p className="auth-switch" style={{ marginTop: '0.5rem' }}>
            <AuthTransitionLink href="/forgot-password">
              Quên mật khẩu?
            </AuthTransitionLink>
          </p>
        </div>
      </section>
      </main>
  );
}