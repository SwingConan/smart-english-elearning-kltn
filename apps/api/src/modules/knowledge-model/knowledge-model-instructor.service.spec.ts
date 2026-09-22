import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { KnowledgeModelInstructorService } from './knowledge-model-instructor.service';

describe('KnowledgeModelInstructorService', () => {
  const instructorId = '10000000-0000-4000-8000-000000000001';
  const courseId = '20000000-0000-4000-8000-000000000001';
  const skillId = '30000000-0000-4000-8000-000000000001';
  let transaction: {
    classOffering: { findFirst: jest.Mock };
    skill: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    masteryHistory: { findFirst: jest.Mock };
  };
  let prisma: { $transaction: jest.Mock };
  let service: KnowledgeModelInstructorService;

  beforeEach(() => {
    transaction = {
      classOffering: { findFirst: jest.fn().mockResolvedValue({ id: 'offering' }) },
      skill: {
        create: jest.fn(async ({ data }) => ({ id: skillId, ...data })),
        findUnique: jest.fn(),
        update: jest.fn(async ({ data }) => ({ id: skillId, courseId, ...data })),
      },
      masteryHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(transaction)),
    };
    service = new KnowledgeModelInstructorService(prisma as unknown as PrismaService);
  });

  it('creates a Skill with the locked BKT defaults and preserves trimmed code casing', async () => {
    const result = await service.createSkill(instructorId, courseId, {
      code: '  Grammar_Core  ',
      name: '  Grammar Core  ',
    });

    expect(result).toMatchObject({
      code: 'Grammar_Core',
      name: 'Grammar Core',
      pInit: 0.5,
      pLearn: 0.1,
      pGuess: 0.2,
      pSlip: 0.1,
    });
  });

  it('accepts custom valid BKT parameters', async () => {
    const result = await service.createSkill(instructorId, courseId, {
      code: 'CUSTOM',
      name: 'Custom',
      pInit: 0.25,
      pLearn: 0.3,
      pGuess: 0.4,
      pSlip: 0.2,
    });
    expect(result).toMatchObject({ pInit: 0.25, pLearn: 0.3, pGuess: 0.4, pSlip: 0.2 });
  });

  it.each([
    { pInit: -0.01 },
    { pLearn: 1.01 },
    { pGuess: Number.NaN },
    { pSlip: Number.POSITIVE_INFINITY },
  ])('rejects an invalid BKT range: %p', async (invalid) => {
    await expect(
      service.createSkill(instructorId, courseId, {
        code: 'INVALID',
        name: 'Invalid',
        ...invalid,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates pGuess + pSlip from final effective PATCH values', async () => {
    transaction.skill.findUnique.mockResolvedValue({
      id: skillId,
      courseId,
      code: 'SKILL',
      name: 'Skill',
      description: null,
      pInit: 0.5,
      pLearn: 0.1,
      pGuess: 0.2,
      pSlip: 0.1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.updateSkill(instructorId, skillId, { pGuess: 0.95 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks only effective BKT changes after history while allowing same-value metadata updates', async () => {
    const stored = {
      id: skillId,
      courseId,
      code: 'SKILL',
      name: 'Skill',
      description: null,
      pInit: 0.5,
      pLearn: 0.1,
      pGuess: 0.2,
      pSlip: 0.1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    transaction.skill.findUnique.mockResolvedValue(stored);
    transaction.masteryHistory.findFirst.mockResolvedValue({ id: 'history' });

    await expect(service.updateSkill(instructorId, skillId, { pInit: 0.6 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.updateSkill(instructorId, skillId, { pInit: 0.5, name: 'Renamed' }),
    ).resolves.toMatchObject({ name: 'Renamed', pInit: 0.5 });
  });
});
