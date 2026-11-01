"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";

type StudentProgress = {
	id: string;
	full_name: string | null;
	msv: string | null;
	class_code: string | null;
	total_lessons: number;
	completed: number;
	completion_rate: number;
	avg_score: number | null;
	details: {
		lesson_id: number;
		lesson_title: string;
		order_number: number;
		score: number | null;
		correct_count: number | null;
		total_questions: number | null;
		submitted_at: string | null;
		status: "done" | "missing";
	}[];
};

export function ProgressPageClient({
	progressList: initialProgressList,
	classCodes,
	studentCountByClass,
	profile,
	totalLessonsGlobal,
}: {
	progressList: StudentProgress[];
	classCodes: string[];
	studentCountByClass: Map<string, number>;
	profile: { full_name: string | null };
	totalLessonsGlobal: number;
}) {
	const [selectedClass, setSelectedClass] = useState<string>("all");
	const [searchMsv, setSearchMsv] = useState("");

	const filteredProgress = useMemo(() => {
		return initialProgressList.filter((student) => {
			const classMatch = selectedClass === "all" || student.class_code === selectedClass;
			const msvMatch = !searchMsv || student.msv?.toLowerCase().includes(searchMsv.toLowerCase());
			return classMatch && msvMatch;
		});
	}, [initialProgressList, selectedClass, searchMsv]);

	const selectedClassCount = selectedClass === "all"
		? initialProgressList.length
		: (studentCountByClass.get(selectedClass) || 0);

	return (
		<div className="app-page">
			<header className="topbar">
				<div className="topbar-inner">
					<div className="flex items-center gap-4">
						<Link href="/admin" className="button button-subtle">
							← Quay lại Admin
						</Link>
						<BrandLogo
							href="/admin"
							kicker="TEACHER SPACE"
							name="Tiến độ sinh viên"
						/>
					</div>
					<span className="user-chip">
						Admin: <strong>{profile.full_name}</strong>
					</span>
				</div>
			</header>

			<main className="content-wrap">
				<div className="page-intro">
					<div>
						<span className="eyebrow">Tổng quan học tập</span>
						<h1 className="page-title">Tiến độ sinh viên</h1>
						<p className="page-description">
							Theo dõi mức độ hoàn thành và kết quả của từng học viên qua các
							bài đang giao.
						</p>
					</div>
					<span className="hero-meta">{totalLessonsGlobal} bài đang giao (tổng)</span>
				</div>

				{/* Filter Bar */}
				<div className="filter-bar mb-6 p-4 bg-white rounded-lg shadow flex flex-wrap items-center gap-4">
					<div className="flex items-center gap-2">
						<label className="text-sm font-medium text-gray-700">Lớp:</label>
						<select
							value={selectedClass}
							onChange={(e) => setSelectedClass(e.target.value)}
							className="field-control w-auto min-w-[200px]"
						>
							<option value="all">Tất cả lớp</option>
							{classCodes.map((code) => (
								<option key={code} value={code}>{code}</option>
							))}
						</select>
					</div>

					<div className="flex items-center gap-2">
						<label className="text-sm font-medium text-gray-700">Mã SV:</label>
						<input
							type="text"
							value={searchMsv}
							onChange={(e) => setSearchMsv(e.target.value)}
							placeholder="Nhập mã sinh viên..."
							className="field-control w-auto min-w-[180px]"
						/>
					</div>

					<div className="filter-count ml-auto text-sm text-gray-600">
						<span className="font-medium">Số Sinh Viên: {selectedClassCount}</span>
						{selectedClass !== "all" && (
							<span className="ml-2 text-gray-400">(Lớp {selectedClass})</span>
						)}
					</div>
				</div>

				<div className="progress-list">
					{filteredProgress.map((student) => (
						<article key={student.id} className="progress-student">
							{/* Thông tin sinh viên */}
							<div className="progress-student-head">
								<div>
									<h2 className="progress-student-name">
										{student.full_name || "—"}
									</h2>
									<p className="progress-student-meta">
										MSV: {student.msv || "—"} • Lớp: {student.class_code || "—"}
									</p>
								</div>

								<div className="progress-metrics">
									<div className="progress-metric">
										<p className="progress-metric-label">Hoàn thành</p>
										<p className="progress-metric-value">
											{student.completed}/{student.total_lessons}
										</p>
									</div>
									<div className="progress-metric">
										<p className="progress-metric-label">Tỷ lệ</p>
										<p className="progress-metric-value">
											{student.completion_rate.toFixed(0)}%
										</p>
									</div>
									<div className="progress-metric">
										<p className="progress-metric-label">Điểm TB</p>
										<p className="progress-metric-value">
											{student.avg_score != null
												? student.avg_score.toFixed(1)
												: "—"}
										</p>
									</div>
								</div>
							</div>

							{/* Chi tiết từng bài */}
							<div className="progress-lesson-grid">
								{student.details.map((d) => (
									<div
										key={d.lesson_id}
										className={`progress-lesson ${d.status === "done" ? "is-done" : ""}`}
									>
										<p className="progress-lesson-name" title={d.lesson_title}>
											Bài {d.order_number}
										</p>
										{d.status === "done" ? (
											<p className="progress-lesson-result">{d.score}/10</p>
										) : (
											<p className="progress-lesson-missing">Chưa làm</p>
										)}
									</div>
								))}
							</div>
						</article>
					))}

					{filteredProgress.length === 0 && (
						<div className="empty-state">
							<h3>Không có sinh viên phù hợp</h3>
							<p>Thử thay đổi bộ lọc hoặc kiểm tra dữ liệu.</p>
						</div>
					)}
				</div>

				{initialProgressList.length === 0 && filteredProgress.length === 0 && (
					<div className="empty-state">
						<h3>Chưa có sinh viên nào</h3>
						<p>Danh sách học viên sẽ hiển thị ở đây sau khi đăng ký.</p>
					</div>
				)}
			</main>
		</div>
	);
}