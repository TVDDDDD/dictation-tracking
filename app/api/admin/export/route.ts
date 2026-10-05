import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchAllFullSubmissions } from '@/lib/fetch-all-submissions'
import {
  escapeCsvCell,
  vietnamDateToUTC,
  isValidDateString,
} from '@/lib/admin-utils'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

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

  const searchParams = request.nextUrl.searchParams
  const classCode = searchParams.get('class') || ''
  const lessonParam = searchParams.get('lesson') || ''
  const search = searchParams.get('search') || ''
  const fromDate = searchParams.get('from') || ''
  const toDate = searchParams.get('to') || ''

  // Validate lesson
  let lessonId: number | null = null
  if (lessonParam) {
    const parsed = Number(lessonParam)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'Invalid lesson id' }, { status: 400 })
    }
    lessonId = parsed
  }

  // Validate dates
  if (fromDate && !isValidDateString(fromDate)) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }
  if (toDate && !isValidDateString(toDate)) {
    return NextResponse.json({ error: 'Invalid to date' }, { status: 400 })
  }
  if (fromDate && toDate && fromDate > toDate) {
    return NextResponse.json({ error: 'from date must be <= to date' }, { status: 400 })
  }

  // Lấy toàn bộ dữ liệu (phân trang)
  let filtered = await fetchAllFullSubmissions({
    lessonId,
    fromDate: fromDate ? vietnamDateToUTC(fromDate, false) : null,
    toDate: toDate ? vietnamDateToUTC(toDate, true) : null,
  })

  // Lọc class + search
  if (classCode) {
    filtered = filtered.filter((s) => s.profiles?.class_code === classCode)
  }
  if (search) {
    const keyword = search.toLowerCase()
    filtered = filtered.filter(
      (s) =>
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
    'listen_count',
  ]

  const rows = filtered.map((item) => [
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
    item.listen_count ?? 0,
  ])

  const bom = '\uFEFF'
  const csvContent =
    bom +
    [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n')

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="submissions_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}