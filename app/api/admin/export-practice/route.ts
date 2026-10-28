import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { escapeCsvCell } from '@/lib/admin-utils'

export async function GET() {
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

  // 1. Lấy danh sách sinh viên (role = student)
  const { data: students, error: studentsError } = await supabase
    .from('profiles')
    .select('id, full_name, msv, class_code')
    .eq('role', 'student')

  if (studentsError || !students) {
    return NextResponse.json({ error: 'Không lấy được danh sách sinh viên' }, { status: 500 })
  }

  // 2. Lấy danh sách bài học active
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, title, order_number')
    .eq('is_active', true)
    .order('order_number')

  if (lessonsError || !lessons) {
    return NextResponse.json({ error: 'Không lấy được danh sách bài học' }, { status: 500 })
  }

  // 3. Lấy TẤT CẢ practice_sessions (phân trang)
  const pageSize = 1000
  let from = 0
  let allSessions: { user_id: string; lesson_id: number; started_at: string }[] = []
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('user_id, lesson_id, started_at')
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('Lỗi lấy practice_sessions:', error)
      break
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allSessions = allSessions.concat(data)
      from += pageSize
      if (data.length < pageSize) hasMore = false
    }
  }

  // 4. Aggregate: key = `${user_id}-${lesson_id}`
  const sessionMap = new Map<string, { count: number; first: number; last: number }>()
  for (const s of allSessions) {
    const key = `${s.user_id}-${s.lesson_id}`
    const ts = new Date(s.started_at).getTime()
    const existing = sessionMap.get(key)
    if (existing) {
      existing.count++
      if (ts < existing.first) existing.first = ts
      if (ts > existing.last) existing.last = ts
    } else {
      sessionMap.set(key, { count: 1, first: ts, last: ts })
    }
  }

  // 5. Build rows: cross join students × lessons, left join aggregate
  type OutputRow = {
    user_id: string
    full_name: string
    msv: string
    class_code: string
    lesson_id: number
    lesson_title: string
    practice_count: number
    first_practice_at: string | null
    last_practice_at: string | null
  }

  const rows: OutputRow[] = []
  for (const student of students) {
    for (const lesson of lessons) {
      const key = `${student.id}-${lesson.id}`
      const agg = sessionMap.get(key)
      rows.push({
        user_id: student.id,
        full_name: student.full_name || '',
        msv: student.msv || '',
        class_code: student.class_code || '',
        lesson_id: lesson.id,
        lesson_title: lesson.title,
        practice_count: agg?.count || 0,
        first_practice_at: agg?.first ? new Date(agg.first).toISOString() : null,
        last_practice_at: agg?.last ? new Date(agg.last).toISOString() : null,
      })
    }
  }

  // Sort: class_code, full_name, lesson order
  rows.sort((a, b) => {
    if (a.class_code !== b.class_code) return a.class_code.localeCompare(b.class_code)
    if (a.full_name !== b.full_name) return a.full_name.localeCompare(b.full_name)
    return a.lesson_id - b.lesson_id
  })

  // CSV headers
  const headers = [
    'user_id',
    'full_name',
    'msv',
    'class_code',
    'lesson_id',
    'lesson_title',
    'practice_count',
    'first_practice_at',
    'last_practice_at',
  ]

  const csvRows = rows.map((item) => [
    item.user_id,
    item.full_name,
    item.msv,
    item.class_code,
    String(item.lesson_id),
    item.lesson_title,
    String(item.practice_count),
    item.first_practice_at || '',
    item.last_practice_at || '',
  ])

  const bom = '\uFEFF'
  const csvContent =
    bom +
    [
      headers.join(','),
      ...csvRows.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n')

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="practice_sessions_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}