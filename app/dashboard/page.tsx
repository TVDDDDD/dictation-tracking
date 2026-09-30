import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Kiểm tra đăng nhập
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Lấy thông tin profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Lấy danh sách bài học
  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("is_active", true)
    .order("order_number", { ascending: true });

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard" className="brand-lockup">
            <span className="brand-mark">D</span>
            <span className="brand-copy">
              <span className="brand-kicker">LISTEN · LEARN</span>
              <span className="brand-name">Dictation Studio</span>
            </span>
          </Link>

          <div className="topbar-actions">
            {/* Nút Admin - chỉ hiện khi là admin */}
            {profile?.role === "admin" && (
              <Link href="/admin" className="button button-secondary">
                Quản Lý Sinh viên
              </Link>
            )}

            <Link href="/history" className="button button-subtle">
              Lịch sử làm bài
            </Link>

            <span className="user-chip">
              Xin chào, <strong>{profile?.full_name || user.email}</strong>
              {profile?.msv && ` (${profile.msv})`}
            </span>

            <form action="/auth/signout" method="post">
              <button className="button button-subtle" type="submit">
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="content-wrap">
        <section className="hero-band">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="eyebrow">Góc học tập của bạn</span>
              <h2 className="hero-title">Lắng nghe từng chi tiết.</h2>
              <p className="hero-copy">
                Chọn một bài nghe để bắt đầu luyện tập và xây dựng sự tự tin qua
                từng câu.
              </p>
            </div>

            <span className="hero-meta">
              {lessons?.length
                ? `${lessons.length} bài đang mở`
                : "Đang cập nhật nội dung"}
            </span>
          </div>
        </section>

        <div className="section-heading">
          <div>
            <h3 className="section-title">Bài luyện tập</h3>
            <p className="section-note">
              Các bài nghe hiện đang được giao cho lớp của bạn.
            </p>
          </div>
        </div>

        {lessons && lessons.length > 0 ? (
          <div className="lesson-grid">
            {lessons.map((lesson) => (
              <article key={lesson.id} className="lesson-card">
                <div className="lesson-card-top">
                  <span className="lesson-number">
                    Bài {lesson.order_number}
                  </span>
                  <span className="status-pill">Luyện nghe</span>
                </div>

                <h3>{lesson.title}</h3>

                <p>
                  Lắng nghe đoạn văn và điền chính xác những gì bạn nghe được.
                </p>

                <Link
                  href={`/practice/${lesson.id}`}
                  className="button button-primary"
                >
                  Bắt đầu làm bài
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Chưa có bài học nào</h3>
            <p>Danh sách bài luyện tập sẽ xuất hiện tại đây khi được mở.</p>
          </div>
        )}
      </main>
    </div>
  );
}
