import { Link, Navigate, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { classCodeLabel } from '@/features/demo/presentation';
import { learnerClassLabel, learnerCourseLabel } from '@/features/enrollments/presentation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  Compass,
  HeadphonesIcon,
  LayoutDashboard,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import {
  classStateLabel,
  enrollmentStateLabel,
  roleNames,
  workspaceTitles,
} from '@/features/presentation/labels';
import { workspaceApi, type Workspace, type WorkspaceClass } from '@/features/workspace/api';
import {
  accountLabel,
  classLabel,
  isTechnicalQaRecord,
} from '@/features/catalog/record-presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';
import { StudentDashboard } from '@/features/learner/StudentDashboard';
import { AcademicWorkspaceDashboard } from '@/features/academic/AcademicWorkspaceDashboard';
import { CounselorWorkspaceDashboard } from '@/features/workspace/CounselorWorkspaceDashboard';
import { CashierWorkspaceDashboard } from '@/features/workspace/CashierWorkspaceDashboard';
import { AdminWorkspaceDashboard } from '@/features/workspace/AdminWorkspaceDashboard';
import { InstructorWorkspaceDashboard } from '@/features/workspace/InstructorWorkspaceDashboard';
import { InspectorWorkspaceDashboard } from '@/features/workspace/InspectorWorkspaceDashboard';

export function RoleWorkspacePage() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <StudentDashboard key={user.id} />;
  if (user?.role === 'INSTRUCTOR') return <InstructorWorkspaceDashboard key={user.id} />;
  if (user?.role === 'ACADEMIC_MANAGER') return <AcademicWorkspaceDashboard key={user.id} />;
  if (user?.role === 'COUNSELOR') return <CounselorWorkspaceDashboard key={user.id} />;
  if (user?.role === 'CASHIER') return <CashierWorkspaceDashboard key={user.id} />;
  if (user?.role === 'TEACHING_INSPECTOR') return <InspectorWorkspaceDashboard key={user.id} />;
  if (user?.role === 'SYSTEM_ADMIN') return <AdminWorkspaceDashboard key={user.id} />;
  return <RoleWorkspaceContent key={`${user?.id}:${user?.role}`} />;
}

