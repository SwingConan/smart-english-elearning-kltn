import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  Award,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  UserRound,
  Video,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel, classLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { classStateLabel } from '@/features/presentation/labels';
import { workspaceApi, type Workspace, type WorkspaceClass } from '@/features/workspace/api';
import { academicApi } from './api';
import { planningApi } from './planning-api';
import { apiFetch } from '@/lib/api-client';

type PendingQueues = {
  versions: number;
  assignments: number;
  sessions: number;
  meetReviews: number;
  exceptionReviews: number;
  attendanceReviews: number;
  inspectionClasses: number;
  admissionsStatus: 'READY' | 'GATED' | 'UNKNOWN';
  admissionsPending: number;
  certificatesStatus: 'READY' | 'DISABLED' | 'UNKNOWN';
  certificatesEligible: number;
};

const INITIAL_QUEUES: PendingQueues = {
  versions: 0,
  assignments: 0,
  sessions: 0,
  meetReviews: 0,
  exceptionReviews: 0,
  attendanceReviews: 0,
  inspectionClasses: 0,
  admissionsStatus: 'UNKNOWN',
  admissionsPending: 0,
  certificatesStatus: 'UNKNOWN',
  certificatesEligible: 0,
};

export function AcademicWorkspaceDashboard() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [classes, setClasses] = useState<WorkspaceClass[]>([]);
  const [programCount, setProgramCount] = useState<number>(0);
  const [queues, setQueues] = useState<PendingQueues>(INITIAL_QUEUES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classStatusFilter, setClassStatusFilter] = useState('ALL');
  const [classPage, setClassPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    async function load() {
      try {
        const ws = await workspaceApi.me();
        if (!active) return;
        setWorkspace(ws);
        const resolvedTrack = ws.academicTrack ?? user?.academicTrack ?? null;
        const canFetchTraining = resolvedTrack !== 'STUDENT_AFFAIRS';
        const canFetchStudentAffairs = resolvedTrack !== 'TRAINING';

        const [clsRes, programsRes, approvalsRes, reviewsRes, inspectionRes, admissionsRes, certsRes] =
          await Promise.allSettled([
            workspaceApi.classes(),
            academicApi.programs('?limit=20'),
            canFetchTraining
              ? planningApi.get<{
                  versions?: unknown[];
                  assignments?: unknown[];
                  sessions?: unknown[];
                }>('approvals')
              : Promise.resolve({ versions: [], assignments: [], sessions: [] }),
            canFetchTraining
              ? apiFetch<{
                  data?: {
                    meets?: unknown[];
                    exceptions?: unknown[];
                    corrections?: unknown[];
                  }[];
                  summary?: {
                    pendingMeetLinks?: number;
                    pendingExceptions?: number;
                    pendingAttendance?: number;
                  };
                }>('/v2/session-engagement/reviews')
              : Promise.resolve({ data: [], summary: {} }),
            canFetchTraining
              ? apiFetch<{
                  data?: Array<{ valid?: boolean }>;
                  sessions?: unknown[];
                }>('/v2/inspection')
              : Promise.resolve({ data: [], sessions: [] }),
            user?.email?.endsWith('@example.invalid') && canFetchStudentAffairs
              ? apiFetch<{
                  queue?: Array<{ state?: string }>;
                }>('/v2/admissions-finance/workspace')
              : Promise.reject(new Error('ADMISSIONS_SCOPE_GATED')),
            canFetchStudentAffairs
              ? apiFetch<{
                  enrollments?: Array<{ status?: string }>;
                }>('/v2/certificates/workspace')
              : Promise.reject(new Error('CERTIFICATES_TRACK_GATED')),
          ]);

        if (!active) return;

        if (clsRes.status === 'fulfilled') {
          setClasses(clsRes.value.data ?? []);
        }
        if (programsRes.status === 'fulfilled') {
          setProgramCount(programsRes.value.meta?.total ?? programsRes.value.data?.length ?? 0);
        }

        const nextQueues: PendingQueues = { ...INITIAL_QUEUES };
        if (approvalsRes.status === 'fulfilled') {
          nextQueues.versions = approvalsRes.value.versions?.length ?? 0;
          nextQueues.assignments = approvalsRes.value.assignments?.length ?? 0;
          nextQueues.sessions = approvalsRes.value.sessions?.length ?? 0;
        }
        if (reviewsRes.status === 'fulfilled') {
          const rows = reviewsRes.value.data;
          if (Array.isArray(rows)) {
            nextQueues.meetReviews = rows.reduce((n, r) => n + (r.meets?.length ?? 0), 0);
            nextQueues.exceptionReviews = rows.reduce((n, r) => n + (r.exceptions?.length ?? 0), 0);
            nextQueues.attendanceReviews = rows.reduce((n, r) => n + (r.corrections?.length ?? 0), 0);
          } else {
            nextQueues.meetReviews = reviewsRes.value.summary?.pendingMeetLinks ?? 0;
            nextQueues.exceptionReviews = reviewsRes.value.summary?.pendingExceptions ?? 0;
            nextQueues.attendanceReviews = reviewsRes.value.summary?.pendingAttendance ?? 0;
          }
        }
        if (inspectionRes.status === 'fulfilled') {
          nextQueues.inspectionClasses = (inspectionRes.value.data ?? []).filter(
            (d) => d.valid !== false,
          ).length;
        }
        if (admissionsRes.status === 'fulfilled') {
          nextQueues.admissionsStatus = 'READY';
          nextQueues.admissionsPending =
            admissionsRes.value.queue?.filter((q) =>
              ['PENDING_REVIEW', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(q.state ?? '')),
            ).length ?? 0;
        } else {
          nextQueues.admissionsStatus = 'GATED';
        }
        if (certsRes.status === 'fulfilled') {
          nextQueues.certificatesStatus = 'READY';
          nextQueues.certificatesEligible =
            certsRes.value.enrollments?.filter((e) => e.status === 'ELIGIBLE_FOR_REVIEW').length ??
            0;
        } else {
          nextQueues.certificatesStatus = 'DISABLED';
        }
        setQueues(nextQueues);
      } catch {
        if (active) {
          setError(
            'Không thể tải trang tổng quan học vụ. Vui lòng thử lại hoặc đăng nhập lại.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [user?.email]);

  if (!user) return null;

  const visibleClasses = classes;
  const track = user.academicTrack ?? workspace?.academicTrack ?? null;
  const canAccessAdmissions =
    Boolean(user.email?.endsWith('@example.invalid')) || queues.admissionsStatus === 'READY';
  const filteredClasses = visibleClasses.filter((c) => {
    if (classStatusFilter !== 'ALL' && c.status !== classStatusFilter) return false;
    const q = classSearch.trim().toLowerCase();
    if (!q) return true;
    const text = `${classCodeLabel(c.code)} ${c.name} ${c.course.title} ${c.instructor?.fullName ?? ''}`.toLowerCase();
    return text.includes(q);
  });
  const totalPlanningApprovals = queues.versions + queues.assignments + queues.sessions;
  const totalSessionReviews =
    queues.meetReviews + queues.exceptionReviews + queues.attendanceReviews;
  const pageSize = 10;
  const totalClassPages = Math.max(1, Math.ceil(filteredClasses.length / pageSize));
  const safeClassPage = Math.min(classPage, totalClassPages);
  const pagedClasses = filteredClasses.slice((safeClassPage - 1) * pageSize, safeClassPage * pageSize);

  const trainingUcCards = [
    {
      uc: 'Lập TKB',
      title: 'Lập & Quản lý thời khóa biểu',
      to: '/academic/planning?tab=schedule',
      icon: Calendar,
      description: 'Tạo buổi học từ mẫu tuần, chỉnh giờ, dời lịch và theo dõi lịch tổng hợp toàn trung tâm.',
      statusText: `${queues.sessions} buổi chờ duyệt`,
      cta: 'Mở lập TKB',
    },
    {
      uc: 'Phòng học',
      title: 'Quản lý phòng học & Tài nguyên',
      to: '/academic/planning?tab=rooms',
      icon: Building2,
      description: 'Khai báo phòng học, sức chứa, thiết bị (máy chiếu, loa, máy tính) và trạng thái sử dụng.',
      statusText: 'Khai báo & kiểm tra xung đột phòng',
      cta: 'Mở phòng học',
    },
    {
      uc: 'Phân công GV',
      title: 'Phân công & Điều chỉnh giảng viên',
      to: '/academic/planning?tab=assignments',
      icon: GraduationCap,
      description: 'Lập và phê duyệt phân công giảng viên phụ trách lớp theo giai đoạn và lịch giảng.',
      statusText: `${queues.assignments} phân công chờ duyệt`,
      cta: 'Mở phân công GV',
    },
    {
      uc: 'Thanh tra',
      title: 'Điều phối ca thanh tra giảng dạy',
      to: '/workspace/inspection',
      icon: ClipboardCheck,
      description: 'Phân công thanh tra dự giờ theo tuần, kiểm tra trạng thái xác nhận ca và báo cáo giờ dạy.',
      statusText: `${queues.inspectionClasses} ca thanh tra hiệu lực tuần này`,
      cta: 'Mở điều phối thanh tra',
    },
    {
      uc: 'Đổi lịch / Bù',
      title: 'Duyệt điều chỉnh lịch, nghỉ dạy & dạy bù',
      to: '/academic/session-engagement',
      icon: CheckSquare,
      description: 'Rà soát đề nghị nghỉ dạy, đổi lịch, dạy bù từ giảng viên và phê duyệt theo thẩm quyền.',
      statusText: `${queues.exceptionReviews} đề nghị lịch chờ rà soát`,
      cta: 'Mở hàng đợi lịch',
    },
    {
      uc: 'Google Meet',
      title: 'Duyệt link Google Meet',
      to: '/academic/session-engagement',
      icon: Video,
      description: 'Kiểm tra và xử lý đề nghị link Google Meet cho các buổi học trực tuyến của lớp.',
      statusText: `${queues.meetReviews} link Meet chờ rà soát`,
      cta: 'Duyệt link Meet',
    },
  ];

  const studentAffairsUcCards = [
    ...(canAccessAdmissions
      ? [
          {
            uc: 'Nhập học',
            title: 'Xét duyệt hồ sơ nhập học',
            to: '/workspace/admissions',
            icon: FileCheck2,
            description:
              'Kiểm tra hồ sơ ghi danh, xác minh điều kiện học viên và phê duyệt nhập học theo quyền.',
            statusText:
              queues.admissionsStatus === 'READY'
                ? `${queues.admissionsPending} hồ sơ chờ duyệt`
                : 'Hạn chế quyền xét duyệt',
            cta: 'Mở hồ sơ nhập học',
          },
        ]
      : []),
    {
      uc: 'Đầu vào',
      title: 'Quản lý kiểm tra đầu vào TOEIC',
      to: '/workspace/placement',
      icon: UserCheck,
      description: 'Quản trị tiêu chí xếp lớp, điều phối chấm bài đầu vào và công bố kết quả cho học viên.',
      statusText: 'Đánh giá & công bố trình độ',
      cta: 'Mở kiểm tra đầu vào',
    },
    {
      uc: 'Hoàn thành',
      title: 'Thiết lập điều kiện hoàn thành khóa học',
      to: '/workspace/certificates',
      icon: ShieldCheck,
      description: 'Cấu hình ngưỡng điểm, chuyên cần và điều kiện hoàn thành trước khi phát hành chứng chỉ.',
      statusText:
        queues.certificatesStatus === 'READY'
          ? 'Đang kích hoạt chính sách hoàn thành'
          : 'Chưa thiết lập ngưỡng hoàn thành',
      cta: 'Thiết lập điều kiện',
    },
    {
      uc: 'Chứng chỉ',
      title: 'Xét đạt & Phát hành chứng chỉ',
      to: '/workspace/certificates',
      icon: Award,
      description: 'Xét đủ điều kiện hoàn thành, phát hành và thu hồi chứng chỉ công khai cho học viên.',
      statusText:
        queues.certificatesStatus === 'READY'
          ? `${queues.certificatesEligible} hồ sơ đủ điều kiện`
          : 'Chưa kích hoạt cấp chứng chỉ',
      cta: 'Mở quản lý chứng chỉ',
    },
    {
      uc: 'Thư viện TOEIC',
      title: 'Thư viện kiến thức TOEIC',
      to: '/knowledge/workspace',
      icon: Library,
      description: 'Biên soạn, rà soát và công bố bài kiến thức TOEIC cùng liên kết ôn tập câu hỏi.',
      statusText: 'Kho kiến thức & ôn tập',
      cta: 'Mở thư viện kiến thức',
    },
    {
      uc: 'Chuyển chuyên môn',
      title: 'Phiếu chuyển chuyên môn từ CSKH',
      to: '/workspace/support#referrals',
      icon: MessageSquare,
      description: 'Tiếp nhận, phân loại chủ đề hỗ trợ và phản hồi phiếu chuyển chuyên môn từ Tư vấn viên.',
      statusText: 'Phản hồi & điều phối hỗ trợ',
      cta: 'Mở phiếu chuyển CSKH',
    },
  ];

  const nineUcCards = [
    ...(canAccessAdmissions
      ? [
          {
            uc: 'Nhập học',
            title: 'Xét duyệt hồ sơ nhập học',
            to: '/workspace/admissions',
            icon: FileCheck2,
            description:
              'Kiểm tra hồ sơ ghi danh, xác minh điều kiện học viên và phê duyệt nhập học theo quyền.',
            statusText:
              queues.admissionsStatus === 'READY'
                ? `${queues.admissionsPending} hồ sơ chờ duyệt`
                : 'Hạn chế quyền xét duyệt',
            cta: 'Mở hồ sơ nhập học',
          },
        ]
      : []),
    {
      uc: 'Lập TKB',
      title: 'Lập & Quản lý thời khóa biểu',
      to: '/academic/planning?tab=schedule',
      icon: Calendar,
      description: 'Tạo buổi học từ mẫu tuần, chỉnh giờ, dời lịch và theo dõi lịch tổng hợp toàn trung tâm.',
      statusText: `${queues.sessions} buổi chờ duyệt`,
      cta: 'Mở lập TKB',
    },
    {
      uc: 'Chứng chỉ',
      title: 'Quản lý chứng chỉ',
      to: '/workspace/certificates',
      icon: Award,
      description: 'Theo dõi đủ điều kiện cấp chứng chỉ, phát hành và thu hồi chứng chỉ công khai.',
      statusText:
        queues.certificatesStatus === 'READY'
          ? `${queues.certificatesEligible} hồ sơ đủ điều kiện`
          : 'Chưa kích hoạt cấp chứng chỉ',
      cta: 'Mở quản lý chứng chỉ',
    },
    {
      uc: 'Phòng học',
      title: 'Quản lý phòng học & Tài nguyên',
      to: '/academic/planning?tab=rooms',
      icon: Building2,
      description: 'Khai báo phòng học, sức chứa, thiết bị (máy chiếu, loa, máy tính) và trạng thái sử dụng.',
      statusText: 'Khai báo & kiểm tra xung đột phòng',
      cta: 'Mở phòng học',
    },
    {
      uc: 'Phân công GV',
      title: 'Phân công & Điều chỉnh giảng viên',
      to: '/academic/planning?tab=assignments',
      icon: GraduationCap,
      description: 'Đề xuất phân công giảng viên phụ trách lớp theo giai đoạn và phê duyệt theo thẩm quyền.',
      statusText: `${queues.assignments} phân công chờ duyệt`,
      cta: 'Mở phân công GV',
    },
    {
      uc: 'Thanh tra',
      title: 'Điều phối ca thanh tra giảng dạy',
      to: '/workspace/inspection',
      icon: ClipboardCheck,
      description: 'Phân công thanh tra dự giờ theo tuần, kiểm tra trạng thái xác nhận ca và báo cáo giờ dạy.',
      statusText: `${queues.inspectionClasses} ca thanh tra hiệu lực tuần này`,
      cta: 'Mở điều phối thanh tra',
    },
    {
      uc: 'Đổi lịch / Bù',
      title: 'Duyệt điều chỉnh lịch, nghỉ dạy & dạy bù',
      to: '/academic/session-engagement',
      icon: CheckSquare,
      description: 'Rà soát đề nghị nghỉ dạy, đổi lịch, dạy bù từ giảng viên và phê duyệt theo thẩm quyền.',
      statusText: `${queues.exceptionReviews} đề nghị lịch chờ rà soát`,
      cta: 'Mở hàng đợi lịch',
    },
    {
      uc: 'Hoàn thành',
      title: 'Thiết lập điều kiện hoàn thành khóa học',
      to: '/workspace/certificates',
      icon: ShieldCheck,
      description: 'Cấu hình ngưỡng điểm, chuyên cần và điều kiện hoàn thành trước khi phát hành chứng chỉ.',
      statusText:
        queues.certificatesStatus === 'READY'
          ? 'Đang kích hoạt chính sách hoàn thành'
          : 'Chưa thiết lập ngưỡng hoàn thành',
      cta: 'Thiết lập điều kiện',
    },
    {
      uc: 'Google Meet',
      title: 'Duyệt link Google Meet',
      to: '/academic/session-engagement',
      icon: Video,
      description: 'Kiểm tra và xử lý đề nghị link Google Meet cho các buổi học trực tuyến của lớp.',
      statusText: `${queues.meetReviews} link Meet chờ rà soát`,
      cta: 'Duyệt link Meet',
    },
  ];

  const moduleCards =
    track === 'TRAINING'
      ? trainingUcCards
      : track === 'STUDENT_AFFAIRS'
        ? studentAffairsUcCards
        : nineUcCards;

  return (
    <main className="space-y-6">
      {/* Header matching IUH Portal Orange/Green Identity */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1 rounded bg-[#e9f2e4] px-2.5 py-1 text-[#2f5d1e]">
                <LayoutDashboard size={13} aria-hidden="true" />
                {track === 'TRAINING'
                  ? 'Smart English LMS · Quản lý Đào tạo'
                  : track === 'STUDENT_AFFAIRS'
                    ? 'Smart English LMS · Quản lý Học vụ Học viên'
                    : 'Smart English LMS · Quản lý học vụ'}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-slate-700">
                <UserRound size={12} aria-hidden="true" />
                {accountLabel(user.fullName)}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
              {track === 'TRAINING'
                ? 'Tổng quan Quản lý Đào tạo'
                : track === 'STUDENT_AFFAIRS'
                  ? 'Tổng quan Học vụ Học viên'
                  : 'Tổng quan học vụ'}
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              {track === 'TRAINING'
                ? 'Không gian điều phối đào tạo TOEIC: quản lý chương trình, lập thời khóa biểu, phòng học, phân công giảng viên, thanh tra ca dạy, duyệt Google Meet và đổi lịch/dạy bù.'
                : track === 'STUDENT_AFFAIRS'
                  ? 'Không gian quản lý học vụ học viên: điều phối kiểm tra đầu vào TOEIC, điều kiện hoàn thành khóa học, xét cấp chứng chỉ, thư viện kiến thức và phiếu chuyển chuyên môn CSKH.'
                  : 'Không gian điều phối đào tạo TOEIC trung tâm: xét duyệt hồ sơ, lập thời khóa biểu, quản lý phòng học, phân công giảng viên, thanh tra, phê duyệt Meet và chứng chỉ hoàn thành.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {track === 'STUDENT_AFFAIRS' ? (
              <>
                <Link
                  to="/workspace/placement"
                  className="inline-flex items-center gap-1.5 rounded border border-[#76a35e] bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#5e8a47] sm:text-sm"
                >
                  <UserCheck size={15} aria-hidden="true" />
                  Kiểm tra đầu vào
                </Link>
                <Link
                  to="/workspace/certificates"
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:border-[#76a35e] hover:text-[#2f5d1e] sm:text-sm"
                >
                  <Award size={15} aria-hidden="true" />
                  Chứng chỉ ({queues.certificatesEligible})
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/academic/planning"
                  className="inline-flex items-center gap-1.5 rounded border border-[#76a35e] bg-[#76a35e] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#5e8a47] sm:text-sm"
                >
                  <Building2 size={15} aria-hidden="true" />
                  Lập TKB &amp; Phòng học
                </Link>
                <Link
                  to="/academic/approvals"
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:border-[#76a35e] hover:text-[#2f5d1e] sm:text-sm"
                >
                  <CheckSquare size={15} aria-hidden="true" />
                  Hàng đợi phê duyệt ({totalPlanningApprovals})
                </Link>
              </>
            )}
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:border-[#e66f2b] hover:text-[#e66f2b] sm:text-sm"
            >
              <Calendar size={15} aria-hidden="true" />
              Lịch trung tâm
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {loading && !workspace && !error && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Đang tải dữ liệu tổng quan học vụ…
        </p>
      )}

      {/* Pending Action Queue Strip */}
      <section aria-label="Việc chờ xử lý học vụ" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[#e66f2b]">Việc chờ xử lý</h2>
          <span className="text-xs text-slate-500">
            {programCount} chương trình · {visibleClasses.length} lớp học trong phạm vi
          </span>
        </div>

        <div
          className={`grid gap-3 sm:grid-cols-2 ${
            track === 'TRAINING' || (!track && !canAccessAdmissions) ? 'lg:grid-cols-3' : canAccessAdmissions || track === 'STUDENT_AFFAIRS' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
          }`}
        >
          {track !== 'STUDENT_AFFAIRS' && (
            <>
              <Link
                to="/academic/approvals"
                className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Duyệt TKB &amp; Phân công GV
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{totalPlanningApprovals}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {queues.versions} chương trình · {queues.assignments} phân công · {queues.sessions} buổi học
                </p>
              </Link>

              <Link
                to="/academic/session-engagement"
                className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Meet &amp; Đổi lịch / Nghỉ dạy
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{totalSessionReviews}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {queues.meetReviews} Meet · {queues.exceptionReviews} đổi lịch · {queues.attendanceReviews} điểm danh
                </p>
              </Link>
            </>
          )}

          {track === 'TRAINING' && (
            <Link
              to="/workspace/inspection"
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Thanh tra &amp; Giờ giảng tuần này
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{queues.inspectionClasses}</p>
              <p className="mt-1 text-xs text-slate-600">
                Ca thanh tra hiệu lực cần theo dõi xác nhận
              </p>
            </Link>
          )}

          {track !== 'TRAINING' && canAccessAdmissions && (
            <Link
              to="/workspace/admissions"
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Hồ sơ nhập học
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {queues.admissionsStatus === 'READY' ? queues.admissionsPending : 'Cần quyền nội bộ'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {queues.admissionsStatus === 'READY'
                  ? 'Hồ sơ chờ xét duyệt nhập học'
                  : 'Mở phân hệ nhập học để kiểm tra phạm vi lớp'}
              </p>
            </Link>
          )}

          {track !== 'TRAINING' && (
            <Link
              to="/workspace/certificates"
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Chứng chỉ &amp; Hoàn thành
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {queues.certificatesStatus === 'READY' ? queues.certificatesEligible : 'Chưa kích hoạt'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {queues.certificatesStatus === 'READY'
                  ? 'Hồ sơ đủ điều kiện xem xét cấp'
                  : 'Chưa bật chính sách xét hoàn thành'}
              </p>
            </Link>
          )}

          {track === 'STUDENT_AFFAIRS' && (
            <>
              <Link
                to="/workspace/placement"
                className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Kiểm tra đầu vào TOEIC
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">Đang mở</p>
                <p className="mt-1 text-xs text-slate-600">
                  Xếp lớp, điều phối chấm bài &amp; công bố kết quả
                </p>
              </Link>
              <Link
                to="/workspace/support#referrals"
                className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-xs"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Phiếu chuyển CSKH &amp; Thư viện
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">Sẵn sàng</p>
                <p className="mt-1 text-xs text-slate-600">
                  Phản hồi chuyển chuyên môn &amp; cập nhật kiến thức
                </p>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Academic Manager Operational Modules Grid */}
      <section aria-label="Phân hệ nghiệp vụ" className="space-y-3">
        <h2 className="text-lg font-bold text-[#e66f2b]">
          {track === 'TRAINING'
            ? 'Nghiệp vụ Quản lý Đào tạo'
            : track === 'STUDENT_AFFAIRS'
              ? 'Nghiệp vụ Quản lý Học vụ Học viên'
              : 'Nghiệp vụ quản lý học vụ'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleCards.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.uc}
                to={item.to}
                className="group flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#76a35e] hover:shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-[#e9f2e4] px-2 py-0.5 text-xs font-bold text-[#2f5d1e]">
                      <Icon size={13} aria-hidden="true" />
                      {item.uc}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">{item.statusText}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#e66f2b]">
                    {item.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600">{item.description}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2f5d1e] group-hover:text-[#e66f2b]">
                  {item.cta} <ArrowRight size={13} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Scoped Academic Classes Table & Quick Links */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2.3fr)_minmax(260px,1fr)]">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <h2 className="text-base font-bold text-[#e66f2b]">
              Lớp học trong phạm vi ({filteredClasses.length}/{visibleClasses.length})
            </h2>
            {track !== 'STUDENT_AFFAIRS' && (
              <Link to="/academic" className="text-xs font-semibold text-[#2f5d1e] hover:underline">
                Mở Chương trình &amp; Lớp →
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              id="academic-ws-class-search"
              name="academicClassSearch"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-[#5f8b48] focus:outline-none"
              placeholder="Tìm mã lớp, tên lớp, khóa học hoặc giảng viên…"
              value={classSearch}
              onChange={(e) => {
                setClassSearch(e.target.value);
                setClassPage(1);
              }}
            />
            <select
              id="academic-ws-class-status"
              name="academicClassStatus"
              aria-label="Lọc trạng thái lớp"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              value={classStatusFilter}
              onChange={(e) => {
                setClassStatusFilter(e.target.value);
                setClassPage(1);
              }}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="OPEN">Đang mở lớp</option>
              <option value="IN_PROGRESS">Đang học</option>
              <option value="DRAFT">Bản nháp</option>
              <option value="COMPLETED">Đã kết thúc</option>
            </select>
          </div>
          {filteredClasses.length === 0 ? (
            <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              Chưa có lớp học nào khớp bộ lọc.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="whitespace-nowrap">Lớp học</th>
                      <th className="whitespace-nowrap">Giảng viên</th>
                      <th className="whitespace-nowrap">Sĩ số</th>
                      <th className="whitespace-nowrap">Trạng thái</th>
                      <th className="whitespace-nowrap text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedClasses.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/academic/classes/${c.id}`}
                            className="font-semibold text-slate-900 hover:text-[#e66f2b] hover:underline"
                          >
                            {classCodeLabel(c.code)}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {classLabel(c.name, c.code, c.course.title)} · {c.course.title}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">
                          {c.instructor ? accountLabel(c.instructor.fullName) : 'Chưa phân công'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-700">
                          {c.activeLearnerCount} học viên
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {classStateLabel(c.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs">
                          <Link
                            to={`/academic/classes/${c.id}`}
                            className="font-semibold text-[#2f5d1e] hover:underline"
                          >
                            Chi tiết
                          </Link>
                          {track !== 'STUDENT_AFFAIRS' && (
                            <>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <Link
                                to={`/academic/planning?tab=schedule&classId=${encodeURIComponent(c.id)}`}
                                className="font-semibold text-slate-700 hover:text-[#e66f2b] hover:underline"
                              >
                                Xếp lịch
                              </Link>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalClassPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Hiển thị {(safeClassPage - 1) * pageSize + 1}–
                    {Math.min(safeClassPage * pageSize, filteredClasses.length)} / {filteredClasses.length} lớp · Trang {safeClassPage}/{totalClassPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeClassPage <= 1}
                      onClick={() => setClassPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Trang trước
                    </button>
                    <button
                      type="button"
                      disabled={safeClassPage >= totalClassPages}
                      onClick={() => setClassPage((p) => Math.min(totalClassPages, p + 1))}
                      className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="border-b border-slate-100 pb-2.5 text-base font-bold text-[#e66f2b]">
            {track === 'TRAINING'
              ? 'Liên kết đào tạo khác'
              : track === 'STUDENT_AFFAIRS'
                ? 'Liên kết học vụ học viên'
                : 'Nghiệp vụ liên thông khác'}
          </h2>
          <div className="space-y-2 text-sm">
            {track === 'TRAINING' ? (
              <>
                <Link
                  to="/workspace/inspection"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <ClipboardCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Ca thanh tra &amp; Giờ giảng
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/consultations"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Duyệt tư vấn 1:1
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/my/"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <Calendar size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Lịch tháng trung tâm
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/workspace/reports"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Báo cáo &amp; Phân tích đào tạo
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
              </>
            ) : track === 'STUDENT_AFFAIRS' ? (
              <>
                <Link
                  to="/workspace/placement"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Kiểm tra đầu vào TOEIC
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/knowledge/workspace"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <Library size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Thư viện kiến thức TOEIC
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/workspace/support#referrals"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Phiếu chuyển chuyên môn CSKH
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/workspace/reports"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Báo cáo &amp; Phân tích học vụ
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/workspace/placement"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <UserCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Kiểm tra đầu vào
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/knowledge/workspace"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <Library size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Thư viện kiến thức TOEIC
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/consultations"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Duyệt tư vấn 1:1
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
                <Link
                  to="/workspace/reports"
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2.5 font-medium text-slate-800 hover:border-[#76a35e] hover:bg-[#f7faf5]"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck size={15} className="text-[#76a35e]" aria-hidden="true" />
                    Báo cáo &amp; Phân tích học vụ
                  </span>
                  <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
