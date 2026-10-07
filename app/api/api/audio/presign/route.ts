import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
})

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const lessonId = Number(body.lessonId)

        if (!lessonId || Number.isNaN(lessonId)) {
            return NextResponse.json({ error: 'Invalid lessonId' }, { status: 400 })
        }

        // Lấy thông tin bài
        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select('id, audio_url, is_active')
            .eq('id', lessonId)
            .single()

        if (lessonError || !lesson || !lesson.is_active) {
            return NextResponse.json({ error: 'Lesson not found or inactive' }, { status: 404 })
        }

        if (!lesson.audio_url) {
            return NextResponse.json({ error: 'Audio not configured' }, { status: 400 })
        }

        // Kiểm tra đã được cấp quyền nghe chưa
        const { data: existing } = await supabase
            .from('listen_attempts')
            .select('id, granted_at')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonId)
            .maybeSingle()

        if (existing) {
            return NextResponse.json(
                { error: 'Bạn đã được cấp quyền nghe bài này rồi' },
                { status: 403 }
            )
        }

        // Ghi nhận lượt cấp quyền
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 giờ

        const { error: insertError } = await supabase
            .from('listen_attempts')
            .insert({
                user_id: user.id,
                lesson_id: lessonId,
                expires_at: expiresAt.toISOString(),
            })

        if (insertError) {
            // Nếu bị unique constraint → đã cấp rồi
            if (insertError.code === '23505') {
                return NextResponse.json(
                    { error: 'Bạn đã được cấp quyền nghe bài này rồi' },
                    { status: 403 }
                )
            }
            return NextResponse.json({ error: insertError.message }, { status: 500 })
        }

        // Ký Presigned URL
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: lesson.audio_url, // object key: audio/lesson_1.mp3
        })

        const signedUrl = await getSignedUrl(s3, command, {
            expiresIn: 2 * 60 * 60, // 2 giờ
        })

        return NextResponse.json({
            url: signedUrl,
            expiresAt: expiresAt.toISOString(),
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}