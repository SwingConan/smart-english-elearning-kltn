import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { instructorApi } from '@/features/instructor/api';
import type { Module, Lesson, LearningResource, ResourceType } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';

export function CourseContentManagementPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for expanded modules/lessons
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  // Data states
  const [lessonsMap, setLessonsMap] = useState<Record<string, Lesson[]>>({});
  const [resourcesMap, setResourcesMap] = useState<Record<string, LearningResource[]>>({});

  // Form states
  const [editingModule, setEditingModule] = useState<Partial<Module> | null>(null);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);

  const [editingLesson, setEditingLesson] = useState<Partial<Lesson> | null>(null);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);

  const [editingResource, setEditingResource] = useState<Partial<LearningResource> | null>(null);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    const abortController = new AbortController();

    async function fetchModules() {
      try {
        setLoading(true);
        const data = await instructorApi.modules.list(courseId!, abortController.signal);
        setModules(data);
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

    fetchModules();
    return () => abortController.abort();
  }, [courseId, navigate]);

  // Load lessons for module
  useEffect(() => {
    if (!expandedModuleId) return;
    const abortController = new AbortController();
    async function fetchLessons() {
      try {
        const data = await instructorApi.lessons.list(expandedModuleId!, abortController.signal);
        setLessonsMap((prev) => ({ ...prev, [expandedModuleId!]: data }));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error(err);
      }
    }
    fetchLessons();
    return () => abortController.abort();
  }, [expandedModuleId]);

  // Load resources for lesson
  useEffect(() => {
    if (!expandedLessonId) return;
    const abortController = new AbortController();
    async function fetchResources() {
      try {
        const data = await instructorApi.resources.list(expandedLessonId!, abortController.signal);
        setResourcesMap((prev) => ({ ...prev, [expandedLessonId!]: data }));
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error(err);
      }
    }
    fetchResources();
    return () => abortController.abort();
  }, [expandedLessonId]);


  // Modules handlers
  const handleSaveModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!courseId) return;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;

    try {
      if (editingModule?.id) {
        const updated = await instructorApi.modules.update(editingModule.id, { title, description });
        setModules(modules.map(m => m.id === updated.id ? updated : m));
      } else {
        const created = await instructorApi.modules.create(courseId, { title, description });
        setModules([...modules, created]);
      }
      setIsModuleModalOpen(false);
      setEditingModule(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi lưu module');
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa module này? Tất cả bài học bên trong cũng sẽ bị xóa.')) return;
    try {
      await instructorApi.modules.delete(id);
      setModules(modules.filter(m => m.id !== id));
      if (expandedModuleId === id) setExpandedModuleId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa module');
    }
  };

  const handleReorderModules = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === modules.length - 1)) return;
    const newModules = [...modules];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newModules[index], newModules[swapIndex]] = [newModules[swapIndex], newModules[index]];
    
    // Update order indexes locally for immediate UI response
    newModules.forEach((m, i) => m.orderIndex = i);
    setModules(newModules);
    
    try {
      if (courseId) {
         await instructorApi.modules.reorder(courseId, newModules.map(m => m.id));
      }
    } catch (err) {
      // Revert if error
      alert('Lỗi khi sắp xếp lại');
    }
  };


  // Lessons handlers
  const handleSaveLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!expandedModuleId) return;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;

    try {
      if (editingLesson?.id) {
        const updated = await instructorApi.lessons.update(editingLesson.id, { title, description });
        setLessonsMap(prev => ({
          ...prev,
          [expandedModuleId]: prev[expandedModuleId].map(l => l.id === updated.id ? updated : l)
        }));
      } else {
        const created = await instructorApi.lessons.create(expandedModuleId, { title, description });
        setLessonsMap(prev => ({
          ...prev,
          [expandedModuleId]: [...(prev[expandedModuleId] || []), created]
        }));
      }
      setIsLessonModalOpen(false);
      setEditingLesson(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi lưu bài học');
    }
  };

  const handleDeleteLesson = async (id: string, moduleId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài học này? Tất cả tài liệu bên trong cũng sẽ bị xóa.')) return;
    try {
      await instructorApi.lessons.delete(id);
      setLessonsMap(prev => ({
        ...prev,
        [moduleId]: prev[moduleId].filter(l => l.id !== id)
      }));
      if (expandedLessonId === id) setExpandedLessonId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa bài học');
    }
  };

  const handleReorderLessons = async (moduleId: string, index: number, direction: 'up' | 'down') => {
    const lessons = lessonsMap[moduleId] || [];
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === lessons.length - 1)) return;
    
    const newLessons = [...lessons];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newLessons[index], newLessons[swapIndex]] = [newLessons[swapIndex], newLessons[index]];
    
    newLessons.forEach((l, i) => l.orderIndex = i);
    setLessonsMap(prev => ({ ...prev, [moduleId]: newLessons }));
    
    try {
      await instructorApi.lessons.reorder(moduleId, newLessons.map(l => l.id));
    } catch (err) {
      alert('Lỗi khi sắp xếp lại');
    }
  };


  // Resource handlers
  const handleSaveResource = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!expandedLessonId) return;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const type = formData.get('type') as ResourceType;
    const url = formData.get('url') as string;
    const isDownloadable = formData.get('isDownloadable') === 'on';

    try {
      if (editingResource?.id) {
        const updated = await instructorApi.resources.update(editingResource.id, { title, type, url, isDownloadable });
        setResourcesMap(prev => ({
          ...prev,
          [expandedLessonId]: prev[expandedLessonId].map(r => r.id === updated.id ? updated : r)
        }));
      } else {
        const created = await instructorApi.resources.create(expandedLessonId, { title, type, url, isDownloadable });
        setResourcesMap(prev => ({
          ...prev,
          [expandedLessonId]: [...(prev[expandedLessonId] || []), created]
        }));
      }
      setIsResourceModalOpen(false);
      setEditingResource(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi lưu tài liệu');
    }
  };

  const handleDeleteResource = async (id: string, lessonId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    try {
      await instructorApi.resources.delete(id);
      setResourcesMap(prev => ({
        ...prev,
        [lessonId]: prev[lessonId].filter(r => r.id !== id)
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa tài liệu');
    }
  };

  const handleReorderResources = async (lessonId: string, index: number, direction: 'up' | 'down') => {
    const resources = resourcesMap[lessonId] || [];
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === resources.length - 1)) return;
    
    const newResources = [...resources];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newResources[index], newResources[swapIndex]] = [newResources[swapIndex], newResources[index]];
    
    newResources.forEach((r, i) => r.orderIndex = i);
    setResourcesMap(prev => ({ ...prev, [lessonId]: newResources }));
    
    try {
      await instructorApi.resources.reorder(lessonId, newResources.map(r => r.id));
    } catch (err) {
      alert('Lỗi khi sắp xếp lại');
    }
  };


  if (loading) return <div className="p-8 text-center">Đang tải nội dung...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Lỗi: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý nội dung khóa học</h1>
        <button
          onClick={() => { setEditingModule(null); setIsModuleModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Thêm Module
        </button>
      </div>

      {modules.length === 0 ? (
        <div className="text-center py-10 bg-white shadow rounded-lg text-gray-500">
          Chưa có module nào. Hãy thêm module đầu tiên!
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map((module, mIndex) => (
            <div key={module.id} className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
              <div className="p-4 bg-gray-50 flex justify-between items-center border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setExpandedModuleId(expandedModuleId === module.id ? null : module.id)}
                    className="text-gray-500 hover:text-gray-700 font-bold w-6"
                  >
                    {expandedModuleId === module.id ? '▼' : '▶'}
                  </button>
                  <h2 className="text-lg font-semibold cursor-pointer" onClick={() => setExpandedModuleId(expandedModuleId === module.id ? null : module.id)}>
                    Module {mIndex + 1}: {module.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleReorderModules(mIndex, 'up')} disabled={mIndex === 0} className="px-2 py-1 text-gray-500 disabled:opacity-30">▲</button>
                  <button onClick={() => handleReorderModules(mIndex, 'down')} disabled={mIndex === modules.length - 1} className="px-2 py-1 text-gray-500 disabled:opacity-30">▼</button>
                  <button onClick={() => { setEditingModule(module); setIsModuleModalOpen(true); }} className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50">Sửa</button>
                  <button onClick={() => handleDeleteModule(module.id)} className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50">Xóa</button>
                </div>
              </div>

              {expandedModuleId === module.id && (
                <div className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-md font-medium text-gray-700">Danh sách bài học</h3>
                    <button
                      onClick={() => { setEditingLesson(null); setIsLessonModalOpen(true); }}
                      className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
                    >
                      Thêm bài học
                    </button>
                  </div>

                  {(!lessonsMap[module.id] || lessonsMap[module.id].length === 0) ? (
                    <div className="text-sm text-gray-500 italic py-2">Chưa có bài học nào.</div>
                  ) : (
                    <div className="space-y-3 pl-4 border-l-2 border-gray-100">
                      {lessonsMap[module.id].map((lesson, lIndex) => (
                        <div key={lesson.id} className="bg-gray-50 rounded border border-gray-200">
                          <div className="p-3 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                               <button 
                                onClick={() => setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)}
                                className="text-gray-400 hover:text-gray-600 text-xs w-4"
                              >
                                {expandedLessonId === lesson.id ? '▼' : '▶'}
                              </button>
                              <span className="font-medium text-gray-800 cursor-pointer" onClick={() => setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)}>
                                Bài {lIndex + 1}: {lesson.title}
                              </span>
                            </div>
                            <div className="flex gap-2">
                               <button onClick={() => handleReorderLessons(module.id, lIndex, 'up')} disabled={lIndex === 0} className="px-1 text-gray-400 disabled:opacity-30">▲</button>
                               <button onClick={() => handleReorderLessons(module.id, lIndex, 'down')} disabled={lIndex === lessonsMap[module.id].length - 1} className="px-1 text-gray-400 disabled:opacity-30">▼</button>
                               <button onClick={() => { setEditingLesson(lesson); setIsLessonModalOpen(true); }} className="text-xs text-blue-600 hover:underline">Sửa</button>
                               <button onClick={() => handleDeleteLesson(lesson.id, module.id)} className="text-xs text-red-600 hover:underline">Xóa</button>
                            </div>
                          </div>

                          {expandedLessonId === lesson.id && (
                             <div className="p-3 pt-0 border-t border-gray-200 mt-2">
                                <div className="flex justify-between items-center my-3">
                                  <h4 className="text-sm font-medium text-gray-600">Tài liệu</h4>
                                  <button
                                    onClick={() => { setEditingResource(null); setIsResourceModalOpen(true); }}
                                    className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"
                                  >
                                    Thêm tài liệu
                                  </button>
                                </div>
                                {(!resourcesMap[lesson.id] || resourcesMap[lesson.id].length === 0) ? (
                                  <div className="text-xs text-gray-500 italic py-1">Chưa có tài liệu nào.</div>
                                ) : (
                                  <ul className="space-y-2">
                                    {resourcesMap[lesson.id].map((resource, rIndex) => (
                                      <li key={resource.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100 text-sm">
                                        <div className="flex items-center gap-2">
                                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">{resource.type}</span>
                                          <a href={resource.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-xs">{resource.title}</a>
                                          {resource.isDownloadable && <span className="text-xs text-green-600 ml-2">(Có thể tải)</span>}
                                        </div>
                                        <div className="flex gap-2">
                                           <button onClick={() => handleReorderResources(lesson.id, rIndex, 'up')} disabled={rIndex === 0} className="px-1 text-gray-400 disabled:opacity-30 text-xs">▲</button>
                                           <button onClick={() => handleReorderResources(lesson.id, rIndex, 'down')} disabled={rIndex === resourcesMap[lesson.id].length - 1} className="px-1 text-gray-400 disabled:opacity-30 text-xs">▼</button>
                                           <button onClick={() => { setEditingResource(resource); setIsResourceModalOpen(true); }} className="text-xs text-blue-600 hover:underline">Sửa</button>
                                           <button onClick={() => handleDeleteResource(resource.id, lesson.id)} className="text-xs text-red-600 hover:underline">Xóa</button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                             </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Module Modal */}
      {isModuleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingModule?.id ? 'Sửa Module' : 'Thêm Module'}</h2>
            <form onSubmit={handleSaveModule} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                <input name="title" required defaultValue={editingModule?.title} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mô tả (tùy chọn)</label>
                <textarea name="description" defaultValue={editingModule?.description || ''} className="w-full border rounded p-2" rows={3}></textarea>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsModuleModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lesson Modal */}
      {isLessonModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingLesson?.id ? 'Sửa Bài học' : 'Thêm Bài học'}</h2>
            <form onSubmit={handleSaveLesson} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                <input name="title" required defaultValue={editingLesson?.title} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Mô tả (tùy chọn)</label>
                <textarea name="description" defaultValue={editingLesson?.description || ''} className="w-full border rounded p-2" rows={3}></textarea>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsLessonModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resource Modal */}
      {isResourceModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingResource?.id ? 'Sửa Tài liệu' : 'Thêm Tài liệu'}</h2>
            <form onSubmit={handleSaveResource} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tiêu đề</label>
                <input name="title" required defaultValue={editingResource?.title} className="w-full border rounded p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Loại</label>
                <select name="type" required defaultValue={editingResource?.type || 'VIDEO'} className="w-full border rounded p-2">
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Tài liệu (PDF, Word...)</option>
                  <option value="LINK">Liên kết ngoài</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL / Link</label>
                <input name="url" type="url" required defaultValue={editingResource?.url} className="w-full border rounded p-2" />
              </div>
              <div className="flex items-center gap-2">
                <input name="isDownloadable" type="checkbox" id="isDownloadable" defaultChecked={editingResource?.isDownloadable} />
                <label htmlFor="isDownloadable" className="text-sm font-medium">Cho phép tải xuống</label>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setIsResourceModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 text-white bg-purple-600 rounded hover:bg-purple-700">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
