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
    forcePathStyle: true, // bắt buộc với R2
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
        const mode = body.mode === 'review' ? 'review' : 'exam'

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

        if (mode === 'exam') {
            const { data: submission, error: submissionError } = await supabase
                .from('submissions')
                .select('id')
                .eq('user_id', user.id)
                .eq('lesson_id', lessonId)
                .maybeSingle()

            if (submissionError) {
                return NextResponse.json({ error: submissionError.message }, { status: 500 })
            }
            if (submission) {
                return NextResponse.json(
                    { error: 'Bạn đã nộp bài này rồi' },
                    { status: 403 }
                )
            }

            const { data: existingAttempt, error: attemptError } = await supabase
                .from('listen_attempts')
                .select('id')
                .eq('user_id', user.id)
                .eq('lesson_id', lessonId)
                .maybeSingle()

            if (attemptError) {
                return NextResponse.json({ error: attemptError.message }, { status: 500 })
            }
            if (existingAttempt) {
                return NextResponse.json(
                    { error: 'Bạn đã được cấp quyền nghe bài này rồi' },
                    { status: 403 }
                )
            }
        } else {
            const { data: submission, error: submissionError } = await supabase
                .from('submissions')
                .select('id')
                .eq('user_id', user.id)
                .eq('lesson_id', lessonId)
                .maybeSingle()

            if (submissionError) {
                return NextResponse.json({ error: submissionError.message }, { status: 500 })
            }
            if (!submission) {
                return NextResponse.json(
                    { error: 'Bạn cần nộp bài trước khi nghe lại' },
                    { status: 403 }
                )
            }
        }

        // Ký Presigned URL
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: lesson.audio_url, // object key: audio/lesson_1.mp3
        })

        const signedUrl = await getSignedUrl(s3, command, {
            expiresIn: 2 * 60 * 60, // 2 giờ
        })

        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)

        if (mode === 'exam') {
            const { error: insertError } = await supabase
                .from('listen_attempts')
                .insert({
                    user_id: user.id,
                    lesson_id: lessonId,
                    expires_at: expiresAt.toISOString(),
                })

            if (insertError) {
                if (insertError.code === '23505') {
                    return NextResponse.json(
                        { error: 'Bạn đã được cấp quyền nghe bài này rồi' },
                        { status: 403 }
                    )
                }
                return NextResponse.json({ error: insertError.message }, { status: 500 })
            }
        }

        return NextResponse.json({
            url: signedUrl,
            expiresAt: expiresAt.toISOString(),
        })
    } catch (err) {
        console.error(err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}