import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { instructorApi } from '@/features/instructor/api';
import type { TeachingEntry } from '@/features/instructor/types';

const offeringStatusLabel: Record<string, string> = {
  OPEN: 'Đang mở đăng ký',
  IN_PROGRESS: 'Đang học',
  CLOSED: 'Đã đóng',
  COMPLETED: 'Đã kết thúc',
  DRAFT: 'Bản nháp',
};

export function InstructorTeachingPage() {
  const [teachingEntries, setTeachingEntries] = useState<TeachingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const redirectExpiredSession = useSessionExpiry();

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchTeaching() {
      try {
        const data = await instructorApi.teaching.list(abortController.signal);
        setTeachingEntries(data);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (await redirectExpiredSession(err)) return;
        setError('Không thể tải danh sách lớp giảng dạy. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }

    void fetchTeaching();

    return () => {
      abortController.abort();
    };
  }, [redirectExpiredSession]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tải danh sách...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">Đã xảy ra lỗi: {error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Lớp giảng dạy của tôi</h1>

      {teachingEntries.length === 0 ? (
        <div className="text-center text-gray-500 bg-white shadow rounded-lg p-8">
          Bạn chưa được phân công giảng dạy khóa học nào.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teachingEntries.map(({ course, classOfferings }) => (
            <div
              key={course.id}
              className="bg-white shadow rounded-lg p-6 border border-gray-200 flex flex-col h-full"
            >
              <div className="flex flex-1 flex-col">
                <div className="mb-4 flex min-h-16 items-start justify-between gap-3">
                  <h2 className="text-xl font-bold leading-7 text-gray-900">{course.title}</h2>
                  {course.isPublished ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Đã xuất bản
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Nháp
                    </span>
                  )}
                </div>

                <div className="mb-4 min-h-14 space-y-2">
                  <div className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-700">Trình độ:</span> {course.level}
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-700">Số module:</span>{' '}
                    {course._count.modules}
                  </div>
                </div>

                {classOfferings.length > 0 && (
                  <div className="mb-4 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Lớp đang dạy:</h3>
                    <ul className="space-y-3">
                      {classOfferings.map((offering) => (
                        <li
                          key={offering.id}
                          className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
                        >
                          <div className="flex min-h-10 items-start justify-between gap-2">
                            <span className="font-semibold leading-5 text-gray-800">
                              {offering.name}
                            </span>
                            <span className="inline-flex shrink-0 items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              {offeringStatusLabel[offering.status] ?? 'Đang cập nhật'}
                            </span>
                          </div>
                          <Link
                            className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700"
                            to={`/instructor/classes/${offering.id}/assessments`}
                          >
                            Bài kiểm tra của lớp
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-2 border-t border-gray-100 pt-4">
                <Link
                  to={`/instructor/courses/${course.id}/content`}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Quản lý nội dung
                </Link>
                <Link
                  to={`/instructor/courses/${course.id}/question-bank`}
                  className="inline-flex w-full items-center justify-center rounded-md border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Ngân hàng câu hỏi
                </Link>
                <Link
                  to={`/instructor/courses/${course.id}/tests`}
                  className="inline-flex w-full items-center justify-center rounded-md border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Mẫu bài kiểm tra
                </Link>
                <p className="text-xs leading-5 text-slate-500">
                  Mẫu bài kiểm tra = nội dung dùng lại. Bài kiểm tra của lớp = lịch giao và bài nộp
                  của một lớp cụ thể.
                </p>
                <details className="rounded-md border border-slate-200 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Công cụ nâng cao
                  </summary>
                  <div className="mt-3 grid gap-2">
                    <Link
                      className="text-emerald-700 hover:underline"
                      to={`/instructor/courses/${course.id}/skills`}
                    >
                      Mô hình kiến thức — Kỹ năng (KC)
                    </Link>
                    <Link
                      className="text-amber-700 hover:underline"
                      to={`/instructor/courses/${course.id}/adaptive-policy`}
                    >
                      Chính sách thích ứng
                    </Link>
                    <Link
                      className="text-cyan-700 hover:underline"
                      to={`/instructor/courses/${course.id}/learner-mastery`}
                    >
                      Mức độ thành thạo của học viên
                    </Link>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
