import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";

type LessonSummary = {
  title: string;
  order_number: number;
};

function getLessonSummary(
  relation: LessonSummary | LessonSummary[] | null | undefined,
) {
  return Array.isArray(relation) ? (relation[0] ?? null) : (relation ?? null);
}

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [profileResult, submissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single(),
    supabase
      .from("submissions")
      .select(
        `
      id,
      lesson_id,
      score,
      user_answer,
      listen_count,
      submitted_at,
      attempt_number,
      lessons (
        title,
        order_number
      )
    `,
      )
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false }),
  ]);

  const profile = profileResult.data;
  const submissions = submissionsResult.data;
  const submissionsError = submissionsResult.error;

  if (submissionsError) {
    console.error("Không thể tải lịch sử làm bài:", submissionsError);
  }

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="button button-subtle">
              ← Dashboard
            </Link>
            <BrandLogo
              href="/dashboard"
              kicker="LEARNING RECORD"
              name="Lịch sử làm bài"
            />
          </div>
          <span className="user-chip">
            {profile?.full_name} {profile?.msv && `(${profile.msv})`}
          </span>
        </div>
      </header>

      <main className="content-wrap">
        <div className="page-intro">
          <div>
            <span className="eyebrow">Nhật ký học tập</span>
            <h1 className="page-title">Bài đã hoàn thành</h1>
            <p className="page-description">
              Xem lại điểm số và thời gian nộp của từng bài nghe.
            </p>
          </div>
        </div>

        {submissionsError ? (
          <div className="notice-error">
            Không thể tải lịch sử làm bài. Vui lòng thử lại sau.
            <p className="mt-2 text-sm text-gray-500">
              {submissionsError.message}
            </p>
          </div>
        ) : submissions && submissions.length > 0 ? (
          <div className="history-grid">
            {submissions.map((item) => {
              const lesson = getLessonSummary(item.lessons);
              const score = Number(item.score ?? 0);
              const scoreColor =
                score >= 8 ? 'text-green-600' : score >= 5 ? 'text-yellow-600' : 'text-red-600';
              const attemptBadge = Number(item.attempt_number ?? 1) > 1
                ? <span className="ml-2 inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Lượt {item.attempt_number} (makeup)</span>
                : null;

              return (
                <Link
                  key={item.id}
                  href={`/practice/${item.lesson_id}?mode=result&attempt=${item.attempt_number}`}
                  className="history-card"
                >
                  <article className="history-card-inner">
                    <div className="history-left">
                      <h2 className="history-title">
                        {lesson?.title || "Bài không xác định"}
                      </h2>
                      <p className="history-meta">
                        {lesson?.order_number != null && `Bài số ${lesson.order_number} • `}
                        {attemptBadge}
                        Ngày làm: {new Date(item.submitted_at).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="history-right">
                      <p className={`history-score ${scoreColor}`}>
                        {item.score}/10
                      </p>
                      <p className="history-score-label">
                        Nghe {item.listen_count} lần
                      </p>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>Bạn chưa làm bài nào</h3>
            <p>Khi hoàn thành bài luyện tập, kết quả sẽ được lưu tại đây.</p>
            <div className="mt-4">
              <Link href="/dashboard" className="button button-primary">
                Đi làm bài ngay →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}