import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";

type LessonStatus = "makeup" | "done" | "open" | "locked";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Kiểm tra đăng nhập
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profileResult, lessonsResult, submissionsResult, accessResult, grantsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single(),
      supabase
        .from("lessons")
        .select("*")
        .eq("is_active", true)
        .order("order_number", { ascending: true }),
      supabase
        .from("submissions")
        .select("lesson_id, attempt_number")
        .eq("user_id", user.id),
      supabase
        .from("lesson_access")
        .select("lesson_id, class_code"),
      supabase
        .from("makeup_grants")
        .select("lesson_id")
        .eq("user_id", user.id),
    ]);

  const profile = profileResult.data;
  const lessons = lessonsResult.data || [];
  const classCode = (profile?.class_code || "").trim();

  // Set lesson_id đã có submission
  const submitted = new Map<number, { maxAttempt: number }>();
  for (const sub of submissionsResult.data || []) {
    const attempt = Number(sub.attempt_number ?? 1);
    const cur = submitted.get(sub.lesson_id);
    submitted.set(sub.lesson_id, {
      maxAttempt: cur ? Math.max(cur.maxAttempt, attempt) : attempt,
    });
  }

  // Set lesson_id mở cho lớp mình
  const openForClass = new Set(
    (accessResult.data || [])
      .filter((a) => a.class_code === classCode)
      .map((a) => a.lesson_id),
  );

  // Set lesson_id có makeup_grant chưa dùng (đủ điều kiện: chưa có attempt 2)
  const makeupReady = new Set(
    (grantsResult.data || [])
      .filter((g) => (submitted.get(g.lesson_id)?.maxAttempt ?? 0) < 2)
      .map((g) => g.lesson_id),
  );

  const statusOf = (lessonId: number): LessonStatus => {
    if (makeupReady.has(lessonId)) return "makeup";
    if (submitted.has(lessonId)) return "done";
    if (openForClass.has(lessonId)) return "open";
    return "locked";
  };

  const statusConfig: Record<
    LessonStatus,
    { pill: string; cta: string; href: string | null }
  > = {
    makeup: { pill: 'Được làm lại', cta: 'Làm lại (makeup)', href: '/practice/[id]' },
    done: { pill: 'Đã làm', cta: 'Xem kết quả / Ôn tập', href: '/practice/[id]' },
    open: { pill: 'Đã mở', cta: 'Làm bài', href: '/practice/[id]' },
    locked: { pill: 'Chưa mở', cta: 'Chưa mở', href: null },
  };

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <BrandLogo href="/dashboard" />

          <div className="topbar-actions">
            {/* Nút Admin - chỉ hiện khi là admin */}
            {profile?.role === "admin" && (
              <>
                <Link href="/admin" className="button button-secondary">
                  Quản lý sinh viên
                </Link>
                <Link href="/admin/progress" className="button button-secondary">
                  Tiến độ sinh viên
                </Link>
              </>
            )}

            <Link href="/history" className="button button-subtle">
              Lịch sử làm bài
            </Link>

            <span className="user-chip">
              Xin chào, <strong>{profile?.full_name || user.email}</strong>
              {profile?.msv && ` (${profile.msv})`}
            </span>

            <form action="/auth/signout" method="post">
              <button className="button button-danger" type="submit">
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
                Chọn một bài nghe để bắt đầu luyện tập và xây dựng sự tự tin
                qua từng câu.
              </p>
            </div>

            <span className="hero-meta">
              {lessons.length
                ? `${lessons.length} bài đang mở`
                : "Đang cập nhật nội dung"}
            </span>
          </div>
        </section>

        <div className="section-heading">
          <div>
            <h3 className="section-title">Bài luyện tập</h3>
            <p className="section-note">
              Bài được mở cho lớp của bạn. Sinh viên chưa có mã lớp sẽ thấy mọi
              bài ở trạng thái &quot;Chưa mở&quot;.
            </p>
          </div>
        </div>

        {lessons.length > 0 ? (
          <div className="lesson-grid">
            {lessons.map((lesson) => {
              const status = statusOf(lesson.id);
              const cfg = statusConfig[status];
              const href = cfg.href
                ? cfg.href.replace("[id]", String(lesson.id))
                : null;

              return (
                <article key={lesson.id} className="lesson-card">
                  <div className="lesson-card-top">
                    <span className="lesson-number">
                      Bài {lesson.order_number}
                    </span>
                    <span
                      className="status-pill"
                      style={{
                        background:
                          status === "open" || status === "makeup"
                            ? "var(--mint)"
                            : status === "done"
                              ? "rgba(96,165,250,.15)"
                              : "var(--surface-muted)",
                        color:
                          status === "open" || status === "makeup"
                            ? "var(--forest)"
                            : status === "done"
                              ? "#1d4ed8"
                              : "var(--ink-soft)",
                      }}
                    >
                      {cfg.pill}
                    </span>
                  </div>

                  <h3>{lesson.title}</h3>

                  <p>
                    Lắng nghe đoạn văn và điền chính xác những gì bạn nghe
                    được.
                  </p>

                  {href ? (
                    <Link
                      href={href}
                      className="button button-primary"
                    >
                      {cfg.cta}
                    </Link>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled
                    >
                      {cfg.cta}
                    </button>
                  )}
                </article>
              );
            })}
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
