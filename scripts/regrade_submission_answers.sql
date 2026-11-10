-- ============================================================
-- RE-GRADE SCRIPT 1: Cập nhật is_correct trong submission_answers
-- ============================================================
-- Mục đích: Chấm lại bài đã nộp theo logic mới (correct_answer có thể chứa | variant)
-- Chỉ UPDATE cột is_correct, KHÔNG xóa dữ liệu, KHÔNG DDL
-- Chạy: Supabase Dashboard → SQL Editor
-- Tham số: Thay YOUR_LESSON_ID bằng lesson_id thực tế (VD: 1, 2, 3...)
-- ============================================================

-- KIỂM TRA TRƯỚC KHI CHẠY: Uncomment dòng dưới để xem số row sẽ bị ảnh hưởng
-- SELECT COUNT(*) FROM submission_answers sa
-- JOIN submissions s ON sa.submission_id = s.id
-- WHERE s.lesson_id = YOUR_LESSON_ID;

WITH new_grading AS (
  SELECT
    sa.id AS submission_answer_id,
    sa.user_answer,
    q.correct_answer,
    (
      sa.user_answer IS NOT NULL
      AND lower(trim(sa.user_answer)) = ANY(
        regexp_split_to_array(lower(q.correct_answer), '\s*\|\s*')
      )
    ) AS new_is_correct
  FROM submission_answers sa
  JOIN submissions s ON sa.submission_id = s.id
  JOIN questions q ON sa.question_id = q.id
  WHERE s.lesson_id = YOUR_LESSON_ID
)
UPDATE submission_answers sa
SET is_correct = ng.new_is_correct
FROM new_grading ng
WHERE sa.id = ng.submission_answer_id;

-- KIỂM TRA SAU KHI CHẠY: Uncomment để verify
-- SELECT sa.id, sa.user_answer, q.correct_answer, sa.is_correct
-- FROM submission_answers sa
-- JOIN submissions s ON sa.submission_id = s.id
-- JOIN questions q ON sa.question_id = q.id
-- WHERE s.lesson_id = YOUR_LESSON_ID
-- ORDER BY sa.id;