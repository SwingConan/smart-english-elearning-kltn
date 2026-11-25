import { Link, useLocation } from 'react-router';

export function LearnerBreadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  let parent: { to: string; label: string } | undefined;
  let label = 'Trang học tập';
  if (segments[0] === 'student') {
    label = 'Lớp đang theo học';
    if (segments.length > 2) {
      parent = { to: '/student/enrollments', label };
      label =
        (
          {
            learn: 'Nội dung học tập',
            lessons: 'Bài học',
            tests: 'Bài kiểm tra',
            results: 'Kết quả',
            recommendations: 'Gợi ý tự học',
            progress: 'Tiến độ',
            mastery: 'Năng lực học tập',
            path: 'Lộ trình học',
            attempts: pathname.endsWith('/result') ? 'Kết quả bài làm' : 'Bài làm',
          } as Record<string, string>
        )[segments[3]] ?? 'Không gian lớp';
    }
  } else {
    label =
      (
        {
          my: 'Lịch tháng',
          classroom: 'Không gian lớp',
          workspace: 'Trang học tập',
          placement: 'Kiểm tra đầu vào',
          admissions: 'Học phí & Ghi danh',
          payments: 'Thanh toán học phí',
          consultations: 'Tư vấn 1:1',
          knowledge: 'Thư viện kiến thức TOEIC',
          support: 'Hỗ trợ học viên',
          completion: 'Hoàn thành & Chứng chỉ',
          profile: 'Hồ sơ cá nhân',
          certificates: 'Tra cứu chứng chỉ',
          calendar: 'Lịch học',
        } as Record<string, string>
      )[segments[0]] ?? label;
    if (pathname === '/workspace/reports') label = 'Báo cáo cá nhân';
    if (pathname.startsWith('/my/events/')) {
      parent = { to: '/my/', label: 'Lịch tháng' };
      label = 'Chi tiết buổi học';
    }
  }
  return (
    <nav
      aria-label="Đường dẫn học viên"
      className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-2 px-4 pt-5 text-xs font-semibold text-slate-500 sm:px-6 lg:px-8"
    >
      <Link to="/workspace" className="hover:text-[#4d7439]">
        Trang chủ học tập
      </Link>
      <span aria-hidden="true">/</span>
      {parent && (
        <>
          <Link to={parent.to} className="hover:text-[#4d7439]">
            {parent.label}
          </Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      <span aria-current="page" className="text-[#4d7439]">
        {label}
      </span>
    </nav>
  );
}
