import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminFilters from './AdminFilters'
import {
  vietnamDateToUTC,
  isValidDateString,
  type SubmissionRow
} from '@/lib/admin-utils'

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

  // Lấy danh sách lớp
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('class_code')
    .eq('role', 'student')

  const classList = Array.from(
    new Set(
      (allProfiles || [])
        .map((p) => p.class_code)
        .filter((c): c is string => Boolean(c))
    )
  ).sort()

  // Lấy danh sách bài
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, order_number')
    .eq('is_active', true)
    .order('order_number')

  // Validate tham số
  const lessonParam = params.lesson
  let lessonId: number | null = null
  if (lessonParam) {
    const parsed = Number(lessonParam)
    if (Number.isInteger(parsed) && parsed > 0) {
      lessonId = parsed
    }
  }

  const fromDate = params.from && isValidDateString(params.from) ? params.from : ''
  const toDate = params.to && isValidDateString(params.to) ? params.to : ''

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
    .limit(1000)

  if (lessonId) {
    query = query.eq('lesson_id', lessonId)
  }
  if (fromDate) {
    query = query.gte('submitted_at', vietnamDateToUTC(fromDate, false))
  }
  if (toDate) {
    query = query.lte('submitted_at', vietnamDateToUTC(toDate, true))
  }

  const { data: rawData, error: queryError } = await query

  let submissions: SubmissionRow[] = []
  let loadError: string | null = null

  if (queryError) {
    loadError = queryError.message
  } else {
    submissions = (rawData || []) as unknown as SubmissionRow[]

    // Lọc class + search
    if (params.class) {
      submissions = submissions.filter(
        (s) => s.profiles?.class_code === params.class
      )
    }
    if (params.search) {
      const keyword = params.search.toLowerCase()
      submissions = submissions.filter(
        (s) =>
          s.profiles?.full_name?.toLowerCase().includes(keyword) ||
          s.profiles?.msv?.toLowerCase().includes(keyword)
      )
    }
  }

  // Thống kê
  const totalSubmissions = submissions.length
  const avgScore =
    totalSubmissions > 0
      ? (
          submissions.reduce((sum, s) => sum + Number(s.score || 0), 0) /
          totalSubmissions
        ).toFixed(1)
      : '0'
  const uniqueStudents = new Set(submissions.map((s) => s.user_id)).size

  // URL xuất CSV
  const exportParams = new URLSearchParams()
  if (params.class) exportParams.set('class', params.class)
  if (lessonId) exportParams.set('lesson', String(lessonId))
  if (params.search) exportParams.set('search', params.search)
  if (fromDate) exportParams.set('from', fromDate)
  if (toDate) exportParams.set('to', toDate)
  const exportUrl = `/api/admin/export?${exportParams.toString()}`

  return (
    <div className="min-h-screen bg-gray-50">
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
        <AdminFilters
          classList={classList}
          lessons={lessons || []}
          currentParams={params}
        />

        {/* Thống kê */}
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

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Chi tiết bài làm</h2>
          <a
            href={exportUrl}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            ↓ Xuất CSV
          </a>
        </div>

        {loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            Lỗi tải dữ liệu: {loadError}
          </div>
        ) : (
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
                  submissions.map((item) => (
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
        )}
      </main>
    </div>
  )
}