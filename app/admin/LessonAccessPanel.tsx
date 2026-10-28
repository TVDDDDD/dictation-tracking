"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { toggleLessonAccess, grantMakeup } from "./actions";

type Lesson = {
  id: number;
  title: string;
  order_number: number;
};

type AccessRow = {
  lesson_id: number;
  class_code: string;
  granted_by: string;
  granted_at: string;
  profiles: { full_name: string | null }[] | null;
};

type Student = {
  id: string;
  full_name: string | null;
  msv: string | null;
  class_code: string | null;
};

type GrantRow = {
  user_id: string;
  lesson_id: number;
  granted_by: string;
  granted_at: string;
};

type Props = {
  lessons: Lesson[];
  classList: string[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN");
}

const PAGE_SIZE = 10;

export default function LessonAccessPanel({ lessons, classList }: Props) {
  const supabase = createClient();

  const [access, setAccess] = useState<AccessRow[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Dropdown state
  const [selectedClass, setSelectedClass] = useState<string>(() => classList[0] || "");
  const [currentPage, setCurrentPage] = useState(1);

  const lessonIds = lessons.map((l) => l.id).join(",");

  // Nạp ma trận lesson_access (audit: tên admin + thời điểm)
  useEffect(() => {
    const loadAccess = async () => {
      if (lessons.length === 0) {
        setAccess([]);
        return;
      }
      const { data } = await supabase
        .from("lesson_access")
        .select("lesson_id, class_code, granted_by, granted_at, profiles ( full_name )")
        .in(
          "lesson_id",
          lessons.map((l) => l.id),
        );
      setAccess((data as AccessRow[]) || []);
    };
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, supabase, lessonIds]);

  // Filter lessons for selected class
  const filteredLessons = useMemo(() => {
    return lessons.filter(() => true); // Show all lessons, just with open/closed status
  }, [lessons]);

  // Pagination
  const totalPages = Math.ceil(filteredLessons.length / PAGE_SIZE);
  const paginatedLessons = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLessons.slice(start, start + PAGE_SIZE);
  }, [filteredLessons, currentPage]);

  // Reset page when class changes
  useEffect(() => {
    setTimeout(() => setCurrentPage(1), 0);
  }, [selectedClass]);

  const handleToggle = async (
    lesson: Lesson,
    classCode: string,
    currentlyOpen: boolean,
  ) => {
    const key = `${lesson.id}:${classCode}`;
    setBusy(key);
    setMsg(null);
    const res = await toggleLessonAccess(lesson.id, classCode, !currentlyOpen);
    setBusy(null);
    setMsg({
      ok: res.success,
      text: res.success
        ? `Bài ${lesson.order_number} — lớp ${classCode}: ${res.message}`
        : res.message,
    });
    setRefresh((n) => n + 1);
  };

  // Bulk open/close all
  const handleBulkToggle = async (open: boolean) => {
    if (!selectedClass) return;
    const key = `bulk:${selectedClass}:${open ? 'open' : 'close'}`;
    setBusy(key);
    setMsg(null);
    try {
      for (const lesson of lessons) {
        const res = await toggleLessonAccess(lesson.id, selectedClass, open);
        if (!res.success) {
          throw new Error(res.message);
        }
      }
      setMsg({ ok: true, text: `Đã ${open ? 'mở' : 'đóng'} tất cả bài cho lớp ${selectedClass}` });
      setRefresh((n) => n + 1);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Có lỗi xảy ra' });
    }
    setBusy(null);
  };

  // ---- Makeup ----
  const [keyword, setKeyword] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [grantLesson, setGrantLesson] = useState<number>(lessons[0]?.id ?? 0);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [reloadGrants, setReloadGrants] = useState(0);

  const searchStudents = async (k: string) => {
    if (!k.trim()) {
      setStudents([]);
      return;
    }
    const kw = k.trim().toLowerCase();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, msv, class_code")
      .eq("role", "student")
      .or(`full_name.ilike.%${kw}%,msv.ilike.%${kw}%`)
      .limit(20);
    setStudents((data as Student[]) || []);
  };

  const studentIds = students.map((s) => s.id).join(",");

  useEffect(() => {
    const loadGrants = async () => {
      if (students.length === 0) {
        setGrants([]);
        setSubCounts({});
        return;
      }
      const ids = students.map((s) => s.id);
      const [grantsRes, subsRes] = await Promise.all([
        supabase
          .from("makeup_grants")
          .select("user_id, lesson_id, granted_by, granted_at")
          .in("user_id", ids),
        supabase
          .from("submissions")
          .select("user_id")
          .in("user_id", ids)
          .eq("lesson_id", grantLesson),
      ]);
      setGrants((grantsRes.data as GrantRow[]) || []);
      const counts: Record<string, number> = {};
      for (const row of subsRes.data || []) {
        counts[row.user_id] = (counts[row.user_id] || 0) + 1;
      }
      setSubCounts(counts);
    };
    loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentIds, grantLesson, reloadGrants, supabase]);

  const grantStatusOf = (userId: string, lessonId: number) => {
    const grant = grants.find(
      (g) => g.user_id === userId && g.lesson_id === lessonId,
    );
    if (!grant) return null;
    const used = (subCounts[userId] ?? 0) >= 2;
    return { grant, used };
  };

  const handleGrant = async (student: Student) => {
    setBusy(`grant:${student.id}`);
    setMsg(null);
    const res = await grantMakeup(student.id, grantLesson);
    setBusy(null);
    setMsg({ ok: res.success, text: res.message });
    if (res.success) {
      setReloadGrants((n) => n + 1);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-6">
      {/* ===== Dropdown chọn lớp + bảng bài của lớp đó ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Mở/đóng bài theo lớp</h2>
        <p className="text-sm text-gray-500 mb-3">
          Chọn lớp → bảng dưới hiển thị các bài của lớp đó. Bật/tắt từng bài.
        </p>

        {classList.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa có sinh viên có mã lớp.</p>
        ) : (
          <div className="space-y-4">
            {/* Dropdown chọn lớp */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="class-select" className="text-sm font-medium text-gray-700">
                  Chọn lớp:
                </label>
                <select
                  id="class-select"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="field-control"
                  style={{ width: 220 }}
                  disabled={classList.length === 0}
                >
                  {classList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bulk actions */}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleBulkToggle(true)}
                  disabled={busy?.startsWith('bulk:') || lessons.length === 0}
                  className="button button-secondary button-small"
                  title="Mở tất cả bài cho lớp này"
                >
                  Mở tất cả
                </button>
                <button
                  onClick={() => handleBulkToggle(false)}
                  disabled={busy?.startsWith('bulk:') || lessons.length === 0}
                  className="button button-secondary button-small"
                  title="Đóng tất cả bài cho lớp này"
                >
                  Đóng tất cả
                </button>
              </div>
            </div>

            {/* Bảng bài của lớp được chọn */}
            {lessons.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có bài học nào.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-left">
                      <tr>
                        <th className="px-4 py-3">Bài</th>
                        <th className="px-4 py-3 text-center w-32">Trạng thái</th>
                        <th className="px-4 py-3 text-center w-40">Admin mở</th>
                        <th className="px-4 py-3 text-center w-40">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLessons.map((lesson) => {
                        const cell = access.find(
                          (a) =>
                            a.lesson_id === lesson.id &&
                            a.class_code === selectedClass,
                        );
                        const open = Boolean(cell);
                        const key = `${lesson.id}:${selectedClass}`;

                        return (
                          <tr key={lesson.id} className="border-t">
                            <td className="px-4 py-3 font-medium">
                              Bài {lesson.order_number} — {lesson.title}
                            </td>
                            <td className="px-4 py-3 text-center align-top">
                              <button
                                onClick={() =>
                                  handleToggle(lesson, selectedClass, open)
                                }
                                disabled={busy === key}
                                aria-pressed={open}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                                  open
                                    ? "bg-green-600 text-white hover:bg-green-700"
                                    : "border border-gray-300 bg-white text-gray-500 hover:bg-gray-100"
                                } disabled:opacity-50`}
                              >
                                {open ? "✓ Mở" : "Đóng"}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center align-top">
                              {cell ? (
                                <span className="text-xs text-gray-600">
                                  {cell.profiles?.[0]?.full_name || "Admin"}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center align-top">
                              {cell ? (
                                <span className="text-xs text-gray-400">{fmtDate(cell.granted_at)}</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t">
                    <p className="text-sm text-gray-500">
                      Trang {currentPage} / {totalPages} · Tổng {filteredLessons.length} bài
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1 || Boolean(busy)}
                        className="button button-secondary button-small"
                      >
                        ← Trước
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || Boolean(busy)}
                        className="button button-secondary button-small"
                      >
                        Sau →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== Cấp quyền làm lại (makeup) ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Cấp làm lại (makeup)</h2>
        <p className="text-sm text-gray-500 mb-3">
          Tìm sinh viên → chọn bài → cấp quyền. Bài nộp cũ được giữ nguyên;
          sinh viên làm submission mới (lượt 2). Mỗi sinh viên mỗi bài tối đa
          1 lần makeup.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              searchStudents(e.target.value);
            }}
            placeholder="Tìm theo MSV hoặc tên..."
            className="field-control"
            style={{ width: 260 }}
          />
          <select
            value={grantLesson}
            onChange={(e) => setGrantLesson(Number(e.target.value))}
            className="field-control"
          >
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                Bài {l.order_number} - {l.title}
              </option>
            ))}
          </select>
        </div>

        {students.length > 0 && (
          <div className="space-y-2">
            {students.map((student) => {
              const status = grantStatusOf(student.id, grantLesson);
              return (
                <div
                  key={student.id}
                  className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-md border"
                >
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-sm">
                      {student.full_name || "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {student.msv || "—"} · Lớp {student.class_code || "—"}
                    </p>
                  </div>

                  <span className="text-xs text-gray-500 w-40">
                    {status
                      ? status.used
                        ? "Grant: đã dùng"
                        : "Grant: chưa dùng"
                      : "Chưa có grant"}
                  </span>

                  <button
                    onClick={() => handleGrant(student)}
                    disabled={busy === `grant:${student.id}` || status !== null}
                    className="button button-secondary button-small"
                  >
                    {status ? "Đã cấp" : "Cấp làm lại"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {msg && (
          <p
            className={`mt-3 text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}
            role="status"
          >
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}