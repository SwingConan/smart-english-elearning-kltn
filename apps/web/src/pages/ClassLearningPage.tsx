import { classCodeLabel, demoText } from '@/features/demo/presentation';
import { learnerClassLabel } from '@/features/enrollments/presentation';
import { AssignmentPanel } from '@/features/class-lms/AssignmentPanel';
import { LocalAttendancePanel } from '@/features/class-lms/LocalAttendancePanel';
import { LocalQuizPanel } from '@/features/class-lms/LocalQuizPanel';
import {
  IuhActivityBadge,
  IuhBreadcrumb,
  IuhCourseIndexLayout,
  activityTypeMicroLabel,
  type CourseIndexSection,
} from '@/features/class-lms/IuhLmsShell';
import {
  CheckCircle2 as IuhCheckIcon,
  ChevronDown as IuhChevronDown,
  ChevronRight as IuhChevronRight,
} from 'lucide-react';
import {
  lmsLocalApi,
  type LocalActivityKind,
  type UnifiedClassResults,
} from '@/features/class-lms/lms-local-api';
import {
  InstructorClassGradebookTab,
  InstructorClassInfoTab,
  InstructorClassProgressTab,
  InstructorClassStudentsTab,
  type ClassroomTab,
} from '@/features/class-lms/InstructorClassTabsPanel';
import { instructorApi } from '@/features/instructor/api';
import type {
  InstructorClassOverview,
  InstructorClassResults,
  InstructorRoster,
} from '@/features/instructor/types';
import { useAuth } from '@/features/auth/auth-context';
import { academicApi, type AcademicClass } from '@/features/academic/api';
import { ClassRoadmapTable } from '@/features/catalog/ClassRoadmapTable';
import { classLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiFetch, apiUrl } from '@/lib/api-client';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import {
  activityState,
  button,
  classLmsApi,
  field,
  type Activity,
  type ClassCard,
  type ClassTree,
  type Section,
} from '@/features/class-lms/api';
import { schoolInput } from '@/features/academic/planning-api';
import { schoolTime } from '@/features/class-lms/month';
import { schoolTimestamp } from '@/features/class-lms/school-time';
import {
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  HelpCircle,
  UserCheck,
  Video,
  Edit3,
  Plus,
  Search,
  X,
} from 'lucide-react';

const failure =
  'Không lưu được: dữ liệu đã đổi hoặc quyền phân công đã hết hiệu lực. Tải lại để kiểm tra; nội dung đang nhập được giữ nguyên.';

export function ClassLearningPage() {
  const { user } = useAuth();
  return <ClassLearningContent key={`${user?.id}:${user?.role}`} />;
}

