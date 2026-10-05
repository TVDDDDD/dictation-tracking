import { createClient } from '@/lib/supabase/server'

export type FullSubmission = {
  id: string
  user_id: string
  lesson_id: number
  score: number | null
  correct_count: number | null
  total_questions: number | null
  percentage: number | null
  listen_count: number | null
  submitted_at: string
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

type FetchOptions = {
  lessonId?: number | null
  fromDate?: string | null
  toDate?: string | null
}

/**
 * Lấy TẤT CẢ submissions (có join) bằng phân trang
 */
export async function fetchAllFullSubmissions(
  options: FetchOptions = {}
): Promise<FullSubmission[]> {
  const supabase = await createClient()
  const pageSize = 1000
  let from = 0
  let allData: FullSubmission[] = []
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('submissions')
      .select(`
        id,
        user_id,
        lesson_id,
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
      .range(from, from + pageSize - 1)

    if (options.lessonId) {
      query = query.eq('lesson_id', options.lessonId)
    }
    if (options.fromDate) {
      query = query.gte('submitted_at', options.fromDate)
    }
    if (options.toDate) {
      query = query.lte('submitted_at', options.toDate)
    }

    const { data, error } = await query

    if (error) {
      console.error('Lỗi khi lấy submissions:', error.message)
      break
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allData = allData.concat(data as unknown as FullSubmission[])
      from += pageSize

      if (data.length < pageSize) {
        hasMore = false
      }
    }
  }

  return allData
}