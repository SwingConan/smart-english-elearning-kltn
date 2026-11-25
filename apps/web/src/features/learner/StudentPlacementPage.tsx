import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ClipboardCheck, Compass, GraduationCap, History, RefreshCw } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import {
  placementIntegration,
  type Mode,
  type PlacementHistoryEntry,
  type PlacementIntegrationConfig,
} from '@/features/placement/integration-api';

const date = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const modeLabel = (mode?: Mode) =>
  mode === 'FOUR_SKILLS' ? 'TOEIC 4 kỹ năng' : 'TOEIC Listening & Reading';

export function StudentPlacementPage() {
  const { user } = useAuth();
  return <StudentPlacementContent key={user?.id} />;
}

function StudentPlacementContent() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PlacementIntegrationConfig>();
  const [history, setHistory] = useState<PlacementHistoryEntry[]>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const fail = (part: string, message: string) => {
      if (live) setErrors((e) => ({ ...e, [part]: message }));
    };

    void placementIntegration
      .config()
      .then((value) => {
        if (live) {
          setConfig(value);
          setErrors((e) => ({ ...e, config: '' }));
        }
      })
      .catch(() => fail('config', 'Chưa tải được thông tin mở bài kiểm tra đầu vào.'));

    void placementIntegration
      .history()
      .then((value) => {
        if (live) {
          setHistory(value);
          setErrors((e) => ({ ...e, history: '' }));
        }
      })
      .catch(() => fail('history', 'Chưa tải được lịch sử kiểm tra đầu vào của bạn.'));

    return () => {
      live = false;
    };
  }, [tick]);

  const allowedSources = config?.previewEnabled ? (config.sources ?? []) : [];
  const results = (history ?? []).filter((h) => h.resultPath && h.status === 'SUBMITTED');

  const handleStartSource = async (sourceId: string, mode: Mode) => {
    if (startingId) return;
    setStartingId(sourceId);
    setStartError('');
    try {
      const res = await placementIntegration.start({
        mode,
        sourceVersionId: sourceId,
        goalLR: 650,
        ...(mode === 'FOUR_SKILLS' ? { goalSpeaking: 140, goalWriting: 140 } : {}),
        idempotencyKey: crypto.randomUUID(),
      });
      navigate(res.examPath);
    } catch {
      setStartError('Không thể mở bài kiểm tra này lúc này. Vui lòng thử lại sau.');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <main className="workspace-page min-w-0 space-y-5">
      <header className="workspace-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-700">
            Đánh giá năng lực đầu vào TOEIC
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Kiểm tra đầu vào
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Bài kiểm tra đầu vào được phép làm, lịch sử làm bài, kết quả và gợi ý khóa học phù hợp.
          </p>
        </div>
        <button
          className="btn-secondary gap-2 text-sm"
          type="button"
          onClick={() => setTick((t) => t + 1)}
        >
          <RefreshCw size={16} />
          Tải lại
        </button>
      </header>

      {config && !config.fullExamEnabled && (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <strong>Bài kiểm tra đầu vào chính thức chưa mở</strong>
          <span> · Trung tâm sẽ thông báo khi đề thi được phê duyệt và mở cho học viên.</span>
        </p>
      )}

      {errors.config && (
        <p role="alert" className="text-sm text-rose-700">
          {errors.config} Bấm “Tải lại” để thử lại.
        </p>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section
          className="workspace-card min-w-0 space-y-4"
          aria-labelledby="available-placement"
        >
          <h2 id="available-placement" className="flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck size={20} className="text-indigo-600" />
            Bài kiểm tra đầu vào được phép làm
          </h2>

          {startError && (
            <p role="alert" className="text-sm text-rose-700">
              {startError}
            </p>
          )}

          {!config && !errors.config ? (
            <p role="status" className="text-sm text-slate-500">
              Đang tải thông tin bài kiểm tra đầu vào…
            </p>
          ) : allowedSources.length > 0 ? (
            <div className="space-y-3">
              {allowedSources.map((src) => (
                <article
                  key={src.id}
                  className="min-w-0 rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-medium text-indigo-700">{modeLabel(src.mode)}</p>
                  <h3 className="mt-1 break-words font-semibold text-slate-900">{src.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {src.itemCount} câu hỏi · Phiên bản {src.version}
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-3 text-sm"
                    disabled={startingId !== null}
                    onClick={() => void handleStartSource(src.id, src.mode)}
                  >
                    {startingId === src.id ? 'Đang mở bài…' : 'Bắt đầu làm bài'}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                Hiện chưa có bài kiểm tra đầu vào chính thức đang mở.
              </p>
              <p className="mt-1">
                Khi trung tâm phê duyệt và mở đề kiểm tra đầu vào, bài thi sẽ xuất hiện tại đây để bạn tham gia.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
            <span>Các bài kiểm tra thuộc lớp học được quản lý riêng trong không gian lớp LMS.</span>
            <Link
              to="/student/enrollments"
              className="shrink-0 font-semibold text-indigo-700 hover:underline"
            >
              Vào lớp học của tôi
            </Link>
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="workspace-card space-y-3" aria-labelledby="placement-history">
            <h2 id="placement-history" className="flex items-center gap-2 text-lg font-bold">
              <History size={20} className="text-indigo-600" />
              Lịch sử làm bài
            </h2>
            {errors.history ? (
              <p role="alert" className="text-sm text-rose-700">
                {errors.history}
              </p>
            ) : !history ? (
              <p role="status" className="text-sm text-slate-500">
                Đang tải lịch sử…
              </p>
            ) : !history.length ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Bạn chưa có lượt kiểm tra đầu vào nào được ghi nhận.
              </p>
            ) : (
              history.map((h, i) => {
                const resume =
                  config?.workflowEnabled &&
                  h.kind === 'DEV_WORKFLOW' &&
                  h.status &&
                  !['SUBMITTED', 'BLOCKED_REVIEW'].includes(h.status);
                return (
                  <article key={h.attemptId} className="rounded-xl border border-slate-200 p-3">
                    <h3 className="font-semibold text-slate-900">
                      {h.label || `Lần kiểm tra ${history.length - i}`}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {h.status === 'SUBMITTED'
                        ? 'Đã nộp bài'
                        : h.status === 'BLOCKED_REVIEW'
                          ? 'Cần trung tâm kiểm tra'
                          : 'Đã ghi nhận lượt kiểm tra'}
                      {h.mode ? ` · ${modeLabel(h.mode)}` : ''}
                    </p>
                    {h.startedAt && (
                      <p className="mt-1 text-xs text-slate-500">Bắt đầu: {date(h.startedAt)}</p>
                    )}
                    {h.submittedAt && (
                      <p className="mt-1 text-xs text-slate-500">Đã nộp: {date(h.submittedAt)}</p>
                    )}
                    {resume ? (
                      <Link
                        className="mt-2 inline-block text-sm font-semibold text-indigo-700 underline"
                        to={'/placement/sittings/' + h.attemptId}
                      >
                        Tiếp tục bài đang làm
                      </Link>
                    ) : h.resultPath ? (
                      <Link
                        className="mt-2 inline-block text-sm font-semibold text-indigo-700 underline"
                        to={h.resultPath}
                      >
                        Xem trạng thái và kết quả
                      </Link>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        Trung tâm sẽ thông báo khi có kết quả.
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </section>

          <section className="workspace-card space-y-3" aria-labelledby="placement-recommendations">
            <h2 id="placement-recommendations" className="flex items-center gap-2 text-lg font-bold">
              <GraduationCap size={20} className="text-indigo-600" />
              Kết quả và gợi ý khóa học
            </h2>
            {results.length ? (
              <>
                <p className="text-sm text-slate-600">
                  Xem điểm số, nhận xét và khóa học được đề xuất từ các lần kiểm tra đã hoàn thành.
                </p>
                {results.map((h, i) => (
                  <Link
                    className="block text-sm font-semibold text-indigo-700 underline"
                    key={h.attemptId}
                    to={h.resultPath!}
                  >
                    Xem kết quả &amp; gợi ý lần {results.length - i}
                  </Link>
                ))}
              </>
            ) : (
              <p className="text-sm text-slate-600">
                Chưa có kết quả kiểm tra đầu vào để đề xuất khóa học. Sau khi hoàn thành bài kiểm tra chính thức, kết quả và lộ trình học phù hợp sẽ hiển thị tại đây.
              </p>
            )}
            <Link
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 underline"
              to="/catalog"
            >
              <Compass size={15} />
              Xem danh mục khóa học
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
