import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Headphones,
  ListChecks,
  Maximize2,
  Send,
  Volume2,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { practiceTestsApi } from '@/features/practice-tests/api';
import type {
  PracticeAttemptGroup,
  PracticeAttemptResponse,
} from '@/features/practice-tests/types';
import { ApiError } from '@/lib/api-client';

const TRANSITION_DELAY_SECONDS = 2;

function formatTimer(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function PracticeTestAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<PracticeAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<'LISTENING' | 'READING'>('LISTENING');
  const [listeningIndex, setListeningIndex] = useState(0);
  const [readingGroupOffset, setReadingGroupOffset] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());

  // Authentic Listening single-play lock state
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [transitionCountdown, setTransitionCountdown] = useState<number | null>(null);
  const [audioBlockedError, setAudioBlockedError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Server-authoritative Reading timer
  const [readingSecondsLeft, setReadingSecondsLeft] = useState(75 * 60);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!attemptId) return;
    const controller = new AbortController();
    setLoading(true);
    void practiceTestsApi
      .getAttempt(attemptId, controller.signal)
      .then((data) => {
        if (data.status === 'SUBMITTED' && data.resultPath) {
          navigate(data.resultPath, { replace: true });
          return;
        }
        setAttempt(data);
        const restored: Record<string, string[]> = {};
        for (const grp of data.groups ?? []) {
          for (const q of grp.questions) {
            restored[q.testQuestionId] = q.selectedOptionIds;
          }
        }
        setAnswers(restored);
        if (data.state) {
          setPhase(data.state.phase);
          setListeningIndex(data.state.listeningGroupIndex);
          setReadingSecondsLeft(data.state.readingRemainingSeconds);
          setMarkedIds(new Set(data.state.markedQuestionIds));
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Không thể tải phiên thi thử.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [attemptId, navigate]);

  const groups = attempt?.groups ?? [];
  const listeningGroups = useMemo(
    () => groups.filter((g) => g.skill === 'LISTENING'),
    [groups],
  );
  const readingGroups = useMemo(
    () => groups.filter((g) => g.skill === 'READING'),
    [groups],
  );

  const activeListeningGroup: PracticeAttemptGroup | undefined =
    listeningGroups[Math.min(listeningIndex, Math.max(0, listeningGroups.length - 1))];
  const activeReadingGroup: PracticeAttemptGroup | undefined = readingGroups[readingGroupOffset];

  const handleSelectOption = useCallback(
    async (testQuestionId: string, optionId: string) => {
      if (!attemptId) return;
      setAnswers((prev) => ({ ...prev, [testQuestionId]: [optionId] }));
      try {
        await practiceTestsApi.saveProgress(attemptId, {
          answers: [{ testQuestionId, selectedOptionIds: [optionId] }],
        });
      } catch {
        // Optimistic state kept; retry on next action or submit
      }
    },
    [attemptId],
  );

  const toggleBookmark = useCallback(
    async (testQuestionId: string) => {
      if (!attemptId) return;
      const next = new Set(markedIds);
      if (next.has(testQuestionId)) next.delete(testQuestionId);
      else next.add(testQuestionId);
      setMarkedIds(next);
      try {
        await practiceTestsApi.saveProgress(attemptId, {
          markedQuestionIds: Array.from(next),
        });
      } catch {
        // Non-blocking
      }
    },
    [attemptId, markedIds],
  );

  const submitFinal = useCallback(async () => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    setConfirmOpen(false);
    setError(null);
    try {
      await practiceTestsApi.submitAttempt(attemptId);
      navigate(`/practice-tests/attempts/${attemptId}/result`, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Không thể nộp bài thi. Vui lòng thử lại.');
      setSubmitting(false);
    }
  }, [attemptId, navigate, submitting]);

  // Strict Listening auto-play sequence
  useEffect(() => {
    if (phase !== 'LISTENING' || !audioStarted || !activeListeningGroup?.audioUrl) return;
    const el = audioRef.current;
    if (!el) return;

    setAudioProgress(0);
    setAudioDuration(0);
    setAudioBlockedError(false);

    const playPromise = el.play();
    if (playPromise) {
      playPromise.catch(() => {
        setAudioBlockedError(true);
      });
    }
  }, [phase, audioStarted, listeningIndex, activeListeningGroup?.audioUrl]);

  // Auto-advance timer after current listening track finishes
  useEffect(() => {
    if (transitionCountdown === null) return;
    if (transitionCountdown <= 0) {
      setTransitionCountdown(null);
      const nextIdx = listeningIndex + 1;
      if (nextIdx >= listeningGroups.length) {
        setPhase('READING');
        setReadingSecondsLeft(75 * 60);
        if (attemptId) {
          void practiceTestsApi
            .saveProgress(attemptId, {
              listeningGroupIndex: listeningGroups.length,
              enterReading: true,
            })
            .then((res) => {
              setReadingSecondsLeft(res.state.readingRemainingSeconds);
            });
        }
      } else {
        setListeningIndex(nextIdx);
        if (attemptId) {
          void practiceTestsApi.saveProgress(attemptId, {
            listeningGroupIndex: nextIdx,
          });
        }
      }
      return;
    }
    const timer = setTimeout(() => {
      setTransitionCountdown((c) => (c === null ? null : c - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [attemptId, listeningGroups.length, listeningIndex, transitionCountdown]);

  // Reading countdown timer (75 minutes)
  useEffect(() => {
    if (phase !== 'READING' || loading || submitting) return;
    const timer = setInterval(() => {
      setReadingSecondsLeft((prev) => {
        if (prev <= 1) {
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            void submitFinal();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, phase, submitFinal, submitting]);

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const grp of groups) {
      for (const q of grp.questions) {
        if ((answers[q.testQuestionId]?.length ?? 0) > 0) count++;
      }
    }
    return count;
  }, [answers, groups]);

  const totalQuestions = useMemo(
    () => groups.reduce((acc, g) => acc + g.questions.length, 0),
    [groups],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-600" role="status">
        Đang chuẩn bị phòng thi mô phỏng TOEIC...
      </div>
    );
  }

  if (error && !attempt) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
          <p className="font-semibold">{error}</p>
          <Link
            to="/practice-tests"
            className="mt-4 inline-block rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-xs"
          >
            Quay lại danh sách đề thi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      {/* Top ETS Exam Control Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              to="/practice-tests"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Thoát
            </Link>
            <div>
              <p className="text-sm font-bold text-slate-900">{attempt?.title}</p>
              <p className="text-xs font-medium text-slate-500">
                {phase === 'LISTENING'
                  ? `Phần Nghe · Part ${activeListeningGroup?.part ?? 1} · Nhóm ${listeningIndex + 1}/${listeningGroups.length}`
                  : `Phần Đọc · Part ${activeReadingGroup?.part ?? 5} · Nhóm ${readingGroupOffset + 1}/${readingGroups.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:inline">
              Đã trả lời: {answeredCount}/{totalQuestions}
            </span>

            {phase === 'LISTENING' ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                <Headphones className="h-4 w-4" aria-hidden="true" />
                Chế độ thi thật (Phát 1 lần)
              </span>
            ) : (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-extrabold tabular-nums ${
                    readingSecondsLeft <= 300
                      ? 'bg-rose-100 text-rose-800'
                      : readingSecondsLeft <= 600
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-indigo-50 text-indigo-900'
                  }`}
                >
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  {formatTimer(readingSecondsLeft)}
                </span>

                <button
                  type="button"
                  onClick={() => setNavigatorOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  Bảng câu hỏi
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#4d7439] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#3f642c] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Nộp bài
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-4xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      {/* MAIN EXAM WORKSPACE */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        {phase === 'LISTENING' && activeListeningGroup && (
          <div className="mx-auto max-w-5xl space-y-5">
            {!audioStarted ? (
              <div className="rounded-3xl border border-[#76a35e]/30 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eef5ea] text-[#4d7439]">
                  <Headphones className="h-7 w-7" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-xl font-extrabold text-slate-900">
                  {listeningIndex === 0
                    ? 'Sẵn sàng bắt đầu Phần Nghe (Listening · Câu 1–100)'
                    : `Tiếp tục Phần Nghe (từ ${activeListeningGroup.title})`}
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Đề thi mô phỏng hoàn toàn quy trình thi thật TOEIC trên máy tính: mỗi đoạn âm thanh
                  chỉ phát tự động <strong>đúng 1 lần</strong>, không dừng, không tua lại và hệ thống
                  sẽ tự chuyển sang câu tiếp theo ngay khi băng dứt.
                </p>
                <button
                  type="button"
                  onClick={() => setAudioStarted(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#4d7439] px-7 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#3f642c]"
                >
                  <Volume2 className="h-5 w-5" aria-hidden="true" />
                  {listeningIndex === 0 ? 'Bắt đầu phát Audio Phần Nghe' : 'Tiếp tục phát Audio'}
                </button>
              </div>
            ) : (
              <>
                {/* Strictly Locked ETS Audio Player Card (NO seek, NO replay, NO pause) */}
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
                  <audio
                    ref={audioRef}
                    src={activeListeningGroup.audioUrl ?? undefined}
                    preload="auto"
                    onTimeUpdate={(e) => setAudioProgress(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                    onEnded={() => setTransitionCountdown(TRANSITION_DELAY_SECONDS)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-[#eef5ea] text-[#4d7439]">
                        <Volume2 className="h-5 w-5 animate-pulse" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {activeListeningGroup.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {transitionCountdown !== null
                            ? `Đã nghe xong — tự động chuyển câu sau ${transitionCountdown}s...`
                            : 'Đang phát tự động (1 lần duy nhất · Không tua/nghe lại)'}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-600">
                      {formatTimer(audioProgress)} /{' '}
                      {audioDuration > 0 ? formatTimer(audioDuration) : '--:--'}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#76a35e] transition-all duration-300"
                      style={{
                        width:
                          audioDuration > 0
                            ? `${Math.min(100, (audioProgress / audioDuration) * 100)}%`
                            : '0%',
                      }}
                    />
                  </div>
                  {audioBlockedError && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span>Trình duyệt tạm chặn tự phát âm thanh. Bấm nút bên phải để phát tiếp.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioBlockedError(false);
                          void audioRef.current?.play();
                        }}
                        className="rounded-lg bg-amber-600 px-3 py-1 font-bold text-white"
                      >
                        Phát tiếp
                      </button>
                    </div>
                  )}
                </section>

                {/* Listening Group Content: Graphic/Photo + Questions */}
                <div
                  className={`grid gap-6 ${
                    activeListeningGroup.images.length > 0 ? 'lg:grid-cols-12' : ''
                  }`}
                >
                  {activeListeningGroup.images.length > 0 && (
                    <div className="space-y-4 lg:col-span-6">
                      {activeListeningGroup.images.map((img) => (
                        <div
                          key={img.id}
                          className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-xs"
                        >
                          <img
                            src={img.url}
                            alt={img.altText}
                            className="mx-auto max-h-[520px] w-full rounded-lg object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setZoomedImage({ url: img.url, alt: img.altText })}
                            className="absolute right-4 bottom-4 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-xs font-semibold text-white opacity-90 hover:bg-slate-900"
                          >
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Phóng to
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className={`space-y-4 ${
                      activeListeningGroup.images.length > 0 ? 'lg:col-span-6' : ''
                    }`}
                  >
                    {activeListeningGroup.instructions && (
                      <p className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600">
                        {activeListeningGroup.instructions}
                      </p>
                    )}
                    {activeListeningGroup.questions.map((q) => (
                      <article
                        key={q.testQuestionId}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-[#4d7439]">
                          Câu {q.questionNumber}
                        </p>
                        <h3 className="mt-1.5 text-sm font-semibold leading-6 text-slate-900 sm:text-base">
                          {q.content}
                        </h3>
                        <div className="mt-3.5 space-y-2">
                          {q.options.map((opt) => {
                            const selected = (answers[q.testQuestionId] ?? []).includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => void handleSelectOption(q.testQuestionId, opt.id)}
                                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                                  selected
                                    ? 'border-[#5e8848] bg-[#eef5ea] font-semibold text-[#2d4a1e]'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span
                                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                                    selected
                                      ? 'border-[#4d7439] bg-[#4d7439] text-white'
                                      : 'border-slate-300 text-slate-600'
                                  }`}
                                >
                                  {opt.label}
                                </span>
                                <span className="leading-6">{opt.content}</span>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {phase === 'READING' && activeReadingGroup && (
          <div className="space-y-5">
            <div
              className={`grid gap-6 ${
                activeReadingGroup.images.length > 0 ? 'lg:grid-cols-12' : 'mx-auto max-w-3xl'
              }`}
            >
              {/* Left Pane: Original PDF Passage Images (Part 6 & Part 7) */}
              {activeReadingGroup.images.length > 0 && (
                <section
                  aria-label="Đoạn văn đề thi TOEIC"
                  className="space-y-4 lg:sticky lg:top-20 lg:col-span-7 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1"
                >
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
                    <p className="mb-3 text-xs font-bold text-slate-500">
                      {activeReadingGroup.instructions}
                    </p>
                    <div className="space-y-4">
                      {activeReadingGroup.images.map((img, i) => (
                        <div key={img.id} className="group relative rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                          {activeReadingGroup.images.length > 1 && (
                            <span className="mb-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">
                              Tài liệu {i + 1} / {activeReadingGroup.images.length}
                            </span>
                          )}
                          <img
                            src={img.url}
                            alt={img.altText}
                            className="w-full rounded-lg object-contain"
                          />
                          <button
                            type="button"
                            onClick={() => setZoomedImage({ url: img.url, alt: img.altText })}
                            className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-lg bg-slate-900/75 px-2.5 py-1 text-xs font-semibold text-white opacity-90 hover:bg-slate-900"
                          >
                            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Phóng to
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Right Pane: Interactive Question Options */}
              <section
                aria-label="Danh sách câu hỏi phần Đọc"
                className={`space-y-4 ${
                  activeReadingGroup.images.length > 0 ? 'lg:col-span-5' : ''
                }`}
              >
                {activeReadingGroup.questions.map((q) => {
                  const marked = markedIds.has(q.testQuestionId);
                  return (
                    <article
                      key={q.testQuestionId}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-extrabold text-indigo-800">
                          Part {activeReadingGroup.part} · Câu {q.questionNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => void toggleBookmark(q.testQuestionId)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            marked
                              ? 'bg-amber-100 text-amber-800'
                              : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                          {marked ? 'Đã đánh dấu' : 'Đánh dấu'}
                        </button>
                      </div>

                      <h3 className="mt-3 text-sm font-semibold leading-6 text-slate-900 sm:text-base">
                        {q.content}
                      </h3>

                      <div className="mt-3.5 space-y-2">
                        {q.options.map((opt) => {
                          const selected = (answers[q.testQuestionId] ?? []).includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => void handleSelectOption(q.testQuestionId, opt.id)}
                              className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                                selected
                                  ? 'border-[#5e8848] bg-[#eef5ea] font-semibold text-[#2d4a1e]'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                                  selected
                                    ? 'border-[#4d7439] bg-[#4d7439] text-white'
                                    : 'border-slate-300 text-slate-600'
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span className="leading-6">{opt.content}</span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <button
                    type="button"
                    disabled={readingGroupOffset <= 0}
                    onClick={() => {
                      setReadingGroupOffset((i) => Math.max(0, i - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Trước
                  </button>

                  {readingGroupOffset < readingGroups.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReadingGroupOffset((i) => Math.min(readingGroups.length - 1, i + 1));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
                    >
                      Tiếp theo
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#4d7439] px-5 py-2 text-sm font-bold text-white hover:bg-[#3f642c]"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Hoàn tất &amp; Nộp bài
                    </button>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Reading Question Navigator Drawer */}
      {phase === 'READING' && navigatorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h2 className="text-base font-bold text-slate-900">Bảng câu hỏi Reading (101–200)</h2>
              <button
                type="button"
                aria-label="Đóng bảng câu hỏi"
                onClick={() => setNavigatorOpen(false)}
                className="rounded-lg border p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-5 gap-2">
                {readingGroups.flatMap((grp, rIdx) =>
                  grp.questions.map((q) => {
                    const isAnswered = (answers[q.testQuestionId]?.length ?? 0) > 0;
                    const isMarked = markedIds.has(q.testQuestionId);
                    const isActive = rIdx === readingGroupOffset;
                    return (
                      <button
                        key={q.testQuestionId}
                        type="button"
                        onClick={() => {
                          setReadingGroupOffset(rIdx);
                          setNavigatorOpen(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`rounded-lg border py-2 text-xs font-bold transition ${
                          isActive
                            ? 'ring-2 ring-indigo-600'
                            : ''
                        } ${
                          isMarked
                            ? 'border-amber-400 bg-amber-50 text-amber-900'
                            : isAnswered
                              ? 'border-[#76a35e] bg-[#eef5ea] text-[#2d4a1e]'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {q.questionNumber}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Xác nhận nộp bài thi?</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Bạn đã trả lời <strong>{answeredCount}/{totalQuestions}</strong> câu hỏi.
                  {answeredCount < totalQuestions && (
                    <> Còn {totalQuestions - answeredCount} câu chưa chọn đáp án.</>
                  )}{' '}
                  Sau khi nộp, bài làm này sẽ trở thành <strong>lịch sử làm bài gần nhất</strong>{' '}
                  của đề thi và mở ngay đáp án kèm giải thích từ Part 5 trở đi.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitFinal()}
                className="rounded-xl bg-[#4d7439] px-5 py-2 text-sm font-bold text-white hover:bg-[#3f642c] disabled:opacity-50"
              >
                {submitting ? 'Đang chấm điểm...' : 'Nộp bài ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Zoom */}
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