function ClassLearningContent() {
  const [intent, setIntent] = useSearchParams();
  const location = useLocation();
  const initialTab = intent.get('tab');
  const parsedTab: ClassroomTab =
    initialTab === 'info' ||
    initialTab === 'students' ||
    initialTab === 'grades' ||
    initialTab === 'progress'
      ? initialTab
      : location.pathname.endsWith('/completion')
        ? 'progress'
        : 'course';
  const { classId = '' } = useParams(),
    [tree, setTree] = useState<ClassTree>(),
    [edit, setEdit] = useState(intent.get('edit') === '1'),
    [chooser, setChooser] = useState<string>(),
    [error, setError] = useState(''),
    [title, setTitle] = useState(''),
    [intro, setIntro] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [editSection, setEditSection] = useState<Section>(),
    [editTitle, setEditTitle] = useState(''),
    [editIntro, setEditIntro] = useState(''),
    [confirmDeleteSectionId, setConfirmDeleteSectionId] = useState<string | null>(null),
    [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<string | null>(null),
    [localKinds, setLocalKinds] = useState<
      Record<string, { kind: LocalActivityKind; meta: Record<string, any> }>
    >({}),
    [unified, setUnified] = useState<UnifiedClassResults | null>(null),
    [overview, setOverview] = useState<InstructorClassOverview | null>(null),
    [roster, setRoster] = useState<InstructorRoster | null>(null),
    [results, setResults] = useState<InstructorClassResults | null>(null),
    [studentCard, setStudentCard] = useState<ClassCard | null>(null),
    [academicDetail, setAcademicDetail] = useState<AcademicClass | null>(null),
    [activeTab, setActiveTab] = useState<ClassroomTab>(parsedTab),
    [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  function toggleEditMode(next: boolean) {
    setEdit(next);
    const nextParams = new URLSearchParams(intent);
    if (next) {
      nextParams.set('edit', '1');
    } else {
      nextParams.delete('edit');
      setEditSection(undefined);
      setConfirmDeleteSectionId(null);
      setConfirmDeleteActivityId(null);
    }
    setIntent(nextParams, { replace: true });
  }

  function selectTab(next: ClassroomTab) {
    setActiveTab(next);
    const nextParams = new URLSearchParams(intent);
    if (next === 'course') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', next);
    }
    setIntent(nextParams, { replace: true });
  }

  useEffect(() => {
    let live = true;
    void Promise.all([
      classLmsApi.get<ClassTree>(classId),
      lmsLocalApi
        .getActivityKinds(classId)
        .catch(() => ({ kinds: {} as Record<string, { kind: LocalActivityKind; meta: Record<string, any> }> })),
    ])
      .then(([t, k]) => {
        if (!live) return;
        setTree(t);
        setLocalKinds(k.kinds ?? {});
        setError('');
        if (t.editable) {
          void Promise.all([
            lmsLocalApi.getUnifiedClassResults(classId).catch(() => null),
            instructorApi.classes.overview(classId).catch(() => null),
            instructorApi.classes.learners(classId).catch(() => null),
            instructorApi.classes.results(classId).catch(() => null),
          ]).then(([u, o, r, res]) => {
            if (!live) return;
            setUnified(u);
            setOverview(o);
            setRoster(r);
            setResults(res);
          });
        } else {
          void Promise.all([
            apiFetch<{ data: ClassCard[] }>('/v2/my/classes').catch(() => ({ data: [] as ClassCard[] })),
            academicApi.classroom(classId).catch(() => null),
          ]).then(([res, detail]) => {
            if (!live) return;
            const match = (res.data ?? []).find((c) => c.id === classId) ?? null;
            setStudentCard(match);
            setAcademicDetail(detail);
          });
        }
      })
      .catch(() => {
        if (live) {
          setTree(undefined);
          setError('Không thể mở không gian lớp trong phạm vi hiện tại.');
        }
      });
    return () => {
      live = false;
    };
  }, [classId, tick]);

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setTick((t) => t + 1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.trim() : '';
      setError(msg && !/^HTTP \d{3}$/.test(msg) ? msg : failure);
    } finally {
      setBusy(false);
    }
  }

  async function order(
    items: { id: string; lockVersion?: number }[],
    index: number,
    delta: number,
    path: string,
  ) {
    const next = [...items],
      j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await act(() =>
      classLmsApi.write(classId, path, {
        items: next.map((x) => ({ id: x.id, expectedLockVersion: x.lockVersion })),
      }),
    );
  }

  const indexSections: CourseIndexSection[] = (tree?.sections ?? []).map((sec) => ({
    id: sec.id,
    title: sec.title,
    activities: sec.activities.map((a) => ({
      id: a.id,
      title: a.title,
      type: localKinds[a.id]?.kind ?? a.type,
      completed:
        !tree?.editable && (a.progress === 'COMPLETED' || a.submissionState === 'SUBMITTED'),
    })),
  }));

  const anySectionCollapsed = (tree?.sections ?? []).some((s) => collapsedSections[s.id]);

  function toggleAllSections() {
    if (!tree) return;
    if (anySectionCollapsed) {
      setCollapsedSections({});
    } else {
      const all: Record<string, boolean> = {};
      for (const s of tree.sections) all[s.id] = true;
      setCollapsedSections(all);
    }
  }

  return (
    <IuhCourseIndexLayout
      classId={classId}
      classCode={tree?.class?.code ? classCodeLabel(tree.class.code) : undefined}
      sections={indexSections}
    >
      <main className="min-w-0 space-y-5">
        {error && (
          <p
            role="alert"
            className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        {!tree && !error && <p role="status">Đang tải nội dung lớp…</p>}

        {tree && (
          <>
            <header className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="break-words text-2xl font-bold text-[#e66f2b] sm:text-[26px]">
                    {isTechnicalQaRecord(tree.class.name, tree.class.code)
                      ? classLabel(tree.class.name, tree.class.code)
                      : `${classCodeLabel(tree.class.code)} · ${learnerClassLabel(tree.class.name, tree.class.code)}`}
                  </h1>
                  <SourceRecord
                    name={`${classCodeLabel(tree.class.code)} · ${learnerClassLabel(tree.class.name, tree.class.code)}`}
                    code={tree.class.code}
                  />
                </div>
                {tree.editable && (
                  <button
                    className={
                      edit
                        ? 'inline-flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100'
                        : 'inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                    }
                    aria-pressed={edit}
                    onClick={() => toggleEditMode(!edit)}
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {edit ? 'Tắt chế độ chỉnh sửa' : 'Bật chế độ chỉnh sửa'}
                  </button>
                )}
              </div>

              {/* Signature IUH tab bar (5 in-page tabs for Instructor, 4 for Student) */}
              <nav
                className={
                  tree.editable
                    ? 'grid grid-cols-2 gap-2 sm:grid-cols-5'
                    : 'grid grid-cols-2 gap-2 sm:grid-cols-4'
                }
                aria-label="Trong lớp"
              >
                <button
                  type="button"
                  onClick={() => selectTab('course')}
                  className={`rounded-xs px-3 py-2.5 text-center text-sm transition ${
                    activeTab === 'course'
                      ? 'bg-[#76a35e] font-semibold text-white'
                      : 'bg-[#dee2e6] font-medium text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Khóa học
                </button>
                <button
                  type="button"
                  onClick={() => selectTab('info')}
                  className={`rounded-xs px-3 py-2.5 text-center text-sm transition ${
                    activeTab === 'info'
                      ? 'bg-[#76a35e] font-semibold text-white'
                      : 'bg-[#dee2e6] font-medium text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Thông tin lớp học
                </button>
                {tree.editable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => selectTab('students')}
                      className={`rounded-xs px-3 py-2.5 text-center text-sm transition ${
                        activeTab === 'students'
                          ? 'bg-[#76a35e] font-semibold text-white'
                          : 'bg-[#dee2e6] font-medium text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Danh sách học sinh
                    </button>
                    <button
                      type="button"
                      onClick={() => selectTab('grades')}
                      className={`rounded-xs px-3 py-2.5 text-center text-sm transition ${
                        activeTab === 'grades'
                          ? 'bg-[#76a35e] font-semibold text-white'
                          : 'bg-[#dee2e6] font-medium text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Điểm số
                    </button>
                    <button
                      type="button"
                      onClick={() => selectTab('progress')}
                      className={`rounded-xs px-3 py-2.5 text-center text-sm transition ${
                        activeTab === 'progress'
                          ? 'bg-[#76a35e] font-semibold text-white'
                          : 'bg-[#dee2e6] font-medium text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Tiến độ học tập
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to={'/classroom/' + classId + '/gradebook'}
                      className="rounded-xs bg-[#dee2e6] px-3 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-300"
                    >
                      Điểm số
                    </Link>
                    <Link
                      to={'/classroom/' + classId + '/progress'}
                      className="rounded-xs bg-[#dee2e6] px-3 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-300"
                    >
                      Tiến độ học tập
                    </Link>
                  </>
                )}
              </nav>

              {activeTab === 'course' && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs">
                  <div className="flex items-center gap-3 text-slate-500">
                    {tree.editable && (
                      <span>
                        {edit
                          ? 'Đang bật chế độ chỉnh sửa nội dung riêng của lớp.'
                          : 'Bấm "Bật chế độ chỉnh sửa" để thêm, sửa hoặc sắp xếp chủ đề & hoạt động.'}
                      </span>
                    )}
                  </div>
                  {tree.sections.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllSections}
                      className="font-medium text-[#e66f2b] hover:underline"
                    >
                      {anySectionCollapsed ? 'Mở rộng tất cả' : 'Thu gọn tất cả'}
                    </button>
                  )}
                </div>
              )}
            </header>

            {activeTab === 'info' && tree.editable && (
              <InstructorClassInfoTab
                classId={classId}
                tree={tree}
                overview={overview}
                unified={unified}
                rosterCount={roster?.learners.length ?? null}
                onSelectTab={selectTab}
              />
            )}

            {activeTab === 'info' && !tree.editable && (
              <section className="space-y-4">
                <div className="overflow-hidden rounded border border-slate-200 bg-white">
                  <table className="w-full border-collapse text-left text-sm">
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                          Mã lớp
                        </th>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {classCodeLabel(tree.class.code)}
                        </td>
                      </tr>
                      <tr>
                        <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                          Tên lớp
                        </th>
                        <td className="px-4 py-2.5 text-slate-800">{tree.class.name}</td>
                      </tr>
                      {studentCard && (
                        <tr>
                          <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                            Khóa học &amp; Trình độ
                          </th>
                          <td className="px-4 py-2.5 text-slate-800">
                            {studentCard.course.title}
                            {studentCard.course.level ? ` (${studentCard.course.level})` : ''}
                          </td>
                        </tr>
                      )}
                      {academicDetail && (
                        <>
                          <tr>
                            <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                              Giảng viên &amp; Hình thức
                            </th>
                            <td className="px-4 py-2.5 text-slate-800">
                              {academicDetail.instructor?.fullName ?? 'Đang cập nhật'} ·{' '}
                              {academicDetail.modality === 'ONLINE'
                                ? 'Trực tuyến (Online)'
                                : academicDetail.modality === 'HYBRID'
                                  ? 'Kết hợp (Online & Offline)'
                                  : 'Trực tiếp (Offline)'}
                            </td>
                          </tr>
                          <tr>
                            <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                              Thời lượng &amp; Phòng học
                            </th>
                            <td className="px-4 py-2.5 text-slate-800">
                              {academicDetail.totalSessions ?? academicDetail.roadmapItems?.length ?? '—'} buổi
                              {academicDetail.totalPeriods
                                ? ` · ${academicDetail.totalPeriods} tiết (${academicDetail.minutesPerPeriod ?? 45} phút/tiết)`
                                : ''}
                              {academicDetail.defaultRoom
                                ? ` · ${academicDetail.defaultRoom.code} — ${academicDetail.defaultRoom.name} (${academicDetail.defaultRoom.location})`
                                : ''}
                            </td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <th className="w-48 border-r border-slate-200 bg-[#f8f9fa] px-4 py-2.5 font-semibold text-slate-800">
                          Liên kết nhanh
                        </th>
                        <td className="flex flex-wrap gap-3 px-4 py-2.5 text-xs font-semibold">
                          <Link
                            to="/my/calendar"
                            className="text-[#e66f2b] hover:underline"
                          >
                            Bảng điều khiển lịch học →
                          </Link>
                          <Link
                            to={'/classroom/' + classId + '/gradebook'}
                            className="text-[#2f5d1e] hover:underline"
                          >
                            Bảng điểm cá nhân →
                          </Link>
                          <Link
                            to={'/classroom/' + classId + '/progress'}
                            className="text-indigo-700 hover:underline"
                          >
                            Tiến độ học tập →
                          </Link>
                          {tree.sessionEngagementEnabled && (
                            <Link
                              to={'/classroom/' + classId + '/attendance?mode=attendance'}
                              className="text-[#2f7d32] hover:underline"
                            >
                              Điểm danh theo buổi chính thức →
                            </Link>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {tree.officialSessions && tree.officialSessions.length > 0 && (
                  <div className="rounded border border-slate-200 bg-[#f8f9fa] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 text-base font-semibold text-[#e66f2b]">
                        <Calendar className="h-4 w-4" aria-hidden="true" />
                        Buổi học đã công bố ({tree.officialSessions.length} buổi)
                      </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {tree.officialSessions.map((ts, idx) => (
                        <div
                          key={ts.id}
                          className="rounded border border-slate-200 bg-white p-3.5 text-xs space-y-1.5"
                        >
                          <p className="font-semibold text-slate-900">
                            Buổi #{idx + 1} ·{' '}
                            {new Intl.DateTimeFormat('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                            }).format(new Date(ts.startsAt))}
                          </p>
                          <p className="text-slate-600">
                            {schoolTime(ts.startsAt)} – {schoolTime(ts.endsAt)}
                            {ts.room ? ` · Phòng ${ts.room.code}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-3 pt-1">
                            {ts.approvedMeetUrl && (
                              <a
                                href={ts.approvedMeetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[#e66f2b] hover:underline"
                              >
                                Vào Google Meet
                              </a>
                            )}
                            {tree.sessionEngagementEnabled && (
                              <Link
                                className="font-semibold text-[#2f7d32] hover:underline"
                                to={`/classroom/${classId}/attendance?sessionId=${ts.id}&mode=attendance`}
                              >
                                Mở điểm danh buổi #{idx + 1} →
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {academicDetail?.roadmapItems && academicDetail.roadmapItems.length > 0 && (
                  <ClassRoadmapTable
                    items={academicDetail.roadmapItems}
                    classStart={academicDetail.classStart}
                    classEnd={academicDetail.classEnd}
                    defaultRoom={academicDetail.defaultRoom}
                    minutesPerPeriod={academicDetail.minutesPerPeriod ?? 45}
                    showMeetingUrl
                  />
                )}
              </section>
            )}

            {activeTab === 'students' && tree.editable && (
              <InstructorClassStudentsTab
                classId={classId}
                classCode={tree.class.code}
                unified={unified}
                roster={roster}
              />
            )}

            {activeTab === 'grades' && tree.editable && (
              <InstructorClassGradebookTab
                classId={classId}
                classCode={tree.class.code}
                unified={unified}
                roster={roster}
                results={results}
              />
            )}

            {activeTab === 'progress' && tree.editable && (
              <InstructorClassProgressTab
                classId={classId}
                tree={tree}
                unified={unified}
                roster={roster}
                localKinds={localKinds}
              />
            )}

            {activeTab === 'course' && (
              <>

          {edit && tree.editable && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50/80 px-4 py-2.5 text-amber-950">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded bg-amber-200/80 text-xs font-bold text-amber-900">
                  ✎
                </span>
                <p className="text-xs sm:text-sm font-semibold">
                  Chế độ chỉnh sửa đang bật — Bạn có thể thêm, chỉnh sửa, công bố hoặc sắp xếp lại
                  chủ đề (Section) và hoạt động (Activity).
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-amber-900 underline hover:text-amber-950"
                onClick={() => toggleEditMode(false)}
              >
                Tắt chỉnh sửa
              </button>
            </div>
          )}

          {edit && tree.editable && (
            <form
              className="space-y-3 rounded border border-[#76a35e]/45 bg-[#f4f9f1] p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await classLmsApi.write(
                    classId,
                    'sections',
                    {
                      title,
                      introduction: intro,
                    },
                    'POST',
                  );
                  setTitle('');
                  setIntro('');
                });
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#2f5d1e]">Thêm chủ đề mới (Section)</h2>
                <button
                  disabled={busy || !title.trim()}
                  className="inline-flex items-center gap-1.5 rounded bg-[#76a35e] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#658f50] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tạo chủ đề
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Tên chủ đề
                  <input
                    required
                    maxLength={250}
                    placeholder="Ví dụ: Chương 1 - Listening Part 1 & 2"
                    className={field + ' mt-1 py-2 text-sm'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Giới thiệu chủ đề
                  <textarea
                    placeholder="Mô tả ngắn gọn mục tiêu hoặc tài liệu của chủ đề..."
                    className={field + ' mt-1 py-2 text-sm'}
                    maxLength={5000}
                    rows={1}
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                  />
                </label>
              </div>
            </form>
          )}

          {tree.sections.length === 0 && (
            <p className="workspace-card text-sm text-slate-600">
              {tree.editable
                ? 'Lớp chưa có nội dung được tạo. Không tự chuyển bài học của chương trình thành lịch sử học lớp.'
                : 'Chưa có nội dung đã công bố, đang khả dụng cho bạn.'}
            </p>
          )}

          <div className="divide-y divide-slate-200">
            {tree.sections.map((s, si) => {
              const isCollapsed = Boolean(collapsedSections[s.id]);
              return (
                <section key={s.id} className="py-5 first:pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsedSections((prev) => ({ ...prev, [s.id]: !isCollapsed }))
                      }
                      className="flex items-center gap-2.5 text-left group"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-200 bg-[#f8f9fa] text-slate-600 transition group-hover:bg-slate-200">
                        {isCollapsed ? (
                          <IuhChevronRight size={15} aria-hidden="true" />
                        ) : (
                          <IuhChevronDown size={15} aria-hidden="true" />
                        )}
                      </span>
                      <span className="text-lg font-bold text-slate-900 group-hover:text-[#e66f2b]">
                        {s.title}
                      </span>
                    </button>

                    {tree.editable && (
                      <span className="rounded bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                        {!s.publishedMetadata
                          ? 'Chủ đề chưa công bố'
                          : s.hasDraftChanges
                            ? 'Có thay đổi nháp'
                            : 'Đã công bố · v' + s.publishedMetadata.number}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div className="mt-3 space-y-3">
                      {s.introduction && (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                          {s.introduction}
                        </p>
                      )}

                      {edit && tree.editable && (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-[#f8f9fa] p-2.5">
                            <div className="flex flex-wrap gap-2">
                              <button
                                className={button + ' text-xs font-semibold'}
                                disabled={busy || !s.hasDraftChanges}
                                onClick={() =>
                                  void act(() =>
                                    classLmsApi.write(classId, 'sections/' + s.id + '/publish', {
                                      expectedLockVersion: s.lockVersion,
                                    }),
                                  )
                                }
                              >
                                Công bố chủ đề
                              </button>
                              <button
                                type="button"
                                className={button + ' text-xs font-semibold'}
                                onClick={() => {
                                  if (editSection?.id === s.id) {
                                    setEditSection(undefined);
                                  } else {
                                    setEditSection(s);
                                    setEditTitle(s.title);
                                    setEditIntro(s.introduction);
                                  }
                                }}
                              >
                                {editSection?.id === s.id ? 'Đóng sửa chủ đề' : 'Sửa chủ đề'}
                              </button>
                              {confirmDeleteSectionId === s.id ? (
                                <span className="inline-flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs">
                                  <span className="font-semibold text-rose-900">Xóa chủ đề?</span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                                    onClick={() =>
                                      void act(async () => {
                                        await apiFetch(
                                          `/v2/class-lms/classes/${classId}/sections/${s.id}`,
                                          { method: 'DELETE' },
                                        );
                                        setConfirmDeleteSectionId(null);
                                        if (editSection?.id === s.id) setEditSection(undefined);
                                      })
                                    }
                                  >
                                    Xác nhận xóa
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                                    onClick={() => setConfirmDeleteSectionId(null)}
                                  >
                                    Hủy
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                  onClick={() => setConfirmDeleteSectionId(s.id)}
                                >
                                  Xóa chủ đề
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="mr-1 text-xs text-slate-500">Vị trí:</span>
                              <button
                                aria-label={'Đưa chủ đề ' + s.title + ' lên'}
                                disabled={busy || si === 0}
                                className={button + ' px-2.5 py-1 text-xs'}
                                onClick={() => void order(tree.sections, si, -1, 'sections/reorder')}
                              >
                                ↑
                              </button>
                              <button
                                aria-label={'Đưa chủ đề ' + s.title + ' xuống'}
                                disabled={busy || si === tree.sections.length - 1}
                                className={button + ' px-2.5 py-1 text-xs'}
                                onClick={() => void order(tree.sections, si, 1, 'sections/reorder')}
                              >
                                ↓
                              </button>
                            </div>
                          </div>

                          {editSection?.id === s.id && (
                            <form
                              className="space-y-3 rounded border border-[#76a35e]/50 bg-[#f4f9f1] p-3.5"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void act(async () => {
                                  await classLmsApi.write(
                                    classId,
                                    'sections/' + s.id,
                                    {
                                      title: editTitle,
                                      introduction: editIntro,
                                      expectedLockVersion: s.lockVersion,
                                    },
                                    'PATCH',
                                  );
                                  setEditSection(undefined);
                                });
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-[#2f5d1e]">
                                  Chỉnh sửa chủ đề này
                                </h3>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className={button + ' px-3 py-1 text-xs'}
                                    onClick={() => setEditSection(undefined)}
                                  >
                                    Hủy
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={busy || !editTitle.trim()}
                                    className="inline-flex items-center gap-1 rounded bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#658f50] disabled:opacity-50"
                                  >
                                    Lưu chủ đề
                                  </button>
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block text-xs font-semibold text-slate-700">
                                  Tên chủ đề
                                  <input
                                    required
                                    maxLength={250}
                                    className={field + ' mt-1 py-1.5 text-sm'}
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                  />
                                </label>
                                <label className="block text-xs font-semibold text-slate-700">
                                  Giới thiệu chủ đề
                                  <textarea
                                    className={field + ' mt-1 py-1.5 text-sm'}
                                    maxLength={5000}
                                    rows={1}
                                    value={editIntro}
                                    onChange={(e) => setEditIntro(e.target.value)}
                                  />
                                </label>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      <ul className="space-y-3">
                        {s.activities.map((a, i) => {
                          const localInfo = localKinds[a.id];
                          const effectiveType =
                            localInfo?.kind === 'LOCAL_QUIZ'
                              ? 'LOCAL_QUIZ'
                              : localInfo?.kind === 'LOCAL_ATTENDANCE'
                                ? 'LOCAL_ATTENDANCE'
                                : a.type;
                          const assessmentKind =
                            effectiveType === 'LOCAL_QUIZ'
                              ? String(
                                  localInfo?.meta?.assessmentKind ??
                                    (a as any).assessmentKind ??
                                    'QUIZ',
                                )
                              : effectiveType;
                          const isDone =
                            a.progress === 'COMPLETED' || a.submissionState === 'SUBMITTED';

                          const doneText =
                            effectiveType === 'LOCAL_ATTENDANCE'
                              ? 'Đã điểm danh'
                              : a.submissionState === 'SUBMITTED'
                                ? 'Đã nộp'
                                : 'Đã hoàn thành';

                          return (
                            <li
                              key={a.id}
                              className={`min-w-0 rounded border p-4 transition ${
                                !tree.editable && isDone
                                  ? 'border-emerald-300 border-l-4 border-l-[#2f7d32] bg-[#f5fbf3] hover:border-emerald-400'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3.5">
                                  <IuhActivityBadge type={assessmentKind} size="md" />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                      {activityTypeMicroLabel(assessmentKind)}
                                    </p>
                                    <Link
                                      className="block break-words text-[15px] font-semibold text-[#e66f2b] hover:underline"
                                      to={'/classroom/' + classId + '/activities/' + a.id}
                                    >
                                      {a.title}
                                    </Link>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  {tree.editable ? (
                                    <span className="rounded border border-slate-200 bg-[#f8f9fa] px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                      {activityState[a.state]} · v{a.revisionNumber}
                                    </span>
                                  ) : isDone ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-[#2f7d32] px-2.5 py-0.5 text-xs font-semibold text-white">
                                      <IuhCheckIcon size={12} aria-hidden="true" />
                                      {doneText}
                                    </span>
                                  ) : a.submissionState === 'DRAFT' ? (
                                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                      Bản nháp
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {(a.introduction || a.availableFrom || a.availableUntil) && (
                                <div className="mt-3 space-y-1.5 rounded bg-[#f3f4f6] px-3.5 py-2.5 text-xs text-slate-700">
                                  {a.introduction && (
                                    <p className="whitespace-pre-wrap leading-relaxed">
                                      {demoText(a.introduction)}
                                    </p>
                                  )}
                                  {(a.availableFrom || a.availableUntil) && (
                                    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200/80 pt-1.5 text-[11px] text-slate-600">
                                      {a.availableFrom && (
                                        <span>
                                          <strong className="text-slate-800">Mở từ (Opened):</strong>{' '}
                                          {schoolTimestamp(a.availableFrom)}
                                        </span>
                                      )}
                                      {a.availableUntil && (
                                        <span>
                                          <strong className="text-slate-800">Hạn / Đóng (Due):</strong>{' '}
                                          {schoolTimestamp(a.availableUntil)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                          {edit && tree.editable && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  className={button + ' text-xs font-semibold'}
                                  to={
                                    localInfo
                                      ? '/classroom/' + classId + '/activities/' + a.id
                                      : '/classroom/' +
                                        classId +
                                        '/sections/' +
                                        s.id +
                                        '/activities/' +
                                        a.id +
                                        '/edit'
                                  }
                                >
                                  {localInfo ? 'Cấu hình & Quản lý' : 'Sửa hoạt động'}
                                </Link>
                                <button
                                  disabled={busy || a.state !== 'DRAFT' || !s.publishedMetadata}
                                  className={button + ' text-xs font-semibold'}
                                  onClick={() =>
                                    void act(() =>
                                      classLmsApi.write(
                                        classId,
                                        'activities/' + a.id + '/publish',
                                        {
                                          expectedLockVersion: a.lockVersion,
                                        },
                                      ),
                                    )
                                  }
                                >
                                  Xuất bản trong lớp
                                </button>
                                <button
                                  disabled={busy || a.state === 'HIDDEN'}
                                  className={button + ' text-xs font-semibold'}
                                  onClick={() =>
                                    void act(() =>
                                      classLmsApi.write(classId, 'activities/' + a.id + '/hide', {
                                        expectedLockVersion: a.lockVersion,
                                      }),
                                    )
                                  }
                                >
                                  Ẩn
                                </button>
                                {confirmDeleteActivityId === a.id ? (
                                  <span className="inline-flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs">
                                    <span className="font-semibold text-rose-900">Xóa?</span>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                                      onClick={() =>
                                        void act(async () => {
                                          await apiFetch(
                                            `/v2/class-lms/classes/${classId}/activities/${a.id}`,
                                            { method: 'DELETE' },
                                          );
                                          setConfirmDeleteActivityId(null);
                                        })
                                      }
                                    >
                                      Xác nhận
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                                      onClick={() => setConfirmDeleteActivityId(null)}
                                    >
                                      Hủy
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() => setConfirmDeleteActivityId(a.id)}
                                  >
                                    Xóa
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  aria-label={'Đưa ' + a.title + ' lên'}
                                  disabled={busy || i === 0}
                                  className={button + ' px-2 py-1 text-xs'}
                                  onClick={() =>
                                    void order(s.activities, i, -1, 'sections/' + s.id + '/reorder')
                                  }
                                >
                                  ↑
                                </button>
                                <button
                                  aria-label={'Đưa ' + a.title + ' xuống'}
                                  disabled={busy || i === s.activities.length - 1}
                                  className={button + ' px-2 py-1 text-xs'}
                                  onClick={() =>
                                    void order(s.activities, i, 1, 'sections/' + s.id + '/reorder')
                                  }
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {!s.activities.length && (
                    <p className="py-4 text-sm text-slate-500">
                      Chưa có hoạt động được phép hiển thị.
                    </p>
                  )}

                  {edit && tree.editable && (
                    <button
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-[#76a35e]/70 bg-[#f4f9f1] py-2.5 text-sm font-semibold text-[#2f5d1e] transition hover:border-[#76a35e] hover:bg-[#e9f2e4] active:scale-[0.99]"
                      onClick={() => setChooser(s.id)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Thêm hoạt động hoặc tài nguyên
                    </button>
                  )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {chooser && (
            <ActivityChooser
              showMeetOption={Boolean(
                tree.sessionEngagementEnabled &&
                  ((tree.class.modality ??
                    overview?.classOffering?.modality ??
                    academicDetail?.modality) !== 'OFFLINE' ||
                    tree.officialSessions?.some(
                      (s) => s.modality === 'ONLINE' || s.modality === 'HYBRID',
                    )),
              )}
              classId={classId}
              sectionId={chooser}
              close={() => setChooser(undefined)}
            />
          )}
              </>
            )}
        </>
      )}
    </main>
    </IuhCourseIndexLayout>
  );
}

export function ActivityChooser({
  showMeetOption = false,
  classId,
  sectionId,
  close,
}: {
  showMeetOption?: boolean;
  classId: string;
  sectionId: string;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [search, setSearch] = useState(''),
    navigate = useNavigate();

  useLayoutEffect(() => {
    const d = ref.current!,
      previous = document.activeElement as HTMLElement | null;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    d.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      if (typeof d.close === 'function') d.close();
      previous?.focus();
    };
  }, []);

  const options = [
    {
      type: 'LOCAL_ATTENDANCE',
      title: 'Điểm danh buổi học',
      description:
        'Tạo hoạt động điểm danh ngay trong chủ đề này (tự đặt khung giờ check-in & mã tùy chọn, đồng bộ Lịch tháng và Sổ điểm).',
      icon: UserCheck,
    },
    ...(showMeetOption
      ? [
          {
            type: 'ONLINE_SESSION',
            title: 'Buổi học online / Đề nghị Meet',
            description: 'Đề xuất đường dẫn Google Meet HTTPS cho buổi học để học vụ duyệt.',
            icon: Video,
          },
        ]
      : []),
    {
      type: 'LOCAL_QUIZ_QUIZ',
      title: 'Quiz luyện tập (Trắc nghiệm & Tự luận)',
      description:
        'Tạo Quiz luyện tập trong chủ đề, chọn từ Ngân hàng câu hỏi khóa học, chấm trắc nghiệm tự động & tự luận.',
      icon: HelpCircle,
    },
    {
      type: 'LOCAL_QUIZ_REGULAR',
      title: 'Kiểm tra thường kỳ (REGULAR)',
      description:
        'Tạo bài kiểm tra thường kỳ có lịch mở/đóng đồng bộ Lịch tháng, thang điểm đạt và kiểm soát công bố điểm.',
      icon: HelpCircle,
    },
    {
      type: 'LOCAL_QUIZ_MIDTERM',
      title: 'Kiểm tra giữa kỳ (MIDTERM)',
      description:
        'Biên soạn đề giữa kỳ, đặt lịch mở/đóng đồng bộ Lịch tháng, lấy câu từ Ngân hàng câu hỏi và công bố trực tiếp cho lớp.',
      icon: HelpCircle,
    },
    {
      type: 'LOCAL_QUIZ_FINAL',
      title: 'Kiểm tra cuối kỳ (FINAL)',
      description:
        'Biên soạn đề cuối kỳ, đặt lịch mở/đóng đồng bộ Lịch tháng, lấy câu từ Ngân hàng câu hỏi và công bố trực tiếp cho lớp.',
      icon: HelpCircle,
    },
    {
      type: 'ASSIGNMENT',
      title: 'Bài tập',
      description: 'Giao bài riêng của lớp, nhận bài nộp văn bản hoặc tài liệu có bảo vệ.',
      icon: ClipboardList,
    },
    {
      type: 'LESSON',
      title: 'Bài học',
      description: 'Nội dung bài học riêng hoặc bản sao từ mẫu chuẩn.',
      icon: BookOpen,
    },
    {
      type: 'RESOURCE',
      title: 'Tài nguyên',
      description: 'Liên kết HTTPS hoặc tài liệu tải lên có bảo vệ.',
      icon: FileText,
    },
  ].filter((o) =>
    (o.title + ' ' + o.description)
      .toLocaleLowerCase('vi')
      .includes(search.toLocaleLowerCase('vi')),
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby="activity-chooser-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(94vw,720px)] max-w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-slate-950/50"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#76a35e]">
            Bộ chọn hoạt động lớp học
          </p>
          <h2 id="activity-chooser-title" className="text-xl font-bold text-[#e66f2b]">
            Thêm hoạt động hoặc tài nguyên
          </h2>
        </div>
        <button className={button} onClick={close} aria-label="Đóng bộ chọn">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <label className="mt-4 block text-sm font-semibold text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Tìm loại hoạt động
        </span>
        <input
          className={field}
          placeholder="Nhập tên loại hoạt động (Bài học, Bài tập, Quiz, Tài nguyên...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.type}
              className="group flex items-start gap-3.5 rounded border border-slate-200 bg-[#f8f9fa] p-4 text-left transition hover:border-[#76a35e] hover:bg-[#f4f9f1] focus-visible:ring-2"
              onClick={() =>
                navigate(
                  o.type === 'LOCAL_ATTENDANCE'
                    ? '/classroom/' + classId + '/sections/' + sectionId + '/attendance/new'
                    : o.type === 'ATTENDANCE'
                      ? '/classroom/' + classId + '/attendance?mode=attendance'
                      : o.type === 'ONLINE_SESSION'
                        ? '/classroom/' + classId + '/attendance?mode=meet'
                        : o.type.startsWith('LOCAL_QUIZ')
                          ? '/classroom/' +
                            classId +
                            '/sections/' +
                            sectionId +
                            '/local-quiz/new?kind=' +
                            (o.type.replace('LOCAL_QUIZ_', '') || 'QUIZ')
                          : o.type === 'QUIZ'
                            ? '/classroom/' + classId + '/sections/' + sectionId + '/quizzes/new'
                            : '/classroom/' +
                              classId +
                              '/sections/' +
                              sectionId +
                              '/activities/new?type=' +
                              o.type,
                )
              }
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e9f2e4] text-[#2f5d1e] transition group-hover:bg-[#76a35e] group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[#e66f2b]">{o.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                  {o.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {!options.length && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Không có loại được hỗ trợ phù hợp.
        </p>
      )}
      <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Các hoạt động tạo trong học phần sẽ tự động đồng bộ sang Sổ điểm &amp; Lịch học khi được xuất bản.
      </p>
    </dialog>
  );
}

type Draft = {
  title: string;
  introduction: string;
  contentMarkdown: string;
  resourceUrl: string;
  availableFrom: string;
  availableUntil: string;
  source: string;
};

type Sources = {
  lessons: {
    id: string;
    title: string;
    updatedAt: string;
    resources: { id: string; title: string; updatedAt: string }[];
  }[];
};

export function ClassActivityEditorPage() {
  const { classId = '', sectionId = '', activityId } = useParams();
  return (
    <Editor
      key={classId + sectionId + activityId}
      classId={classId}
      sectionId={sectionId}
      activityId={activityId}
    />
  );
}

function Editor({
  classId,
  sectionId,
  activityId,
}: {
  classId: string;
  sectionId: string;
  activityId?: string;
}) {
  const navigate = useNavigate(),
    [search] = useSearchParams(),
    [draft, setDraft] = useState<Draft>({
      title: '',
      introduction: '',
      contentMarkdown: '',
      resourceUrl: '',
      availableFrom: '',
      availableUntil: '',
      source: '',
    }),
    [type, setType] = useState<Activity['type']>(
      search.get('type') === 'ASSIGNMENT'
        ? 'ASSIGNMENT'
        : search.get('type') === 'RESOURCE'
          ? 'RESOURCE'
          : 'LESSON',
    ),
    [sources, setSources] = useState<Sources>(),
    [row, setRow] = useState<Activity>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File>(),
    [ready, setReady] = useState(false),
    [assignCfg, setAssignCfg] = useState({
      maxFiles: 20,
      maxFileSizeMb: 10,
      allowFile: true,
      allowText: true,
      allowAudio: false,
      allowResubmit: true,
      allowLate: false,
      maxScore: 10,
      promptUrl: '',
    }),
    [promptFile, setPromptFile] = useState<File>();

  useEffect(() => {
    let live = true;
    void Promise.all([
      classLmsApi.get<ClassTree>(classId),
      classLmsApi.get<Sources>(classId, 'sources'),
      activityId
        ? classLmsApi.get<Activity>(classId, 'activities/' + activityId)
        : Promise.resolve(undefined),
    ])
      .then(async ([tree, s, a]) => {
        if (!live) return;
        if (!tree.editable || !tree.sections.some((x) => x.id === sectionId)) throw Error();
        setSources(s);
        if (a) {
          if (a.sectionId !== sectionId) throw Error();
          setRow(a);
          setType(a.type);
          setDraft({
            title: a.title,
            introduction: a.introduction,
            contentMarkdown: a.contentMarkdown ?? '',
            resourceUrl: a.resourceUrl ?? '',
            availableFrom: a.availableFrom ? schoolInput(a.availableFrom) : '',
            availableUntil: a.availableUntil ? schoolInput(a.availableUntil) : '',
            source: '',
          });
          if (a.type === 'ASSIGNMENT') {
            try {
              const ws = await lmsLocalApi.getWorkspace(classId, a.id);
              if (live) {
                setAssignCfg({
                  maxFiles: ws.config.maxFiles,
                  maxFileSizeMb: ws.config.maxFileSizeMb,
                  allowFile: ws.config.allowFile,
                  allowText: ws.config.allowText,
                  allowAudio: ws.config.allowAudio,
                  allowResubmit: ws.config.allowResubmit,
                  allowLate: ws.config.allowLate,
                  maxScore: ws.config.maxScore,
                  promptUrl: ws.config.promptUrl ?? '',
                });
              }
            } catch {
              // fallback to defaults
            }
          }
        }
        setReady(true);
      })
      .catch(() => {
        if (live) setError('Không có quyền sửa nội dung lớp hoặc hoạt động này.');
      });
    return () => {
      live = false;
    };
  }, [classId, sectionId, activityId]);

  function update(k: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [k]: value }));
  }

  async function save(publish = false) {
    if (type === 'ASSIGNMENT' && !draft.source && !draft.contentMarkdown.trim()) {
      setError('Vui lòng nhập đề bài và hướng dẫn trước khi lưu bài tập.');
      return;
    }
    setBusy(true);
    setError('');
    let saved: Activity | undefined;
    try {
      const source =
        type === 'LESSON'
          ? sources?.lessons.find((s) => s.id === draft.source)
          : sources?.lessons.flatMap((s) => s.resources).find((s) => s.id === draft.source);
      const body = {
        type,
        title: draft.title,
        introduction: draft.introduction,
        contentMarkdown: type !== 'RESOURCE' ? draft.contentMarkdown : '',
        resourceUrl: type === 'RESOURCE' && draft.resourceUrl ? draft.resourceUrl : undefined,
        availableFrom: draft.availableFrom
          ? new Date(draft.availableFrom + ':00+07:00').toISOString()
          : undefined,
        availableUntil: draft.availableUntil
          ? new Date(draft.availableUntil + ':00+07:00').toISOString()
          : undefined,
        ...(source
          ? {
              [type === 'LESSON' ? 'sourceLessonId' : 'sourceResourceId']: source.id,
              expectedSourceUpdatedAt: source.updatedAt,
            }
          : {}),
        ...(row ? { expectedLockVersion: row.lockVersion } : {}),
      };
      saved = await classLmsApi.write<Activity>(
        classId,
        'sections/' + sectionId + '/activities' + (row ? '/' + row.id : ''),
        body,
        row ? 'PATCH' : 'POST',
      );
      setRow(saved);
      if (file) {
        const form = new FormData();
        form.set('expectedLockVersion', String(saved.lockVersion));
        form.set('file', file);
        saved = await apiFetch<Activity>(
          '/v2/class-lms/classes/' + classId + '/activities/' + saved.id + '/file',
          {
            method: 'POST',
            body: form,
          },
        );
        setRow(saved);
      }
      if (publish) {
        await classLmsApi.write(classId, 'activities/' + saved.id + '/publish', {
          expectedLockVersion: saved.lockVersion,
        });
      }
      const cfgDirty =
        type === 'ASSIGNMENT' &&
        (assignCfg.maxFiles !== 20 ||
          assignCfg.maxFileSizeMb !== 10 ||
          !assignCfg.allowFile ||
          !assignCfg.allowText ||
          assignCfg.allowAudio ||
          !assignCfg.allowResubmit ||
          assignCfg.allowLate ||
          assignCfg.maxScore !== 10 ||
          Boolean(assignCfg.promptUrl.trim()) ||
          Boolean(promptFile));
      if (cfgDirty) {
        await lmsLocalApi.updateConfig(classId, saved.id, {
          maxFiles: assignCfg.maxFiles,
          maxFileSizeMb: assignCfg.maxFileSizeMb,
          allowFile: assignCfg.allowFile,
          allowText: assignCfg.allowText,
          allowAudio: assignCfg.allowAudio,
          allowResubmit: assignCfg.allowResubmit,
          allowLate: assignCfg.allowLate,
          maxScore: assignCfg.maxScore,
          promptUrl: assignCfg.promptUrl.trim() || null,
        });
        if (promptFile) {
          await lmsLocalApi.uploadPromptFile(classId, saved.id, promptFile);
        }
      }
      navigate('/classroom/' + classId + '?edit=1');
    } catch {
      setError(
        saved
          ? 'Bản nháp đã lưu nhưng chưa hoàn tất đính kèm hoặc xuất bản. Kiểm tra lại trong lớp; bài chưa được xuất bản.'
          : failure,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page max-w-4xl space-y-5">
      <Link
        to={'/classroom/' + classId + '?edit=1'}
        className="text-sm font-semibold text-indigo-700 hover:underline"
      >
        ← Trở về nội dung lớp
      </Link>
      <header className="workspace-header">
        <h1 className="text-2xl font-extrabold text-slate-900">
          {row ? 'Sửa' : 'Tạo'}{' '}
          {type === 'LESSON' ? 'bài học' : type === 'ASSIGNMENT' ? 'bài tập' : 'tài nguyên'} của lớp
        </h1>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {error}
        </p>
      )}
      {!ready && !error && <p role="status">Đang tải trình soạn…</p>}
      {ready && (
        <form
          className="workspace-card space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save(type === 'ASSIGNMENT');
          }}
        >
          <p className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-950">
            {type === 'ASSIGNMENT'
              ? 'Lưu và xuất bản để học viên thấy bài tập và lịch đã đặt. Có thể lưu bản nháp để xuất bản sau. Chủ đề cần được công bố trước.'
              : 'Lưu thành bản nháp. Xuất bản lại trong lớp để học viên thấy bản sửa. Lịch sử phiên bản cũ được giữ.'}
          </p>
          <label className="block text-sm font-semibold text-slate-700">
            Tiêu đề
            <input
              className={field}
              required
              maxLength={250}
              value={draft.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Giới thiệu
            <textarea
              className={field}
              maxLength={5000}
              value={draft.introduction}
              onChange={(e) => update('introduction', e.target.value)}
            />
          </label>
          {!['ASSIGNMENT', 'QUIZ'].includes(type) && (
            <label className="block text-sm font-semibold text-slate-700">
              Nhập bản sao từ nội dung chuẩn
              <select
                className={field}
                value={draft.source}
                onChange={(e) => update('source', e.target.value)}
              >
                <option value="">Soạn nội dung riêng của lớp</option>
                {(type === 'LESSON'
                  ? [...(sources?.lessons ?? [])].sort((x, y) =>
                      x.title.localeCompare(y.title, 'vi', { numeric: true }),
                    )
                  : [...(sources?.lessons ?? []).flatMap((s) => s.resources)].sort((x, y) =>
                      x.title.localeCompare(y.title, 'vi', { numeric: true }),
                    )
                ).map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type !== 'RESOURCE' ? (
            <>
              <label className="block text-sm font-semibold text-slate-700">
                {type === 'ASSIGNMENT'
                  ? 'Đề bài và hướng dẫn (Markdown)'
                  : 'Nội dung bài học (Markdown)'}
                <textarea
                  required={!draft.source}
                  disabled={!!draft.source}
                  rows={12}
                  maxLength={100000}
                  className={field}
                  value={draft.contentMarkdown}
                  onChange={(e) => update('contentMarkdown', e.target.value)}
                />
              </label>
              {!draft.source && (
                <div className="workspace-subcard">
                  <h2 className="mb-3 font-bold text-slate-900">Xem trước</h2>
                  <SafeMarkdown markdown={draft.contentMarkdown} />
                </div>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm font-semibold text-slate-700">
                Liên kết tài nguyên HTTPS
                <input
                  className={field}
                  type="url"
                  disabled={!!draft.source || !!file}
                  placeholder="https://…"
                  value={draft.resourceUrl}
                  onChange={(e) => update('resourceUrl', e.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Tài liệu riêng tư (tối đa 20 MB)
                <input
                  className={field}
                  type="file"
                  disabled={!!draft.source}
                  accept=".pdf,.txt,.docx,.pptx,.xlsx"
                  onChange={(e) => {
                    setFile(e.target.files?.[0]);
                    update('resourceUrl', '');
                  }}
                />
              </label>
              {row?.file && <p className="text-sm text-slate-600">Tệp đang gắn: {row.file.name}</p>}
            </>
          )}
          {type !== 'QUIZ' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                {type === 'ASSIGNMENT'
                  ? 'Ngày mở bài (giờ Việt Nam)'
                  : 'Bắt đầu cho phép xem (giờ trường)'}
                <input
                  className={field}
                  type="datetime-local"
                  value={draft.availableFrom}
                  onChange={(e) => update('availableFrom', e.target.value)}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                {type === 'ASSIGNMENT'
                  ? 'Hạn nộp (giờ Việt Nam)'
                  : 'Hết thời gian xem (giờ trường)'}
                <input
                  className={field}
                  type="datetime-local"
                  min={draft.availableFrom || undefined}
                  value={draft.availableUntil}
                  onChange={(e) => update('availableUntil', e.target.value)}
                />
              </label>
            </div>
          )}
          {type === 'ASSIGNMENT' && (
            <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4">
              <h2 className="text-base font-bold text-indigo-950">
                Thiết lập nộp bài & tài liệu đề bài
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-semibold text-slate-700">
                  Số tệp tối đa (1–50)
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={50}
                    value={assignCfg.maxFiles}
                    onChange={(e) =>
                      setAssignCfg((c) => ({ ...c, maxFiles: Number(e.target.value) || 1 }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Dung lượng tối đa/tệp (MB)
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={50}
                    value={assignCfg.maxFileSizeMb}
                    onChange={(e) =>
                      setAssignCfg((c) => ({ ...c, maxFileSizeMb: Number(e.target.value) || 1 }))
                    }
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Thang điểm tối đa
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={100}
                    value={assignCfg.maxScore}
                    onChange={(e) =>
                      setAssignCfg((c) => ({ ...c, maxScore: Number(e.target.value) || 10 }))
                    }
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Liên kết tài liệu hướng dẫn HTTPS (tùy chọn)
                  <input
                    className={field}
                    type="url"
                    placeholder="https://..."
                    value={assignCfg.promptUrl}
                    onChange={(e) => setAssignCfg((c) => ({ ...c, promptUrl: e.target.value }))}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Tệp đề bài đính kèm (tùy chọn)
                  <input
                    className={field}
                    type="file"
                    onChange={(e) => setPromptFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-800">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignCfg.allowFile}
                    onChange={(e) => setAssignCfg((c) => ({ ...c, allowFile: e.target.checked }))}
                  />
                  Cho phép nộp tệp
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignCfg.allowText}
                    onChange={(e) => setAssignCfg((c) => ({ ...c, allowText: e.target.checked }))}
                  />
                  Cho phép văn bản trực tuyến
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignCfg.allowAudio}
                    onChange={(e) => setAssignCfg((c) => ({ ...c, allowAudio: e.target.checked }))}
                  />
                  Cho phép tệp Audio
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignCfg.allowResubmit}
                    onChange={(e) =>
                      setAssignCfg((c) => ({ ...c, allowResubmit: e.target.checked }))
                    }
                  />
                  Cho phép sửa / nộp lại
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={assignCfg.allowLate}
                    onChange={(e) => setAssignCfg((c) => ({ ...c, allowLate: e.target.checked }))}
                  />
                  Cho phép nộp muộn
                </label>
              </div>
              <p className="text-xs text-slate-600">
                Để trống ngày khi luyện tập tự do. Chỉ ngày đã đặt và xuất bản mới hiện trên lịch
                học viên.
              </p>
            </section>
          )}
          <button disabled={busy || !draft.title.trim()} className={button}>
            {busy ? 'Đang lưu…' : type === 'ASSIGNMENT' ? 'Lưu và xuất bản' : 'Lưu bản nháp'}
          </button>
          {type === 'ASSIGNMENT' && (
            <button
              type="button"
              disabled={busy || !draft.title.trim()}
              className={button + ' ml-2'}
              onClick={() => void save()}
            >
              Lưu bản nháp
            </button>
          )}
        </form>
      )}
    </main>
  );
}

export function ClassActivityPage() {
  const { classId = '', activityId = '' } = useParams();
  return <ActivityView key={classId + activityId} classId={classId} activityId={activityId} />;
}

function ActivityView({ classId, activityId }: { classId: string; activityId: string }) {
  const [a, setA] = useState<Activity>(),
    [tree, setTree] = useState<ClassTree | null>(null),
    [localKind, setLocalKind] = useState<LocalActivityKind | null>(null),
    [localMeta, setLocalMeta] = useState<Record<string, any> | null>(null),
    [kindsReady, setKindsReady] = useState(false),
    [localKindsMap, setLocalKindsMap] = useState<
      Record<string, { kind: LocalActivityKind; meta: Record<string, any> }>
    >({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([
      classLmsApi.get<Activity>(classId, 'activities/' + activityId),
      lmsLocalApi
        .getActivityKinds(classId)
        .catch(() => ({ kinds: {} as Record<string, { kind: LocalActivityKind; meta: Record<string, any> }> })),
      classLmsApi.get<ClassTree>(classId).catch(() => null),
    ])
      .then(([r, k, t]) => {
        if (live) {
          setA(r);
          setLocalKind(k.kinds?.[activityId]?.kind ?? null);
          setLocalMeta(k.kinds?.[activityId]?.meta ?? null);
          setLocalKindsMap(k.kinds ?? {});
          setKindsReady(true);
          if (t && 'sections' in t) setTree(t);
        }
      })
      .catch(() => {
        if (live) {
          setKindsReady(true);
          setError('Hoạt động chưa khả dụng hoặc bạn không còn quyền truy cập.');
        }
      });
    return () => {
      live = false;
    };
  }, [classId, activityId, reloadTick]);

  async function markAsDone() {
    if (!a || busy || a.progress === 'COMPLETED') return;
    setBusy(true);
    setError('');
    try {
      if (a.progress === 'NOT_STARTED') {
        await classLmsApi.write<{ status: Activity['progress'] }>(
          classId,
          'activities/' + activityId + '/open',
          {},
        );
      }
      const p = await classLmsApi.write<{ status: Activity['progress'] }>(
        classId,
        'activities/' + activityId + '/complete',
        {},
      );
      setA((old) => (old ? { ...old, progress: p.status } : old));
      setReloadTick((t) => t + 1);
    } catch {
      setError('Không ghi nhận được tiến độ. Kiểm tra lại quyền truy cập và phiên bản.');
    } finally {
      setBusy(false);
    }
  }

  const indexSections: CourseIndexSection[] = (tree?.sections ?? []).map((sec) => ({
    id: sec.id,
    title: sec.title,
    activities: sec.activities.map((act) => {
      const done =
        act.id === activityId && !a?.editable
          ? a?.progress === 'COMPLETED' || a?.submissionState === 'SUBMITTED'
          : !tree?.editable &&
            (act.progress === 'COMPLETED' || act.submissionState === 'SUBMITTED');
      return {
        id: act.id,
        title: act.title,
        type: localKindsMap[act.id]?.kind ?? act.type,
        completed: done,
      };
    }),
  }));

  const effectiveType = localKind ?? a?.type ?? 'LESSON';
  const effectiveBadgeType =
    localKind === 'LOCAL_QUIZ' && localMeta?.assessmentKind
      ? String(localMeta.assessmentKind)
      : effectiveType;
  const isCompletedOrSubmitted =
    a?.progress === 'COMPLETED' || a?.submissionState === 'SUBMITTED';
  const canManualMarkDone =
    Boolean(a) &&
    !a?.editable &&
    kindsReady &&
    !localKind &&
    !['ASSIGNMENT', 'QUIZ'].includes(a?.type ?? '');
  const completedBadgeText =
    effectiveType === 'LOCAL_ATTENDANCE'
      ? 'Đã điểm danh'
      : a?.submissionState === 'SUBMITTED'
        ? 'Đã nộp bài'
        : 'Đã hoàn thành';

  return (
    <IuhCourseIndexLayout
      classId={classId}
      classCode={tree ? classCodeLabel(tree.class.code) : undefined}
      sections={indexSections}
      currentActivityId={activityId}
    >
      <main className="min-w-0 space-y-5">
        {error && (
          <p
            role="alert"
            className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        {!a && !error && <p role="status">Đang tải hoạt động…</p>}
        {a && (
          <>
            <IuhBreadcrumb
              items={[
                {
                  label: tree?.class.code ? classCodeLabel(tree.class.code) : 'Nội dung lớp',
                  to: '/classroom/' + classId + (a.editable ? '?edit=1' : ''),
                },
                { label: a.title, active: true },
              ]}
            />

            {/* IUH Activity Icon + Orange Title Header */}
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <IuhActivityBadge type={effectiveBadgeType} size="lg" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {activityTypeMicroLabel(effectiveBadgeType)}
                    {a.editable ? ` · phiên bản ${a.revisionNumber}` : ''}
                  </p>
                  <h1 className="break-words text-2xl font-bold text-[#e66f2b]">{a.title}</h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {a.editable && !localKind && (
                  <Link
                    to={
                      '/classroom/' +
                      classId +
                      '/sections/' +
                      a.sectionId +
                      '/activities/' +
                      a.id +
                      '/edit'
                    }
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Chỉnh sửa nội dung
                  </Link>
                )}
                <Link
                  to={'/classroom/' + classId + (a.editable ? '?edit=1' : '')}
                  className="text-xs font-medium text-[#e66f2b] hover:underline"
                >
                  ← Quay lại nội dung lớp
                </Link>
              </div>
            </header>

            {a.editable && (
              <p className="rounded border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-950">
                {activityState[a.state]} · Chế độ xem trước dành cho giảng viên
              </p>
            )}

            {/* IUH Framed Info Card (#f8f9fa bordered container matching Moodle/IUH UI) */}
            <section className="overflow-hidden rounded border border-slate-200 bg-[#f8f9fa] divide-y divide-slate-200">
              {(!a.editable && (isCompletedOrSubmitted || canManualMarkDone)) && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  {isCompletedOrSubmitted ? (
                    <span className="inline-flex items-center gap-1.5 rounded bg-[#2f7d32] px-3 py-1 text-xs font-semibold text-white shadow-2xs">
                      <IuhCheckIcon size={13} aria-hidden="true" />
                      {completedBadgeText}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markAsDone()}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-[#2f7d32] hover:bg-[#eef7ea] hover:text-[#1f5c2e] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Đang lưu…' : 'Đánh dấu hoàn thành'}
                    </button>
                  )}
                </div>
              )}

              {(a.availableFrom || a.availableUntil) && (
                <div className="space-y-1 px-4 py-3 text-xs text-slate-700">
                  {a.availableFrom && (
                    <p>
                      <strong className="text-slate-900">Mở từ (Opened):</strong>{' '}
                      {schoolTimestamp(a.availableFrom)}
                    </p>
                  )}
                  {a.availableUntil && (
                    <p>
                      <strong className="text-slate-900">Hạn nộp / Đóng (Due):</strong>{' '}
                      {schoolTimestamp(a.availableUntil)}
                    </p>
                  )}
                </div>
              )}

              {(a.introduction || (a.type !== 'RESOURCE' && a.contentMarkdown) || a.type === 'RESOURCE') && (
                <div className="space-y-3 bg-white px-4 py-4 text-sm text-slate-800">
                  {a.introduction &&
                    a.introduction.trim() !== (a.contentMarkdown ?? '').trim() && (
                      <p className="whitespace-pre-wrap text-slate-700">{demoText(a.introduction)}</p>
                    )}
                  {a.type !== 'RESOURCE' && a.contentMarkdown && (
                    <SafeMarkdown markdown={demoText(a.contentMarkdown)} />
                  )}
                  {a.type === 'RESOURCE' && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {a.resourceUrl && (
                        <a
                          href={a.resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded bg-[#76a35e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#658f50]"
                        >
                          Mở tài nguyên bên ngoài ↗
                        </a>
                      )}
                      {a.file && (
                        <a
                          href={apiUrl(
                            '/v2/class-lms/classes/' + classId + '/activities/' + a.id + '/file',
                          )}
                          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#e66f2b] hover:underline"
                        >
                          Tải tài liệu: {a.file.name}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {localKind === 'LOCAL_QUIZ' ? (
              <LocalQuizPanel
                classId={classId}
                activityId={a.id}
                onActivityRefresh={() => setReloadTick((t) => t + 1)}
              />
            ) : localKind === 'LOCAL_ATTENDANCE' ? (
              <LocalAttendancePanel
                classId={classId}
                activityId={a.id}
                onActivityRefresh={() => setReloadTick((t) => t + 1)}
              />
            ) : (
              <>
                {a.type === 'QUIZ' && (
                  <div>
                    <Link
                      className="inline-flex items-center rounded bg-[#76a35e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#658f50]"
                      to={
                        '/classroom/' +
                        classId +
                        '/activities/' +
                        a.id +
                        (a.editable ? '/quiz-author' : '/quiz')
                      }
                    >
                      {a.editable ? 'Soạn nguồn Quiz / xem bài đã kết thúc' : 'Mở Quiz của lớp'}
                    </Link>
                  </div>
                )}
                {a.type === 'ASSIGNMENT' && (
                  <AssignmentPanel
                    classId={classId}
                    activity={a}
                    onActivityRefresh={() => setReloadTick((t) => t + 1)}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>
    </IuhCourseIndexLayout>
  );
}
