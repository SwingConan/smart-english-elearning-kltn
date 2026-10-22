import { NavLink, Outlet } from 'react-router';

const tabs = [
  ['/admin/criteria/evaluation', 'Đánh giá đầu vào'],
  ['/admin/criteria/course-recommendations', 'Gợi ý khóa học'],
  ['/admin/criteria/study-recommendations', 'Gợi ý tự học'],
] as const;

export function AdminCriteriaLayout() {
  return (
    <div>
      <nav
        aria-label="Các nhóm tiêu chí và quy tắc"
        className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      >
        {tabs.map(([to, label]) => (
          <NavLink
            className={({ isActive }) =>
              `whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
              }`
            }
            key={to}
            to={to}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-950">
        Thay đổi tiêu chí chỉ áp dụng cho kết quả/gợi ý được tạo sau khi lưu. Lịch sử học viên đã
        ghi nhận sẽ không bị tính lại.
      </div>
      <Outlet />
    </div>
  );
}
