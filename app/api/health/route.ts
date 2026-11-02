import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    // Quick DB connectivity test
    const { error } = await supabase.from('profiles').select('id').limit(1)

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: error ? 'error' : 'connected'
    })
  } catch {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}