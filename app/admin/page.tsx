import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Kiểm tra quyền admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  // Lấy danh sách sinh viên
  const { data: students } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('full_name')

  // Lấy tất cả bài nộp (kèm thông tin bài và sinh viên)
  const { data: submissions } = await supabase
    .from('submissions')
    .select(`
      id,
      score,
      correct_count,
      total_questions,
      percentage,
      listen_count,
      submitted_at,
      user_id,
      lesson_id,
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

  // Thống kê nhanh
  const totalStudents = students?.length || 0
  const totalSubmissions = submissions?.length || 0
  const avgScore = totalSubmissions > 0
    ? (submissions!.reduce((sum, s) => sum + Number(s.score || 0), 0) / totalSubmissions).toFixed(1)
    : '0'

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
        {/* Thống kê tổng quan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Tổng số sinh viên</p>
            <p className="text-3xl font-bold text-blue-600">{totalStudents}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Tổng số bài đã nộp</p>
            <p className="text-3xl font-bold text-green-600">{totalSubmissions}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Điểm trung bình</p>
            <p className="text-3xl font-bold text-purple-600">{avgScore}</p>
          </div>
        </div>

        {/* Bảng chi tiết bài nộp */}
        <h2 className="text-xl font-semibold mb-4">Chi tiết bài làm của sinh viên</h2>
        
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
              {submissions && submissions.length > 0 ? (
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
                      <span className={`font-bold ${
                        Number(item.score) >= 8 ? 'text-green-600' :
                        Number(item.score) >= 5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
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
                    Chưa có bài nộp nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Danh sách sinh viên */}
        <h2 className="text-xl font-semibold mt-10 mb-4">Danh sách sinh viên</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Họ tên</th>
                <th className="px-4 py-3 text-left">MSV</th>
                <th className="px-4 py-3 text-left">Lớp</th>
                <th className="px-4 py-3 text-left">Ngày đăng ký</th>
              </tr>
            </thead>
            <tbody>
              {students?.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">{s.full_name}</td>
                  <td className="px-4 py-3">{s.msv}</td>
                  <td className="px-4 py-3">{s.class_code || '—'}</td>
                  <td className="px-4 py-3">
                    {new Date(s.created_at).toLocaleDateString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}