function RoleWorkspaceContent() {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace>();
  const [classes, setClasses] = useState<WorkspaceClass[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void workspaceApi
      .me()
      .then(async (data) => {
        if (!active) return;
        setWorkspace(data);
        if (
          data.capabilities.classRead ||
          ['STUDENT', 'INSTRUCTOR', 'COUNSELOR', 'TEACHING_INSPECTOR'].includes(data.role)
        ) {
          const result = await workspaceApi.classes();
          if (active) setClasses(result.data);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Không thể tải trang tổng quan. Vui lòng thử lại; nếu phiên đã hết hạn, hãy đăng nhập lại.',
          );
      });
    return () => {
      active = false;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="workspace-page">
      {/* Workspace Hero Header */}
      <header className="workspace-header">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-info">
              <LayoutDashboard size={13} aria-hidden="true" />
              Smart English V2
            </span>
            <span className="badge-published">
              <UserRound size={12} aria-hidden="true" />
              {accountLabel(user.fullName)}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {workspaceTitles[user.role]}
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            {user.role === 'STUDENT'
              ? 'Xem lớp của bạn, lịch học và các dịch vụ hỗ trợ học tập.'
              : `Theo dõi công việc và các lớp bạn được phụ trách với vai trò ${roleNames[user.role].toLowerCase()}.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.role === 'INSTRUCTOR' && (
            <Link className="btn-primary px-3.5 py-2 text-xs sm:text-sm" to="/instructor/teaching">
              Mở lớp giảng dạy
            </Link>
          )}
          {user.role === 'STUDENT' && (
            <Link className="btn-primary px-3.5 py-2 text-xs sm:text-sm" to="/student/enrollments">
              Vào lớp của tôi
            </Link>
          )}
          {user.role === 'ACADEMIC_MANAGER' && (
            <Link className="btn-primary px-3.5 py-2 text-xs sm:text-sm" to="/academic">
              Quản lý chương trình và lớp
            </Link>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {!workspace && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải dữ liệu…
        </p>
      )}

      {/* Role-Scoped Quick Action Cards */}
      <section aria-label="Phân hệ nghiệp vụ" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(user.role) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/my/calendar"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <Calendar size={13} aria-hidden="true" />
                Lịch tháng & Lớp
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Lớp học và lịch tháng
              </h2>
              <p className="text-xs text-slate-600">
                Theo dõi lịch tháng, các buổi học đã duyệt và truy cập nhanh lớp học.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Xem lịch tháng <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(user.role) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/consultations"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <MessageSquare size={13} aria-hidden="true" />
                Tư vấn 1:1
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                {user.role === 'INSTRUCTOR'
                  ? 'Quản lý lịch tư vấn 1:1'
                  : user.role === 'ACADEMIC_MANAGER'
                    ? 'Phê duyệt tư vấn 1:1'
                    : 'Tư vấn giảng viên 1:1 miễn phí'}
              </h2>
              <p className="text-xs text-slate-600">
                {user.role === 'INSTRUCTOR'
                  ? 'Cập nhật hồ sơ tư vấn, mở khung giờ trống, xác nhận lịch hẹn và gửi link Google Meet.'
                  : user.role === 'ACADEMIC_MANAGER'
                    ? 'Xem xét hồ sơ giảng viên, link Google Meet và đề nghị đổi/hủy lịch chờ duyệt.'
                    : 'Đặt lịch hẹn tư vấn 30 phút trực tuyến miễn phí cùng giảng viên chuyên môn.'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              {user.role === 'INSTRUCTOR'
                ? 'Quản lý tư vấn 1:1'
                : user.role === 'ACADEMIC_MANAGER'
                  ? 'Mở hàng đợi duyệt'
                  : 'Mở lịch tư vấn'}{' '}
              <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['ACADEMIC_MANAGER', 'TEACHING_INSPECTOR', 'INSTRUCTOR'].includes(user.role) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/workspace/inspection"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <ShieldCheck size={13} aria-hidden="true" />
                Giám sát ca dạy
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Thanh tra · Ca và giờ giảng dạy
              </h2>
              <p className="text-xs text-slate-600">
                Theo dõi phân công thanh tra, ghi nhận hiện diện và đối soát giờ giảng dạy.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Mở phân hệ thanh tra <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['STUDENT', 'ACADEMIC_MANAGER', 'CASHIER'].includes(user.role) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to={user.role === 'STUDENT' ? '/admissions' : '/workspace/admissions'}
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <ClipboardCheck size={13} aria-hidden="true" />
                Tuyển sinh & Học phí
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Hồ sơ nhập học và học phí
              </h2>
              <p className="text-xs text-slate-600">
                Xử lý hồ sơ đăng ký lớp, nghĩa vụ học phí và biên nhận đối soát.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Mở hồ sơ học phí <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['STUDENT', 'COUNSELOR', 'ACADEMIC_MANAGER', 'CASHIER', 'INSTRUCTOR'].includes(
          user.role,
        ) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to={user.role === 'STUDENT' ? '/support' : '/workspace/support'}
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <HeadphonesIcon size={13} aria-hidden="true" />
                Chăm sóc học viên
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Yêu cầu tư vấn và hỗ trợ
              </h2>
              <p className="text-xs text-slate-600">
                Gửi phiếu hỗ trợ, phản hồi yêu cầu hoặc chuyển tuyến chuyên môn học vụ.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Xem yêu cầu hỗ trợ <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(user.role) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/workspace/placement"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <Compass size={13} aria-hidden="true" />
                Đánh giá đầu vào
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Bài kiểm tra đầu vào và kết quả
              </h2>
              <p className="text-xs text-slate-600">
                Quản lý đề nguồn, phân công chấm Speaking/Writing và công bố kết quả.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Xem bài kiểm tra đầu vào <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {user.role === 'ACADEMIC_MANAGER' && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/knowledge/workspace"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <BookOpen size={13} aria-hidden="true" />
                Thư viện kiến thức TOEIC
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Biên soạn và duyệt kiến thức
              </h2>
              <p className="text-xs text-slate-600">
                Soạn thảo bài viết chuyên môn và duyệt công bố vào thư viện trung tâm.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Biên soạn bài kiến thức <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}

        {['ACADEMIC_MANAGER', 'INSTRUCTOR', 'STUDENT', 'TEACHING_INSPECTOR'].includes(
          user.role,
        ) && (
          <Link
            className="workspace-card group flex flex-col justify-between gap-3 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
            to="/calendar"
          >
            <div className="space-y-1.5">
              <span className="badge-info">
                <Calendar size={13} aria-hidden="true" />
                Lịch trường
              </span>
              <h2 className="text-base font-bold text-slate-950 group-hover:text-indigo-700">
                Lịch theo ngày của bạn
              </h2>
              <p className="text-xs text-slate-600">
                Tra cứu danh sách các buổi học chính thức theo múi giờ trường.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
              Xem lịch theo ngày <ArrowRight size={13} aria-hidden="true" />
            </span>
          </Link>
        )}
      </section>

      {/* Account & Integration Status Strip */}
      <nav className="grid gap-3 sm:grid-cols-3" aria-label="Tài khoản và trạng thái tích hợp">
        <Link
          className="workspace-subcard bg-white font-semibold text-indigo-700 hover:border-indigo-300 hover:underline"
          to="/profile"
        >
          Hồ sơ và phiên truy cập
        </Link>
        <Link
          className="workspace-subcard bg-white font-semibold text-indigo-700 hover:border-indigo-300 hover:underline"
          to="/workspace/operations/live"
        >
          Tình trạng nguồn vận hành
        </Link>
        {user.role === 'STUDENT' && (
          <Link
            className="workspace-subcard bg-white font-semibold text-indigo-700 hover:border-indigo-300 hover:underline"
            to="/completion"
          >
            Điều kiện hoàn thành và chứng chỉ
          </Link>
        )}
      </nav>

      {/* QT Account & Authority Management */}
      {workspace?.capabilities.accountsManage && (
        <section className="workspace-card space-y-2 border-l-4 border-l-indigo-600">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-indigo-600" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-950">Tài khoản và quyền</h2>
          </div>
          <p className="text-sm text-slate-600">
            Mỗi tài khoản có một vai trò chính. Thay đổi vai trò và cấp quyền cần người duyệt độc
            lập.
          </p>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:underline"
            to="/workspace/authority"
          >
            Quản lý tài khoản, đề xuất và audit <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      )}

      {workspace?.capabilities.recoveryApprove && (
        <div className="workspace-card">
          <Link className="font-bold text-indigo-700 hover:underline" to="/admin/exam-recovery/s10">
            Duyệt khôi phục S10
          </Link>
        </div>
      )}

      {/* Scoped Classes List */}
      {workspace &&
        (workspace.capabilities.classRead ||
          ['STUDENT', 'INSTRUCTOR', 'COUNSELOR', 'TEACHING_INSPECTOR'].includes(user.role)) && (
          <section className="workspace-card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Lớp trong phạm vi được phép</h2>
                <p className="text-xs text-slate-500">
                  Tối đa 100 lớp. Chỉ đọc; học viên xem lớp đã ghi danh, giảng viên xem lớp được
                  phân công.
                </p>
              </div>
              <span className="badge-info">{classes.length} lớp</span>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
              {classes.map((item) => (
                <li
                  key={item.id}
                  className="workspace-subcard flex flex-col justify-between gap-3 bg-white"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="badge-info">{classStateLabel(item.status)}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                        <Users size={13} aria-hidden="true" />
                        {item.activeLearnerCount} học viên đang học
                      </span>
                    </div>

                    <Link
                      className="block pt-1 text-lg font-bold text-[#e66f2b] hover:underline"
                      to={
                        user.role === 'INSTRUCTOR'
                          ? '/classroom/' + item.id
                          : '/workspace/classes/' + item.id
                      }
                    >
                      {user.role === 'STUDENT'
                        ? learnerClassLabel(item.name, item.code)
                        : isTechnicalQaRecord(item.name, item.code, item.course.title)
                          ? classLabel(item.name, item.code, item.course.title)
                          : `${classCodeLabel(item.code)} · ${item.name}`}
                    </Link>

                    <p className="text-xs font-medium text-slate-600">
                      {user.role === 'STUDENT'
                        ? learnerCourseLabel(item.course.title)
                        : isTechnicalQaRecord(item.course.title)
                          ? 'Chương trình QA'
                          : item.course.title}{' '}
                      · Giảng viên:{' '}
                      {item.instructor ? accountLabel(item.instructor.fullName) : 'Chưa phân công'}
                    </p>

                    {user.role !== 'STUDENT' && (
                      <SourceRecord
                        name={`${classCodeLabel(item.code)} · ${item.name}`}
                        code={item.code}
                        courseTitle={item.course.title}
                      />
                    )}
                  </div>

                  {['STUDENT', 'INSTRUCTOR'].includes(user.role) && (
                    <div className="flex justify-end border-t border-slate-100 pt-2.5">
                      <Link
                        to={'/classroom/' + item.id}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline"
                      >
                        Vào lớp học <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {classes.length === 0 && (
              <p className="text-sm text-slate-600">Không có lớp trong phạm vi được phép.</p>
            )}
          </section>
        )}

      {workspace && ['COUNSELOR', 'CASHIER', 'TEACHING_INSPECTOR'].includes(user.role) && (
        <section className="workspace-card space-y-2">
          <h2 className="text-lg font-bold text-slate-950">Phạm vi hiện tại</h2>
          <p className="text-sm text-slate-600">
            Quy trình{' '}
            {user.role === 'COUNSELOR'
              ? 'tư vấn'
              : user.role === 'CASHIER'
                ? 'thu ngân'
                : 'thanh tra'}{' '}
            hiển thị theo quyền và dữ liệu hiện có. Mở mục công việc tương ứng để thực hiện; phần
            chưa đủ quyền hoặc chưa có nguồn dữ liệu sẽ được ghi rõ là chưa khả dụng.
          </p>
        </section>
      )}

      {user.role === 'ADMIN_COORDINATOR' && (
        <p
          role="status"
          className="workspace-card border-amber-300 bg-amber-50 text-sm text-amber-950"
        >
          Tài khoản cũ chưa được xác nhận vai trò. Cần người có thẩm quyền xét duyệt; tài khoản này
          chưa được cấp quyền quản trị mới.
        </p>
      )}
    </div>
  );
}

export function WorkspaceClassPage() {
  const { id } = useParams();
  const { user } = useAuth();
  if (user?.role === 'STUDENT' || user?.role === 'INSTRUCTOR') {
    return <Navigate to={'/classroom/' + id} replace />;
  }
  return <ClassDetail key={id} id={id!} />;
}

function ClassDetail({ id }: { id: string }) {
  const [item, setItem] = useState<WorkspaceClass>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void workspaceApi
      .detail(id!)
      .then((data) => {
        if (active) setItem(data);
      })
      .catch(() => {
        if (active) setError('Không tìm thấy lớp hoặc không có quyền truy cập.');
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="workspace-page">
      <Link
        to="/workspace"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Tổng quan
      </Link>
      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {!item && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải lớp…
        </p>
      )}
      {item && (
        <div className="workspace-card space-y-4">
          <div className="border-b border-slate-100 pb-4">
            <span className="badge-info">
              {classStateLabel(item.status)} · {item.activeLearnerCount} học viên đang học
            </span>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
              {classCodeLabel(item.code)} · {classLabel(item.name, item.code, item.course.title)}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {isTechnicalQaRecord(item.course.title) ? 'Chương trình TOEIC' : item.course.title} ·{' '}
              {item.course.level} · Giảng viên:{' '}
              {item.instructor ? accountLabel(item.instructor.fullName) : 'Chưa phân công'}
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-950">Danh sách học viên</h2>
            {!item.enrollments ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Thông tin định danh từng học viên được bảo mật theo phạm vi phân quyền hiện tại. Sĩ số đang hoạt động là{' '}
                <strong>{item.activeLearnerCount} học viên</strong>.
              </p>
            ) : item.enrollments.length === 0 ? (
              <p className="text-sm text-slate-600">Lớp hiện chưa có học viên ghi danh.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/70 px-4">
                {item.enrollments.map((row) => (
                  <li key={row.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-semibold text-slate-900">
                      {row.learner?.fullName ?? 'Ghi danh của bạn'}
                    </span>
                    <span className="badge-draft">{enrollmentStateLabel(row.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
