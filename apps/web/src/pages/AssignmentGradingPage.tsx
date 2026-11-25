import { KnowledgeRecommendations } from '@/pages/KnowledgeLibraryPage';
import { QuizGradebook } from '@/pages/ClassQuizPage';
import { classCodeLabel } from '@/features/demo/presentation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { button, field } from '@/features/class-lms/api';
import {
  gradingApi,
  gradingPath,
  gradingState,
  type AssignmentRubric,
  type Grade,
  type SubmittedWork,
  type GradingQueue,
  type CheckerInbox,
  type Gradebook,
} from '@/features/class-lms/grading-api';
import { lmsLocalApi, type UnifiedClassResults } from '@/features/class-lms/lms-local-api';
import { UnifiedGradebookPanel } from '@/features/class-lms/UnifiedGradebookPanel';
import { schoolTimestamp } from '@/features/class-lms/school-time';
const failure =
  'Không thể hoàn tất thao tác lúc này. Nội dung bạn đã nhập vẫn được giữ nguyên. Vui lòng kiểm tra lại kết nối và thử lại.';
function useWrites(reload: () => void) {
  const keys = useRef(new Map<string, string>()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function write(path: string, body: object, method = 'POST') {
    setBusy(true);
    setError('');
    setNotice('');
    const signature = method + path + JSON.stringify(body);
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    try {
      await apiFetch(path, {
        method,
        body: JSON.stringify({ ...body, idempotencyKey: keys.current.get(signature) }),
      });
      setNotice('Đã ghi nhận trên hệ thống.');
      reload();
      return true;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, write };
}
function WorkShell({ academic = false, children }: { academic?: boolean; children: ReactNode }) {
  return (
    <main className="section-shell grid min-w-0 gap-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <nav
          aria-label={academic ? 'Học vụ chấm bài' : 'Không gian chấm bài'}
          className="flex flex-wrap gap-2 text-sm font-semibold text-slate-700 lg:flex-col"
        >
          <Link className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900" to="/my/calendar">
            Lịch tháng
          </Link>
          <Link className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900" to="/workspace">
            Tổng quan
          </Link>
          {!academic && (
            <Link
              className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900"
              to="/instructor/teaching"
            >
              Lớp đang dạy
            </Link>
          )}
          {academic && (
            <>
              <Link className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900" to="/academic">
                Chương trình và lớp
              </Link>
              <Link
                className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900"
                to="/academic/grading"
              >
                Duyệt rubric và điểm
              </Link>
              <Link
                className="rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:text-slate-900"
                to="/academic/approvals"
              >
                Duyệt lịch học
              </Link>
            </>
          )}
        </nav>
      </aside>
      <div className="min-w-0 space-y-5">{children}</div>
    </main>
  );
}
function Messages({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4">
          {notice}
        </p>
      )}
    </>
  );
}
function RubricDetails({ rubric }: { rubric: AssignmentRubric }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-bold">
        {rubric.name} · Rubric v{rubric.version}
      </h3>
      <p>
        {rubric.state === 'PUBLISHED'
          ? 'Rubric đã được học vụ phát hành'
          : 'Rubric nháp · Chưa dùng để chấm điểm'}
      </p>
      <p className="whitespace-pre-wrap">{rubric.description}</p>
      <ol className="space-y-2">
        {rubric.criteria.map((c) => (
          <li key={c.id} className="rounded-lg bg-slate-50 p-3">
            <strong>
              {c.name} · tối đa {c.maxScore}
            </strong>
            <p className="whitespace-pre-wrap">{c.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function PublishedGradeDetails({ grade }: { grade: Grade }) {
  return (
    <div className="space-y-3">
      <p className="text-xl font-bold">
        {grade.earned === null ? 'Chưa có điểm hoàn chỉnh' : `${grade.earned} / ${grade.max}`}
        {grade.percent !== null && ` · ${grade.percent}%`}
      </p>
      <p className="text-sm">Điểm đánh giá theo rubric nội bộ của bài học.</p>
      <p>
        Rubric v{grade.rubric.version} · {grade.rubric.name}
      </p>
      <ul className="space-y-2">
        {grade.rubric.criteria.map((c) => {
          const s = grade.scores.find((x) => x.criterionId === c.id);
          return (
            <li key={c.id} className="rounded-lg border p-3">
              <strong>
                {c.name}: {s ? s.score : 'Chưa chấm'} / {c.maxScore}
              </strong>
              <p>{c.description}</p>
              {s?.feedback && <p className="whitespace-pre-wrap">{s.feedback}</p>}
            </li>
          );
        })}
      </ul>
      <p className="whitespace-pre-wrap">{grade.feedback}</p>
      {grade.publishedAt && <p>Công bố: {schoolTimestamp(grade.publishedAt)}</p>}
      {grade.reason && <p className="whitespace-pre-wrap">Lý do sửa: {grade.reason}</p>}
    </div>
  );
}
type Write = (p: string, b: object, method?: string) => Promise<boolean>;
function RubricForm({
  c,
  a,
  rubrics,
  busy,
  write,
}: {
  c: string;
  a: string;
  rubrics: AssignmentRubric[];
  busy: boolean;
  write: Write;
}) {
  const draft = rubrics.find((r) => r.state === 'DRAFT'),
    previous = rubrics[0]?.version ?? 0;
  const [name, setName] = useState(draft?.name ?? ''),
    [description, setDescription] = useState(draft?.description ?? ''),
    [criteria, setCriteria] = useState(
      draft?.criteria.map((x) => ({
        name: x.name,
        description: x.description,
        maxScore: x.maxScore,
      })) ?? [{ name: '', description: '', maxScore: '' }],
    );
  function change(i: number, k: 'name' | 'description' | 'maxScore', v: string) {
    setCriteria((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  }
  return (
    <form
      aria-label="Soạn rubric"
      className="space-y-4 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void write(
          gradingPath(c, a, 'rubrics' + (draft ? '/' + draft.id : '')),
          {
            name,
            description,
            criteria,
            expectedPreviousVersion: previous,
            ...(draft ? { expectedLockVersion: draft.lockVersion } : {}),
          },
          draft ? 'PUT' : 'POST',
        );
      }}
    >
      <h2 className="text-xl font-bold">
        {draft ? 'Sửa rubric nháp' : 'Soạn phiên bản rubric mới'}
      </h2>
      <p>Giảng viên biên soạn; phòng Học vụ phê duyệt và ban hành. Tiêu chí đã ban hành không thể chỉnh sửa.</p>
      <label className="block">
        Tên rubric
        <input
          className={field}
          required
          maxLength={250}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block">
        Mô tả rubric
        <textarea
          className={field}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {criteria.map((x, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Tiêu chí {i + 1}</h3>
            <button
              className={button + ' text-xs text-rose-700 hover:bg-rose-50'}
              type="button"
              disabled={busy || criteria.length === 1}
              onClick={() => setCriteria((xs) => xs.filter((_, j) => j !== i))}
            >
              Bỏ tiêu chí {i + 1}
            </button>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Tên tiêu chí {i + 1}
            <input
              className={field}
              required
              maxLength={250}
              value={x.name}
              onChange={(e) => change(i, 'name', e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Điểm tối đa {i + 1}
            <input
              className={field}
              required
              type="number"
              min="0.01"
              max="999999.99"
              step="0.01"
              value={x.maxScore}
              onChange={(e) => change(i, 'maxScore', e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Mô tả mức đạt {i + 1}
            <textarea
              className={field}
              required
              maxLength={5000}
              value={x.description}
              onChange={(e) => change(i, 'description', e.target.value)}
            />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          className={button}
          type="button"
          disabled={busy || criteria.length >= 50}
          onClick={() => setCriteria((xs) => [...xs, { name: '', description: '', maxScore: '' }])}
        >
          Thêm tiêu chí
        </button>
        <button className={button} disabled={busy}>
          Lưu rubric nháp
        </button>
      </div>
    </form>
  );
}
function GradeForm({
  c,
  a,
  work,
  rubrics,
  busy,
  write,
  correction = false,
}: {
  c: string;
  a: string;
  work: SubmittedWork;
  rubrics: AssignmentRubric[];
  busy: boolean;
  write: Write;
  correction?: boolean;
}) {
  const old = work.grades[0],
    draft = old?.state === 'DRAFT' ? old : undefined,
    published = rubrics.filter((r) => r.state === 'PUBLISHED'),
    [rubricId, setRubricId] = useState(
      draft?.rubric.id ?? old?.rubric.id ?? published[0]?.id ?? '',
    ),
    [scores, setScores] = useState<Record<string, { score: string; feedback: string }>>(
      Object.fromEntries(
        (draft ?? (correction ? old : undefined))?.scores.map((s) => [
          s.criterionId,
          { score: s.score, feedback: s.feedback },
        ]) ?? [],
      ),
    ),
    [feedback, setFeedback] = useState(
      draft?.feedback ?? (correction ? (old?.feedback ?? '') : ''),
    ),
    [reason, setReason] = useState(draft?.reason ?? ''),
    [dirty, setDirty] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const rubric = draft?.rubric ?? published.find((r) => r.id === rubricId),
    complete = rubric?.criteria.every((x) => scores[x.id]?.score.trim());
  function change(id: string, k: 'score' | 'feedback', v: string) {
    setDirty(true);
    setReviewed(false);
    setScores((xs) => ({
      ...xs,
      [id]: { score: xs[id]?.score ?? '', feedback: xs[id]?.feedback ?? '', [k]: v },
    }));
  }
  if (!rubric)
    return (
      <p className="rounded-xl bg-amber-50 p-4">
        Chưa có rubric được học vụ phát hành. Chưa thể chấm hoặc xác nhận FINAL.
      </p>
    );
  return (
    <form
      aria-label="Chấm bài theo rubric"
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void write(
          gradingPath(c, a, 'submissions/' + work.id + '/grades' + (draft ? '/' + draft.id : '')),
          {
            rubricId,
            expectedPreviousVersion: old?.number ?? 0,
            reason,
            feedback,
            scores: rubric.criteria
              .filter((x) => scores[x.id]?.score.trim())
              .map((x) => ({ criterionId: x.id, ...scores[x.id] })),
            ...(draft ? { expectedLockVersion: draft.lockVersion } : {}),
          },
          draft ? 'PUT' : 'POST',
        );
      }}
    >
      <h3 className="font-bold">
        {draft ? 'Bản chấm nháp' : correction ? 'Sửa điểm bằng phiên bản mới' : 'Chấm bài mới'}
      </h3>
      <label className="block">
        Rubric dùng chấm
        <select
          className={field}
          value={rubricId}
          disabled={!!draft || busy}
          onChange={(e) => {
            setRubricId(e.target.value);
            setScores({});
            setDirty(true);
          }}
        >
          {published.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · v{r.version}
            </option>
          ))}
        </select>
      </label>
      {rubric.criteria.map((x) => (
        <div key={x.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-sm font-bold text-slate-900">
            {x.name} · tối đa {x.maxScore}
          </p>
          <p className="text-xs text-slate-600">{x.description}</p>
          <label className="block text-sm font-semibold text-slate-700">
            Điểm {x.name}
            <input
              className={field}
              type="number"
              min="0"
              max={x.maxScore}
              step="0.01"
              value={scores[x.id]?.score ?? ''}
              onChange={(e) => change(x.id, 'score', e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Nhận xét {x.name}
            <textarea
              className={field}
              maxLength={5000}
              value={scores[x.id]?.feedback ?? ''}
              onChange={(e) => change(x.id, 'feedback', e.target.value)}
            />
          </label>
        </div>
      ))}
      <label className="block">
        Nhận xét chung
        <textarea
          className={field}
          maxLength={10000}
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            setDirty(true);
            setReviewed(false);
          }}
        />
      </label>
      {(correction || (draft && draft.number > 1)) && (
        <label className="block">
          Lý do sửa điểm
          <textarea
            className={field}
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setDirty(true);
              setReviewed(false);
            }}
          />
        </label>
      )}
      <button className={button} disabled={busy}>
        Lưu bản chấm nháp
      </button>
      {draft && (
        <div className="space-y-3 border-t pt-4">
          <p>
            Bản nháp trên server:{' '}
            {draft.earned === null ? 'Chưa chấm đủ tiêu chí' : draft.earned + ' / ' + draft.max}.
            Học viên chưa thấy điểm.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Tôi đã đối chiếu bài nộp gốc và rubric; xác nhận bản chấm đã lưu.
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || dirty || !complete || !reviewed}
            onClick={() =>
              void write(gradingPath(c, a, 'grades/' + draft.id + '/final'), {
                expectedLockVersion: draft.lockVersion,
              })
            }
          >
            Xác nhận REVIEWED_FINAL
          </button>
          {dirty && <p>Vui lòng lưu thay đổi trước khi xác nhận điểm cuối.</p>}
        </div>
      )}
    </form>
  );
}
function WorkCard({
  c,
  a,
  work,
  rubrics,
  busy,
  write,
}: {
  c: string;
  a: string;
  work: SubmittedWork;
  rubrics: AssignmentRubric[];
  busy: boolean;
  write: Write;
}) {
  const [correction, setCorrection] = useState(false),
    latest = work.grades[0];
  return (
    <article className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-6">
      <h2 className="text-xl font-bold">{work.learnerName}</h2>
      <p className="break-all text-sm">
        Mã bài nộp: {work.id} · {schoolTimestamp(work.submittedAt)}
      </p>
      <details open>
        <summary className="font-semibold">
          Đề gốc v{work.source.version}: {work.source.title}
        </summary>
        <SafeMarkdown markdown={work.source.contentMarkdown} />
      </details>
      <p className="whitespace-pre-wrap break-words">{work.text}</p>
      {work.file && (
        <a
          className={button}
          href={apiUrl(
            '/v2/class-lms/classes/' +
              c +
              '/activities/' +
              a +
              '/assignment/submissions/' +
              work.id +
              '/file',
          )}
        >
          Tải bài gốc: {work.file.name}
        </a>
      )}
      {latest && (
        <div className="space-y-3 rounded-xl bg-indigo-50 p-4">
          <p className="font-bold">
            {gradingState[latest.state]} · bản điểm {latest.number}
          </p>
          <PublishedGradeDetails grade={latest} />
        </div>
      )}
      {(!latest || latest.state === 'DRAFT' || correction) && (
        <GradeForm
          key={(latest?.id ?? 'new') + ':' + (latest?.lockVersion ?? 0) + ':' + correction}
          c={c}
          a={a}
          work={work}
          rubrics={rubrics}
          busy={busy}
          write={write}
          correction={correction}
        />
      )}
      {latest?.state === 'PUBLISHED' && !correction && (
        <button className={button} onClick={() => setCorrection(true)}>
          Sửa điểm bằng phiên bản mới
        </button>
      )}
      {work.grades.length > 1 && (
        <details>
          <summary>Lịch sử bản điểm</summary>
          {work.grades.slice(1).map((g) => (
            <div key={g.id} className="my-3 rounded-xl border p-4">
              <p>
                Bản {g.number} · {gradingState[g.state]}
              </p>
              <PublishedGradeDetails grade={g} />
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
export function AssignmentGradingPage() {
  const { classId = '', activityId = '' } = useParams(),
    [data, setData] = useState<GradingQueue>(),
    [tick, setTick] = useState(0),
    [loadError, setLoadError] = useState(''),
    writes = useWrites(() => setTick((x) => x + 1));
  useEffect(() => {
    let live = true;
    void gradingApi
      .queue(classId, activityId)
      .then((d) => {
        if (live) {
          setData(d);
          setLoadError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setLoadError('Không thể mở hàng đợi chấm bài trong phân công hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [classId, activityId, tick]);
  return (
    <WorkShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-sm font-semibold text-indigo-700 hover:underline"
          to={'/classroom/' + classId + '/activities/' + activityId}
        >
          ← Quay lại bài tập & chấm điểm trực tiếp
        </Link>
        <button className={button} disabled={writes.busy} onClick={() => setTick((x) => x + 1)}>
          Tải lại hàng đợi
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2">
        <h1 className="text-2xl font-extrabold text-slate-900">Chấm bài tập theo Rubric (Phê duyệt Học vụ)</h1>
        <p className="text-sm text-slate-600">
          Không gian thiết lập tiêu chí Rubric chuẩn hóa và xác nhận điểm cuối có phê duyệt Học vụ.
          Nếu muốn chấm nhanh bài nộp tệp/văn bản của học viên, dùng bảng <strong>Chấm điểm trực tiếp</strong> ngay trong trang bài tập.
        </p>
      </div>
      <Messages error={writes.error || loadError} notice={writes.notice} />
      {!data && !loadError && <p role="status">Đang tải…</p>}
      {data && (
        <>
          <div className="space-y-3">
            {data.rubrics.map((r) => (
              <RubricDetails key={r.id} rubric={r} />
            ))}
          </div>
          <RubricForm
            key={data.rubrics[0]?.id + ':' + data.rubrics[0]?.lockVersion}
            c={classId}
            a={activityId}
            rubrics={data.rubrics}
            busy={writes.busy}
            write={writes.write}
          />
          <h2 className="text-xl font-bold">Bài đã nộp trong lớp</h2>
          {!data.submissions.length && <p>Chưa có bài nộp nào từ học viên trong lớp.</p>}
          {data.submissions.map((s) => (
            <WorkCard
              key={s.id + ':' + (s.grades[0]?.lockVersion ?? 0) + ':' + s.grades.length}
              c={classId}
              a={activityId}
              work={s}
              rubrics={data.rubrics}
              busy={writes.busy}
              write={writes.write}
            />
          ))}
        </>
      )}
    </WorkShell>
  );
}
function PublishButton({
  path,
  version,
  canPublish,
  busy,
  write,
  label,
}: {
  path: string;
  version: number;
  canPublish: boolean;
  busy: boolean;
  write: Write;
  label: string;
}) {
  const [reviewed, setReviewed] = useState(false);
  return (
    <div className="space-y-3 border-t pt-4">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        Đã kiểm tra nội dung và nguồn; quyết định công bố độc lập.
      </label>
      {!canPublish && <p>Không thể tự duyệt nội dung mình đã soạn hoặc chấm.</p>}
      <button
        className={button}
        disabled={busy || !canPublish || !reviewed}
        onClick={() => void write(path, { expectedLockVersion: version })}
      >
        {label}
      </button>
    </div>
  );
}
export function AssignmentCheckerPage() {
  const [data, setData] = useState<CheckerInbox>(),
    [tick, setTick] = useState(0),
    [classId, setClassId] = useState(''),
    [loadError, setLoadError] = useState(''),
    writes = useWrites(() => setTick((x) => x + 1));
  useEffect(() => {
    let live = true;
    void gradingApi
      .inbox()
      .then((d) => {
        if (live) {
          setData(d);
          setLoadError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setLoadError('Không thể tải phạm vi duyệt hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [tick]);
  return (
    <WorkShell academic>
      <h1 className="text-2xl font-bold">Học vụ · Phê duyệt tiêu chí và điểm bài tập</h1>
      <p>
        Danh sách tiêu chí đánh giá và bảng điểm chờ phê duyệt theo phân công học vụ.
      </p>
      <Messages error={writes.error || loadError} notice={writes.notice} />
      <button className={button} disabled={writes.busy} onClick={() => setTick((x) => x + 1)}>
        Tải lại phạm vi duyệt
      </button>
      {data && (
        <>
          <label className="block">
            Lọc lớp
            <select className={field} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Tất cả lớp được ủy quyền</option>
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classCodeLabel(c.code)} · {c.name}
                </option>
              ))}
            </select>
          </label>
          {data.truncated && (
            <p role="alert">
              Danh sách giới hạn 200 mục; cần kiểm tra thêm trước khi xử lý toàn bộ.
            </p>
          )}
          <h2 className="text-xl font-bold">Rubric chờ phát hành</h2>
          {!data.rubrics.length && <p>Không có rubric chờ duyệt trong phạm vi.</p>}
          {data.rubrics
            .filter((r) => !classId || r.classId === classId)
            .map((r) => (
              <article className="space-y-4 rounded-xl border bg-white p-4" key={r.rubric.id}>
                <RubricDetails rubric={r.rubric} />
                <PublishButton
                  path={gradingPath(r.classId, r.activityId, 'rubrics/' + r.rubric.id + '/publish')}
                  version={r.rubric.lockVersion}
                  canPublish={r.canPublish}
                  busy={writes.busy}
                  write={writes.write}
                  label="Duyệt và phát hành rubric"
                />
              </article>
            ))}
          <h2 className="text-xl font-bold">Điểm FINAL chờ công bố</h2>
          {!data.grades.length && <p>Không có điểm FINAL chờ công bố trong phạm vi.</p>}
          {data.grades
            .filter((g) => !classId || g.classId === classId)
            .map((g) => (
              <article className="space-y-4 rounded-xl border bg-white p-4 sm:p-6" key={g.grade.id}>
                <h3 className="text-lg font-bold">
                  {g.submission.learnerName} · {g.submission.source.title}
                </h3>
                <p>
                  Bản điểm {g.grade.number} · {gradingState[g.grade.state]}
                </p>
                <details>
                  <summary>Đối chiếu đề gốc và bài nộp</summary>
                  <SafeMarkdown markdown={g.submission.source.contentMarkdown} />
                  <p className="whitespace-pre-wrap break-words">{g.submission.text}</p>
                  {g.submission.file && (
                    <a
                      className={button}
                      href={apiUrl(
                        gradingPath(g.classId, g.activityId, 'grades/' + g.grade.id + '/file'),
                      )}
                    >
                      Tải bài gốc: {g.submission.file.name}
                    </a>
                  )}
                </details>
                <PublishedGradeDetails grade={g.grade} />
                <PublishButton
                  path={gradingPath(g.classId, g.activityId, 'grades/' + g.grade.id + '/publish')}
                  version={g.grade.lockVersion}
                  canPublish={g.canPublish}
                  busy={writes.busy}
                  write={writes.write}
                  label="Duyệt và công bố điểm"
                />
              </article>
            ))}
        </>
      )}
      {!data && !loadError && <p role="status">Đang tải…</p>}
    </WorkShell>
  );
}
export function AssignmentGradebookPage() {
  const { classId = '' } = useParams(),
    [data, setData] = useState<Gradebook>(),
    [unified, setUnified] = useState<UnifiedClassResults>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([
      gradingApi.book(classId),
      Promise.resolve(lmsLocalApi.getUnifiedClassResults(classId)).catch(() => undefined),
    ])
      .then(([d, u]) => {
        if (live) {
          setData(d);
          setUnified(u && Array.isArray(u.activityColumns) ? u : undefined);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setUnified(undefined);
          setError('Không thể mở bảng điểm trong quyền ghi danh hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [classId, tick]);
  const labels = {
    NOT_GRADED: 'Chưa chấm',
    GRADING_IN_PROGRESS: 'Đang chấm',
    PENDING_PUBLICATION: 'Đang chờ học vụ công bố',
    PUBLISHED: 'Đã công bố',
  };
  return (
    <main className="section-shell max-w-5xl space-y-5 py-8">
      <Link to={'/classroom/' + classId}>← Nội dung lớp</Link>
      <h1 className="text-2xl font-bold">Bảng điểm lớp học</h1>
      <p>
        Tổng hợp điểm các hoạt động LMS (Bài tập, Quiz / Kiểm tra thường kỳ, Điểm danh) và các bài
        đánh giá đã công bố chính thức.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className={button} onClick={() => setTick((x) => x + 1)}>
        Tải lại bảng điểm
      </button>
      {!data && !error && <p role="status">Đang tải…</p>}
      {unified && <UnifiedGradebookPanel classId={classId} unified={unified} />}
      {data && !data.entries.length && !unified?.activityColumns.length && (
        <p>Chưa có bài tập nào được công bố điểm.</p>
      )}
      {data && (
        <>
          <KnowledgeRecommendations
            key={'knowledge-' + tick}
            returnTo={'/classroom/' + classId + '/gradebook'}
          />
          <QuizGradebook key={tick} classId={classId} />
        </>
      )}
      {data?.entries.map((e) => (
        <article
          key={e.submissionId}
          className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-6"
        >
          <h2 className="text-xl font-bold">{e.title}</h2>
          <p role="status">{labels[e.status]}</p>
          {e.result && (
            <>
              <p>Bản điểm {e.result.number}</p>
              <PublishedGradeDetails grade={e.result} />
            </>
          )}
          {e.history.length > 1 && (
            <details>
              <summary>Lịch sử điểm đã công bố</summary>
              {e.history.slice(1).map((g) => (
                <div key={g.id} className="my-4 rounded-xl border p-4">
                  <h3>Bản điểm {g.number}</h3>
                  <PublishedGradeDetails grade={g} />
                </div>
              ))}
            </details>
          )}
        </article>
      ))}
    </main>
  );
}
