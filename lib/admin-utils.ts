export type SubmissionRow = {
  id: string
  score: number | null
  correct_count: number | null
  total_questions: number | null
  percentage: number | null
  listen_count: number | null
  submitted_at: string
  lesson_id: number
  user_id: string
  lessons: {
    title: string
    order_number: number
  } | null
  profiles: {
    full_name: string | null
    msv: string | null
    class_code: string | null
  } | null
}

/** Chuyển ngày YYYY-MM-DD theo giờ Việt Nam sang UTC ISO */
export function vietnamDateToUTC(dateStr: string, endOfDay = false): string {
  const [year, month, day] = dateStr.split('-').map(Number)

  if (!year || !month || !day) {
    throw new Error('Invalid date format')
  }

  // Giờ Việt Nam = UTC+7
  if (endOfDay) {
    // 23:59:59.999 giờ VN = 16:59:59.999 UTC
    return new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999)).toISOString()
  }

  // 00:00:00 giờ VN = 17:00:00 ngày hôm trước (UTC)
  return new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0, 0)).toISOString()
}

/** Kiểm tra định dạng ngày YYYY-MM-DD */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00')
  return !isNaN(d.getTime())
}

/** Escape ô CSV + chống formula injection */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let str = String(value ?? '')

  // Chống formula injection (kể cả có khoảng trắng/tab phía trước)
  const trimmed = str.trimStart()
  if (/^[=+\-@\t]/.test(trimmed)) {
    str = "'" + str
  }

  // Escape dấu phẩy, xuống dòng, dấu nháy
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`
  }

  return str
}