import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { TeachingEntry } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';

export function InstructorTeachingPage() {
  const [teachingEntries, setTeachingEntries] = useState<TeachingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchTeaching() {
      try {
        const data = await instructorApi.teaching.list(abortController.signal);
        setTeachingEntries(data);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchTeaching();

    return () => {
      abortController.abort();
    };
  }, [navigate]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Đang tải danh sách...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Đã xảy ra lỗi: {error}
      </div>
    );
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
              <div className="flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-gray-900">{course.title}</h2>
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

                <div className="text-sm text-gray-500 mb-2">
                  <span className="font-semibold text-gray-700">Trình độ:</span> {course.level}
                </div>
                <div className="text-sm text-gray-500 mb-4">
                  <span className="font-semibold text-gray-700">Số module:</span> {course._count.modules}
                </div>

                {classOfferings.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Lớp đang dạy:</h3>
                    <ul className="space-y-2">
                      {classOfferings.map((offering) => (
                        <li key={offering.id} className="text-sm flex items-center gap-2">
                          <span className="text-gray-700">{offering.name}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {offering.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <Link
                  to={`/instructor/courses/${course.id}/content`}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Quản lý nội dung
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
