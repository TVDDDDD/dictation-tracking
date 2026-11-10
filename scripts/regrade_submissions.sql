-- ============================================================
-- RE-GRADE SCRIPT 2: Cập nhật score, correct_count, percentage trong submissions
-- ============================================================
-- Mục đích: Tính lại điểm tổng sau khi is_correct đã được cập nhật ở Script 1
-- Chỉ UPDATE 3 cột: correct_count, score, percentage
-- KHÔNG xóa dữ liệu, KHÔNG DDL
-- Chạy: Supabase Dashboard → SQL Editor (SAU khi Script 1 đã chạy xong)
-- Tham số: Thay YOUR_LESSON_ID bằng lesson_id thực tế (VD: 1, 2, 3...)
-- ============================================================

-- KIỂM TRA TRƯỚC KHI CHẠY: Uncomment để xem preview kết quả mới
-- WITH recalc AS (
--   SELECT
--     s.id AS submission_id,
--     COUNT(*) FILTER (WHERE sa.is_correct) AS new_correct_count,
--     COUNT(*) AS total_q,
--     ROUND((COUNT(*) FILTER (WHERE sa.is_correct)::numeric / COUNT(*)) * 10, 1) AS new_score,
--     ROUND((COUNT(*) FILTER (WHERE sa.is_correct)::numeric / COUNT(*)) * 100, 1) AS new_percentage
--   FROM submissions s
--   JOIN submission_answers sa ON sa.submission_id = s.id
--   WHERE s.lesson_id = YOUR_LESSON_ID
--   GROUP BY s.id
-- )
-- SELECT * FROM recalc ORDER BY submission_id;

WITH recalc AS (
  SELECT
    s.id AS submission_id,
    COUNT(*) FILTER (WHERE sa.is_correct) AS new_correct_count,
    COUNT(*) AS total_q,
    ROUND((COUNT(*) FILTER (WHERE sa.is_correct)::numeric / COUNT(*)) * 10, 1) AS new_score,
    ROUND((COUNT(*) FILTER (WHERE sa.is_correct)::numeric / COUNT(*)) * 100, 1) AS new_percentage
  FROM submissions s
  JOIN submission_answers sa ON sa.submission_id = s.id
  WHERE s.lesson_id = YOUR_LESSON_ID
  GROUP BY s.id
)
UPDATE submissions s
SET
  correct_count = r.new_correct_count,
  score = r.new_score,
  percentage = r.new_percentage
FROM recalc r
WHERE s.id = r.submission_id;

-- KIỂM TRA SAU KHI CHẠY: Uncomment để verify
-- SELECT id, user_id, lesson_id, correct_count, score, percentage, submitted_at
-- FROM submissions
-- WHERE lesson_id = YOUR_LESSON_ID
-- ORDER BY id;