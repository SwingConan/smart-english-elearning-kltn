import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { adaptivePathApi } from '@/features/adaptive/api';
import {
  adaptivePercentage,
  adaptiveReasonText,
  categoryLabel,
  masteryBandLabel,
  prerequisiteStatusLabel,
} from '@/features/adaptive/display';
import type {
  AdaptiveBlockedLesson,
  AdaptiveLessonCategory,
  AdaptivePathLesson,
  AdaptiveSkillClassification,
  StudentAdaptivePath,
} from '@/features/adaptive/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: StudentAdaptivePath };

export function StudentAdaptivePathPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [state, setState] = useState<PageState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadPath() {
      setState({ status: 'loading' });
      if (!enrollmentId) {
        setState({ status: 'error', message: 'Không thể xác định lớp học.' });
        return;
      }

      try {
        const data = await adaptivePathApi.get(enrollmentId, controller.signal);
        setState({ status: 'success', data });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setState({ status: 'error', message: pathErrorMessage(error) });
      }
    }

    void loadPath();
    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession]);

  return (
    <section className="space-y-6">
      <header>
        <Link
          className="text-sm font-medium text-blue-700 hover:underline"
          to={enrollmentId ? `/student/enrollments/${enrollmentId}/learn` : '/student/enrollments'}
        >
          &larr; Quay lại khóa học
        </Link>
        <h1 className="mt-3 text-3xl font-bold">Personalized Learning Path</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Lộ trình ưu tiên hiện tại dựa trên BKT-based learner model và cấu hình Skill/KC của khóa
          học.
        </p>
      </header>

      {state.status === 'loading' ? (
        <p role="status">Đang tải lộ trình học cá nhân hóa...</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' ? <AdaptivePathContent data={state.data} /> : null}
    </section>
  );
}

function AdaptivePathContent({ data }: { data: StudentAdaptivePath }) {
  return (
    <div className="space-y-6">
      <PolicyContext data={data} />
      <ConfigurationNotice data={data} />

      <section aria-labelledby="skill-overview-heading">
        <h2 className="text-xl font-semibold" id="skill-overview-heading">
          Tổng quan Skill/KC
        </h2>
        {data.skillClassifications.length === 0 ? (
          <p className="mt-3 rounded border bg-white p-5 text-slate-600">
            Chưa có Skill/KC để hiển thị trong lộ trình.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {data.skillClassifications.map((skill) => (
              <SkillSummary key={skill.skillId} skill={skill} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="actionable-path-heading">
        <h2 className="text-xl font-semibold" id="actionable-path-heading">
          Bài học được ưu tiên
        </h2>
        {data.configurationStatus === 'NO_MAPPED_LESSONS' ? (
          <p className="mt-3 rounded border border-dashed p-5 text-slate-600">
            Chưa thể tạo adaptive recommendation vì chưa có Lesson nào được liên kết với Skill/KC.
          </p>
        ) : data.path.length === 0 ? (
          <p className="mt-3 rounded border bg-white p-5 text-slate-600">
            Hiện không có bài học nào cần ưu tiên theo trạng thái mastery hiện tại.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {data.path.map((lesson) => (
              <li key={lesson.lessonId}>
                <PathLessonCard lesson={lesson} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.blockedLessons.length > 0 ? (
        <section aria-labelledby="blocked-lessons-heading">
          <h2 className="text-xl font-semibold" id="blocked-lessons-heading">
            Bài học chưa được ưu tiên
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Các bài học này vẫn thuộc khóa học nhưng chưa được ưu tiên trong lộ trình hiện tại.
          </p>
          <div className="mt-3 space-y-4">
            {data.blockedLessons.map((lesson) => (
              <BlockedLessonCard key={lesson.lessonId} lesson={lesson} />
            ))}
          </div>
        </section>
      ) : null}

      {data.unmappedLessons.length > 0 ? (
        <section aria-labelledby="unmapped-lessons-heading">
          <h2 className="text-xl font-semibold" id="unmapped-lessons-heading">
            Bài học chưa liên kết Skill/KC
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Các bài học này thuộc khóa học nhưng chưa được liên kết với Skill/KC, nên adaptive
            engine chưa dùng chúng để tạo đề xuất cá nhân hóa.
          </p>
          <ul className="mt-3 space-y-3">
            {data.unmappedLessons.map((lesson) => (
              <li className="rounded-lg border bg-white p-4" key={lesson.lessonId}>
                <p className="text-sm text-slate-500">{lesson.moduleTitle}</p>
                <p className="font-medium">{lesson.title}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PolicyContext({ data }: { data: StudentAdaptivePath }) {
  const { policy } = data;
  return (
    <section
      aria-labelledby="policy-context-heading"
      className="rounded-xl border bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" id="policy-context-heading">
          Ngữ cảnh policy
        </h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
          {policy.source === 'DEFAULT' ? 'Using default policy' : 'Course-specific policy'}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <PolicyBand
          label="Ôn lại nền tảng"
          value={`< ${adaptivePercentage(policy.remedialThreshold)}`}
        />
        <PolicyBand
          label="Củng cố"
          value={`${adaptivePercentage(policy.remedialThreshold)} – < ${adaptivePercentage(policy.progressionThreshold)}`}
        />
        <PolicyBand
          label="Sẵn sàng tiến tiếp"
          value={`≥ ${adaptivePercentage(policy.progressionThreshold)}`}
        />
      </dl>
    </section>
  );
}

function PolicyBand({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 p-3">
      <dt className="font-medium text-slate-700">{label}</dt>
      <dd className="mt-1 text-slate-600">{value}</dd>
    </div>
  );
}

function ConfigurationNotice({ data }: { data: StudentAdaptivePath }) {
  if (data.configurationStatus === 'READY') return null;
  return (
    <p className="rounded-md bg-amber-50 p-4 text-amber-800" role="status">
      {data.configurationStatus === 'PARTIALLY_MAPPED'
        ? 'Một số nội dung khóa học chưa được liên kết với Skill/KC, nên lộ trình cá nhân hóa hiện chỉ bao phủ một phần.'
        : 'Khóa học chưa có liên kết Lesson → Skill/KC, nên chưa thể tạo adaptive recommendation.'}
    </p>
  );
}

function SkillSummary({ skill }: { skill: AdaptiveSkillClassification }) {
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {skill.code}
          </p>
          <h3 className="font-semibold">{skill.name}</h3>
        </div>
        <strong className="text-xl">{adaptivePercentage(skill.masteryProbability)}</strong>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <SkillDetail
          label="Nguồn mastery"
          value={skill.state === 'PRIOR' ? 'PRIOR — Chưa có quan sát đánh giá' : 'OBSERVED'}
        />
        <SkillDetail
          label="Mastery band"
          value={`${skill.masteryBand} — ${masteryBandLabel(skill.masteryBand)}`}
        />
        <SkillDetail
          label="Prerequisite"
          value={`${skill.prerequisiteStatus} — ${prerequisiteStatusLabel(skill.prerequisiteStatus)}`}
        />
      </dl>
      {skill.unsatisfiedPrerequisites.length > 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          Chưa đạt: {skill.unsatisfiedPrerequisites.map(({ name }) => name).join(', ')}
        </p>
      ) : null}
    </article>
  );
}

function SkillDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-slate-700">{label}</dt>
      <dd className="text-slate-600">{value}</dd>
    </div>
  );
}

function PathLessonCard({ lesson }: { lesson: AdaptivePathLesson }) {
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{lesson.moduleTitle}</p>
          <h3 className="text-lg font-semibold">{lesson.title}</h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle(lesson.category)}`}
        >
          {lesson.category} — {categoryLabel(lesson.category)}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-700">{adaptiveReasonText(lesson.reason)}</p>
      <p className="mt-2 text-sm text-slate-600">
        Focus Skill: {lesson.reason.focusSkillCode} — {lesson.reason.focusSkillName}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Mastery hiện tại: {adaptivePercentage(lesson.reason.masteryProbability)}
      </p>
      {lesson.isCompleted && lesson.isReview ? (
        <p className="mt-3 rounded bg-blue-50 p-3 text-sm font-medium text-blue-800">
          Đã học — đề xuất ôn lại
        </p>
      ) : null}
    </article>
  );
}

function BlockedLessonCard({ lesson }: { lesson: AdaptiveBlockedLesson }) {
  return (
    <article className="rounded-xl border border-amber-200 bg-white p-5">
      <p className="text-sm text-slate-500">{lesson.moduleTitle}</p>
      <h3 className="font-semibold">{lesson.title}</h3>
      <p className="mt-2 text-sm text-slate-700">{adaptiveReasonText(lesson.reason)}</p>
      {lesson.reason.unsatisfiedPrerequisites.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">
          {lesson.reason.unsatisfiedPrerequisites.map((prerequisite) => (
            <li key={prerequisite.skillId}>
              {prerequisite.code} — {prerequisite.name} (
              {adaptivePercentage(prerequisite.masteryProbability)})
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function categoryStyle(category: AdaptiveLessonCategory): string {
  switch (category) {
    case 'REMEDIAL':
      return 'bg-red-50 text-red-800';
    case 'REINFORCEMENT':
      return 'bg-amber-50 text-amber-800';
    case 'PROGRESSION':
      return 'bg-green-50 text-green-800';
  }
}

function pathErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Không tìm thấy lộ trình hoặc lớp học không còn khả dụng.';
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'Bạn không có quyền xem lộ trình học này.';
  }
  return 'Không thể tải Personalized Learning Path. Vui lòng thử lại.';
}
