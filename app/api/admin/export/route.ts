import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Kiểm tra đăng nhập + quyền admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Lấy các tham số lọc từ URL
  const searchParams = request.nextUrl.searchParams
  const classCode = searchParams.get('class') || ''
  const lessonId = searchParams.get('lesson') || ''
  const search = searchParams.get('search') || ''
  const fromDate = searchParams.get('from') || ''
  const toDate = searchParams.get('to') || ''

  // Query submissions
  let query = supabase
    .from('submissions')
    .select(`
      score,
      correct_count,
      total_questions,
      percentage,
      listen_count,
      submitted_at,
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

  // Áp dụng bộ lọc
  if (lessonId) {
    query = query.eq('lesson_id', Number(lessonId))
  }
  if (fromDate) {
    query = query.gte('submitted_at', fromDate)
  }
  if (toDate) {
    // Thêm 1 ngày để bao gồm cả ngày kết thúc
    const nextDay = new Date(toDate)
    nextDay.setDate(nextDay.getDate() + 1)
    query = query.lt('submitted_at', nextDay.toISOString())
  }

  const { data: submissions, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Lọc thêm ở phía server (class + search tên/MSV)
  let filtered = submissions || []

  if (classCode) {
    filtered = filtered.filter((s: any) => s.profiles?.class_code === classCode)
  }
  if (search) {
    const keyword = search.toLowerCase()
    filtered = filtered.filter((s: any) => 
      s.profiles?.full_name?.toLowerCase().includes(keyword) ||
      s.profiles?.msv?.toLowerCase().includes(keyword)
    )
  }

  // Tạo CSV
  const headers = [
    'class_code',
    'msv',
    'student_name',
    'lesson_order',
    'lesson_title',
    'submitted_at',
    'correct_count',
    'total_questions',
    'percentage',
    'score',
    'listen_count'
  ]

  const rows = filtered.map((item: any) => [
    item.profiles?.class_code || '',
    item.profiles?.msv || '',
    item.profiles?.full_name || '',
    item.lessons?.order_number || '',
    item.lessons?.title || '',
    item.submitted_at ? new Date(item.submitted_at).toISOString() : '',
    item.correct_count ?? '',
    item.total_questions ?? '',
    item.percentage != null ? Number(item.percentage).toFixed(1) : '',
    item.score ?? '',
    item.listen_count ?? 0
  ])

  // Tạo nội dung CSV (UTF-8 BOM để Excel mở tiếng Việt đẹp)
  const bom = '\uFEFF'
  const csvContent = bom + [
    headers.join(','),
    ...rows.map(row => 
      row.map(cell => {
        const str = String(cell ?? '')
        // Escape nếu có dấu phẩy, xuống dòng hoặc dấu nháy
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    )
  ].join('\n')

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="submissions_${new Date().toISOString().slice(0, 10)}.csv"`
    }
  })
}