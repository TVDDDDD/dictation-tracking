import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { escapeCsvCell } from '@/lib/admin-utils'

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

  let lessonId: number | null = null
  if (lessonParam) {
    const parsed = Number(lessonParam)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'Invalid lesson id' }, { status: 400 })
    }
    lessonId = parsed
  }

  // 1. Lấy danh sách sinh viên (role = student), lọc theo class nếu có
  let studentsQuery = supabase
    .from('profiles')
    .select('id, full_name, msv, class_code')
    .eq('role', 'student')
    .order('full_name')

  if (classCode) {
    studentsQuery = studentsQuery.eq('class_code', classCode)
  }

  const { data: students, error: studentsError } = await studentsQuery

  if (studentsError || !students) {
    return NextResponse.json({ error: 'Không lấy được danh sách sinh viên' }, { status: 500 })
  }

  if (students.length === 0) {
    return NextResponse.json({ error: 'Không có sinh viên nào' }, { status: 400 })
  }

  // 2. Lấy danh sách bài học active, lọc theo lesson_id nếu có
  let lessonsQuery = supabase
    .from('lessons')
    .select('id, title, order_number, class_codes')
    .eq('is_active', true)
    .order('order_number')

  if (lessonId) {
    lessonsQuery = lessonsQuery.eq('id', lessonId)
  }

  const { data: allLessons, error: lessonsError } = await lessonsQuery

  if (lessonsError || !allLessons) {
    return NextResponse.json({ error: 'Không lấy được danh sách bài học' }, { status: 500 })
  }

  // 3. Lấy lesson_access để xác định visibility runtime (grants thủ công qua LessonAccessPanel)
  const targetClassCodes = classCode
    ? [classCode]
    : [...new Set(students.map(s => s.class_code).filter(Boolean))]

  const { data: lessonAccessRows } = await supabase
    .from('lesson_access')
    .select('lesson_id, class_code')
    .in('class_code', targetClassCodes)

  // Build Set of lesson_ids that are granted for target classes
  const grantedLessonIds = new Set<number>()
  if (lessonAccessRows) {
    for (const row of lessonAccessRows) {
      grantedLessonIds.add(row.lesson_id)
    }
  }

  // 4. Lọc lessons theo visibility: class_codes HOẶC lesson_access
  const visibleLessons = allLessons.filter((lesson) => {
    const codes = lesson.class_codes || []
    if (codes.length === 0) return true // all classes
    // Config layer: class_codes contains target class
    const configVisible = codes.some((c: string) => targetClassCodes.includes(c))
    // Runtime layer: lesson_access grant exists
    const runtimeVisible = grantedLessonIds.has(lesson.id)
    return configVisible || runtimeVisible
  })

  if (visibleLessons.length === 0) {
    return NextResponse.json({ error: 'Không có bài học nào phù hợp' }, { status: 400 })
  }

  // 4. Lấy practice_sessions chỉ của visible lessons
  const visibleLessonIds = visibleLessons.map(l => l.id)
  const pageSize = 1000
  let from = 0
  let allSessions: { user_id: string; lesson_id: number; started_at: string }[] = []
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('practice_sessions')
      .select('user_id, lesson_id, started_at')
      .in('lesson_id', visibleLessonIds)
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

  // 5. Aggregate: key = `${user_id}-${lesson_id}`
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

  // 6. Build rows: chỉ cross join students × visibleLessons
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
    for (const lesson of visibleLessons) {
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

  const filename = `practice_sessions${classCode ? `_${classCode.replace(/\//g, '-')}` : ''}${lessonId ? `_lesson${lessonId}` : ''}_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}