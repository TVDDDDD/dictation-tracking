"use client";

import { useEffect, useState } from "react";
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

export default function LessonAccessPanel({ lessons, classList }: Props) {
  const supabase = createClient();

  const [access, setAccess] = useState<AccessRow[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      {/* ===== Ma trận mở bài theo lớp ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Mở/đóng bài theo lớp</h2>
        <p className="text-sm text-gray-500 mb-3">
          Bật ô để mở bài cho lớp đó; tắt để đóng. Bài chưa mở sẽ hiện
          trạng thái &quot;Chưa mở&quot; trên dashboard sinh viên.
        </p>

        {lessons.length === 0 || classList.length === 0 ? (
          <p className="text-sm text-gray-500">
            Chưa có bài đang mở hoặc chưa có sinh viên có mã lớp.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="px-4 py-3">Bài</th>
                  {classList.map((c) => (
                    <th key={c} className="px-4 py-3 text-center">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      Bài {lesson.order_number} — {lesson.title}
                    </td>
                    {classList.map((classCode) => {
                      const cell = access.find(
                        (a) =>
                          a.lesson_id === lesson.id &&
                          a.class_code === classCode,
                      );
                      const open = Boolean(cell);
                      const key = `${lesson.id}:${classCode}`;

                      return (
                        <td
                          key={classCode}
                          className="px-4 py-3 text-center align-top"
                        >
                          <button
                            onClick={() =>
                              handleToggle(lesson, classCode, open)
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
                          {cell && (
                            <p className="mt-1 text-[11px] text-gray-400">
                              {cell.profiles?.[0]?.full_name || "Admin"} ·{" "}
                              {fmtDate(cell.granted_at)}
                            </p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
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
