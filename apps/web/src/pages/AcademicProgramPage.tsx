import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowDown, ArrowUp, BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, Globe, Plus, Trash2 } from 'lucide-react';
import {
  academicApi,
  type AcademicClass,
  type CurriculumModule,
  type Program,
} from '@/features/academic/api';
import { planningApi, type Room } from '@/features/academic/planning-api';
import { useAuth } from '@/features/auth/auth-context';

const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

const SKILL_SCOPE_LABELS: Record<string, string> = {
  LR: 'Nghe & Đọc',
  FOUR_SKILLS: '4 Kỹ năng',
  LISTENING: 'Kỹ năng Nghe',
  READING: 'Kỹ năng Đọc',
  SPEAKING: 'Kỹ năng Nói',
  WRITING: 'Kỹ năng Viết',
};

const MODALITY_LABELS: Record<string, string> = {
  OFFLINE: 'Trực tiếp tại cơ sở',
  ONLINE: 'Trực tuyến',
  HYBRID: 'Kết hợp',
};

const CLASS_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  OPEN: 'Đang mở đăng ký',
  IN_PROGRESS: 'Đang diễn ra',
  COMPLETED: 'Đã kết thúc',
  CANCELLED: 'Đã hủy',
};

export function AcademicProgramPage() {
  const { id } = useParams();
  return <ProgramDetails key={id} id={id!} />;
}

