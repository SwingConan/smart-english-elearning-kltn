import { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Headphones,
  History,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { practiceTestsApi } from '@/features/practice-tests/api';
import type { PracticeTestSummaryItem } from '@/features/practice-tests/types';
import { ApiError } from '@/lib/api-client';

export function PracticeTestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<PracticeTestSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTestId, setBusyTestId] = useState<string | null>(null);
  const [confirmRestartTest, setConfirmRestartTest] = useState<PracticeTestSummaryItem | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void practiceTestsApi
      .listTests(controller.signal)
      .then((res) => {
        setTests(res.tests);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Không thể tải danh sách đề luyện thi TOEIC. Vui lòng thử lại.',
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [user?.id]);

  async function handleStart(test: PracticeTestSummaryItem, restart = false) {
    if (!user) {
      navigate('/login?returnUrl=/practice-tests');
      return;
    }
    if (user.role !== 'STUDENT') {
      setError('Chỉ tài khoản Học viên mới có thể bắt đầu lượt làm bài luyện đề TOEIC.');
      return;
    }
    setBusyTestId(test.id);
    setError(null);
    try {
      const res = await practiceTestsApi.startTest(test.id, restart);
      setConfirmRestartTest(null);
      navigate(`/practice-tests/attempts/${res.attemptId}`);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'Không thể khởi tạo bài làm. Vui lòng thử lại.',
      );
    } finally {
      setBusyTestId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-[#76a35e]/25 bg-gradient-to-br from-[#f5f9f2] via-white to-slate-50 p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e9f2e3] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#3f642c]">
              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
              Mô phỏng thi thật TOEIC Listening &amp; Reading
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Luyện đề TOEIC chuẩn ETS — Bộ 6 Đề Full 200 Câu
            </h1>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Trải nghiệm quy trình thi thật 120 phút: phần <strong>Listening (100 câu)</strong> tự
              động phát đúng 1 lần theo từng đoạn nghe và tự chuyển câu (không tua/nghe lại); phần{' '}
              <strong>Reading (100 câu · 75 phút)</strong> giữ nguyên bố cục hình ảnh đoạn văn gốc
              Part 6–7. Sau khi nộp bài, hệ thống lưu <strong>lịch sử làm bài gần nhất</strong> của
              từng đề kèm giải thích chi tiết các câu sai từ Part 5 trở đi.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-500">Số lượng đề</p>
              <p className="mt-1 text-xl font-extrabold text-[#4d7439]">{tests.length || 6} đề</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-center">
              <p className="text-xs font-semibold text-slate-500">Cấu trúc</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">200 câu</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-center sm:col-span-1">
              <p className="text-xs font-semibold text-slate-500">Thời gian</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">120 phút</p>
            </div>
          </div>
        </div>

        {!user && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            <span>
              Vui lòng đăng nhập bằng tài khoản Học viên để bắt đầu làm đề thi và lưu lịch sử bài
              làm gần nhất.
            </span>
            <Link
              to="/login?returnUrl=/practice-tests"
              className="rounded-xl bg-[#76a35e] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#5e8848]"
            >
              Đăng nhập ngay
            </Link>
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-800"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-2xl border bg-white p-6" />
          ))}
        </div>
      ) : tests.length === 0 ? (
        <div className="mt-8 rounded-2xl border bg-white p-10 text-center text-slate-600">
          Hiện chưa có đề luyện thi TOEIC nào được xuất bản.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => {
            const history = test.latestHistory;
            const inProgress = test.inProgressAttempt;
            const shortLabel = `Đề ${test.testNumber}`;
            const isBusy = busyTestId === test.id;

            return (
              <article
                key={test.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:border-[#76a35e]/50 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-[#eef5ea] px-3 py-1 text-xs font-bold text-[#3f642c]">
                      {shortLabel} · Chuẩn ETS
                    </span>
                    {history ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Đã có lịch sử
                      </span>
                    ) : inProgress ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Đang làm dở
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Chưa làm</span>
                    )}
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-slate-900">{test.title}</h2>
                  {test.description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
                      {test.description}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <Headphones className="h-4 w-4 text-[#5e8848]" aria-hidden="true" />
                      <span>Listening: {test.listeningQuestions} câu</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <BookOpen className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                      <span>Reading: {test.readingQuestions} câu</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>
                        Thời lượng: {test.timeLimitMinutes} phút (Audio phát 1 lần · Reading 75
                        phút)
                      </span>
                    </div>
                  </div>

                  {history && (
                    <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                          <Award className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          Bài làm gần nhất
                        </span>
                        <span className="text-sm font-extrabold text-emerald-800">
                          {history.totalToeicScore ?? '—'} / 990
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-emerald-800/90">
                        Đúng <strong>{history.score}/{history.maxScore}</strong> câu · L:{' '}
                        <strong>{history.listeningScore ?? '—'}</strong> · R:{' '}
                        <strong>{history.readingScore ?? '—'}</strong>
                      </p>
                      {history.submittedAt && (
                        <p className="mt-0.5 text-[11px] text-emerald-700/80">
                          Nộp lúc {new Date(history.submittedAt).toLocaleString('vi-VN')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4">
                  {history && (
                    <Link
                      to={`/practice-tests/${test.id}/history`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4d7439] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#3f642c]"
                    >
                      <History className="h-4 w-4" aria-hidden="true" />
                      Lịch sử làm {shortLabel}
                    </Link>
                  )}

                  {inProgress ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleStart(test, false)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        <PlayCircle className="h-4 w-4" aria-hidden="true" />
                        Tiếp tục làm
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmRestartTest(test)}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Làm lại
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        history ? setConfirmRestartTest(test) : void handleStart(test, false)
                      }
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                        history
                          ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                          : 'bg-[#76a35e] text-white hover:bg-[#5e8848]'
                      }`}
                    >
                      {history ? (
                        <>
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Làm lại {shortLabel}
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4" aria-hidden="true" />
                          {user ? `Làm ${shortLabel} ngay` : 'Đăng nhập để làm đề'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirmRestartTest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="restart-modal-title" className="text-lg font-bold text-slate-900">
              Bắt đầu lượt làm mới — Đề {confirmRestartTest.testNumber}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Bài thi sẽ chạy lại từ <strong>Part 1 (Listening)</strong> theo đúng chuẩn thi thật.
              {confirmRestartTest.latestHistory && (
                <>
                  {' '}
                  Lịch sử <strong>Đề {confirmRestartTest.testNumber}</strong> cũ vẫn được giữ nguyên
                  cho tới khi bạn bấm <strong>Nộp bài</strong> mới (khi nộp sẽ thay thế bằng bài
                  làm mới nhất).
                </>
              )}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRestartTest(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={busyTestId === confirmRestartTest.id}
                onClick={() => void handleStart(confirmRestartTest, true)}
                className="rounded-xl bg-[#4d7439] px-4 py-2 text-sm font-bold text-white hover:bg-[#3f642c] disabled:opacity-50"
              >
                Bắt đầu thi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
