import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json()
    const filename = body.filename || 'audio.mp3'

    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const ext = filename.split('.').pop()?.toLowerCase() || 'mp3'
    const key = `audio/lesson_${timestamp}_${random}.${ext}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    })

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: 'audio/mpeg',
    })

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 })

    return NextResponse.json({ success: true, url: signedUrl, key })
  } catch (e) {
    console.error('Presigned PUT error:', e)
    return NextResponse.json(
      { success: false, error: 'Không tạo được presigned PUT' },
      { status: 500 }
    )
  }
}