function ProgramDetails({ id }: { id: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program>(),
    [classes, setClasses] = useState<AcademicClass[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [instructors, setInstructors] = useState<{ id: string; fullName: string }[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [activeTab, setActiveTab] = useState<'curriculum' | 'classes'>('curriculum'),
    [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({ 0: true });

  const [form, setForm] = useState({
    title: '',
    description: '',
    level: '',
    skillScope: 'LR',
    defaultDurationWeeks: 12,
    defaultSessionsCount: 24,
    defaultPeriodsPerSession: 3,
  });

  const [curriculum, setCurriculum] = useState<CurriculumModule[]>([]);

  const [cls, setCls] = useState({
    code: '',
    name: '',
    maxStudents: 20,
    modality: 'OFFLINE',
    pricingType: 'PAID',
    tuitionFeeVnd: 1850000,
    classStart: '',
    totalSessions: 24,
    periodsPerSession: 3,
    durationWeeks: 12,
    defaultRoomId: '',
    instructorId: '',
    autoInitSections: true,
    reason: '',
  });

  const syncProgramState = (p: Program) => {
    setProgram(p);
    setForm({
      title: p.title,
      description: p.description,
      level: p.level,
      skillScope: p.skillScope,
      defaultDurationWeeks: p.defaultDurationWeeks ?? 12,
      defaultSessionsCount: p.defaultSessionsCount ?? 24,
      defaultPeriodsPerSession: p.defaultPeriodsPerSession ?? 3,
    });
    setCurriculum(
      (p.modules ?? []).map((m, idx) => ({
        id: m.id,
        title: m.title,
        description: m.description ?? '',
        orderIndex: m.orderIndex ?? idx,
        lessons: (m.lessons ?? []).map((l, lIdx) => ({
          id: l.id,
          title: l.title,
          description: l.description ?? '',
          orderIndex: l.orderIndex ?? lIdx,
          estimatedMinutes: l.estimatedMinutes ?? 45,
        })),
      })),
    );
    setCls((prev) => ({
      ...prev,
      totalSessions: p.defaultSessionsCount ?? prev.totalSessions,
      periodsPerSession: p.defaultPeriodsPerSession ?? prev.periodsPerSession,
      durationWeeks: p.defaultDurationWeeks ?? prev.durationWeeks,
      pricingType: p.defaultPricingType ?? prev.pricingType,
      tuitionFeeVnd: p.defaultTuitionFeeVnd ?? prev.tuitionFeeVnd,
    }));
  };

  useEffect(() => {
    let live = true;
    void Promise.all([
      academicApi.program(id),
      academicApi.classes('?courseId=' + id),
      planningApi.get<{ data: Room[] }>('rooms?limit=100').catch(() => ({ data: [] as Room[] })),
      planningApi.get<{ id: string; fullName: string }[]>('instructors').catch(() => []),
    ])
      .then(([p, c, r, inst]) => {
        if (!live) return;
        syncProgramState(p);
        setClasses(c.data);
        setRooms((r.data ?? []).filter((room) => room.status === 'ACTIVE'));
        setInstructors(Array.isArray(inst) ? inst : []);
      })
      .catch(() => {
        if (live) setError('Không tìm thấy chương trình hoặc bạn không có quyền xem.');
      });
    return () => {
      live = false;
    };
  }, [id]);

  const update = async (e: FormEvent) => {
    e.preventDefault();
    if (!program) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await academicApi.write(
        '/programs/' + id,
        { ...form, reason, expectedUpdatedAt: program.updatedAt },
        'PATCH',
      );
      const p = await academicApi.program(id);
      syncProgramState(p);
      setReason('');
      setNotice('Đã lưu thông tin khóa học.');
    } catch {
      setError(
        'Không thể lưu thông tin. Dữ liệu có thể đã thay đổi, vui lòng tải lại trang và thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async () => {
    if (!program) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await academicApi.publishProgram(id, !program.isPublished);
      syncProgramState(updated);
      setNotice(
        updated.isPublished
          ? 'Đã công bố khóa học trực tiếp lên Catalog công khai.'
          : 'Đã tạm ẩn khóa học khỏi Catalog công khai.',
      );
    } catch {
      setError('Không thể cập nhật trạng thái công bố khóa học.');
    } finally {
      setBusy(false);
    }
  };

  const saveCurriculum = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload: CurriculumModule[] = curriculum
        .filter((m) => m.title.trim().length > 0)
        .map((m, mi) => ({
          ...(m.id ? { id: m.id } : {}),
          title: m.title.trim(),
          description: m.description?.trim() || '',
          orderIndex: mi,
          lessons: (m.lessons ?? [])
            .filter((l) => l.title.trim().length > 0)
            .map((l, li) => ({
              title: l.title.trim(),
              description: l.description?.trim() || '',
              orderIndex: li,
              estimatedMinutes: Number(l.estimatedMinutes) || 45,
            })),
        }));
      const updated = await academicApi.saveCurriculum(id, payload);
      syncProgramState(updated);
      setNotice('Đã lưu khung chương trình chuẩn (Học phần & Bài học) thành công.');
    } catch {
      setError('Không thể lưu khung chương trình (lưu ý không xóa học phần đã có điểm/tiến độ học viên).');
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        courseId: id,
        code: cls.code,
        name: cls.name,
        maxStudents: cls.maxStudents,
        modality: cls.modality,
        pricingType: cls.pricingType,
        tuitionFeeVnd: cls.pricingType === 'FREE' ? 0 : cls.tuitionFeeVnd,
        totalSessions: cls.totalSessions || undefined,
        periodsPerSession: cls.periodsPerSession || undefined,
        durationWeeks: cls.durationWeeks || undefined,
        ...(cls.classStart ? { classStart: new Date(`${cls.classStart}T00:00:00+07:00`).toISOString() } : {}),
        ...(cls.defaultRoomId ? { defaultRoomId: cls.defaultRoomId } : {}),
        ...(cls.instructorId ? { instructorId: cls.instructorId } : {}),
        autoInitSections: cls.autoInitSections,
        reason: cls.reason,
      };
      const c = await academicApi.write<AcademicClass>('/classes', payload);
      navigate('/academic/classes/' + c.id);
    } catch {
      setError('Không thể tạo lớp học. Vui lòng kiểm tra lại mã lớp và thông tin đã nhập.');
    } finally {
      setBusy(false);
    }
  };

  const canManage = user?.role === 'ACADEMIC_MANAGER';

  return (
    <main className="section-shell space-y-6 py-8">
      <div>
        <Link to="/academic" className="text-sm font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline">
          ← Chương trình và lớp
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!program && !error && <p role="status">Đang tải chương trình…</p>}

      {program && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{program.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    program.isPublished
                      ? 'bg-[#e9f2e4] text-[#2f5d1e]'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {program.isPublished ? 'Đã công khai trên Danh mục khóa học' : 'Bản nháp nội bộ'}
                </span>
                <span>
                  {program.level} · {SKILL_SCOPE_LABELS[program.skillScope] ?? program.skillScope}
                </span>
                {program.defaultSessionsCount && (
                  <span>
                    · {program.defaultSessionsCount} buổi · {program.defaultPeriodsPerSession ?? 3} tiết/buổi (45 phút/tiết)
                  </span>
                )}
                <span>· {curriculum.length} học phần</span>
                <span>· {classes.length} lớp học</span>
              </div>
              <Link
                to={'/academic/programs/' + id + '/versions'}
                className="mt-2 inline-block text-xs font-semibold text-indigo-700 hover:underline"
              >
                Xem lịch sử &amp; phiên bản chương trình →
              </Link>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void togglePublish()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    program.isPublished
                      ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      : 'bg-[#76a35e] text-white hover:bg-[#658f4f]'
                  }`}
                >
                  <Globe size={15} aria-hidden="true" />
                  {program.isPublished ? 'Ẩn khỏi Danh mục' : 'Công bố lên Danh mục khóa học'}
                </button>
              </div>
            )}
          </header>

          <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2" aria-label="Điều hướng chương trình">
            <button
              type="button"
              onClick={() => setActiveTab('curriculum')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'curriculum'
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Khung chương trình &amp; Thông tin ({curriculum.length} học phần)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('classes')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === 'classes'
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              Lớp học &amp; Mở lớp mới ({classes.length} lớp)
            </button>
          </nav>

          {activeTab === 'curriculum' && (
            <>
              <details
                open={program.editable}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <summary className="cursor-pointer select-none text-sm font-bold text-slate-800">
                  Thông tin chung &amp; định hướng chương trình{' '}
                  <span className="ml-2 font-normal text-xs text-slate-500">
                    ({program.editable ? 'Đang mở chỉnh sửa bản nháp' : 'Thông tin định danh đã khóa do chương trình đã công bố / có lớp — nhấn để xem'})
                  </span>
                </summary>
                <form
                  className="mt-4 grid gap-4 md:grid-cols-2"
                  onSubmit={(e) => void update(e)}
                >
                  <label>
                    Tên chương trình
                    <input
                      className={control + ' block w-full'}
                      required
                      disabled={!program.editable || busy}
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                  <label>
                    Trình độ
                    <input
                      className={control + ' block w-full'}
                      required
                      disabled={!program.editable || busy}
                      value={form.level}
                      onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                    />
                  </label>
                  <label>
                    Kỹ năng
                    <select
                      className={control + ' block w-full'}
                      disabled={!program.editable || busy}
                      value={form.skillScope}
                      onChange={(e) => setForm((f) => ({ ...f, skillScope: e.target.value }))}
                    >
                      {['LR', 'FOUR_SKILLS', 'LISTENING', 'READING', 'SPEAKING', 'WRITING'].map((s) => (
                        <option key={s} value={s}>
                          {SKILL_SCOPE_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mô tả và định hướng
                    <textarea
                      className={control + ' block w-full'}
                      disabled={!program.editable || busy}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>
                  {program.editable && (
                    <>
                      <label>
                        Lý do thay đổi
                        <textarea
                          className={control + ' block w-full'}
                          required
                          minLength={10}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <div className="flex items-end">
                        <button className={control + ' font-semibold'} disabled={busy}>
                          Lưu chương trình nháp
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </details>

              {/* Khung chương trình chuẩn builder */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                      <BookOpenCheck className="h-5 w-5 text-[#5e9141]" aria-hidden="true" />
                      Khung chương trình chuẩn (Học phần &amp; Bài học)
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Nhấn vào từng học phần để mở hoặc thu gọn danh sách bài học. Khung này dùng để ánh xạ vào Bản đồ lớp và LMS.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {curriculum.length > 0 && (
                      <button
                        type="button"
                        className={control + ' text-xs font-semibold'}
                        onClick={() => {
                          const allOpen = curriculum.every((_, i) => Boolean(expandedModules[i]));
                          const next: Record<number, boolean> = {};
                          curriculum.forEach((_, i) => {
                            next[i] = !allOpen;
                          });
                          setExpandedModules(next);
                        }}
                      >
                        {curriculum.every((_, i) => Boolean(expandedModules[i]))
                          ? 'Thu gọn tất cả'
                          : 'Mở tất cả'}
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          type="button"
                          className={control + ' inline-flex items-center gap-1 font-semibold'}
                          onClick={() => {
                            const newIndex = curriculum.length;
                            setCurriculum((prev) => [
                              ...prev,
                              {
                                title: `Học phần ${prev.length + 1}`,
                                description: '',
                                orderIndex: prev.length,
                                lessons: [{ title: 'Bài 1: Nội dung trọng tâm', estimatedMinutes: 90 }],
                              },
                            ]);
                            setExpandedModules((prev) => ({ ...prev, [newIndex]: true }));
                          }}
                        >
                          <Plus size={14} aria-hidden="true" />
                          Thêm học phần
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveCurriculum()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f4f] disabled:opacity-60"
                        >
                          <CheckCircle2 size={15} aria-hidden="true" />
                          Lưu khung chương trình
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {curriculum.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Chưa có nội dung chuẩn. Hãy nhấn "Thêm học phần" để xây dựng khung bài giảng cho khóa học.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {curriculum.map((mod, mi) => {
                      const isOpen = Boolean(expandedModules[mi]);
                      const lessonCount = mod.lessons?.length ?? 0;
                      const totalMinutes = (mod.lessons ?? []).reduce(
                        (sum, l) => sum + (Number(l.estimatedMinutes) || 45),
                        0,
                      );
                      return (
                        <div key={mod.id ?? `mod-${mi}`} className="rounded-xl border border-slate-200 bg-[#f8f9fa] p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex-1 min-w-[240px] space-y-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  aria-expanded={isOpen}
                                  onClick={() =>
                                    setExpandedModules((prev) => ({ ...prev, [mi]: !isOpen }))
                                  }
                                  className="inline-flex items-center gap-1 rounded bg-[#e9f2e4] px-2 py-1 text-xs font-bold text-[#2f5d1e] hover:bg-[#d7e8ce]"
                                >
                                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  Học phần {mi + 1}
                                </button>
                                <input
                                  className={control + ' flex-1 font-semibold'}
                                  value={mod.title}
                                  placeholder="Tên học phần..."
                                  onChange={(e) =>
                                    setCurriculum((prev) =>
                                      prev.map((item, idx) => (idx === mi ? { ...item, title: e.target.value } : item)),
                                    )
                                  }
                                />
                                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                                  {lessonCount} bài · {totalMinutes} phút
                                </span>
                              </div>
                              {isOpen && (
                                <input
                                  className={control + ' w-full text-xs'}
                                  value={mod.description ?? ''}
                                  placeholder="Mục tiêu / tóm tắt nội dung học phần (tùy chọn)..."
                                  onChange={(e) =>
                                    setCurriculum((prev) =>
                                      prev.map((item, idx) =>
                                        idx === mi ? { ...item, description: e.target.value } : item,
                                      ),
                                    )
                                  }
                                />
                              )}
                            </div>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={mi === 0}
                            aria-label="Đưa học phần lên"
                            className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 disabled:opacity-40"
                            onClick={() =>
                              setCurriculum((prev) => {
                                const next = [...prev];
                                [next[mi - 1], next[mi]] = [next[mi], next[mi - 1]];
                                return next;
                              })
                            }
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={mi === curriculum.length - 1}
                            aria-label="Đưa học phần xuống"
                            className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 disabled:opacity-40"
                            onClick={() =>
                              setCurriculum((prev) => {
                                const next = [...prev];
                                [next[mi], next[mi + 1]] = [next[mi + 1], next[mi]];
                                return next;
                              })
                            }
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label="Xóa học phần"
                            className="rounded border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                            onClick={() =>
                              setCurriculum((prev) => prev.filter((_, idx) => idx !== mi))
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isOpen && (
                      <div className="space-y-2 pl-3 border-l-2 border-[#cde0c2]">
                        {(mod.lessons ?? []).map((lesson, li) => (
                          <div key={lesson.id ?? `les-${mi}-${li}`} className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 w-12">Bài {li + 1}</span>
                            <input
                              className={control + ' flex-1 min-w-[200px]'}
                              value={lesson.title}
                              placeholder="Tên bài học..."
                              onChange={(e) =>
                                setCurriculum((prev) =>
                                  prev.map((mItem, mIdx) =>
                                    mIdx === mi
                                      ? {
                                          ...mItem,
                                          lessons: (mItem.lessons ?? []).map((lItem, lIdx) =>
                                            lIdx === li ? { ...lItem, title: e.target.value } : lItem,
                                          ),
                                        }
                                      : mItem,
                                  ),
                                )
                              }
                            />
                            <input
                              type="number"
                              min={15}
                              max={600}
                              className={control + ' w-24 text-xs'}
                              value={lesson.estimatedMinutes ?? 45}
                              title="Thời lượng (phút)"
                              onChange={(e) =>
                                setCurriculum((prev) =>
                                  prev.map((mItem, mIdx) =>
                                    mIdx === mi
                                      ? {
                                          ...mItem,
                                          lessons: (mItem.lessons ?? []).map((lItem, lIdx) =>
                                            lIdx === li
                                              ? { ...lItem, estimatedMinutes: Number(e.target.value) || 45 }
                                              : lItem,
                                          ),
                                        }
                                      : mItem,
                                  ),
                                )
                              }
                            />
                            <span className="text-xs text-slate-500">phút</span>
                            <button
                              type="button"
                              className="text-xs text-rose-600 hover:underline px-1.5"
                              onClick={() =>
                                setCurriculum((prev) =>
                                  prev.map((mItem, mIdx) =>
                                    mIdx === mi
                                      ? {
                                          ...mItem,
                                          lessons: (mItem.lessons ?? []).filter((_, lIdx) => lIdx !== li),
                                        }
                                      : mItem,
                                  ),
                                )
                              }
                            >
                              Xóa
                            </button>
                          </div>
                        ))}
                        {canManage && (
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#2f5d1e] hover:underline"
                            onClick={() =>
                              setCurriculum((prev) =>
                                prev.map((mItem, mIdx) =>
                                  mIdx === mi
                                    ? {
                                        ...mItem,
                                        lessons: [
                                          ...(mItem.lessons ?? []),
                                          {
                                            title: `Bài ${(mItem.lessons?.length ?? 0) + 1}: `,
                                            estimatedMinutes: 45,
                                          },
                                        ],
                                      }
                                    : mItem,
                                ),
                              )
                            }
                          >
                            + Thêm bài học vào học phần {mi + 1}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'classes' && (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <h2 className="text-xl font-bold text-slate-900">Lớp học trong chương trình ({classes.length})</h2>
                {classes.length > 0 ? (
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Lớp học</th>
                          <th>Hình thức</th>
                          <th>Thời lượng</th>
                          <th>Phòng &amp; Giảng viên</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classes.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <Link className="font-semibold text-[#2f5d1e] hover:underline" to={'/academic/classes/' + c.id}>
                                {c.code} · {c.name}
                              </Link>
                            </td>
                            <td>{MODALITY_LABELS[c.modality] ?? c.modality}</td>
                            <td>{c.totalSessions ?? '—'} buổi · {c.totalPeriods ?? '—'} tiết</td>
                            <td>
                              <div className="text-xs">
                                <div>{c.defaultRoom ? `Phòng ${c.defaultRoom.code}` : 'Chưa gán phòng'}</div>
                                <div className="text-slate-500">{c.instructor?.fullName ?? 'Chưa phân công GV'}</div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  c.status === 'OPEN' || c.status === 'IN_PROGRESS'
                                    ? 'badge-success'
                                    : c.status === 'DRAFT'
                                      ? 'badge-warning'
                                      : 'badge-neutral'
                                }`}
                              >
                                {CLASS_STATUS_LABELS[c.status] ?? c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có lớp thuộc khóa học này.</p>
                )}
              </section>

              {(program.createdById === user?.id || canManage) && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Tạo lớp học mới thuộc khóa này</h2>
                    <p className="text-xs text-slate-600">
                      Sau khi tạo, trang chi tiết lớp sẽ cho phép bạn cấu hình lịch tuần, sinh Bản đồ lộ trình lớp học (45p/tiết) và mở đăng ký ngay.
                    </p>
                  </div>
                  <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => void create(e)}>
                    <label>
                      Mã lớp
                      <input
                        className={control + ' block w-full'}
                        required
                        pattern="[A-Za-z0-9_\-]{2,60}"
                        placeholder="VD: SE-READ-550-247"
                        value={cls.code}
                        onChange={(e) => setCls((f) => ({ ...f, code: e.target.value }))}
                      />
                    </label>
                    <label>
                      Tên lớp
                      <input
                        className={control + ' block w-full'}
                        required
                        placeholder="VD: TOEIC Reading 550+ — Tối 2-4-6"
                        value={cls.name}
                        onChange={(e) => setCls((f) => ({ ...f, name: e.target.value }))}
                      />
                    </label>
                    <label>
                      Sĩ số tối đa
                      <input
                        className={control + ' block w-full'}
                        type="number"
                        min={1}
                        max={1000}
                        required
                        value={cls.maxStudents}
                        onChange={(e) => setCls((f) => ({ ...f, maxStudents: Number(e.target.value) }))}
                      />
                    </label>
                    <label>
                      Hình thức
                      <select
                        className={control + ' block w-full'}
                        value={cls.modality}
                        onChange={(e) => setCls((f) => ({ ...f, modality: e.target.value }))}
                      >
                        {['OFFLINE', 'ONLINE', 'HYBRID'].map((s) => (
                          <option key={s} value={s}>
                            {MODALITY_LABELS[s] ?? s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Ngày khai giảng dự kiến
                      <input
                        type="date"
                        className={control + ' block w-full'}
                        value={cls.classStart}
                        onChange={(e) => setCls((f) => ({ ...f, classStart: e.target.value }))}
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <label>
                        Số buổi
                        <input
                          type="number"
                          min={1}
                          max={500}
                          className={control + ' block w-full'}
                          value={cls.totalSessions}
                          onChange={(e) => setCls((f) => ({ ...f, totalSessions: Number(e.target.value) || 24 }))}
                        />
                      </label>
                      <label>
                        Tiết/buổi
                        <input
                          type="number"
                          min={1}
                          max={12}
                          className={control + ' block w-full'}
                          value={cls.periodsPerSession}
                          onChange={(e) =>
                            setCls((f) => ({ ...f, periodsPerSession: Number(e.target.value) || 3 }))
                          }
                        />
                      </label>
                      <label>
                        Số tuần
                        <input
                          type="number"
                          min={1}
                          max={104}
                          className={control + ' block w-full'}
                          value={cls.durationWeeks}
                          onChange={(e) =>
                            setCls((f) => ({ ...f, durationWeeks: Number(e.target.value) || 12 }))
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Phòng học mặc định
                      <select
                        className={control + ' block w-full'}
                        value={cls.defaultRoomId}
                        onChange={(e) => setCls((f) => ({ ...f, defaultRoomId: e.target.value }))}
                      >
                        <option value="">-- Chưa chọn / Lớp trực tuyến --</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} — {r.name} ({r.capacity} chỗ · {r.location})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Giảng viên phụ trách
                      <select
                        className={control + ' block w-full'}
                        value={cls.instructorId}
                        onChange={(e) => setCls((f) => ({ ...f, instructorId: e.target.value }))}
                      >
                        <option value="">-- Chọn sau --</option>
                        {instructors.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Loại học phí nháp
                      <select
                        className={control + ' block w-full'}
                        value={cls.pricingType}
                        onChange={(e) =>
                          setCls((f) => ({ ...f, pricingType: e.target.value, tuitionFeeVnd: 0 }))
                        }
                      >
                        <option value="FREE">Miễn phí</option>
                        <option value="PAID">Có học phí</option>
                      </select>
                    </label>
                    <label>
                      Học phí nháp (VND)
                      <input
                        className={control + ' block w-full'}
                        type="number"
                        disabled={cls.pricingType === 'FREE'}
                        min={cls.pricingType === 'FREE' ? 0 : 1}
                        max={1000000000}
                        value={cls.tuitionFeeVnd}
                        onChange={(e) =>
                          setCls((f) => ({ ...f, tuitionFeeVnd: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={cls.autoInitSections}
                        onChange={(e) => setCls((f) => ({ ...f, autoInitSections: e.target.checked }))}
                      />
                      Tự động khởi tạo sẵn các Học phần LMS từ khung chương trình cho giảng viên
                    </label>
                    <label className="md:col-span-2">
                      Lý do tạo lớp
                      <textarea
                        className={control + ' block w-full'}
                        required
                        minLength={10}
                        maxLength={500}
                        value={cls.reason}
                        onChange={(e) => setCls((f) => ({ ...f, reason: e.target.value }))}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button className={control + ' bg-[#76a35e] text-white font-semibold border-[#76a35e]'} disabled={busy}>
                        Tạo lớp nháp
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
