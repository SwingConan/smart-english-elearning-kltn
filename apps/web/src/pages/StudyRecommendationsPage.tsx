import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, Clock3, History, Target } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { studentAssessmentApi } from '@/features/assessments/api';
import { studentAssessmentErrorMessage } from '@/features/assessments/errors';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { studyRecommendationApi } from '@/features/recommendations/api';
import {
  formatDate,
  formatPercent,
  skillLabel,
  stageLabel,
  taskCodeLabel,
} from '@/features/recommendations/display';
import type {
  StudyRecommendationItem,
  StudyRecommendationResponse,
} from '@/features/recommendations/types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: StudyRecommendationResponse };

export function StudyRecommendationsPage() {
  const { enrollmentId = '' } = useParams();
  const navigate = useNavigate();
  const redirectExpiredSession = useSessionExpiry();
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [startingTestId, setStartingTestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void studyRecommendationApi
      .get(enrollmentId, controller.signal)
      .then((data) => setLoadState({ status: 'ready', data }))
      .catch(async (error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (await redirectExpiredSession(error)) return;
        setLoadState({ status: 'error' });
      });
    return () => controller.abort();
  }, [enrollmentId, redirectExpiredSession, reloadKey]);

  const startPractice = useCallback(
    async (testId: string) => {
      setStartingTestId(testId);
      setActionError(null);
      try {
        const attempt = await studentAssessmentApi.startOrResume(enrollmentId, testId);
        navigate(`/student/enrollments/${enrollmentId}/attempts/${attempt.id}`);
      } catch (error: unknown) {
        if (await redirectExpiredSession(error)) return;
        setActionError(
          studentAssessmentErrorMessage(error, 'Không thể mở bài luyện lúc này. Vui lòng thử lại.'),
        );
      } finally {
        setStartingTestId(null);
      }
    },
    [enrollmentId, navigate, redirectExpiredSession],
  );

  if (loadState.status === 'loading') return <RecommendationSkeleton />;
  if (loadState.status === 'error') {
    return (
      <section className="state-error" role="alert">
        <h1 className="text-xl font-bold">Không thể tải gợi ý tự học</h1>
        <p className="mt-2">Vui lòng kiểm tra kết nối và thử lại.</p>
        <button
          className="btn-secondary mt-4"
          onClick={() => {
            setLoadState({ status: 'loading' });
            setReloadKey((key) => key + 1);
          }}
          type="button"
        >
          Thử lại
        </button>
      </section>
    );
  }

  const { data } = loadState;
  const base = `/student/enrollments/${enrollmentId}`;
  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 to-indigo-950 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-indigo-200">
          Lộ trình cá nhân hóa theo kết quả trong lớp
        </p>
        <h1 className="mt-2 text-3xl font-bold">Gợi ý tự học</h1>
        <p className="mt-3 max-w-3xl leading-7 text-indigo-100">
          Các bước dưới đây được chọn theo quy tắc xác định từ kết quả đã chấm cuối cùng. Gợi ý
          không thay đổi chương trình học trên lớp.
        </p>
        {data.source ? (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Nguồn: {data.source.testTitle}</p>
              <p className="mt-1 text-indigo-100">
                {data.source.stage ? stageLabel[data.source.stage] : 'Bài kiểm tra trong lớp'} ·{' '}
                {formatDate(data.source.submittedAt)}
              </p>
            </div>
            <Link
              className="rounded-lg border border-white/40 px-3 py-2 font-semibold hover:bg-white/10"
              to={data.source.resultPath}
            >
              Xem kết quả nguồn
            </Link>
          </div>
        ) : null}
      </header>

      {data.pendingNewerAttempt ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="font-semibold">Có kết quả mới hơn đang chờ hoàn tất chấm</p>
          <p className="mt-1 text-sm leading-6">
            {data.pendingNewerAttempt.title} còn chờ:{' '}
            {data.pendingNewerAttempt.pendingSkills.map((skill) => skillLabel[skill]).join(', ') ||
              'một số kỹ năng'}
            . Gợi ý hiện tại vẫn dùng kết quả cuối cùng gần nhất; điểm đang chờ không được tính là
            0.
          </p>
          <Link
            className="mt-3 inline-block text-sm font-semibold underline"
            to={data.pendingNewerAttempt.resultPath}
          >
            Xem trạng thái chấm
          </Link>
        </section>
      ) : null}

      {data.state === 'READY' ? (
        <ReadyContent
          actionError={actionError}
          data={data}
          onStartPractice={startPractice}
          startingTestId={startingTestId}
        />
      ) : (
        <EmptyState enrollmentBase={base} state={data.state} />
      )}

      <RecommendationHistory history={data.history} />
    </div>
  );
}

