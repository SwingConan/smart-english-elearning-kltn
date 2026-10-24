import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AssessmentStimulusMediaStorage } from '../placement/assessment-stimulus-media.storage';
import { AssessmentInstructorService } from './assessment-instructor.service';

describe('Rubric ownership', () => {
  it('marks another instructor rubric as read-only in the list projection', async () => {
    const prisma = {
      rubric: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'mine', createdById: 'current', criteria: [] },
          { id: 'other', createdById: 'another', criteria: [] },
          { id: 'legacy', createdById: null, criteria: [] },
        ]),
      },
    };
    const service = new AssessmentInstructorService(
      prisma as unknown as PrismaService,
      {} as AssessmentStimulusMediaStorage,
    );
    await expect(service.listRubrics('current')).resolves.toEqual([
      expect.objectContaining({ id: 'mine', canEdit: true, isOwnedByCurrentInstructor: true }),
      expect.objectContaining({ id: 'other', canEdit: false, isOwnedByCurrentInstructor: false }),
      expect.objectContaining({ id: 'legacy', canEdit: false, isOwnedByCurrentInstructor: false }),
    ]);
  });

  it('deactivates an owned rubric without deleting criteria, questions, or grading history', async () => {
    const prisma = {
      rubric: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'rubric', isActive: false, criteria: [] }),
      },
      rubricCriterion: { deleteMany: jest.fn() },
      question: { deleteMany: jest.fn() },
      answerEvaluation: { deleteMany: jest.fn() },
    };
    const service = new AssessmentInstructorService(
      prisma as unknown as PrismaService,
      {} as AssessmentStimulusMediaStorage,
    );
    await service.setRubricActive('instructor', 'rubric', false);
    expect(prisma.rubricCriterion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.question.deleteMany).not.toHaveBeenCalled();
    expect(prisma.answerEvaluation.deleteMany).not.toHaveBeenCalled();
  });
});
