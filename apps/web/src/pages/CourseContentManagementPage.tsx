import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useSessionExpiry } from '@/features/auth/use-session-expiry';
import { instructorApi } from '@/features/instructor/api';
import type { Module, Lesson, LearningResource, ResourceType } from '@/features/instructor/types';
import { ApiError } from '@/lib/api-client';
import { knowledgeModelApi } from '@/features/knowledge-model/api';
import { SkillChecklistDialog } from '@/features/knowledge-model/SkillChecklistDialog';
import type { Skill } from '@/features/knowledge-model/types';

export function CourseContentManagementPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const redirectExpiredSession = useSessionExpiry();

  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const mutationInFlight = useRef(false);

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
  const [courseSkills, setCourseSkills] = useState<Skill[] | null>(null);
  const [mappingLesson, setMappingLesson] = useState<Lesson | null>(null);
  const [mappedSkillIds, setMappedSkillIds] = useState<string[]>([]);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  const beginMutation = (action: string): boolean => {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setPendingAction(action);
    setActionError(null);
    return true;
  };

  const endMutation = (): void => {
    mutationInFlight.current = false;
    setPendingAction(null);
  };

  const handleRequestError = useCallback(
    async (
      requestError: unknown,
      fallback: string,
      conflictMessage?: string,
    ): Promise<void> => {
      if (await redirectExpiredSession(requestError)) return;
      setActionError(
        contentErrorMessage(requestError, fallback, conflictMessage),
      );
    },
    [redirectExpiredSession],
  );

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
        if (await redirectExpiredSession(err)) return;
        setError('Không thể tải nội dung khóa học. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }

    void fetchModules();
    return () => abortController.abort();
  }, [courseId, redirectExpiredSession]);

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
        await handleRequestError(
          err,
          'Không thể tải danh sách bài học. Vui lòng thử lại.',
        );
      }
    }
    void fetchLessons();
    return () => abortController.abort();
  }, [expandedModuleId, handleRequestError]);

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
        await handleRequestError(
          err,
          'Không thể tải danh sách tài liệu. Vui lòng thử lại.',
        );
      }
    }
    void fetchResources();
    return () => abortController.abort();
  }, [expandedLessonId, handleRequestError]);


  // Modules handlers
  const handleSaveModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!courseId || !beginMutation('Lưu module')) return;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;

    try {
      if (editingModule?.id) {
        const updated = await instructorApi.modules.update(editingModule.id, { title, description });
        setModules((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await instructorApi.modules.create(courseId, { title, description });
        setModules((current) => [...current, created]);
      }
      setIsModuleModalOpen(false);
      setEditingModule(null);
    } catch (err) {
      await handleRequestError(err, 'Không thể lưu module. Vui lòng thử lại.');
    } finally {
      endMutation();
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa module này? Tất cả bài học bên trong cũng sẽ bị xóa.')) return;
    if (!beginMutation('Xóa module')) return;
    try {
      await instructorApi.modules.delete(id);
      setModules((current) => current.filter((item) => item.id !== id));
      if (expandedModuleId === id) setExpandedModuleId(null);
    } catch (err) {
      await handleRequestError(
        err,
        'Không thể xóa module. Vui lòng thử lại.',
        'Không thể xóa nội dung vì đã có tiến độ học viên.',
      );
    } finally {
      endMutation();
    }
  };

  const handleReorderModules = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === modules.length - 1)) return;
    if (!courseId || !beginMutation('Sắp xếp module')) return;
    const previousModules = modules;
    const reorderedModules = [...modules];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [reorderedModules[index], reorderedModules[swapIndex]] = [reorderedModules[swapIndex], reorderedModules[index]];
    const newModules = reorderedModules.map((item, orderIndex) => ({ ...item, orderIndex }));
    setModules(newModules);

    try {
      await instructorApi.modules.reorder(courseId, newModules.map((item) => item.id));
    } catch (err) {
      setModules(previousModules);
      await handleRequestError(
        err,
        'Không thể sắp xếp module. Thứ tự cũ đã được khôi phục.',
      );
    } finally {
      endMutation();
    }
  };


  // Lessons handlers
  const handleSaveLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!expandedModuleId || !beginMutation('Lưu bài học')) return;
    const moduleId = expandedModuleId;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;

    try {
      if (editingLesson?.id) {
        const updated = await instructorApi.lessons.update(editingLesson.id, { title, description });
        setLessonsMap(prev => ({
          ...prev,
          [moduleId]: (prev[moduleId] ?? []).map((item) => item.id === updated.id ? updated : item)
        }));
      } else {
        const created = await instructorApi.lessons.create(moduleId, { title, description });
        setLessonsMap(prev => ({
          ...prev,
          [moduleId]: [...(prev[moduleId] || []), created]
        }));
      }
      setIsLessonModalOpen(false);
      setEditingLesson(null);
    } catch (err) {
      await handleRequestError(err, 'Không thể lưu bài học. Vui lòng thử lại.');
    } finally {
      endMutation();
    }
  };

  const handleDeleteLesson = async (id: string, moduleId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa bài học này? Tất cả tài liệu bên trong cũng sẽ bị xóa.')) return;
    if (!beginMutation('Xóa bài học')) return;
    try {
      await instructorApi.lessons.delete(id);
      setLessonsMap(prev => ({
        ...prev,
        [moduleId]: (prev[moduleId] ?? []).filter((item) => item.id !== id)
      }));
      if (expandedLessonId === id) setExpandedLessonId(null);
    } catch (err) {
      await handleRequestError(
        err,
        'Không thể xóa bài học. Vui lòng thử lại.',
        'Không thể xóa nội dung vì đã có tiến độ học viên.',
      );
    } finally {
      endMutation();
    }
  };

  const handleReorderLessons = async (moduleId: string, index: number, direction: 'up' | 'down') => {
    const lessons = lessonsMap[moduleId] || [];
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === lessons.length - 1)) return;
    if (!beginMutation('Sắp xếp bài học')) return;
    const previousLessons = lessons;
    const reorderedLessons = [...lessons];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [reorderedLessons[index], reorderedLessons[swapIndex]] = [reorderedLessons[swapIndex], reorderedLessons[index]];
    const newLessons = reorderedLessons.map((item, orderIndex) => ({ ...item, orderIndex }));
    setLessonsMap(prev => ({ ...prev, [moduleId]: newLessons }));

    try {
      await instructorApi.lessons.reorder(moduleId, newLessons.map((item) => item.id));
    } catch (err) {
      setLessonsMap((current) => ({ ...current, [moduleId]: previousLessons }));
      await handleRequestError(
        err,
        'Không thể sắp xếp bài học. Thứ tự cũ đã được khôi phục.',
      );
    } finally {
      endMutation();
    }
  };


  // Resource handlers
  const handleSaveResource = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!expandedLessonId || !beginMutation('Lưu tài liệu')) return;
    const lessonId = expandedLessonId;
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
          [lessonId]: (prev[lessonId] ?? []).map((item) => item.id === updated.id ? updated : item)
        }));
      } else {
        const created = await instructorApi.resources.create(lessonId, { title, type, url, isDownloadable });
        setResourcesMap(prev => ({
          ...prev,
          [lessonId]: [...(prev[lessonId] || []), created]
        }));
      }
      setIsResourceModalOpen(false);
      setEditingResource(null);
    } catch (err) {
      await handleRequestError(err, 'Không thể lưu tài liệu. Vui lòng thử lại.');
    } finally {
      endMutation();
    }
  };

  const handleDeleteResource = async (id: string, lessonId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    if (!beginMutation('Xóa tài liệu')) return;
    try {
      await instructorApi.resources.delete(id);
      setResourcesMap(prev => ({
        ...prev,
        [lessonId]: (prev[lessonId] ?? []).filter((item) => item.id !== id)
      }));
    } catch (err) {
      await handleRequestError(
        err,
        'Không thể xóa tài liệu. Vui lòng thử lại.',
        'Không thể xóa nội dung vì đã có tiến độ học viên.',
      );
    } finally {
      endMutation();
    }
  };

  const handleReorderResources = async (lessonId: string, index: number, direction: 'up' | 'down') => {
    const resources = resourcesMap[lessonId] || [];
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === resources.length - 1)) return;
    if (!beginMutation('Sắp xếp tài liệu')) return;
    const previousResources = resources;
    const reorderedResources = [...resources];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [reorderedResources[index], reorderedResources[swapIndex]] = [reorderedResources[swapIndex], reorderedResources[index]];
    const newResources = reorderedResources.map((item, orderIndex) => ({ ...item, orderIndex }));
    setResourcesMap(prev => ({ ...prev, [lessonId]: newResources }));

    try {
      await instructorApi.resources.reorder(lessonId, newResources.map((item) => item.id));
    } catch (err) {
      setResourcesMap((current) => ({ ...current, [lessonId]: previousResources }));
      await handleRequestError(
        err,
        'Không thể sắp xếp tài liệu. Thứ tự cũ đã được khôi phục.',
      );
    } finally {
      endMutation();
    }
  };

  const openLessonSkillMapping = async (lesson: Lesson) => {
    if (!courseId) return;
    setMappingLesson(lesson);
    setMappingMessage(null);
    setMappingLoading(true);
    setMappingError(null);
    try {
      const [available, mapped] = await Promise.all([
        courseSkills ?? knowledgeModelApi.skills.list(courseId),
        knowledgeModelApi.lessonSkills.list(lesson.id),
      ]);
      setCourseSkills(available);
      setMappedSkillIds(mapped.map(({ id }) => id));
    } catch (requestError) {
      if (await redirectExpiredSession(requestError)) return;
      setMappingError('Không thể tải liên kết Skill cho bài học.');
    } finally {
      setMappingLoading(false);
    }
  };

  const saveLessonSkillMapping = async () => {
    if (!mappingLesson || !beginMutation('Lưu Skill bài học')) return;
    try {
      const mapped = await knowledgeModelApi.lessonSkills.replace(
        mappingLesson.id,
        [...new Set(mappedSkillIds)],
      );
      setMappedSkillIds(mapped.map(({ id }) => id));
      setMappingLesson(null);
      setMappingMessage('Đã cập nhật Skill cho bài học.');
    } catch (requestError) {
      if (await redirectExpiredSession(requestError)) return;
      setMappingError('Không thể cập nhật liên kết Skill cho bài học.');
    } finally {
      endMutation();
    }
  };


  if (loading) return <div className="p-8 text-center">Đang tải nội dung...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  const isMutating = pendingAction !== null;

  return (
    <div className="max-w-5xl mx-auto py-8">
      {actionError ? (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}
      {mappingMessage ? (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-green-700" role="status">
          {mappingMessage}
        </p>
      ) : null}
      {pendingAction ? (
        <p className="mb-4 rounded-md bg-blue-50 p-3 text-blue-700" role="status">
          {pendingAction}...
        </p>
      ) : null}
      <fieldset className="contents" disabled={isMutating}>
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
                               <button onClick={() => void openLessonSkillMapping(lesson)} className="text-xs text-emerald-700 hover:underline">Edit Skills</button>
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
      {mappingLesson ? <SkillChecklistDialog
        title={`Skill (KC) của bài học: ${mappingLesson.title}`}
        description="Chọn các Skill được giảng dạy hoặc củng cố trong bài học này."
        skills={courseSkills ?? []}
        selectedIds={mappedSkillIds}
        pending={mappingLoading || pendingAction === 'Lưu Skill bài học'}
        error={mappingError}
        onToggle={(id) => setMappedSkillIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
        onSave={() => void saveLessonSkillMapping()}
        onCancel={() => setMappingLesson(null)}
      /> : null}
      </fieldset>
    </div>
  );
}

function contentErrorMessage(
  error: unknown,
  fallback: string,
  conflictMessage?: string,
): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return conflictMessage ?? 'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.';
    }
    if (error.status === 403) {
      return 'Bạn không có quyền thực hiện thao tác này.';
    }
    if (error.status === 404) {
      return 'Nội dung không còn tồn tại. Vui lòng tải lại trang.';
    }
    if (error.status === 400) {
      return 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.';
    }
  }
  return fallback;
}
