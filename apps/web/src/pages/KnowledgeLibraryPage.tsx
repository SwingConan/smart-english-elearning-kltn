import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { button, field } from '@/features/class-lms/api';
import { schoolTimestamp } from '@/features/class-lms/school-time';
import {
  knowledgeGet,
  knowledgeWrite,
  knowledgeReturnTo,
  knowledgeState,
  type Article,
  type Draft,
  type Entry,
  type Recommendation,
  type Revision,
  type Tag,
  type Workspace,
} from '@/features/knowledge/api';
import { workspaceApi, type WorkspaceClass } from '@/features/workspace/api';
const failure =
  'Chưa xác nhận thao tác thành công. Nội dung đang nhập được giữ. Kiểm tra quyền hiện hành, phiên bản và nguồn; thử lại cùng thao tác hoặc tải lại. Không có duyệt/công bố tự động.';
function useWrites() {
  const keys = useRef(new Map<string, string>()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function write<T>(p: string, b: object, method = 'POST') {
    setBusy(true);
    setError('');
    const signature = method + p + JSON.stringify(b);
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    try {
      return await knowledgeWrite<T>(
        p,
        { ...b, idempotencyKey: keys.current.get(signature) },
        method,
      );
    } catch {
      setError(failure);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { write, busy, error };
}
function WorkShell({ children }: { children: ReactNode }) {
  return <main className="section-shell min-w-0 space-y-5 py-6">{children}</main>;
}
export function KnowledgeLibraryPage() {
  const [data, setData] = useState<{
      data: { slug: string; title: string; version: number; objectives: string[]; tags: Tag[] }[];
      meta: { total: number };
      tags: Tag[];
    }>(),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [skill, setSkill] = useState(''),
    [part, setPart] = useState(''),
    [tag, setTag] = useState(''),
    [query, setQuery] = useState(''),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void knowledgeGet<NonNullable<typeof data>>('articles' + (query ? '?' + query : ''))
      .then((x) => {
        if (live) {
          setData(x);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setError('Không thể tải thư viện. Vui lòng kiểm tra phiên đăng nhập và thử lại.');
        }
      });
    return () => {
      live = false;
    };
  }, [query, tick]);
  return (
    <main className="section-shell max-w-6xl space-y-6 py-8">
      <Link to="/my/calendar">← Lịch tháng</Link>
      <h1 className="text-3xl font-bold">Thư viện kiến thức TOEIC</h1>
      <p>
        Bài đã được học vụ kiểm tra và công bố. Bạn có thể học dù chưa ghi danh lớp. Tự kiểm tra
        trong bài không phải Quiz ghi điểm.
      </p>
      <form
        className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(
            new URLSearchParams(
              Object.fromEntries(Object.entries({ search, skill, part, tag }).filter(([, v]) => v)),
            ).toString(),
          );
        }}
      >
        <label>
          Tìm bài / từ đồng nghĩa
          <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          Kỹ năng
          <select aria-label="Kỹ năng" className={field} value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="READING">Reading</option>
            <option value="LISTENING">Listening</option>
          </select>
        </label>
        <label>
          TOEIC Part
          <select aria-label="TOEIC Part" className={field} value={part} onChange={(e) => setPart(e.target.value)}>
            <option value="">Tất cả</option>
            {[1, 2, 3, 4, 5, 6, 7].map((x) => (
              <option key={x} value={x}>
                Part {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chủ điểm
          <select aria-label="Chủ điểm" className={field} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Tất cả</option>
            {data?.tags.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className={button}>Tìm kiến thức</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button className={button} onClick={() => setTick((x) => x + 1)}>
        Tải lại thư viện
      </button>
      {data && <p>{data.meta.total} bài khả dụng</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.data.map((a) => (
          <article key={a.slug} className="space-y-3 rounded-2xl border bg-white p-5">
            <h2 className="text-xl font-bold">
              <Link className="text-indigo-700 underline" to={'/knowledge/articles/' + a.slug}>
                {a.title}
              </Link>
            </h2>
            <p>
              Phiên bản {a.version} · {a.tags.map((t) => t.name + ' / Part ' + t.part).join(' · ')}
            </p>
            <ul className="list-disc pl-5">
              {a.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      {data && !data.data.length && <p>Chưa có bài đã công bố phù hợp. Thử bỏ bớt bộ lọc.</p>}
    </main>
  );
}
export function KnowledgeRecommendations({ returnTo }: { returnTo: string }) {
  const [data, setData] = useState<Recommendation>(),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void knowledgeGet<Recommendation>('recommendations')
      .then((x) => {
        if (live) {
          setData(x);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setError('Chưa thể tải gợi ý kiến thức. Bạn vẫn có thể duyệt thư viện.');
        }
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="space-y-3 rounded-xl border bg-indigo-50 p-5">
      <h2 className="text-xl font-bold">Kiến thức nên ôn</h2>
      <p className="text-sm">
        Chỉ tổng hợp từ Quiz đã công bố, tối thiểu bốn câu có nhãn đã duyệt. Đây không phải đánh giá
        năng lực hay điểm TOEIC.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.state === 'INSUFFICIENT_DATA' && <p>Chưa đủ dữ liệu</p>}
      {data?.recommendations.map((r) => (
        <article key={r.code + r.article.revisionId} className="space-y-2 rounded-lg bg-white p-4">
          <p className="font-semibold">{r.message}</p>
          <Link
            className="text-indigo-700 underline"
            to={
              '/knowledge/articles/' +
              r.article.slug +
              '?returnTo=' +
              encodeURIComponent(knowledgeReturnTo(returnTo))
            }
          >
            {r.article.title} · phiên bản {r.article.version}
          </Link>
        </article>
      ))}
      <Link className="text-indigo-700 underline" to="/knowledge">
        Duyệt thư viện kiến thức
      </Link>
    </section>
  );
}
function SelfCheck({ article }: { article: Article }) {
  const [selected, setSelected] = useState<Record<number, number>>({}),
    [feedback, setFeedback] = useState<Record<number, { correct: boolean; feedback: string }>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<number>();
  async function check(item: number) {
    setBusy(item);
    setError('');
    try {
      const x = await knowledgeWrite<{ correct: boolean; feedback: string }>(
        'articles/' + article.slug + '/self-check',
        { revisionId: article.revisionId, item, option: selected[item] },
      );
      setFeedback((v) => ({ ...v, [item]: x }));
    } catch {
      setFeedback({});
      setError(
        'Bài có thể đã được thu hồi hoặc thay phiên bản. Tải lại bài để kiểm tra; không có điểm nào được ghi.',
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold">Tự kiểm tra — không ghi điểm</h2>
      <p>Bài luyện độc lập với đề Quiz; phản hồi chỉ giúp bạn luyện lại cách nhận diện từ.</p>
      {error && <p role="alert">{error}</p>}
      {article.practice.map((p) => (
        <fieldset key={p.item} className="space-y-3 rounded-xl border p-4">
          <legend className="font-bold">Tự kiểm tra {p.item + 1}</legend>
          <p>{p.prompt}</p>
          {p.options.map((o, i) => (
            <label key={i} className="flex items-start gap-3 rounded-lg border p-3">
              <input
                type="radio"
                name={'practice-' + p.item}
                checked={selected[p.item] === i}
                onChange={() => {
                  setSelected((v) => ({ ...v, [p.item]: i }));
                  setFeedback((v) => {
                    const next = { ...v };
                    delete next[p.item];
                    return next;
                  });
                }}
              />
              <span>{o}</span>
            </label>
          ))}
          <button
            className={button}
            disabled={selected[p.item] === undefined || busy !== undefined}
            onClick={() => void check(p.item)}
          >
            Kiểm tra câu {p.item + 1}
          </button>
          {feedback[p.item] && (
            <div role="status" className="rounded-lg bg-indigo-50 p-3">
              <p className="font-bold">
                {feedback[p.item].correct ? 'Đúng' : 'Chưa đúng — thử phân tích vị trí từ'}
              </p>
              <p>{feedback[p.item].feedback}</p>
            </div>
          )}
        </fieldset>
      ))}
    </section>
  );
}
export function KnowledgeArticlePage() {
  const { slug = '' } = useParams(),
    [params] = useSearchParams(),
    [data, setData] = useState<Article>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    back = knowledgeReturnTo(params.get('returnTo'));
  useEffect(() => {
    let live = true;
    void knowledgeGet<Article>('articles/' + encodeURIComponent(slug))
      .then((x) => {
        if (live) {
          setData(x);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setError(
            'Bài không còn khả dụng hoặc chưa được công bố. Nội dung cũ không được hiển thị.',
          );
        }
      });
    return () => {
      live = false;
    };
  }, [slug, tick]);
  return (
    <main className="section-shell max-w-4xl space-y-6 py-8">
      <Link className="text-indigo-700 underline" to={back}>
        {back === '/knowledge' ? '← Về thư viện' : '← Quay lại hoạt động học'}
      </Link>
      {error && <p role="alert">{error}</p>}
      <button className={button} onClick={() => setTick((x) => x + 1)}>
        Tải lại bài kiến thức
      </button>
      {data && (
        <>
          <header>
            <p>
              {data.tags
                .map((t) => t.name + ' · ' + t.skills.join('/') + ' · Part ' + t.part)
                .join(' / ')}
            </p>
            <h1 className="text-3xl font-bold">{data.title}</h1>
            <p>
              Phiên bản {data.version} · Công bố {schoolTimestamp(data.publishedAt)}
            </p>
          </header>
          <section className="rounded-xl bg-indigo-50 p-5">
            <h2 className="text-xl font-bold">Mục tiêu học</h2>
            <ul className="list-disc pl-5">
              {data.objectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </section>
          <SafeMarkdown markdown={data.bodyMarkdown} />
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">Ví dụ tự biên soạn</h2>
            {data.examples.map((x, i) => (
              <article key={i} className="rounded-xl border bg-white p-4">
                <p lang="en" className="font-semibold">
                  {x.english}
                </p>
                <p>{x.explanation}</p>
              </article>
            ))}
          </section>
          <SelfCheck key={data.revisionId} article={data} />
          <section className="space-y-2 border-t pt-5">
            <h2 className="text-xl font-bold">Nguồn tham khảo</h2>
            <p>
              Nội dung và bài luyện tự biên soạn: {data.attribution}. Liên kết chỉ mở khi bạn chọn;
              không nhúng nội dung bên ngoài.
            </p>
            <ul>
              {data.references.map((x, i) => (
                <li key={i}>
                  <a
                    className="text-indigo-700 underline"
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {x.title} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <Link className={button} to={back}>
            Quay lại hoạt động học
          </Link>
        </>
      )}
    </main>
  );
}
const blankPractice = () => ({ prompt: '', options: ['', '', '', ''], answer: 0, feedback: '' });
const blankDraft = (): Draft => ({
  kind: 'ARTICLE',
  slug: '',
  title: '',
  objectives: [],
  bodyMarkdown: '',
  examples: [{ english: '', explanation: '' }],
  practice: [blankPractice(), blankPractice(), blankPractice()],
  rights: { kind: 'ORIGINAL', owner: '', license: 'ORIGINAL_TEXT', proof: '' },
  references: [],
  skills: ['READING'],
  part: 5,
  synonyms: [],
  tagRevisionIds: [],
  expectedLockVersion: 0,
  expectedPreviousVersion: 0,
});
export function KnowledgeEditorPage() {
  const { revisionId = '' } = useParams(),
    [params] = useSearchParams(),
    entryId = params.get('entry') ?? '',
    next = params.get('next') === '1',
    navigate = useNavigate(),
    [draft, setDraft] = useState<Draft>(blankDraft),
    [ready, setReady] = useState(!revisionId),
    [tags, setTags] = useState<Tag[]>([]),
    [loadError, setLoadError] = useState(''),
    writes = useWrites();
  useEffect(() => {
    let live = true;
    void knowledgeGet<Workspace>('workspace')
      .then((w) => {
        if (live) setTags(w.tags);
      })
      .catch(() => {
        if (live) setLoadError('Chưa có quyền biên soạn thư viện.');
      });
    if (revisionId)
      void knowledgeGet<Revision>('revisions/' + revisionId)
        .then((r) => {
          if (live) {
            setDraft({
              ...r.payload,
              rights: { ...blankDraft().rights, ...r.payload.rights },
              expectedLockVersion: next ? r.entryLockVersion : r.lockVersion,
              expectedPreviousVersion: next ? r.latestNumber : r.number,
            });
            setReady(true);
          }
        })
        .catch(() => {
          if (live) setLoadError('Không thể mở bản nháp trong quyền hiện hành.');
        });
    return () => {
      live = false;
    };
  }, [revisionId, next]);
  function change<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  async function save() {
    const p =
        revisionId && !next
          ? 'revisions/' + revisionId
          : entryId
            ? 'entries/' + entryId + '/revisions'
            : 'entries',
      saved = await writes.write<Revision>(p, draft, revisionId && !next ? 'PUT' : 'POST');
    if (saved) navigate('/knowledge/workspace');
  }
  return (
    <WorkShell>
      <h1 className="text-2xl font-bold">
        {revisionId && !next ? 'Chỉnh bản nháp' : 'Biên soạn phiên bản kiến thức mới'}
      </h1>
      <p>
        Nội dung luôn là nháp học thuật cho đến khi Quản lý Học vụ Học viên kiểm tra và phát hành. Không nhập
        đề thi, media hoặc tài liệu chưa rõ quyền sử dụng.
      </p>
      {(loadError || writes.error) && <p role="alert">{loadError || writes.error}</p>}
      {ready && (
        <form
          className="space-y-5 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Loại nội dung
              <select aria-label="Loại nội dung"
                className={field}
                disabled={!!revisionId}
                value={draft.kind}
                onChange={(e) =>
                  setDraft((d) =>
                    e.target.value === 'TAG'
                      ? {
                          ...d,
                          kind: 'TAG',
                          objectives: [],
                          examples: [],
                          practice: [],
                          bodyMarkdown: '',
                          tagRevisionIds: [],
                        }
                      : { ...blankDraft(), kind: 'ARTICLE' },
                  )
                }
              >
                <option value="ARTICLE">Bài kiến thức</option>
                <option value="TAG">Nhãn kiến thức chuẩn</option>
              </select>
            </label>
            <label>
              Slug ổn định
              <input
                required
                className={field}
                disabled={!!revisionId}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={draft.slug}
                onChange={(e) => change('slug', e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            Tiêu đề
            <input
              required
              className={field}
              maxLength={250}
              value={draft.title}
              onChange={(e) => change('title', e.target.value)}
            />
          </label>
          {draft.kind === 'TAG' ? (
            <>
              <label className="block">
                Mã nhãn chuẩn
                <input
                  required
                  disabled={!!revisionId}
                  pattern="[A-Z][A-Z0-9_]*"
                  className={field}
                  value={draft.tagCode ?? ''}
                  onChange={(e) => change('tagCode', e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  Kỹ năng nhãn
                  <select aria-label="Kỹ năng nhãn"
                    className={field}
                    value={draft.skills[0] ?? ''}
                    onChange={(e) => change('skills', [e.target.value])}
                  >
                    <option value="READING">Reading</option>
                    <option value="LISTENING">Listening</option>
                  </select>
                </label>
                <label>
                  TOEIC Part nhãn
                  <input
                    required
                    type="number"
                    min={1}
                    max={7}
                    className={field}
                    value={draft.part ?? ''}
                    onChange={(e) => change('part', Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="block">
                Từ đồng nghĩa, cách nhau dấu chấm phẩy
                <input
                  className={field}
                  value={draft.synonyms.join('; ')}
                  onChange={(e) => change('synonyms', e.target.value.split(';'))}
                />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                Mục tiêu học, mỗi dòng một mục
                <textarea
                  className={field}
                  value={draft.objectives.join('\n')}
                  onChange={(e) => change('objectives', e.target.value.split('\n'))}
                />
              </label>
              <fieldset className="space-y-2">
                <legend>Nhãn đã công bố</legend>
                {tags.map((t) => (
                  <label key={t.revisionId} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draft.tagRevisionIds.includes(t.revisionId)}
                      onChange={(e) =>
                        change(
                          'tagRevisionIds',
                          e.target.checked
                            ? [...draft.tagRevisionIds, t.revisionId]
                            : draft.tagRevisionIds.filter((x) => x !== t.revisionId),
                        )
                      }
                    />
                    {t.name} · {t.code} · v{t.version} · Part {t.part}
                  </label>
                ))}
                {!tags.length && <p>Cần biên soạn và học vụ công bố nhãn trước khi đề xuất bài.</p>}
              </fieldset>
              <label className="block">
                Nội dung bài (Markdown an toàn)
                <textarea
                  rows={16}
                  className={field}
                  value={draft.bodyMarkdown}
                  onChange={(e) => change('bodyMarkdown', e.target.value)}
                />
              </label>
              <details>
                <summary>Xem trước văn bản an toàn</summary>
                <SafeMarkdown markdown={draft.bodyMarkdown} />
              </details>
              <h2 className="text-xl font-bold">Ví dụ tự biên soạn</h2>
              {draft.examples.map((x, i) => (
                <fieldset key={i} className="space-y-3 rounded-lg border p-3">
                  <legend>Ví dụ {i + 1}</legend>
                  <label className="block">
                    Tiếng Anh ví dụ {i + 1}
                    <input
                      className={field}
                      value={x.english}
                      onChange={(e) =>
                        change(
                          'examples',
                          draft.examples.map((v, j) =>
                            i === j ? { ...v, english: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    Giải thích ví dụ {i + 1}
                    <textarea
                      className={field}
                      value={x.explanation}
                      onChange={(e) =>
                        change(
                          'examples',
                          draft.examples.map((v, j) =>
                            i === j ? { ...v, explanation: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                </fieldset>
              ))}
              <button
                type="button"
                className={button}
                onClick={() =>
                  change('examples', [...draft.examples, { english: '', explanation: '' }])
                }
              >
                Thêm ví dụ
              </button>
              <h2 className="text-xl font-bold">Bài luyện tự kiểm tra độc lập</h2>
              {draft.practice.map((x, i) => (
                <fieldset key={i} className="space-y-3 rounded-lg border p-3">
                  <legend>Bài luyện {i + 1}</legend>
                  <label className="block">
                    Câu luyện {i + 1}
                    <textarea
                      className={field}
                      value={x.prompt}
                      onChange={(e) =>
                        change(
                          'practice',
                          draft.practice.map((v, j) =>
                            i === j ? { ...v, prompt: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  {x.options.map((o, j) => (
                    <label key={j} className="block">
                      Phương án luyện {i + 1}.{j + 1}
                      <input
                        className={field}
                        value={o}
                        onChange={(e) =>
                          change(
                            'practice',
                            draft.practice.map((v, k) =>
                              k === i
                                ? {
                                    ...v,
                                    options: v.options.map((a, l) =>
                                      l === j ? e.target.value : a,
                                    ),
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <label className="block">
                    Đáp án luyện {i + 1}
                    <select aria-label={`Đáp án luyện ${i + 1}`}
                      className={field}
                      value={x.answer}
                      onChange={(e) =>
                        change(
                          'practice',
                          draft.practice.map((v, j) =>
                            i === j ? { ...v, answer: Number(e.target.value) } : v,
                          ),
                        )
                      }
                    >
                      {x.options.map((_, j) => (
                        <option key={j} value={j}>
                          Phương án {j + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Phản hồi luyện {i + 1}
                    <textarea
                      className={field}
                      value={x.feedback}
                      onChange={(e) =>
                        change(
                          'practice',
                          draft.practice.map((v, j) =>
                            i === j ? { ...v, feedback: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                </fieldset>
              ))}
              <button
                type="button"
                className={button}
                onClick={() => change('practice', [...draft.practice, blankPractice()])}
              >
                Thêm bài luyện
              </button>
              <section className="space-y-3 rounded-xl bg-amber-50 p-4">
                <h2 className="font-bold">Nguồn và quyền sử dụng — nội bộ học vụ</h2>
                <label className="block">
                  Loại nguồn
                  <select aria-label="Loại nguồn"
                    className={field}
                    value={draft.rights.kind}
                    onChange={(e) =>
                      change('rights', {
                        ...draft.rights,
                        kind: e.target.value as 'ORIGINAL' | 'LICENSED',
                        license: e.target.value === 'ORIGINAL' ? 'ORIGINAL_TEXT' : 'PERMISSION',
                      })
                    }
                  >
                    <option value="ORIGINAL">Tự biên soạn</option>
                    <option value="LICENSED">Đã có quyền sử dụng rõ ràng</option>
                  </select>
                </label>
                <label className="block">
                  Tác giả / chủ sở hữu
                  <input
                    className={field}
                    value={draft.rights.owner}
                    onChange={(e) => change('rights', { ...draft.rights, owner: e.target.value })}
                  />
                </label>
                <label className="block">
                  Căn cứ quyền sử dụng
                  <select aria-label="Căn cứ quyền sử dụng"
                    className={field}
                    value={draft.rights.license}
                    onChange={(e) => change('rights', { ...draft.rights, license: e.target.value })}
                  >
                    <option value="ORIGINAL_TEXT">Văn bản và ví dụ tự biên soạn</option>
                    <option value="PERMISSION">Văn bản cho phép</option>
                    <option value="CC_BY">CC BY có ghi nguồn</option>
                    <option value="CC0">CC0</option>
                  </select>
                </label>
                <label className="block">
                  Bằng chứng / tuyên bố quyền, nội bộ
                  <textarea
                    className={field}
                    value={draft.rights.proof}
                    onChange={(e) => change('rights', { ...draft.rights, proof: e.target.value })}
                  />
                </label>
              </section>
              <h2 className="text-xl font-bold">Liên kết tham khảo</h2>
              {draft.references.map((x, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-2">
                  <label>
                    Tên nguồn {i + 1}
                    <input
                      className={field}
                      value={x.title}
                      onChange={(e) =>
                        change(
                          'references',
                          draft.references.map((v, j) =>
                            j === i ? { ...v, title: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    URL nguồn {i + 1}
                    <input
                      type="url"
                      className={field}
                      value={x.url}
                      onChange={(e) =>
                        change(
                          'references',
                          draft.references.map((v, j) =>
                            j === i ? { ...v, url: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                className={button}
                onClick={() => change('references', [...draft.references, { title: '', url: '' }])}
              >
                Thêm nguồn tham khảo
              </button>
            </>
          )}
          <div>
            <button className={button} disabled={writes.busy || !!loadError}>
              Lưu nháp kiến thức
            </button>
          </div>
        </form>
      )}
    </WorkShell>
  );
}
export function KnowledgeWorkspacePage() {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [searchQuery, setSearchQuery] = useState(''),
    [kindFilter, setKindFilter] = useState<'ALL' | 'ARTICLE' | 'TAG'>('ALL'),
    [visFilter, setVisFilter] = useState<'ALL' | 'LIVE' | 'UNPUBLISHED' | 'WITHDRAWN'>('ALL'),
    [selectedEntryId, setSelectedEntryId] = useState<string | null>(null),
    writes = useWrites();
  useEffect(() => {
    let live = true;
    void knowledgeGet<Workspace>('workspace')
      .then((x) => {
        if (live) {
          setData(x);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setError('Bạn chưa có quyền mở trang biên soạn hoặc quyền đã hết hiệu lực.');
        }
      });
    return () => {
      live = false;
    };
  }, [tick]);
  async function act(path: string, lockVersion: number) {
    if (
      await writes.write(path, {
        expectedLockVersion: lockVersion,
        reason,
        rightsConfirmed: confirmed,
      })
    )
      setTick((x) => x + 1);
  }
  return (
    <WorkShell>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
            Thư viện kiến thức TOEIC
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kho bài viết &amp; nhãn kiến thức chuẩn được gắn tự động vào Lộ trình tự ôn sau Kiểm tra đầu vào và Lộ trình lớp học.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.capabilities.author && (
            <Link className="btn-primary px-3.5 py-2 text-xs" to="/knowledge/editor">
              Tạo bài hoặc nhãn kiến thức
            </Link>
          )}
          <button
            type="button"
            className="btn-secondary px-3.5 py-2 text-xs"
            onClick={() => setTick((x) => x + 1)}
          >
            Làm mới
          </button>
        </div>
      </header>

      {(error || writes.error) && <p role="alert">{error || writes.error}</p>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-xs font-medium text-slate-500">Tổng bài viết &amp; nhãn chuẩn</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{data.entries.length}</p>
            <p className="text-[11px] text-slate-500">
              {data.entries.filter((e) => e.kind === 'ARTICLE').length} bài kiến thức ·{' '}
              {data.entries.filter((e) => e.kind === 'TAG').length} nhãn chuẩn
            </p>
          </div>
          <div className="rounded-xl border border-[#76a35e]/40 bg-[#f7faf5] p-3.5">
            <p className="text-xs font-medium text-[#2f5d1e]">Đang hiển thị cho học viên</p>
            <p className="mt-1 text-xl font-bold text-[#2f5d1e]">
              {data.entries.filter((e) => e.visibility === 'LIVE').length}/{data.entries.length}
            </p>
            <p className="text-[11px] text-slate-600">
              Liên kết trực tiếp với gợi ý ôn tập sau Kiểm tra đầu vào
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="text-xs font-medium text-slate-500">Chờ kiểm duyệt / Xuất bản</p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {data.entries.filter((e) => e.revisions[0]?.state === 'SUBMITTED' || e.revisions[0]?.state === 'REVIEWED').length}
            </p>
            <p className="text-[11px] text-slate-500">
              {data.capabilities.author
                ? 'Quyền Học vụ: Tự biên soạn, kiểm duyệt & xuất bản kiến thức TOEIC'
                : data.capabilities.review || data.capabilities.publish
                  ? 'Quyền Học vụ: Kiểm duyệt & xuất bản phiên bản kiến thức'
                  : 'Chế độ chỉ xem'}
            </p>
          </div>
        </div>
      )}

      {data && !Object.values(data.capabilities).some(Boolean) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Chế độ chỉ xem:</span>{' '}
          <span className="text-slate-600">
            Bạn chưa được cấp quyền biên soạn hoặc duyệt bài. Liên hệ Phòng Học vụ nếu cần mở quyền biên soạn.
          </span>
        </div>
      )}

      {data && Object.values(data.capabilities).some(Boolean) && (
        <details className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs">
          <summary className="cursor-pointer font-bold text-amber-900">
            Cài đặt lý do &amp; xác nhận duyệt chung ({reason.trim().length}/10+ ký tự)
          </summary>
          <div className="mt-2.5 space-y-2">
            <textarea
              className={field}
              value={reason}
              maxLength={500}
              placeholder="VD: Kiểm tra nội dung học thuật chính xác, phê duyệt hiển thị cho học viên."
              onChange={(e) => setReason(e.target.value)}
            />
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Tôi đã đối chiếu độ chính xác học thuật, nguồn và quyền sử dụng của phiên bản này.
            </label>
          </div>
        </details>
      )}

      {data && (() => {
        const filteredEntries = data.entries.filter((e) => {
          if (kindFilter !== 'ALL' && e.kind !== kindFilter) return false;
          if (visFilter === 'LIVE' && e.visibility !== 'LIVE') return false;
          if (visFilter === 'WITHDRAWN' && e.visibility !== 'WITHDRAWN') return false;
          if (visFilter === 'UNPUBLISHED' && (e.visibility === 'LIVE' || e.visibility === 'WITHDRAWN')) return false;
          const q = searchQuery.trim().toLowerCase();
          if (!q) return true;
          return `${e.revisions[0]?.payload.title ?? ''} ${e.slug} ${e.tagCode ?? ''}`.toLowerCase().includes(q);
        });
        const selectedEntry = selectedEntryId ? data.entries.find((e) => e.id === selectedEntryId) : undefined;
        return (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Tìm tiêu đề, mã nhãn…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#5f8b48] focus:outline-none"
                />
                <select
                  aria-label="Lọc loại"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as 'ALL' | 'ARTICLE' | 'TAG')}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="ALL">Tất cả loại ({data.entries.length})</option>
                  <option value="ARTICLE">Bài kiến thức</option>
                  <option value="TAG">Nhãn chuẩn</option>
                </select>
                <select
                  aria-label="Lọc trạng thái"
                  value={visFilter}
                  onChange={(e) =>
                    setVisFilter(e.target.value as 'ALL' | 'LIVE' | 'UNPUBLISHED' | 'WITHDRAWN')
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="LIVE">Đang hiển thị</option>
                  <option value="UNPUBLISHED">Chưa công bố</option>
                  <option value="WITHDRAWN">Đã thu hồi</option>
                </select>
              </div>
              <span className="text-xs text-slate-500">
                Đang hiển thị: <strong>{filteredEntries.length}</strong>/{data.entries.length} mục
              </span>
            </div>

            {filteredEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                Không có mục nào khớp bộ lọc hiện tại.
              </p>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tiêu đề &amp; Định danh</th>
                      <th>Phân loại</th>
                      <th>Phiên bản mới nhất</th>
                      <th>Hiển thị</th>
                      <th className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredEntries.map((e) => {
                      const latest = e.revisions[0];
                      return (
                        <tr key={e.id} className="align-middle hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {latest?.payload.title ?? e.slug}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {e.tagCode ?? e.slug}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            {e.kind === 'TAG' ? 'Nhãn chuẩn' : 'Bài kiến thức'}
                          </td>
                          <td className="px-4 py-3">
                            {latest ? (
                              <div>
                                <span className="font-semibold text-slate-800">
                                  Phiên bản {latest.number} · {knowledgeState[latest.state]}
                                </span>
                                <p className="text-[11px] text-slate-500">
                                  {latest.publishedAt
                                    ? 'Công bố ' + schoolTimestamp(latest.publishedAt)
                                    : latest.reviewedAt
                                      ? 'Duyệt ' + schoolTimestamp(latest.reviewedAt)
                                      : 'Chưa duyệt'}
                                </p>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={
                                e.visibility === 'LIVE'
                                  ? 'badge-published'
                                  : e.visibility === 'WITHDRAWN'
                                    ? 'badge-rejected'
                                    : 'badge-pending'
                              }
                            >
                              {e.visibility === 'LIVE'
                                ? 'Đang hiển thị'
                                : e.visibility === 'WITHDRAWN'
                                  ? 'Đã thu hồi'
                                  : 'Chưa công bố'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => setSelectedEntryId(e.id)}
                              >
                                Xem &amp; Xử lý
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedEntry && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={selectedEntry.revisions[0]?.payload.title ?? selectedEntry.slug}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
                onClick={() => setSelectedEntryId(null)}
              >
                <div
                  className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-1 shadow-xl"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 pt-4 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Chi tiết &amp; Xử lý kiến thức
                    </span>
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setSelectedEntryId(null)}
                    >
                      Đóng
                    </button>
                  </div>
                  {Object.values(data.capabilities).some(Boolean) && (
                    <div className="mx-5 mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
                      <label className="block font-semibold text-amber-950">
                        Lý do chuyển trạng thái ({reason.trim().length}/10+ ký tự)
                        <input
                          type="text"
                          className={field + ' mt-1 bg-white text-xs'}
                          value={reason}
                          maxLength={500}
                          placeholder="Nhập tối thiểu 10 ký tự để mở khóa nút duyệt / thu hồi"
                          onChange={(ev) => setReason(ev.target.value)}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(ev) => setConfirmed(ev.target.checked)}
                        />
                        Đã đối chiếu độ chính xác học thuật &amp; quyền sử dụng
                      </label>
                    </div>
                  )}
                  <EntryCard
                    entry={selectedEntry}
                    capabilities={data.capabilities}
                    busy={writes.busy || reason.trim().length < 10}
                    confirmed={confirmed}
                    act={act}
                  />
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {data?.capabilities.author && (
        <KnowledgeMappingForm data={data} reload={() => setTick((x) => x + 1)} />
      )}

      {data && (data.links.length > 0 || data.capabilities.author) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              Liên kết nguồn Quiz chờ kiểm duyệt ({data.links.length})
            </h2>
          </div>
          {data.links.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Chưa có liên kết nguồn Quiz nào đang chờ kiểm duyệt.
            </p>
          )}
      {data.links.map((l) => (
        <article key={l.id} className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="font-bold">
            {l.quizTitle} · v{l.quizVersion} → {l.tag} → {l.article}
          </h3>
          <p>{l.prompt}</p>
          <p>
            {knowledgeState[l.state]} · {l.reason}
          </p>
          <div className="flex flex-wrap gap-3">
            {data.capabilities.author && ['DRAFT', 'REJECTED'].includes(l.state) && (
              <button
                className={button}
                disabled={writes.busy || reason.trim().length < 10}
                onClick={() => void act('links/' + l.id + '/submit', l.lockVersion)}
              >
                Đề xuất liên kết
              </button>
            )}
            {l.state === 'SUBMITTED' && l.canReview && (
              <button
                className={button}
                disabled={writes.busy || !confirmed || reason.trim().length < 10}
                onClick={() => void act('links/' + l.id + '/review', l.lockVersion)}
              >
                Duyệt nhãn câu hỏi
              </button>
            )}
            {l.state === 'REVIEWED' && l.canPublish && (
              <button
                className={button}
                disabled={writes.busy || reason.trim().length < 10}
                onClick={() => void act('links/' + l.id + '/publish', l.lockVersion)}
              >
                Công bố liên kết ôn tập
              </button>
            )}
            {l.state === 'PUBLISHED' && l.canPublish && (
              <button
                className={button}
                disabled={writes.busy || reason.trim().length < 10}
                onClick={() => void act('links/' + l.id + '/withdraw', l.lockVersion)}
              >
                Thu hồi liên kết
              </button>
            )}
          </div>
        </article>
      ))}
        </section>
      )}
    </WorkShell>
  );
}
function EntryCard({
  entry: e,
  capabilities: c,
  busy,
  confirmed,
  act,
}: {
  entry: Entry;
  capabilities: Workspace['capabilities'];
  busy: boolean;
  confirmed: boolean;
  act: (path: string, v: number) => Promise<void>;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5">
      <header>
        <h2 className="text-xl font-bold">{e.revisions[0]?.payload.title ?? e.slug}</h2>
        <p>
          {e.kind === 'TAG' ? 'Nhãn chuẩn' : 'Bài kiến thức'} · {e.tagCode ?? e.slug} ·{' '}
          {e.visibility === 'LIVE'
            ? 'Đang hiển thị'
            : e.visibility === 'WITHDRAWN'
              ? 'Đã thu hồi'
              : 'Chưa công bố'}
        </p>
        {c.publish && e.visibility === 'LIVE' && (
          <button
            className={button}
            disabled={busy}
            onClick={() => void act('entries/' + e.id + '/withdraw', e.lockVersion)}
          >
            Thu hồi bài / nhãn
          </button>
        )}
      </header>
      {e.revisions.map((r, i) => (
        <article key={r.id} className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              Phiên bản {r.number} · {knowledgeState[r.state]}
            </h3>
            <span className="text-xs text-slate-500">
              {r.publishedAt
                ? 'Công bố ' + schoolTimestamp(r.publishedAt)
                : r.reviewedAt
                  ? 'Duyệt ' + schoolTimestamp(r.reviewedAt)
                  : 'Chưa duyệt'}
            </span>
          </div>
          {r.reviewReason && !/^Wave 0\d/i.test(r.reviewReason) && (
            <p className="text-xs text-slate-600">Nhận xét: {r.reviewReason}</p>
          )}
          {r.payload.objectives.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
              <p className="font-bold text-slate-800">Mục tiêu học:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                {r.payload.objectives.map((o, j) => (
                  <li key={j}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {r.payload.bodyMarkdown && (
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-sm">
              <SafeMarkdown markdown={r.payload.bodyMarkdown} />
            </div>
          )}
          {r.payload.examples.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs">
              <p className="font-bold text-slate-800">Ví dụ minh họa ({r.payload.examples.length}):</p>
              {r.payload.examples.map((x, j) => (
                <p key={j} className="text-slate-700">
                  <strong className="text-slate-900">{x.english}</strong> — {x.explanation}
                </p>
              ))}
            </div>
          )}
          {r.payload.practice.length > 0 && (
            <details className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-[#2f5d1e]">
                Câu hỏi tự kiểm tra ({r.payload.practice.length} câu) &amp; Nguồn bản quyền
              </summary>
              <div className="mt-2 space-y-1.5 text-slate-700">
                {r.payload.practice.map((x, j) => (
                  <p key={j}>
                    <strong>Câu {j + 1}:</strong> {x.prompt} · Đáp án: {x.options[x.answer]} ·{' '}
                    {x.feedback}
                  </p>
                ))}
                <p className="pt-1 text-slate-500">
                  Nguồn sở hữu: {r.payload.rights?.owner} · {r.payload.rights?.license}
                  {r.tags.length > 0 ? ` · Nhãn: ${r.tags.map((t) => t.code + ' v' + t.version).join(', ')}` : ''}
                </p>
              </div>
            </details>
          )}
          <div className="flex flex-wrap gap-3">
            {c.author && ['DRAFT', 'REJECTED'].includes(r.state) && (
              <>
                <Link className={button} to={'/knowledge/editor/' + r.id}>
                  Sửa nháp kiến thức
                </Link>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void act('revisions/' + r.id + '/submit', r.lockVersion)}
                >
                  Đề nghị học vụ duyệt
                </button>
              </>
            )}
            {c.author && i === 0 && r.state === 'PUBLISHED' && (
              <Link className={button} to={'/knowledge/editor/' + r.id + '?next=1&entry=' + e.id}>
                Tạo phiên bản kiến thức mới
              </Link>
            )}
            {r.state === 'SUBMITTED' && r.canReview && (
              <>
                <button
                  className={button}
                  disabled={busy || !confirmed}
                  onClick={() => void act('revisions/' + r.id + '/review', r.lockVersion)}
                >
                  Duyệt học thuật và nguồn
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void act('revisions/' + r.id + '/reject', r.lockVersion)}
                >
                  Yêu cầu sửa bản nháp
                </button>
              </>
            )}
            {r.state === 'REVIEWED' && r.canPublish && (
              <button
                className={button}
                disabled={busy}
                onClick={() => void act('revisions/' + r.id + '/publish', r.lockVersion)}
              >
                Công bố phiên bản kiến thức
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
function KnowledgeMappingForm({ data, reload }: { data: Workspace; reload: () => void }) {
  const [classes, setClasses] = useState<WorkspaceClass[]>([]),
    [classId, setClassId] = useState(''),
    [sources, setSources] = useState<
      {
        id: string;
        title: string;
        quizVersion: number;
        testQuestions: { id: string; question: { content: string } }[];
      }[]
    >([]),
    [selected, setSelected] = useState<string[]>([]),
    [articleId, setArticleId] = useState(''),
    [tagId, setTagId] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    writes = useWrites();
  useEffect(() => {
    void workspaceApi
      .classes()
      .then((x) => setClasses(x.data))
      .catch(() => setError('Không thể tải các lớp đang được phân công.'));
  }, []);
  useEffect(() => {
    if (!classId) return;
    let live = true;
    void knowledgeGet<typeof sources>('quiz-sources/' + classId)
      .then((x) => {
        if (live) {
          setSources(x);
          setSelected([]);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setSources([]);
          setError('Nguồn không thuộc quyền giảng viên hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [classId]);
  const articles = data.entries.filter(
      (e) => e.kind === 'ARTICLE' && e.visibility === 'LIVE' && e.publishedRevisionId,
    ),
    article = articles
      .find((a) => a.publishedRevisionId === articleId)
      ?.revisions.find((r) => r.id === articleId);
  async function create() {
    for (const id of selected) {
      const x = await writes.write('links', {
        testQuestionId: id,
        articleRevisionId: articleId,
        tagRevisionId: tagId,
        reason,
      });
      if (!x) return;
    }
    setSelected([]);
    reload();
  }
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="text-xl font-bold">Đề xuất nhãn ôn tập cho nguồn Quiz đã duyệt</h2>
      <p>
        Chỉ nguồn lớp đang được phân công, bài và nhãn đã công bố. Liên kết ngoài nguồn đóng băng;
        không sửa câu hỏi hay đáp án.
      </p>
      {(error || writes.error) && <p role="alert">{error || writes.error}</p>}
      <label className="block">
        Lớp Quiz
        <select aria-label="Lớp Quiz" className={field} value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Chọn lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Bài kiến thức đã công bố
        <select aria-label="Bài kiến thức đã công bố"
          className={field}
          value={articleId}
          onChange={(e) => {
            setArticleId(e.target.value);
            setTagId('');
          }}
        >
          <option value="">Chọn bài</option>
          {articles.map((a) => (
            <option key={a.id} value={a.publishedRevisionId!}>
              {a.revisions.find((r) => r.id === a.publishedRevisionId)?.payload.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Nhãn nguồn đã duyệt
        <select aria-label="Nhãn nguồn đã duyệt" className={field} value={tagId} onChange={(e) => setTagId(e.target.value)}>
          <option value="">Chọn nhãn</option>
          {article?.tags.map((t) => (
            <option key={t.revisionId} value={t.revisionId}>
              {t.name} · v{t.version}
            </option>
          ))}
        </select>
      </label>
      {sources.map((s) => (
        <fieldset key={s.id} className="space-y-2 rounded-lg border p-3">
          <legend>
            {s.title} · phiên bản {s.quizVersion}
          </legend>
          {s.testQuestions.map((q) => (
            <label key={q.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.includes(q.id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked ? [...v, q.id] : v.filter((x) => x !== q.id),
                  )
                }
              />
              {q.question.content}
            </label>
          ))}
        </fieldset>
      ))}
      <label className="block">
        Lý do gắn nhãn và nguồn gốc
        <textarea className={field} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        className={button}
        disabled={
          writes.busy || !articleId || !tagId || !selected.length || reason.trim().length < 10
        }
        onClick={() => void create()}
      >
        Tạo liên kết nhãn ({selected.length} câu)
      </button>
    </section>
  );
}
