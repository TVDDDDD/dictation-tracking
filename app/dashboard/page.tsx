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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">Dictation Tracking</h1>
          <div className="flex items-center gap-4">
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

      {/* Nội dung chính */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold mb-6">Danh sách bài luyện tập</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {lessons?.map((lesson) => (
            <div
              key={lesson.id}
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-medium">{lesson.title}</h3>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  Bài {lesson.order_number}
                </span>
              </div>

              <Link
                href={`/practice/${lesson.id}`}
                className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
              >
                Bắt đầu làm bài
              </Link>
            </div>
          ))}
        </div>

        {(!lessons || lessons.length === 0) && (
          <p className="text-gray-500">Chưa có bài học nào.</p>
        )}
      </main>
    </div>
  )
}