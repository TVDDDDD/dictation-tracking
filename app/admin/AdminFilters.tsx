"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Lesson = {
  id: number;
  title: string;
  order_number: number;
};

type Props = {
  classList: string[];
  lessons: Lesson[];
  currentParams: { [key: string]: string | undefined };
};

export default function AdminFilters({
  classList,
  lessons,
  currentParams,
}: Props) {
  const router = useRouter();
  const [classCode, setClassCode] = useState(currentParams.class || "");
  const [lesson, setLesson] = useState(currentParams.lesson || "");
  const [search, setSearch] = useState(currentParams.search || "");
  const [fromDate, setFromDate] = useState(currentParams.from || "");
  const [toDate, setToDate] = useState(currentParams.to || "");

  const applyFilter = () => {
    const params = new URLSearchParams();
    if (classCode) params.set("class", classCode);
    if (lesson) params.set("lesson", lesson);
    if (search.trim()) params.set("search", search.trim());
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    router.push(`/admin?${params.toString()}`);
  };

  const clearFilter = () => {
    setClassCode("");
    setLesson("");
    setSearch("");
    setFromDate("");
    setToDate("");
    router.push("/admin");
  };

  return (
    <div className="filter-panel">
      <div className="filter-grid">
        <div>
          <label className="field-label">Lớp</label>
          <select
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            className="field-control"
          >
            <option value="">Tất cả lớp</option>
            {classList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Bài nghe</label>
          <select
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            className="field-control"
          >
            <option value="">Tất cả bài</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                Bài {l.order_number} - {l.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">MSV / Tên</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập MSV hoặc tên..."
            className="field-control"
          />
        </div>

        <div>
          <label className="field-label">Từ ngày</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="field-control"
          />
        </div>

        <div>
          <label className="field-label">Đến ngày</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="field-control"
          />
        </div>
      </div>

      <div className="filter-actions">
        <button onClick={applyFilter} className="button button-primary">
          Áp dụng lọc
        </button>
        <button onClick={clearFilter} className="button button-secondary">
          Xóa bộ lọc
        </button>
      </div>
    </div>
  );
}
