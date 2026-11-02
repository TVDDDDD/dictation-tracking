import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      // signup & invite: user đã có session -> vào dashboard sau loading
      // recovery (reset password): cần set password mới -> qua /reset-password
      const next = (type === 'signup' || type === 'invite') ? '/dashboard' : '/reset-password'
      return NextResponse.redirect(`${origin}/auth/verify-loading?next=${encodeURIComponent(next)}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}