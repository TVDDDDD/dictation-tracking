import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminFilters from './AdminFilters'

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  // Lấy danh sách lớp và bài để làm bộ lọc
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('class_code')
    .eq('role', 'student')

  const classList = Array.from(
    new Set(allProfiles?.map(p => p.class_code).filter(Boolean) || [])
  ).sort()

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, order_number')
    .eq('is_active', true)
    .order('order_number')

  // Query submissions
  let query = supabase
    .from('submissions')
    .select(`
      id,
      score,
      correct_count,
      total_questions,
      percentage,
      listen_count,
      submitted_at,
      lesson_id,
      user_id,
      lessons (
        title,
        order_number
      ),
      profiles (
        full_name,
        msv,
        class_code
      )
    `)
    .order('submitted_at', { ascending: false })

  // Áp dụng filter từ URL
  if (params.lesson) {
    query = query.eq('lesson_id', Number(params.lesson))
  }
  if (params.from) {
    query = query.gte('submitted_at', params.from)
  }
  if (params.to) {
    const nextDay = new Date(params.to)
    nextDay.setDate(nextDay.getDate() + 1)
    query = query.lt('submitted_at', nextDay.toISOString())
  }

  const { data: rawSubmissions } = await query

  // Lọc thêm class + search (vì join)
  let submissions = rawSubmissions || []

  if (params.class) {
    submissions = submissions.filter(
      (s: any) => s.profiles?.class_code === params.class
    )
  }
  if (params.search) {
    const keyword = params.search.toLowerCase()
    submissions = submissions.filter(
      (s: any) =>
        s.profiles?.full_name?.toLowerCase().includes(keyword) ||
        s.profiles?.msv?.toLowerCase().includes(keyword)
    )
  }

  // Thống kê theo dữ liệu đã lọc
  const totalSubmissions = submissions.length
  const avgScore =
    totalSubmissions > 0
      ? (
          submissions.reduce((sum: number, s: any) => sum + Number(s.score || 0), 0) /
          totalSubmissions
        ).toFixed(1)
      : '0'

  const uniqueStudents = new Set(submissions.map((s: any) => s.user_id)).size

  // Tạo query string để xuất CSV
  const exportParams = new URLSearchParams()
  if (params.class) exportParams.set('class', params.class)
  if (params.lesson) exportParams.set('lesson', params.lesson)
  if (params.search) exportParams.set('search', params.search)
  if (params.from) exportParams.set('from', params.from)
  if (params.to) exportParams.set('to', params.to)
  const exportUrl = `/api/admin/export?${exportParams.toString()}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-purple-700">Trang Quản trị (Admin)</h1>
          </div>
          <span className="text-sm text-gray-600">
            Admin: <strong>{profile.full_name}</strong>
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Bộ lọc */}
        <AdminFilters
          classList={classList}
          lessons={lessons || []}
          currentParams={params}
        />

        {/* Thống kê (theo bộ lọc) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Số bài nộp (đang lọc)</p>
            <p className="text-3xl font-bold text-green-600">{totalSubmissions}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Số sinh viên (đang lọc)</p>
            <p className="text-3xl font-bold text-blue-600">{uniqueStudents}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Điểm trung bình (đang lọc)</p>
            <p className="text-3xl font-bold text-purple-600">{avgScore}</p>
          </div>
        </div>

        {/* Nút xuất CSV */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Chi tiết bài làm</h2>
          <a
            href={exportUrl}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            ↓ Xuất CSV
          </a>
        </div>

        {/* Bảng dữ liệu */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-4 py-3">Họ tên</th>
                <th className="px-4 py-3">MSV</th>
                <th className="px-4 py-3">Lớp</th>
                <th className="px-4 py-3">Bài</th>
                <th className="px-4 py-3">Câu đúng</th>
                <th className="px-4 py-3">Điểm</th>
                <th className="px-4 py-3">Nghe</th>
                <th className="px-4 py-3">Thời gian nộp</th>
              </tr>
            </thead>
            <tbody>
              {submissions.length > 0 ? (
                submissions.map((item: any) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {item.profiles?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">{item.profiles?.msv || '—'}</td>
                    <td className="px-4 py-3">{item.profiles?.class_code || '—'}</td>
                    <td className="px-4 py-3">
                      {item.lessons?.title || `Bài ${item.lesson_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">
                        {item.correct_count ?? '—'}/{item.total_questions ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold ${
                          Number(item.score) >= 8
                            ? 'text-green-600'
                            : Number(item.score) >= 5
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                      >
                        {item.score ?? '—'}/10
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.listen_count ?? 0} lần</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(item.submitted_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Không có dữ liệu phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}