import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  CircleAlert,
  HelpCircle,
  Maximize2,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { practiceTestsApi } from '@/features/practice-tests/api';
import type { PracticeResultGroup, PracticeResultResponse } from '@/features/practice-tests/types';
import { ApiError } from '@/lib/api-client';

type FilterMode = 'ALL' | 'WRONG_OR_SKIPPED' | 'CORRECT';

export function PracticeTestResultPage({ byTestHistory = false }: { byTestHistory?: boolean }) {
  const { testId, attemptId } = useParams<{ testId?: string; attemptId?: string }>();
  const navigate = useNavigate();

  const [result, setResult] = useState<PracticeResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('WRONG_OR_SKIPPED');
  const [partFilter, setPartFilter] = useState<number | 'ALL'>('ALL');
  const [restarting, setRestarting] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const req =
      byTestHistory && testId
        ? practiceTestsApi.getHistoryByTest(testId, controller.signal)
        : attemptId
          ? practiceTestsApi.getResultByAttempt(attemptId, controller.signal)
          : null;
    if (!req) {
      setError('Đường dẫn lịch sử bài làm không hợp lệ.');
      setLoading(false);
      return;
    }
    void req
      .then((data) => {
        setResult(data);
        // If user got 100% score, default to ALL so the page isn't empty under WRONG filter
        const wrongCount = data.summary.totalQuestions - data.summary.correctCount;
        if (wrongCount === 0) setFilterMode('ALL');
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Không thể tải lịch sử làm bài.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [attemptId, byTestHistory, testId]);

  const filteredGroups = useMemo<PracticeResultGroup[]>(() => {
    if (!result) return [];
    return result.groups
      .filter((g) => (partFilter === 'ALL' ? true : g.part === partFilter))
      .map((g) => {
        const filteredQuestions = g.questions.filter((q) => {
          if (filterMode === 'WRONG_OR_SKIPPED') return !q.isCorrect;
          if (filterMode === 'CORRECT') return q.isCorrect;
          return true;
        });
        return { ...g, questions: filteredQuestions };
      })
      .filter((g) => g.questions.length > 0);
  }, [filterMode, partFilter, result]);

  async function handleRetake() {
    if (!result || restarting) return;
    setRestarting(true);
    try {
      const res = await practiceTestsApi.startTest(result.testId, true);
      navigate(`/practice-tests/attempts/${res.attemptId}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Không thể bắt đầu lượt làm mới.');
      setRestarting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500" role="status">
        Đang tải lịch sử bài làm &amp; giải thích chi tiết...
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
          <p className="font-semibold">{error ?? 'Không tìm thấy lịch sử bài làm.'}</p>
          <Link
            to="/practice-tests"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách đề luyện thi
          </Link>
        </div>
      </div>
    );
  }

  const wrongOrSkippedCount = result.summary.totalQuestions - result.summary.correctCount;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Scorecard */}
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              to="/practice-tests"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4d7439] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Danh sách đề luyện thi TOEIC
            </Link>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
              Lịch sử làm bài gần nhất: {result.title}
            </h1>
            {result.submittedAt && (
              <p className="mt-1 text-xs text-slate-500">
                Nộp bài lúc {new Date(result.submittedAt).toLocaleString('vi-VN')}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={restarting}
            onClick={() => void handleRetake()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#4d7439] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#3f642c] disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {restarting ? 'Đang tạo lượt mới...' : 'Làm lại đề này'}
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#4d7439] to-[#76a35e] p-5 text-white">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-white/90">
              <Award className="h-4 w-4" aria-hidden="true" />
              Điểm TOEIC ước lượng
            </p>
            <p className="mt-2 text-3xl font-extrabold">{result.summary.totalScore} / 990</p>
            <p className="mt-1 text-xs text-white/90">
              Đúng {result.summary.correctCount}/{result.summary.totalQuestions} câu
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold text-slate-500">Listening (Nghe)</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {result.summary.listeningScore} / 495
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {result.summary.listeningRaw}/{result.summary.listeningTotal} câu đúng
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold text-slate-500">Reading (Đọc)</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">
              {result.summary.readingScore} / 495
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {result.summary.readingRaw}/{result.summary.readingTotal} câu đúng
            </p>
          </div>

          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-5">
            <p className="text-xs font-semibold text-rose-700">Cần xem giải thích</p>
            <p className="mt-2 text-2xl font-extrabold text-rose-800">{wrongOrSkippedCount} câu</p>
            <p className="mt-1 text-xs text-rose-700/85">Bao gồm câu sai &amp; bỏ trống</p>
          </div>
        </div>

        {/* Per-Part Accuracy Breakdown */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {result.summary.partBreakdown.map((p) => {
            const pct = p.totalCount > 0 ? Math.round((p.correctCount / p.totalCount) * 100) : 0;
            return (
              <button
                key={p.part}
                type="button"
                onClick={() => setPartFilter((cur) => (cur === p.part ? 'ALL' : p.part))}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  partFilter === p.part
                    ? 'border-[#4d7439] bg-[#eef5ea]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-bold text-slate-800">{p.label}</p>
                <p className="mt-1 text-sm font-extrabold text-[#4d7439]">
                  {p.correctCount}/{p.totalCount}
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-[#76a35e]" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </header>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('WRONG_OR_SKIPPED')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              filterMode === 'WRONG_OR_SKIPPED'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Câu sai &amp; bỏ trống ({wrongOrSkippedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              filterMode === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tất cả câu ({result.summary.totalQuestions})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('CORRECT')}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              filterMode === 'CORRECT'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Câu đúng ({result.summary.correctCount})
          </button>
        </div>

        {partFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => setPartFilter('ALL')}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Đang lọc: Part {partFilter} × (Hiện tất cả Part)
          </button>
        )}
      </div>

      {/* Review List */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
          Không có câu hỏi nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">
                    {group.title}
                  </span>
                  {group.instructions && (
                    <p className="mt-1.5 text-xs font-medium text-slate-500">
                      {group.instructions}
                    </p>
                  )}
                </div>
                {group.audioUrl && (
                  <div className="w-full max-w-sm">
                    <audio controls preload="none" src={group.audioUrl} className="h-9 w-full">
                      Trình duyệt không hỗ trợ phát lại âm thanh.
                    </audio>
                  </div>
                )}
              </div>

              <div
                className={`mt-4 grid gap-6 ${
                  group.images.length > 0 ? 'lg:grid-cols-12' : ''
                }`}
              >
                {group.images.length > 0 && (
                  <div className="space-y-3 lg:col-span-6">
                    {group.images.map((img) => (
                      <div key={img.id} className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
                        <img
                          src={img.url}
                          alt={img.altText}
                          className="w-full rounded-lg object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setZoomedImage({ url: img.url, alt: img.altText })}
                          className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900"
                        >
                          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Phóng to
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={`space-y-4 ${group.images.length > 0 ? 'lg:col-span-6' : ''}`}
                >
                  {group.questions.map((q) => (
                    <article
                      key={q.testQuestionId}
                      className={`rounded-xl border p-4 ${
                        q.isCorrect
                          ? 'border-emerald-200 bg-emerald-50/30'
                          : 'border-rose-200 bg-rose-50/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                          Câu {q.questionNumber} · Part {q.part}
                        </span>
                        {q.isCorrect ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Chính xác
                          </span>
                        ) : q.isSkipped ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            Bỏ trống
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Chưa đúng
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                        {q.content}
                      </h3>

                      <ul className="mt-3 space-y-1.5">
                        {q.options.map((opt) => (
                          <li
                            key={opt.id}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                              opt.isCorrect
                                ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-950'
                                : opt.wasSelected
                                  ? 'border-rose-400 bg-rose-50 font-semibold text-rose-950'
                                  : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <span>
                              <strong className="mr-1.5">{opt.label}.</strong>
                              {opt.content}
                            </span>
                            <span className="shrink-0 text-[11px] font-bold">
                              {opt.isCorrect && opt.wasSelected
                                ? 'Đáp án đúng · Bạn chọn'
                                : opt.isCorrect
                                  ? 'Đáp án đúng'
                                  : opt.wasSelected
                                    ? 'Bạn chọn sai'
                                    : ''}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Explanations from Part 5 onward (auto-open for wrong/skipped) */}
                      {q.part >= 5 && q.explanation && (
                        q.isCorrect ? (
                          <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs leading-6 text-slate-700">
                            <summary className="cursor-pointer font-bold text-[#4d7439]">
                              Xem giải thích chi tiết (Part {q.part})
                            </summary>
                            <p className="mt-2 whitespace-pre-wrap">{q.explanation}</p>
                          </details>
                        ) : (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs leading-6 text-amber-950 sm:text-sm">
                            <p className="flex items-center gap-1.5 font-extrabold text-amber-900">
                              <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                              Giải thích tại sao sai &amp; hướng dẫn đáp án đúng
                            </p>
                            <p className="mt-1.5 whitespace-pre-wrap">{q.explanation}</p>
                          </div>
                        )
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {zoomedImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <button
            type="button"
            aria-label="Đóng ảnh phóng to"
            onClick={() => setZoomedImage(null)}
            className="fixed top-4 right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={zoomedImage.url}
            alt={zoomedImage.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] max-w-[95vw] rounded-lg bg-white object-contain p-1 shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
