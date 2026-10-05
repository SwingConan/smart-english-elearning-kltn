import { useOutletContext } from 'react-router';
import type { InstructorClassWorkspaceContext } from '@/layouts/InstructorClassWorkspaceLayout';
import { CourseContentManagementPage } from './CourseContentManagementPage';

export function InstructorClassContentPage() {
  const { overview } = useOutletContext<InstructorClassWorkspaceContext>();
  return <CourseContentManagementPage courseId={overview.classOffering.course.id} sharedWarning />;
}
