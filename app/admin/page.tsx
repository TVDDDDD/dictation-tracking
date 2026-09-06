import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Kiểm tra có phải admin không
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard') // Không phải admin thì đá về dashboard
  }

  // Lấy danh sách tất cả sinh viên
  const { data: students } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('created_at', { ascending: false })

  // Lấy tất cả bài nộp
  const { data: submissions } = await supabase
    .from('submissions')
    .select(`
      id,
      score,
      listen_count,
      submitted_at,
      user_id,
      lessons (title, order_number),
      profiles (full_name, msv)
    `)
    .order('submitted_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-purple-700">Trang Quản trị (Admin)</h1>
          </div>
          <span className="text-sm text-gray-600">
            Xin chào Admin: <strong>{profile.full_name}</strong>
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Thống kê nhanh */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Tổng số sinh viên</p>
            <p className="text-3xl font-bold text-blue-600">{students?.length || 0}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Tổng số bài đã nộp</p>
            <p className="text-3xl font-bold text-green-600">{submissions?.length || 0}</p>
          </div>
          <div className="bg-white p-5 rounded-lg shadow">
            <p className="text-sm text-gray-500">Điểm trung bình</p>
            <p className="text-3xl font-bold text-purple-600">
              {submissions && submissions.length > 0
                ? (submissions.reduce((sum, s) => sum + Number(s.score), 0) / submissions.length).toFixed(1)
                : '0'}
            </p>
          </div>
        </div>

        {/* Danh sách sinh viên */}
        <h2 className="text-xl font-semibold mb-4">Danh sách sinh viên</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden mb-10">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Họ tên</th>
                <th className="px-4 py-3 text-left">MSV</th>
                <th className="px-4 py-3 text-left">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {students?.map((student) => (
                <tr key={student.id} className="border-t">
                  <td className="px-4 py-3">{student.full_name}</td>
                  <td className="px-4 py-3">{student.msv}</td>
                  <td className="px-4 py-3">
                    {new Date(student.created_at).toLocaleDateString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lịch sử nộp bài gần đây */}
        <h2 className="text-xl font-semibold mb-4">Lịch sử nộp bài gần đây</h2>
        <div className="space-y-3">
          {submissions?.slice(0, 20).map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
              <div>
                <p className="font-medium">
                  {item.profiles?.[0]?.full_name} ({item.profiles?.[0]?.msv})
                </p>
                <p className="text-sm text-gray-500">
                  {item.lessons?.[0]?.title} • {new Date(item.submitted_at).toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${
                  item.score >= 8 ? 'text-green-600' : 
                  item.score >= 5 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {item.score}/10
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}   