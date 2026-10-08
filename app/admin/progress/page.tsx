import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchAllFullSubmissions } from "@/lib/fetch-all-submissions";

type StudentProgress = {
  id: string;
  full_name: string | null;
  msv: string | null;
  class_code: string | null;
  total_lessons: number;
  completed: number;
  completion_rate: number;
  avg_score: number | null;
  details: {
    lesson_id: number;
    lesson_title: string;
    order_number: number;
    score: number | null;
    correct_count: number | null;
    total_questions: number | null;
    submitted_at: string | null;
    status: "done" | "missing";
  }[];
};

export default async function ProgressPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  const [lessonsResult, studentsResult, submissions] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, title, order_number")
      .eq("is_active", true)
      .order("order_number"),
    supabase
      .from("profiles")
      .select("id, full_name, msv, class_code")
      .eq("role", "student")
      .order("class_code")
      .order("full_name"),
    fetchAllFullSubmissions(),
  ]);

  const lessons = lessonsResult.data || [];
  const students = studentsResult.data || [];
  const totalLessons = lessons.length;

  const submissionsByUserAndLesson = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    submissionsByUserAndLesson.set(
      `${submission.user_id}:${submission.lesson_id}`,
      submission,
    );
  }

  // 4. Tính tiến độ từng sinh viên
  const progressList: StudentProgress[] = students.map((student) => {
    const details = lessons.map((lesson) => {
      const sub = submissionsByUserAndLesson.get(`${student.id}:${lesson.id}`);
      return {
        lesson_id: lesson.id,
        lesson_title: lesson.title,
        order_number: lesson.order_number,
        score: sub?.score ?? null,
        correct_count: sub?.correct_count ?? null,
        total_questions: sub?.total_questions ?? null,
        submitted_at: sub?.submitted_at ?? null,
        status: sub ? ("done" as const) : ("missing" as const),
      };
    });

    const completed = details.filter((d) => d.status === "done").length;
    const scores = details
      .filter((d) => d.score != null)
      .map((d) => Number(d.score));

    const avgScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;

    return {
      id: student.id,
      full_name: student.full_name,
      msv: student.msv,
      class_code: student.class_code,
      total_lessons: totalLessons,
      completed,
      completion_rate: totalLessons > 0 ? (completed / totalLessons) * 100 : 0,
      avg_score: avgScore,
      details,
    };
  });

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="button button-subtle">
              ← Quay lại Admin
            </Link>
            <span className="brand-name">Tiến độ sinh viên</span>
          </div>
          <span className="user-chip">
            Admin: <strong>{profile.full_name}</strong>
          </span>
        </div>
      </header>

      <main className="content-wrap">
        <div className="page-intro">
          <div>
            <span className="eyebrow">Tổng quan học tập</span>
            <h1 className="page-title">Tiến độ sinh viên</h1>
            <p className="page-description">
              Theo dõi mức độ hoàn thành và kết quả của từng học viên qua các
              bài đang mở.
            </p>
          </div>
          <span className="hero-meta">{totalLessons} bài đang giao</span>
        </div>

        <div className="progress-list">
          {progressList.map((student) => (
            <article key={student.id} className="progress-student">
              {/* Thông tin sinh viên */}
              <div className="progress-student-head">
                <div>
                  <h2 className="progress-student-name">
                    {student.full_name || "—"}
                  </h2>
                  <p className="progress-student-meta">
                    MSV: {student.msv || "—"} • Lớp: {student.class_code || "—"}
                  </p>
                </div>

                <div className="progress-metrics">
                  <div className="progress-metric">
                    <p className="progress-metric-label">Hoàn thành</p>
                    <p className="progress-metric-value">
                      {student.completed}/{student.total_lessons}
                    </p>
                  </div>
                  <div className="progress-metric">
                    <p className="progress-metric-label">Tỷ lệ</p>
                    <p className="progress-metric-value">
                      {student.completion_rate.toFixed(0)}%
                    </p>
                  </div>
                  <div className="progress-metric">
                    <p className="progress-metric-label">Điểm TB</p>
                    <p className="progress-metric-value">
                      {student.avg_score != null
                        ? student.avg_score.toFixed(1)
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chi tiết từng bài */}
              <div className="progress-lesson-grid">
                {student.details.map((d) => (
                  <div
                    key={d.lesson_id}
                    className={`progress-lesson ${d.status === "done" ? "is-done" : ""}`}
                  >
                    <p className="progress-lesson-name" title={d.lesson_title}>
                      Bài {d.order_number}
                    </p>
                    {d.status === "done" ? (
                      <p className="progress-lesson-result">{d.score}/10</p>
                    ) : (
                      <p className="progress-lesson-missing">Chưa làm</p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        {progressList.length === 0 && (
          <div className="empty-state">
            <h3>Chưa có sinh viên nào</h3>
            <p>Danh sách học viên sẽ hiển thị ở đây sau khi đăng ký.</p>
          </div>
        )}
      </main>
    </div>
  );
}
