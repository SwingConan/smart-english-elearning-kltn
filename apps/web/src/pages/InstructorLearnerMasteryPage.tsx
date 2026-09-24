import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { instructorLearnerMasteryApi } from '@/features/adaptive/api';
import {
  adaptivePercentage,
  adaptiveTimestamp,
  instructorPolicySourceLabel,
  masteryBandLabel,
} from '@/features/adaptive/display';
import type {
  InstructorLearnerMasteryResponse,
  InstructorLearnerMasterySkillState,
} from '@/features/adaptive/types';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { ApiError } from '@/lib/api-client';

type PageState =
  & { courseId: string | undefined }
  & (
    | { status: 'loading' }
    | { status: 'success'; data: InstructorLearnerMasteryResponse }
    | { status: 'forbidden' | 'not-found' | 'error' }
  );

export function InstructorLearnerMasteryPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();
  const [page, setPage] = useState<PageState>({ status: 'loading', courseId });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    if (!courseId) {
      return () => controller.abort();
    }

    void instructorLearnerMasteryApi
      .get(courseId, controller.signal)
      .then((data) => {
        if (active) setPage({ status: 'success', data, courseId });
      })
      .catch(async (error: unknown) => {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return;
        if (await redirectExpiredSession(error)) return;
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setPage({ status: 'forbidden', courseId });
        } else if (error instanceof ApiError && error.status === 404) {
          setPage({ status: 'not-found', courseId });
        } else {
          setPage({ status: 'error', courseId });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [courseId, redirectExpiredSession]);

  const visiblePage: PageState = !courseId
    ? { status: 'not-found', courseId }
    : page.courseId === courseId
      ? page
      : { status: 'loading', courseId };

  return (
    <section className="space-y-6">
      <header>
        <Link className="text-sm font-medium text-blue-700 hover:underline" to="/instructor/teaching">
          &larr; Khóa học đang giảng dạy
        </Link>
        <h1 className="mt-3 text-3xl font-bold">Learner Mastery</h1>
        <p className="mt-2 text-slate-600">Mức độ làm chủ hiện tại theo từng lượt ghi danh và Skill.</p>
      </header>

      {visiblePage.status === 'loading' ? <p role="status">Đang tải Learner Mastery...</p> : null}
      {visiblePage.status === 'forbidden' ? (
        <ErrorNotice>Bạn không có quyền xem Learner Mastery của khóa học này.</ErrorNotice>
      ) : null}
      {visiblePage.status === 'not-found' ? (
        <ErrorNotice>Khóa học không khả dụng hoặc bạn chưa được phân công giảng dạy.</ErrorNotice>
      ) : null}
      {visiblePage.status === 'error' ? (
        <ErrorNotice>Không thể tải Learner Mastery. Vui lòng thử lại.</ErrorNotice>
      ) : null}
      {visiblePage.status === 'success' ? <MasteryContent data={visiblePage.data} /> : null}
    </section>
  );
}

function MasteryContent({ data }: { data: InstructorLearnerMasteryResponse }) {
  return (
    <>
      <section aria-labelledby="policy-heading" className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold" id="policy-heading">Chính sách phân loại</h2>
        <p className="mt-1 text-sm text-slate-600">{instructorPolicySourceLabel(data.policy.source)}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Cần học lại nền tảng" value={`Dưới ${adaptivePercentage(data.policy.remedialThreshold)}`} />
          <Detail label="Sẵn sàng tiến tiếp" value={`Từ ${adaptivePercentage(data.policy.progressionThreshold)}`} />
        </dl>
      </section>

      <section aria-labelledby="skill-legend-heading" className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold" id="skill-legend-heading">Danh mục Skill</h2>
        {data.skills.length === 0 ? (
          <p className="mt-3 text-slate-600">Khóa học chưa được cấu hình Skill.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.skills.map((skill) => (
              <li className="rounded bg-slate-100 px-3 py-2 text-sm" key={skill.skillId}>
                <strong>{skill.code}</strong> — {skill.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="matrix-heading" className="space-y-3">
        <h2 className="text-xl font-semibold" id="matrix-heading">Ma trận Learner Mastery</h2>
        {data.learners.length === 0 ? (
          <p className="rounded-xl border bg-white p-6 text-slate-600">Chưa có học viên đang hoạt động.</p>
        ) : data.skills.length === 0 ? (
          <LearnersWithoutSkills learners={data.learners} />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm" tabIndex={0}>
            <table className="min-w-max border-collapse text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3" scope="col">Học viên</th>
                  <th className="px-4 py-3" scope="col">ClassOffering</th>
                  {data.skills.map((skill) => (
                    <th className="min-w-64 max-w-64 px-4 py-3" key={skill.skillId} scope="col">
                      <span className="block break-words font-semibold">{skill.code}</span>
                      <span className="block break-words font-normal text-slate-600">{skill.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.learners.map((learner) => (
                  <tr data-testid="learner-row" key={learner.enrollmentId}>
                    <th className="max-w-64 break-words px-4 py-4 align-top font-semibold" scope="row">{learner.learnerName}</th>
                    <td className="max-w-64 break-words px-4 py-4 align-top">{learner.classOffering.name}</td>
                    {data.skills.map((skill) => (
                      <td className="px-4 py-4 align-top" key={skill.skillId}>
                        <SkillStateCell state={learner.skillStates.find((item) => item.skillId === skill.skillId)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SkillStateCell({ state }: { state: InstructorLearnerMasterySkillState | undefined }) {
  if (!state) return <span className="text-slate-500">Không có dữ liệu</span>;
  if (state.state !== 'PRIOR' && state.state !== 'OBSERVED') {
    return (
      <div className="space-y-1 text-slate-600">
        <p className="font-semibold">Trạng thái mastery không xác định</p>
        <p>{masteryBandLabel(state.masteryBand)}</p>
        <p>{state.observationCount} quan sát</p>
        <p>Lần quan sát cuối: {adaptiveTimestamp(state.lastObservedAt)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {state.state === 'PRIOR' ? (
        <>
          <p className="font-semibold text-slate-700">Chưa đánh giá</p>
          <p>Prior / baseline: {adaptivePercentage(state.masteryProbability)}</p>
        </>
      ) : (
        <>
          <p className="font-semibold">{adaptivePercentage(state.masteryProbability)}</p>
          <p>{masteryBandLabel(state.masteryBand)}</p>
        </>
      )}
      <p>{state.observationCount} quan sát</p>
      <p>Lần quan sát cuối: {adaptiveTimestamp(state.lastObservedAt)}</p>
    </div>
  );
}

function LearnersWithoutSkills({ learners }: { learners: InstructorLearnerMasteryResponse['learners'] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-slate-600">Chưa có Skill để hiển thị mastery; danh sách lượt ghi danh vẫn được giữ nguyên.</p>
      <ul className="mt-3 space-y-2">
        {learners.map((learner) => (
          <li data-testid="learner-row" key={learner.enrollmentId}>
            <strong>{learner.learnerName}</strong> — {learner.classOffering.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-slate-700">{label}</dt><dd>{value}</dd></div>;
}

function ErrorNotice({ children }: { children: string }) {
  return <p className="rounded-md bg-red-50 p-4 text-red-700" role="alert">{children}</p>;
}
