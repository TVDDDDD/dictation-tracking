import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Kiểm tra đăng nhập
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Lấy thông tin profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Lấy danh sách bài học
  const { data: lessons } = await supabase
    .from('lessons')
    .select('*')
    .eq('is_active', true)
    .order('order_number', { ascending: true })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white shadow">
  <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
    <h1 className="text-xl font-bold text-blue-600">Dictation Tracking</h1>
    
    <div className="flex items-center gap-4">
      {/* Nút Admin - chỉ hiện khi là admin */}
      {profile?.role === 'admin' && (
        <Link 
          href="/admin" 
          className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
        >
          Quản Lý Sinh viên
        </Link>
      )}

      <Link href="/history" className="text-sm text-blue-600 hover:underline">
        Lịch sử làm bài
      </Link>

      <span className="text-sm text-gray-600">
        Xin chào, <strong>{profile?.full_name || user.email}</strong>
        {profile?.msv && ` (${profile.msv})`}
      </span>

      <form action="/auth/signout" method="post">
        <button className="text-sm text-red-600 hover:underline">
          Đăng xuất
        </button>
      </form>
    </div>
  </div>
</header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 p-6 text-white shadow-xl shadow-blue-500/20 sm:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-50">
                Dashboard
              </p>
              <h2 className="text-2xl font-bold sm:text-3xl">Bài luyện tập hôm nay</h2>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm backdrop-blur-sm">
              {lessons?.length ? `${lessons.length} bài đang có sẵn` : 'Đang cập nhật nội dung'}
            </div>
          </div>
        </section>

        <div className="mb-6 flex items-center justify-between gap-3">
          <h3 className="text-2xl font-bold text-slate-900">Danh sách bài luyện tập</h3>
          <div className="hidden rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 sm:block">
            Tiến độ cá nhân
          </div>
        </div>

        {lessons && lessons.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {lessons.map((lesson) => (
              <article
                key={lesson.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/80"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                    Bài {lesson.order_number}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                    Ready
                  </span>
                </div>

                <div className="mb-4 h-2 w-16 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />

                <h4 className="mb-3 text-xl font-semibold text-slate-900 group-hover:text-blue-700">
                  {lesson.title}
                </h4>

                <p className="mb-5 text-sm leading-6 text-slate-600">
                  Luyện nghe và viết chính xác từng đoạn, cải thiện kỹ năng nghe tiếng Anh và kiểm soát tiến độ học tập của bạn.
                </p>

                <Link
                  href={`/practice/${lesson.id}`}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600"
                >
                  Bắt đầu làm bài
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-10 text-center shadow-sm">
            <p className="text-lg font-medium text-slate-700">Chưa có bài học nào.</p>
            <p className="mt-2 text-sm text-slate-500">Hệ thống sẽ cập nhật danh sách bài luyện tập sớm.</p>
          </div>
        )}
      </main>
    </div>
  )
}