function ReadyContent({
  actionError,
  data,
  onStartPractice,
  startingTestId,
}: {
  actionError: string | null;
  data: StudyRecommendationResponse;
  onStartPractice: (testId: string) => Promise<void>;
  startingTestId: string | null;
}) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 size={20} />
            <h2 className="font-bold">Điểm mạnh hiện tại</h2>
          </div>
          {data.strengths.length ? (
            <ul className="mt-4 space-y-3">
              {data.strengths.map((item) => (
                <li
                  className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3"
                  key={item.skill}
                >
                  <span className="font-semibold">{skillLabel[item.skill]}</span>
                  <span>{formatPercent(item.normalizedScore)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Chưa có kỹ năng vượt ngưỡng mạnh trong kết quả nguồn.
            </p>
          )}
        </article>
        <article className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700">
            <Target size={20} />
            <h2 className="font-bold">Trọng tâm ưu tiên</h2>
          </div>
          {data.focus ? (
            <div className="mt-4">
              <p className="text-2xl font-bold">
                {skillLabel[data.focus.skill]} · {formatPercent(data.focus.normalizedScore)}
              </p>
              {taskCodeLabel(data.focus.taskCode) ? (
                <p className="mt-2 text-sm text-slate-600">
                  {taskCodeLabel(data.focus.taskCode)}
                  {data.focus.taskNormalizedScore !== undefined
                    ? ` · ${formatPercent(data.focus.taskNormalizedScore)}`
                    : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              Không có trọng tâm yếu cần ưu tiên trong kết quả này.
            </p>
          )}
        </article>
      </section>

      <section aria-labelledby="recommendation-list-heading">
        <h2 className="text-2xl font-bold" id="recommendation-list-heading">
          Việc nên làm tiếp theo
        </h2>
        <div className="mt-4 space-y-4">
          {data.recommendations.map((item) => (
            <RecommendationCard
              item={item}
              key={item.id}
              onStartPractice={onStartPractice}
              starting={startingTestId === item.practice?.testId}
            />
          ))}
        </div>
        {actionError ? (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      {data.schedule7Days.length ? (
        <details className="rounded-2xl border bg-white p-5 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold">
            <CalendarDays className="text-indigo-700" size={20} />
            Kế hoạch 7 ngày
          </summary>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.schedule7Days.map((entry) => {
              const practice = data.recommendations.find(
                (item) => item.practice?.startPath === entry.path,
              )?.practice;
              const lessonPath = data.recommendations.some(
                (item) => item.lesson.path === entry.path,
              );
              return (
                <li
                  className="rounded-xl bg-slate-50 p-4"
                  key={`${entry.day}-${entry.path ?? entry.title}`}
                >
                  <p className="text-xs font-bold uppercase text-indigo-700">Ngày {entry.day}</p>
                  {practice ? (
                    <button
                      className="mt-1 text-left font-semibold hover:text-indigo-700 disabled:opacity-60"
                      disabled={startingTestId === practice.testId}
                      onClick={() => void onStartPractice(practice.testId)}
                      type="button"
                    >
                      {entry.title}
                    </button>
                  ) : lessonPath && entry.path ? (
                    <Link
                      className="mt-1 block font-semibold hover:text-indigo-700"
                      to={entry.path}
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <p className="mt-1 font-semibold">{entry.title}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}
    </>
  );
}

function RecommendationCard({
  item,
  onStartPractice,
  starting,
}: {
  item: StudyRecommendationItem;
  onStartPractice: (testId: string) => Promise<void>;
  starting: boolean;
}) {
  const task = taskCodeLabel(item.reason?.taskEvidence?.taskCode);
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
            Ưu tiên {item.priority} · {skillLabel[item.skill]}
          </p>
          <h3 className="mt-2 text-xl font-bold">{item.title}</h3>
          <p className="mt-2 text-slate-600">{item.actionText}</p>
        </div>
        {item.lesson.estimatedMinutes ? (
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
            <Clock3 size={15} />
            {item.lesson.estimatedMinutes} phút
          </span>
        ) : null}
      </div>
      <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm text-indigo-700">{item.lesson.moduleTitle}</p>
        <p className="mt-1 font-semibold text-indigo-950">{item.lesson.title}</p>
        {task ? <p className="mt-1 text-sm text-indigo-800">{task}</p> : null}
      </div>
      <details className="mt-4 rounded-xl bg-slate-50 p-4">
        <summary className="cursor-pointer font-semibold">Vì sao có gợi ý này?</summary>
        <ReasonText item={item} />
      </details>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="btn-primary" to={item.lesson.path}>
          <BookOpen size={17} />
          Mở bài học
        </Link>
        {item.practice ? (
          <button
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={starting}
            onClick={() => void onStartPractice(item.practice!.testId)}
            type="button"
          >
            {starting ? 'Đang mở bài luyện...' : 'Làm bài luyện sau bài học'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ReasonText({ item }: { item: StudyRecommendationItem }) {
  const reason = item.reason;
  if (!reason)
    return (
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Chi tiết quy tắc của gợi ý này không còn khả dụng. Bài học vẫn được giữ theo lịch sử đã tạo.
      </p>
    );
  if (reason.taskEvidence)
    return (
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Ở {taskCodeLabel(reason.taskEvidence.taskCode)}, bạn đạt {reason.taskEvidence.awardedPoints}
        /{reason.taskEvidence.maxPoints} điểm ({formatPercent(reason.taskEvidence.normalizedScore)}
        ). Kết quả này nằm trong vùng cần ưu tiên theo chính sách {reason.policy.code} tại thời điểm
        tạo gợi ý.
      </p>
    );
  const basis =
    reason.selection.basis === 'MAINTENANCE'
      ? 'duy trì kỹ năng hiện có'
      : 'củng cố kỹ năng cần ưu tiên';
  return (
    <p className="mt-3 text-sm leading-6 text-slate-600">
      Kết quả {skillLabel[reason.skillEvidence.skill]} là{' '}
      {formatPercent(reason.skillEvidence.normalizedScore)}. Bài học được chọn để {basis}, theo
      chính sách {reason.policy.code} tại thời điểm tạo gợi ý.
    </p>
  );
}

function EmptyState({
  enrollmentBase,
  state,
}: {
  enrollmentBase: string;
  state: StudyRecommendationResponse['state'];
}) {
  const copy = {
    NO_ELIGIBLE_RESULT: {
      title: 'Chưa có kết quả đủ điều kiện',
      body: 'Hoàn thành một bài kiểm tra trong lớp để hệ thống có căn cứ tạo gợi ý tự học.',
      link: `${enrollmentBase}/tests`,
      action: 'Xem bài kiểm tra',
    },
    PENDING_REVIEW: {
      title: 'Kết quả đang chờ hoàn tất chấm',
      body: 'Một hoặc nhiều kỹ năng vẫn đang chờ giảng viên đánh giá. Hệ thống không xem điểm đang thiếu là 0.',
      link: `${enrollmentBase}/results`,
      action: 'Xem kết quả',
    },
    NO_MATCHING_CONTENT: {
      title: 'Chưa có nội dung phù hợp',
      body: 'Kết quả nguồn đã được ghi nhận nhưng chưa có bài học phù hợp với quy tắc hiện tại. Các gợi ý cũ vẫn được giữ trong lịch sử.',
      link: `${enrollmentBase}/learn`,
      action: 'Xem nội dung học',
    },
    READY: { title: '', body: '', link: enrollmentBase, action: '' },
  }[state];
  return (
    <section className="rounded-2xl border bg-white p-8 text-center shadow-sm">
      <Target className="mx-auto text-indigo-600" size={34} />
      <h2 className="mt-4 text-xl font-bold">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-xl leading-7 text-slate-600">{copy.body}</p>
      <Link className="btn-primary mt-5" to={copy.link}>
        {copy.action}
      </Link>
    </section>
  );
}

function RecommendationHistory({ history }: { history: StudyRecommendationResponse['history'] }) {
  if (!history.length) return null;
  return (
    <section aria-labelledby="history-heading">
      <div className="flex items-center gap-2">
        <History className="text-slate-600" size={21} />
        <h2 className="text-xl font-bold" id="history-heading">
          Lịch sử gợi ý
        </h2>
      </div>
      <div className="mt-4 space-y-3">
        {history.map((entry) => (
          <details
            className="rounded-2xl border bg-white p-5"
            key={entry.sourceAttemptId}
            open={entry.current}
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{entry.sourceTitle}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDate(entry.sourceSubmittedAt)} · {entry.itemCount} gợi ý
                    {entry.mainFocus ? ` · Trọng tâm ${skillLabel[entry.mainFocus]}` : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${entry.current ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  {entry.current ? 'Hiện tại' : 'Trước đây'}
                </span>
              </div>
            </summary>
            <div className="mt-4 border-t pt-4">
              <Link
                className="text-sm font-semibold text-indigo-700 underline"
                to={entry.sourceResultPath}
              >
                Xem kết quả nguồn
              </Link>
              <ol className="mt-3 space-y-2">
                {entry.recommendations.map((item) => (
                  <li className="rounded-lg bg-slate-50 p-3 text-sm" key={item.id}>
                    <span className="font-semibold">
                      {item.priority}. {item.lesson.title}
                    </span>
                    <span className="text-slate-500"> · {skillLabel[item.skill]}</span>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function RecommendationSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Đang tải gợi ý tự học">
      <div className="h-56 animate-pulse rounded-3xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-36 animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}
