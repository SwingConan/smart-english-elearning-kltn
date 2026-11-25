import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { apiFetch } from '@/lib/api-client';
import { button, field, classLmsApi } from '@/features/class-lms/api';
import {
  quizGet,
  quizWrite,
  remainingSeconds,
  quizQuestionState,
  type QuizAttempt,
  type QuizAuthor,
  type QuizInbox,
  type QuizResult,
  type QuizSource,
} from '@/features/class-lms/quiz-api';
import { schoolTimestamp } from '@/features/class-lms/school-time';
import { schoolInput } from '@/features/academic/planning-api';
const fail =
  'Chưa xác nhận thành công. Kiểm tra kết nối, quyền và phiên bản. Thử lại cùng thao tác hoặc tải trạng thái đã lưu; không có lượt làm hay công bố tự động.';
type DraftQuestion = {
  content: string;
  points: number;
  explanation: string;
  options: { content: string; isCorrect: boolean }[];
};
const blankQuestion = (): DraftQuestion => ({
  content: '',
  points: 1,
  explanation: '',
  options: [0, 1, 2, 3].map((i) => ({ content: '', isCorrect: i === 0 })),
});
function useMutation() {
  const keys = useRef(new Map<string, string>()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return {
    busy,
    error,
    setError,
    async write<T>(c: string, p: string, b: object, method = 'POST') {
      setBusy(true);
      setError('');
      const sig = method + p + JSON.stringify(b);
      if (!keys.current.has(sig)) keys.current.set(sig, crypto.randomUUID());
      try {
        return await quizWrite<T>(c, p, { ...b, idempotencyKey: keys.current.get(sig) }, method);
      } catch {
        setError(fail);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
  };
}
function SourceDetails({ source: s }: { source: QuizSource }) {
  return (
    <div className="space-y-3">
      <p>
        Phiên bản {s.version} · {s.state === 'APPROVED' ? 'Đã duyệt nguồn' : 'Nháp chưa duyệt'}
      </p>
      <p>
        Mở {schoolTimestamp(s.openAt)} · Đóng {schoolTimestamp(s.closeAt)} · {s.durationMinutes}{' '}
        phút · Giờ Việt Nam
      </p>
      {s.questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-lg border p-3">
          <legend>
            Câu {i + 1} · {q.points} điểm
          </legend>
          <p className="whitespace-pre-wrap">{q.content}</p>
          <ul>
            {q.options.map((o, j) => (
              <li key={o.id}>
                {j + 1}. {o.content}
                {o.isCorrect === true ? ' · Đáp án đúng (nội bộ)' : ''}
              </li>
            ))}
          </ul>
          {q.explanation && <p>Giải thích nội bộ: {q.explanation}</p>}
        </fieldset>
      ))}
    </div>
  );
}
export function QuizAuthorPage() {
  const { classId = '', activityId = '', sectionId = '' } = useParams(),
    navigate = useNavigate(),
    [data, setData] = useState<QuizAuthor>(),
    [tick, setTick] = useState(0),
    [editing, setEditing] = useState<QuizSource | null>(),
    [title, setTitle] = useState(''),
    [open, setOpen] = useState(''),
    [close, setClose] = useState(''),
    [duration, setDuration] = useState(''),
    [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]),
    [notice, setNotice] = useState(''),
    created = useRef<string | undefined>(undefined),
    writes = useMutation();
  const setWriteError = writes.setError;
  useEffect(() => {
    if (!activityId) return;
    let live = true;
    void quizGet<QuizAuthor>(classId, 'activities/' + activityId + '/author')
      .then((x) => {
        if (live) setData(x);
      })
      .catch(() => {
        if (live) setWriteError('Không có quyền giảng viên hiện hành cho Quiz này.');
      });
    return () => {
      live = false;
    };
  }, [classId, activityId, tick, setWriteError]);
  function load(s: QuizSource | null) {
    setEditing(s);
    setTitle(s?.title ?? data?.sources[0]?.title ?? '');
    setOpen(s ? schoolInput(s.openAt) : '');
    setClose(s ? schoolInput(s.closeAt) : '');
    setDuration(s ? String(s.durationMinutes) : '');
    setQuestions(
      s
        ? s.questions.map((q) => ({
            content: q.content,
            points: q.points,
            explanation: q.explanation ?? '',
            options: q.options.map((o) => ({ content: o.content, isCorrect: !!o.isCorrect })),
          }))
        : [blankQuestion()],
    );
  }
  async function save() {
    if (!open || !close || !duration) return;
    let a = activityId || created.current;
    if (!a) {
      try {
        const r = await classLmsApi.write<{ id: string }>(
          classId,
          'sections/' + sectionId + '/activities',
          { type: 'QUIZ', title, introduction: '', contentMarkdown: '' },
        );
        a = r.id;
        created.current = a;
      } catch {
        writes.setError(fail);
        return;
      }
    }
    const latest = data?.sources[0],
      p = 'activities/' + a + '/sources' + (editing?.state === 'DRAFT' ? '/' + editing.id : '');
    const out = await writes.write<QuizSource>(
      classId,
      p,
      {
        title,
        openAt: new Date(open + ':00+07:00').toISOString(),
        closeAt: new Date(close + ':00+07:00').toISOString(),
        durationMinutes: Number(duration),
        expectedVersion: editing?.state === 'DRAFT' ? editing.version : (latest?.version ?? 0),
        ...(editing?.state === 'DRAFT' ? { expectedLockVersion: editing.lockVersion } : {}),
        questions,
      },
      editing?.state === 'DRAFT' ? 'PUT' : 'POST',
    );
    if (out) {
      setNotice(
        'Đã lưu nguồn nháp. Học vụ độc lập cần duyệt trước khi giảng viên xuất bản hoạt động.',
      );
      setEditing(undefined);
      setTick((v) => v + 1);
      if (!activityId) navigate('/classroom/' + classId + '/activities/' + a + '/quiz-author');
    }
  }
  async function publishVersion() {
    try {
      let row = await classLmsApi.get<{
        id: string;
        type: string;
        title: string;
        introduction: string;
        contentMarkdown: string;
        sectionId: string;
        state: string;
        lockVersion: number;
      }>(classId, 'activities/' + activityId);
      if (row.state !== 'DRAFT') {
        row = await classLmsApi.write(
          classId,
          'sections/' + row.sectionId + '/activities/' + row.id,
          {
            type: 'QUIZ',
            title: row.title,
            introduction: row.introduction,
            contentMarkdown: row.contentMarkdown,
            expectedLockVersion: row.lockVersion,
          },
          'PATCH',
        );
      }
      await classLmsApi.write(classId, 'activities/' + row.id + '/publish', {
        expectedLockVersion: row.lockVersion,
      });
      setNotice('Đã xuất bản hoạt động với nguồn Quiz được duyệt.');
      setTick((v) => v + 1);
    } catch {
      writes.setError(
        'Chưa công bố. Kiểm tra chủ đề đã công bố, bộ câu hỏi đã duyệt và phiên bản hiện hành.',
      );
    }
  }
  const form = !activityId || editing !== undefined;
  return (
    <main className="section-shell max-w-5xl space-y-5 py-8">
      <Link to={'/classroom/' + classId}>← Không gian lớp</Link>
      <h1 className="text-2xl font-bold">Soạn Quiz của lớp</h1>
      <p>
        Nguồn trắc nghiệm văn bản một đáp án. Học vụ được ủy quyền riêng theo lớp duyệt nguồn và
        công bố điểm. Mỗi phiên bản được duyệt giữ nguyên.
      </p>
      {writes.error && <p role="alert">{writes.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!form && data && (
        <button
          className={button}
          onClick={() => load(data.sources[0]?.state === 'DRAFT' ? data.sources[0] : null)}
        >
          {data.sources[0]?.state === 'DRAFT' ? 'Chỉnh sửa nguồn nháp' : 'Tạo phiên bản nguồn mới'}
        </button>
      )}
      {form && (
        <form
          className="space-y-4 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="text-xl font-bold">
            {editing?.state === 'DRAFT' ? 'Sửa bản nháp' : 'Nguồn Quiz mới'}
          </h2>
          <label className="block">
            Tên Quiz
            <input
              required
              maxLength={250}
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              Mở lúc (giờ Việt Nam)
              <input
                required
                type="datetime-local"
                className={field}
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </label>
            <label>
              Đóng lúc (giờ Việt Nam)
              <input
                required
                type="datetime-local"
                className={field}
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </label>
            <label>
              Thời lượng (5–120 phút)
              <input
                required
                type="number"
                min={5}
                max={120}
                className={field}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </label>
          </div>
          {questions.map((q, i) => (
            <fieldset className="space-y-3 rounded-xl border p-4" key={i}>
              <legend>Câu {i + 1}</legend>
              <label className="block">
                Nội dung câu {i + 1}
                <textarea
                  required
                  maxLength={10000}
                  className={field}
                  value={q.content}
                  onChange={(e) =>
                    setQuestions((v) =>
                      v.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Điểm câu {i + 1}
                <input
                  required
                  type="number"
                  min={1}
                  max={1000}
                  className={field}
                  value={q.points}
                  onChange={(e) =>
                    setQuestions((v) =>
                      v.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)),
                    )
                  }
                />
              </label>
              {q.options.map((o, j) => (
                <div key={j} className="flex items-center gap-3">
                  <label>
                    <input
                      type="radio"
                      name={'key-' + i}
                      checked={o.isCorrect}
                      onChange={() =>
                        setQuestions((v) =>
                          v.map((x, k) =>
                            k === i
                              ? {
                                  ...x,
                                  options: x.options.map((y, l) => ({ ...y, isCorrect: l === j })),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    Đúng {j + 1}
                  </label>
                  <label className="flex-1">
                    Phương án {i + 1}.{j + 1}
                    <input
                      required
                      maxLength={2000}
                      className={field}
                      value={o.content}
                      onChange={(e) =>
                        setQuestions((v) =>
                          v.map((x, k) =>
                            k === i
                              ? {
                                  ...x,
                                  options: x.options.map((y, l) =>
                                    l === j ? { ...y, content: e.target.value } : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <label className="block">
                Giải thích nội bộ câu {i + 1}
                <textarea
                  className={field}
                  value={q.explanation}
                  onChange={(e) =>
                    setQuestions((v) =>
                      v.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)),
                    )
                  }
                />
              </label>
              {questions.length > 1 && (
                <button
                  type="button"
                  className={button}
                  onClick={() => setQuestions((v) => v.filter((_, j) => j !== i))}
                >
                  Xóa câu {i + 1} khỏi bản nháp
                </button>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={button}
              disabled={questions.length >= 100}
              onClick={() => setQuestions((v) => [...v, blankQuestion()])}
            >
              Thêm câu
            </button>
            <button className={button} disabled={writes.busy}>
              Lưu nguồn nháp Quiz
            </button>
            {activityId && (
              <button type="button" className={button} onClick={() => setEditing(undefined)}>
                Đóng trình soạn
              </button>
            )}
          </div>
        </form>
      )}
      {data?.sources[0]?.state === 'APPROVED' && (
        <button className={button} onClick={() => void publishVersion()}>
          Xuất bản phiên bản Quiz đã duyệt trong lớp
        </button>
      )}
      {data?.sources.map((s) => (
        <article key={s.id} className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-bold">{s.title}</h2>
          <SourceDetails source={s} />
        </article>
      ))}
      <h2 className="text-xl font-bold">Bài đã kết thúc</h2>
      {data?.attempts.map((a) => (
        <article key={a.id} className="rounded-xl border p-4">
          <p>
            {a.learnerName} · Phiên bản {a.version} · {a.earned}/{a.max} ·{' '}
            {a.gradeState === 'PUBLISHED' ? 'Đã công bố' : 'Nội bộ, chờ học vụ công bố'}
          </p>
          <p>{schoolTimestamp(a.submittedAt)}</p>
        </article>
      ))}
    </main>
  );
}
export function QuizCheckerPage() {
  const [data, setData] = useState<QuizInbox>(),
    [tick, setTick] = useState(0),
    writes = useMutation();
  const setWriteError = writes.setError;
  useEffect(() => {
    let live = true;
    void apiFetch<QuizInbox>('/v2/class-quiz/checker')
      .then((x) => {
        if (live) setData(x);
      })
      .catch(() => setWriteError('Không thể tải hộp duyệt trong quyền hiện hành.'));
    return () => {
      live = false;
    };
  }, [tick, setWriteError]);
  async function act(c: string, p: string, v: number) {
    if (await writes.write(c, p, { expectedLockVersion: v })) setTick((v) => v + 1);
  }
  return (
    <main className="section-shell grid gap-6 py-8 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="rounded-xl border bg-white p-4">
        <nav className="flex flex-wrap gap-4 lg:flex-col" aria-label="Học vụ Quiz">
          <Link to="/workspace">Tổng quan</Link>
          <Link to="/academic/grading">Duyệt Assignment</Link>
          <Link to="/academic/quizzes">Duyệt nguồn và điểm Quiz</Link>
        </nav>
      </aside>
      <div className="min-w-0 space-y-5">
        <h1 className="text-2xl font-bold">Duyệt Quiz theo lớp</h1>
        <p>
          Nguồn và điểm dùng hai quyền riêng. Người soạn không tự duyệt; điểm chưa công bố chỉ ở nội
          bộ.
        </p>
        {writes.error && <p role="alert">{writes.error}</p>}
        <button className={button} onClick={() => setTick((v) => v + 1)}>
          Tải lại hộp duyệt
        </button>
        <h2 className="text-xl font-bold">Nguồn nháp chờ duyệt</h2>
        {data?.sources.map((s) => (
          <article key={s.id} className="space-y-4 rounded-xl border bg-white p-4">
            <h3 className="font-bold">{s.title}</h3>
            <SourceDetails source={s} />
            <button
              disabled={!s.canApprove || writes.busy}
              className={button}
              onClick={() =>
                void act(
                  s.classId,
                  'activities/' + s.activityId + '/sources/' + s.id + '/approve',
                  s.lockVersion,
                )
              }
            >
              Duyệt và đóng băng nguồn Quiz
            </button>
          </article>
        ))}
        <h2 className="text-xl font-bold">Điểm nội bộ chờ công bố</h2>
        {data?.attempts.map((a) => (
          <article key={a.id} className="space-y-3 rounded-xl border bg-white p-4">
            <h3 className="font-bold">
              {a.title} · {a.learnerName}
            </h3>
            <p>
              Phiên bản {a.version} · {a.earned}/{a.max} · Nộp {schoolTimestamp(a.submittedAt)}
            </p>
            <button
              className={button}
              disabled={!a.canPublish || writes.busy}
              onClick={() => void act(a.classId, 'attempts/' + a.id + '/publish', a.lockVersion)}
            >
              Duyệt và công bố điểm Quiz
            </button>
          </article>
        ))}
        {data && !data.sources.length && !data.attempts.length && (
          <p>Không có mục chờ duyệt trong phạm vi được cấp.</p>
        )}
      </div>
    </main>
  );
}
function Result({ value: r }: { value: QuizResult }) {
  return (
    <p className="text-lg font-bold">
      {r.earned}/{r.max} · {r.percentage}% · Công bố {schoolTimestamp(r.publishedAt)}
    </p>
  );
}
export function QuizGradebook({ classId }: { classId: string }) {
  const [data, setData] = useState<{
      entries: {
        id: string;
        title: string;
        version: number;
        state: string;
        submittedAt: string | null;
        result: QuizResult | null;
      }[];
    }>(),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void quizGet<NonNullable<typeof data>>(classId, 'gradebook')
      .then((x) => {
        if (live) setData(x);
      })
      .catch(() => {
        if (live) setError('Không thể tải bảng điểm Quiz trong quyền hiện hành.');
      });
    return () => {
      live = false;
    };
  }, [classId]);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Quiz của bạn</h2>
      {error && <p role="alert">{error}</p>}
      {data && !data.entries.length && <p>Chưa có lượt Quiz.</p>}
      {data?.entries.map((e) => (
        <article key={e.id} className="space-y-3 rounded-xl border bg-white p-5">
          <h3 className="font-bold">
            {e.title} · Phiên bản {e.version}
          </h3>
          <p>
            {e.state === 'IN_PROGRESS'
              ? 'Đang làm'
              : e.state === 'PUBLISHED'
                ? 'Đã công bố'
                : 'Chờ học vụ công bố; chưa có điểm hiển thị'}
          </p>
          {e.result && <Result value={e.result} />}
          <Link
            className="text-indigo-700 underline"
            to={'/classroom/' + classId + '/quiz-attempts/' + e.id}
          >
            Xem lượt làm và biên nhận
          </Link>
        </article>
      ))}
    </section>
  );
}
export function QuizLaunchPage() {
  const { classId = '', activityId = '' } = useParams(),
    [data, setData] = useState<{ source: QuizSource; attempt: QuizAttempt | null }>(),
    writes = useMutation(),
    navigate = useNavigate();
  const setWriteError = writes.setError;
  useEffect(() => {
    void quizGet<NonNullable<typeof data>>(classId, 'activities/' + activityId + '/launch')
      .then(setData)
      .catch(() => setWriteError('Quiz chưa khả dụng trong phạm vi ghi danh hiện hành.'));
  }, [classId, activityId, setWriteError]);
  return (
    <main className="section-shell max-w-3xl space-y-5 py-8">
      <Link to={'/classroom/' + classId}>← Nội dung lớp</Link>
      <h1 className="text-2xl font-bold">{data?.source.title ?? 'Quiz của lớp'}</h1>
      {writes.error && <p role="alert">{writes.error}</p>}
      {data && (
        <>
          <p>
            Phiên bản {data.source.version} ·{' '}
            {data.source.questionCount ?? data.source.questions.length} câu ·{' '}
            {data.source.durationMinutes} phút. Mỗi phiên bản chỉ có một lượt làm.
          </p>
          <p>
            Mở {schoolTimestamp(data.source.openAt)} · Đóng {schoolTimestamp(data.source.closeAt)}{' '}
            (giờ Việt Nam).
          </p>
          <p>Hết giờ hệ thống chốt các đáp án đã lưu. Điểm chỉ hiển thị sau khi học vụ công bố.</p>
          <button
            className={button}
            disabled={writes.busy}
            onClick={() =>
              void (async () => {
                const a =
                  data.attempt ??
                  (await writes.write<QuizAttempt>(classId, 'activities/' + activityId + '/start', {
                    sourceId: data.source.id,
                  }));
                if (a) navigate('/classroom/' + classId + '/quiz-attempts/' + a.id);
              })()
            }
          >
            {data.attempt ? 'Tiếp tục / xem lượt đã ghi nhận' : 'Bắt đầu Quiz'}
          </button>
        </>
      )}
    </main>
  );
}
function QuizNavigatorDialog({ close, children }: { close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    return () => {
      if (typeof d.close === 'function') d.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Danh sách câu hỏi"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="fixed inset-0 z-50 m-auto max-h-[90dvh] w-[90vw] max-w-sm space-y-4 overflow-auto rounded-xl border bg-white p-5 shadow-xl"
    >
      <button className={button} autoFocus onClick={close}>
        Đóng danh sách câu hỏi
      </button>
      {children}
    </dialog>
  );
}
export function QuizExamPage() {
  const { classId = '', attemptId = '' } = useParams(),
    [attempt, setAttempt] = useState<QuizAttempt>(),
    [index, setIndex] = useState(0),
    [drawer, setDrawer] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(''),
    [saveState, setSaveState] = useState('Đã lưu'),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [draft, setDraft] = useState<{ answers: QuizAttempt['answers']; marked: string[] }>({
      answers: [],
      marked: [],
    });
  const current = useRef<QuizAttempt | undefined>(undefined),
    draftRef = useRef(draft),
    dirty = useRef(false),
    inFlight = useRef(false),
    blocked = useRef(false),
    pending = useRef<
      | {
          idempotencyKey: string;
          expectedLockVersion: number;
          answers: QuizAttempt['answers'];
          marked: string[];
        }
      | undefined
    >(undefined),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    base = useRef({ server: '', at: 0 }),
    mounted = useRef(true),
    submitKey = useRef<{ version: number; key: string } | undefined>(undefined);
  const accept = useCallback((a: QuizAttempt, replace = true) => {
    current.current = a;
    setAttempt(a);
    base.current = { server: a.serverNow, at: performance.now() };
    setSeconds(remainingSeconds(a.deadline, a.serverNow, 0));
    if (replace) {
      const v = { answers: a.answers, marked: a.marked };
      draftRef.current = v;
      setDraft(v);
      dirty.current = false;
      pending.current = undefined;
      blocked.current = false;
      setSaveState(a.state === 'IN_PROGRESS' ? 'Đã lưu' : 'Đã chốt trên server');
    }
  }, []);
  const reload = useCallback(async () => {
    try {
      const a = await quizGet<QuizAttempt>(classId, 'attempts/' + attemptId);
      if (mounted.current) {
        accept(a);
        setError('');
      }
    } catch {
      if (mounted.current)
        setError(
          'Không thể khôi phục lượt làm. Kiểm tra kết nối hoặc ghi danh; không tạo lượt mới.',
        );
    }
  }, [classId, attemptId, accept]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(reload);
    return () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [reload]);
  useEffect(() => {
    const id = setInterval(() => {
      const a = current.current;
      if (!a) return;
      const left = remainingSeconds(
        a.deadline,
        base.current.server,
        performance.now() - base.current.at,
      );
      setSeconds(left);
      if (a.state === 'IN_PROGRESS' && left === 0 && !inFlight.current) {
        void quizGet<QuizAttempt>(classId, 'attempts/' + attemptId)
          .then((x) => {
            if (mounted.current && x.state !== 'IN_PROGRESS') {
              accept(x);
              setError('');
            }
          })
          .catch(() => {
            if (mounted.current)
              setError(
                'Hết thời gian hiển thị. Đang chờ biên nhận server; không tự suy ra kết quả.',
              );
          });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [classId, attemptId, accept]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function flush(retry = false) {
    if (
      inFlight.current ||
      (blocked.current && !retry) ||
      !current.current ||
      current.current.state !== 'IN_PROGRESS'
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setSaveState('Đang lưu…');
    setError('');
    const sent = pending.current ?? {
      idempotencyKey: crypto.randomUUID(),
      expectedLockVersion: current.current.lockVersion,
      answers: draftRef.current.answers,
      marked: draftRef.current.marked,
    };
    pending.current = sent;
    try {
      const a = await quizWrite<QuizAttempt>(
        classId,
        'attempts/' + attemptId + '/answers',
        sent,
        'PUT',
      );
      if (!mounted.current) return;
      pending.current = undefined;
      blocked.current = false;
      const changed =
        JSON.stringify({ answers: sent.answers, marked: sent.marked }) !==
        JSON.stringify(draftRef.current);
      accept(a, a.state !== 'IN_PROGRESS' || !changed);
      if (a.state === 'IN_PROGRESS' && changed) {
        dirty.current = true;
        setSaveState('Chưa lưu thay đổi mới');
      } else dirty.current = false;
      setError('');
    } catch {
      blocked.current = true;
      if (mounted.current) {
        setSaveState('Lỗi lưu — chưa xác nhận');
        setError(
          'Đáp án chưa được xác nhận đã lưu. Thử lại cùng yêu cầu. Nếu tab khác đã thay đổi, tải trạng thái server trước khi tiếp tục.',
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      if (dirty.current && !blocked.current && mounted.current)
        saveTimer.current = setTimeout(() => void flush(), 100);
    }
  }
  function change(v: typeof draft) {
    draftRef.current = v;
    setDraft(v);
    dirty.current = true;
    setSaveState('Chưa lưu');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 250);
  }
  async function submit() {
    const a = current.current;
    if (!a || dirty.current || inFlight.current) return;
    setBusy(true);
    setError('');
    if (submitKey.current?.version !== a.lockVersion)
      submitKey.current = { version: a.lockVersion, key: crypto.randomUUID() };
    try {
      const x = await quizWrite<QuizAttempt>(classId, 'attempts/' + attemptId + '/submit', {
        idempotencyKey: submitKey.current.key,
        expectedLockVersion: a.lockVersion,
      });
      accept(x);
      setConfirm(false);
    } catch {
      setError(
        'Chưa nhận được biên nhận. Thử nộp lại cùng yêu cầu hoặc tải trạng thái server; không có lượt mới.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!attempt)
    return (
      <main className="section-shell py-8">
        <h1>Đang khôi phục Quiz</h1>
        {error && <p role="alert">{error}</p>}
        <button className={button} onClick={() => void reload()}>
          Thử tải trạng thái
        </button>
      </main>
    );
  const q = attempt.source.questions[index],
    closed = attempt.state !== 'IN_PROGRESS',
    unanswered = attempt.source.questions.filter(
      (q) => !draft.answers.find((a) => a.questionId === q.id)?.optionId,
    ).length,
    disabled = closed || seconds === 0 || (busy && confirm);
  const navigator = (
    <nav className="space-y-4" aria-label="Điều hướng câu hỏi">
      <h2 className="font-bold">Câu hỏi</h2>
      <p className="text-sm">
        {attempt.source.questions.length - unanswered}/{attempt.source.questions.length} đã trả lời
        · {draft.marked.length} đánh dấu
      </p>
      <div className="grid grid-cols-4 gap-2">
        {attempt.source.questions.map((x, i) => {
          const s = quizQuestionState(x.id, draft.answers, draft.marked);
          return (
            <button
              key={x.id}
              aria-current={i === index ? 'step' : undefined}
              aria-label={
                'Câu ' +
                (i + 1) +
                (s.answered ? ', đã trả lời' : ', chưa trả lời') +
                (s.marked ? ', đánh dấu' : '')
              }
              className={
                'min-h-11 rounded-lg border p-2 ' +
                (i === index ? 'ring-2 ring-indigo-600 ' : '') +
                (s.answered ? 'bg-emerald-100 ' : 'bg-white ') +
                (s.marked ? 'border-amber-600 border-2' : 'border-slate-300')
              }
              onClick={() => {
                setIndex(i);
                setDrawer(false);
              }}
            >
              {i + 1}
              {s.marked ? ' ★' : ''}
            </button>
          );
        })}
      </div>
      <p className="text-xs">Xanh: có đáp án · ★: đánh dấu độc lập</p>
    </nav>
  );
  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{attempt.source.title}</h1>
          <p>
            Phiên bản {attempt.source.version} · Hạn server {schoolTimestamp(attempt.deadline)}
          </p>
        </div>
        <div>
          <p
            role="timer"
            className={
              'font-mono text-2xl font-bold ' + (seconds < 60 ? 'text-red-700' : 'text-indigo-800')
            }
          >
            {closed
              ? 'Đã kết thúc'
              : Math.floor(seconds / 60)
                  .toString()
                  .padStart(2, '0') +
                ':' +
                (seconds % 60).toString().padStart(2, '0')}
          </p>
          <p role="status" data-testid="quiz-save-state">
            {saveState}
          </p>
        </div>
      </header>
      {error && (
        <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4">
          <p>{error}</p>
          <button className={button} disabled={busy} onClick={() => void flush(true)}>
            Thử lưu lại
          </button>
          <button className={button} disabled={busy} onClick={() => void reload()}>
            Tải đáp án đã lưu từ server
          </button>
        </div>
      )}
      {closed && (
        <section className="space-y-3 rounded-xl bg-indigo-50 p-5">
          <h2 className="font-bold">
            {attempt.state === 'EXPIRED' ? 'Đã hết hạn và chốt đáp án đã lưu' : 'Đã nộp bài'}
          </h2>
          <p>
            Biên nhận: <code>{attempt.receipt}</code> · {schoolTimestamp(attempt.submittedAt!)}
          </p>
          {attempt.result ? (
            <Result value={attempt.result} />
          ) : (
            <p>Chờ học vụ công bố điểm. Chưa công bố không phải 0.</p>
          )}
          <Link to={'/classroom/' + classId + '/gradebook'}>Bảng điểm của bạn</Link>
        </section>
      )}
      <button className={button + ' lg:hidden'} onClick={() => setDrawer(true)}>
        Mở danh sách câu hỏi
      </button>
      <div
        className="grid gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]"
        data-testid="quiz-exam-grid"
      >
        <section className="min-w-0 space-y-5 rounded-xl border bg-white p-5 sm:p-8">
          <h2 className="text-xl font-bold">
            Câu {index + 1} / {attempt.source.questions.length} · {q.points} điểm
          </h2>
          <p className="whitespace-pre-wrap break-words text-lg">{q.content}</p>
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="sr-only">Chọn một phương án</legend>
            {q.options.map((o, i) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
              >
                <input
                  type="radio"
                  name={q.id}
                  value={o.id}
                  checked={draft.answers.find((a) => a.questionId === q.id)?.optionId === o.id}
                  onChange={() =>
                    change({
                      ...draftRef.current,
                      answers: [
                        ...draftRef.current.answers.filter((a) => a.questionId !== q.id),
                        { questionId: q.id, optionId: o.id },
                      ],
                    })
                  }
                />
                <span>
                  {String.fromCharCode(65 + i)}. {o.content}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={disabled}
              aria-pressed={draft.marked.includes(q.id)}
              onClick={() =>
                change({
                  ...draftRef.current,
                  marked: draftRef.current.marked.includes(q.id)
                    ? draftRef.current.marked.filter((id) => id !== q.id)
                    : [...draftRef.current.marked, q.id],
                })
              }
            >
              {draft.marked.includes(q.id) ? 'Bỏ đánh dấu' : 'Đánh dấu câu'}
            </button>
            <button
              className={button}
              disabled={disabled}
              onClick={() =>
                change({
                  ...draftRef.current,
                  answers: draftRef.current.answers.filter((x) => x.questionId !== q.id),
                })
              }
            >
              Bỏ chọn đáp án
            </button>
          </div>
          <div className="flex justify-between">
            <button
              className={button}
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Câu trước
            </button>
            <button
              className={button}
              disabled={index === attempt.source.questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Câu tiếp
            </button>
          </div>
          {!closed && (
            <button
              className={button}
              disabled={busy || saveState !== 'Đã lưu' || seconds === 0}
              onClick={() => setConfirm(true)}
            >
              Nộp Quiz
            </button>
          )}
          {confirm && !closed && (
            <div
              role="alertdialog"
              aria-label="Xác nhận nộp Quiz"
              className="space-y-3 rounded-lg border border-amber-400 p-4"
            >
              <p>
                Còn {unanswered} câu chưa trả lời. Chỉ đáp án đã lưu được chốt; không có lượt làm
                lại.
              </p>
              <button
                className={button}
                disabled={busy || saveState !== 'Đã lưu'}
                onClick={() => void submit()}
              >
                Xác nhận nộp các đáp án đã lưu
              </button>
              <button className={button} onClick={() => setConfirm(false)}>
                Tiếp tục làm
              </button>
            </div>
          )}
        </section>
        <aside className="hidden min-w-0 self-start rounded-xl border bg-slate-50 p-4 lg:block">
          {navigator}
        </aside>
      </div>
      {drawer && (
        <QuizNavigatorDialog close={() => setDrawer(false)}>{navigator}</QuizNavigatorDialog>
      )}
    </main>
  );
}
