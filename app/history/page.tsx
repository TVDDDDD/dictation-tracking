import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function HistoryPage() {
  const supabase = await createClient()

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

  // Lấy lịch sử làm bài + thông tin bài học
  const { data: submissions } = await supabase
    .from('submissions')
    .select(`
      id,
      score,
      user_answer,
      listen_count,
      submitted_at,
      lessons (
        title,
        order_number
      )
    `)
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-blue-600">Lịch sử làm bài</h1>
          </div>
          <span className="text-sm text-gray-600">
            {profile?.full_name} {profile?.msv && `(${profile.msv})`}
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-semibold mb-6">Các bài bạn đã làm</h2>

        {submissions && submissions.length > 0 ? (
          <div className="space-y-4">
            {submissions.map((item) => (
              <div key={item.id} className="bg-white p-5 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-lg">
                      {item.lessons?.[0]?.title || 'Bài không xác định'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Bài số {item.lessons?.[0]?.order_number} • 
                      Ngày làm: {new Date(item.submitted_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${
                      item.score >= 8 ? 'text-green-600' : 
                      item.score >= 5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {item.score}/10
                    </p>
                    <p className="text-xs text-gray-500">
                      Nghe {item.listen_count} lần
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            Bạn chưa làm bài nào cả.
            <div className="mt-4">
              <Link href="/dashboard" className="text-blue-600 hover:underline">
                Đi làm bài ngay →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}