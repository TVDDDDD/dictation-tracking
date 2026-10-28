
import LessonRow from './components/LessonRow'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLessonsAdmin } from '@/app/admin/actions'
import BrandLogo from '@/app/components/BrandLogo'

export default async function LessonsListPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const lessons = await getLessonsAdmin()

  return (
    <div className="app-page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="button button-subtle">
              ← Admin
            </Link>
            <BrandLogo
              href="/admin"
              kicker="LESSON MANAGEMENT"
              name="Quản lý bài nghe"
            />
           
          </div>
        </div>
      </header>

      <main className="content-wrap">
        <div className="page-intro flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <span className="eyebrow">Quản trị</span>
            <h1 className="page-title">Danh sách bài nghe</h1>
            <p className="page-description">
              Tạo, sửa, xóa bài nghe. Thứ tự hiển thị theo <code>order_number</code>.
            </p>
          </div>
          <Link href="/admin/lessons/new" className="button button-primary">
            + Thêm bài mới
          </Link>
        </div>

        {lessons.length === 0 ? (
          <div className="empty-state text-center py-12">
            <h3 className="text-lg font-medium text-gray-600 mb-2">Chưa có bài nghe nào</h3>
            <p className="text-gray-500 mb-4">Tạo bài nghe đầu tiên để bắt đầu.</p>
            <Link href="/admin/lessons/new" className="button button-primary">
              + Tạo bài nghe đầu tiên
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-12">STT</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tên bài</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Thứ tự</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Audio</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Số câu</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Trạng thái</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lessons.map((lesson, index) => (
                  <LessonRow lesson={lesson} index={index} key={lesson.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}