import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HistoryPage() {
  const supabase = await createClient();

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

  // Lấy lịch sử làm bài + thông tin bài học
  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select(
      `
      id,
      score,
      user_answer,
      listen_count,
      submitted_at,
      lessons (
        title,
        order_number
      )
    `,
    )
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

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
            <Link href="/dashboard" className="brand-lockup">
              <span className="brand-mark">D</span>
              <span className="brand-copy">
                <span className="brand-kicker">LEARNING RECORD</span>
                <span className="brand-name">Lịch sử làm bài</span>
              </span>
            </Link>
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
          <div className="history-list">
            {submissions.map((item) => (
              <article key={item.id} className="history-row">
                <div>
                  <div>
                    <h2 className="history-title">
                      {item.lessons?.[0]?.title || "Bài không xác định"}
                    </h2>
                    <p className="history-meta">
                      Bài số {item.lessons?.[0]?.order_number} • Ngày làm:{" "}
                      {new Date(item.submitted_at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <div>
                    <p className="history-score">{item.score}/10</p>
                    <p className="history-score-label">
                      Nghe {item.listen_count} lần
                    </p>
                  </div>
                </div>
              </article>
            ))}
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
