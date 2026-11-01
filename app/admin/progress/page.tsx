import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchAllFullSubmissions } from "@/lib/fetch-all-submissions";
import { ProgressPageClient } from "./ProgressClient";

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

type LessonInfo = {
	id: number;
	title: string;
	order_number: number;
	class_codes: string[];
};

export default async function ProgressPage() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/login");

	const { data: profile } = await supabase
		.from("profiles")
		.select("role, full_name")
		.eq("id", user.id)
		.single();

	if (!profile || profile.role !== "admin") {
		redirect("/dashboard");
	}

	// Fetch all data
	const [lessonsResult, studentsResult, submissions, lessonAccessResult] = await Promise.all([
		supabase
			.from("lessons")
			.select("id, title, order_number, class_codes")
			.eq("is_active", true)
			.order("order_number"),
		supabase
			.from("profiles")
			.select("id, full_name, msv, class_code")
			.eq("role", "student")
			.order("class_code")
			.order("full_name"),
		fetchAllFullSubmissions(),
		supabase
			.from("lesson_access")
			.select("lesson_id, class_code"),
	]);

	const lessons: LessonInfo[] = (lessonsResult.data || []).map(l => ({
		...l,
		class_codes: l.class_codes || [],
	}));
	const students = studentsResult.data || [];
	const lessonAccessGrants = new Set<string>(
		(lessonAccessResult.data || []).map(g => `${g.lesson_id}:${g.class_code}`)
	);

	// Submissions map
	const submissionsByUserAndLesson = new Map<string, (typeof submissions)[number]>();
	for (const submission of submissions) {
		submissionsByUserAndLesson.set(
			`${submission.user_id}:${submission.lesson_id}`,
			submission,
		);
	}

	// Unique class codes from students (for filter dropdown)
	const classCodes = Array.from(
		new Set(students.map(s => s.class_code).filter(Boolean))
	).sort();

	// Student count per class
	const studentCountByClass = new Map<string, number>();
	for (const student of students) {
		if (student.class_code) {
			studentCountByClass.set(student.class_code, (studentCountByClass.get(student.class_code) || 0) + 1);
		}
	}

	// Compute progress per student (filtered by their class)
	const progressList: StudentProgress[] = students.map((student) => {
		// Filter lessons visible to this student's class
		const visibleLessons = lessons.filter((lesson) => {
			if (!student.class_code) return false;
			// Visible if: class_codes empty (all classes) OR contains student's class OR manual grant
			return (
				lesson.class_codes.length === 0 ||
				lesson.class_codes.includes(student.class_code) ||
				lessonAccessGrants.has(`${lesson.id}:${student.class_code}`)
			);
		});

		const details = visibleLessons.map((lesson) => {
			const sub = submissionsByUserAndLesson.get(`${student.id}:${lesson.id}`);
			return {
				lesson_id: lesson.id,
				lesson_title: lesson.title,
				order_number: lesson.order_number,
				score: sub?.score ?? null,
				correct_count: sub?.correct_count ?? null,
				total_questions: sub?.total_questions ?? null,
				submitted_at: sub?.submitted_at ?? null,
				status: sub ? ("done" as const) : ("missing" as const),
			};
		});

		const totalLessons = visibleLessons.length;
		const completed = details.filter((d) => d.status === "done").length;
		const scores = details
			.filter((d) => d.score != null)
			.map((d) => Number(d.score));

		const avgScore =
			scores.length > 0
				? scores.reduce((a, b) => a + b, 0) / scores.length
				: null;

		return {
			id: student.id,
			full_name: student.full_name,
			msv: student.msv,
			class_code: student.class_code,
			total_lessons: totalLessons,
			completed,
			completion_rate: totalLessons > 0 ? (completed / totalLessons) * 100 : 0,
			avg_score: avgScore,
			details,
		};
	});

	return <ProgressPageClient
		progressList={progressList}
		classCodes={classCodes}
		studentCountByClass={studentCountByClass}
		profile={profile}
		totalLessonsGlobal={lessons.length}
	/>;
}