import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LmsLocalService } from './lms-local.service';

describe('LmsLocalService downloadAllSubmissionsZip', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'lms-local-zip-spec-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('packages each student submission into <Ten>_<YYYY-MM-DD>_<6chars>/ folder in Asia/Ho_Chi_Minh timezone', async () => {
    writeFileSync(join(tempRoot, 'sub-1.txt'), 'Noi dung tep bai nop');

    const tx = {
      classAssignmentSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1b2c3d4-0000-4000-8000-000000000001',
            enrollmentId: 'enr-1',
            storageKey: null,
            originalFileName: null,
            text: '',
            // 2026-11-18T18:30:00Z = 2026-11-19 01:30 in Asia/Ho_Chi_Minh (UTC+7)
            submittedAt: new Date('2026-11-18T18:30:00.000Z'),
            updatedAt: new Date('2026-11-18T18:30:00.000Z'),
            learner: {
              id: 'stu-1',
              fullName: 'Đoàn Minh Ánh',
              email: 'anh@example.com',
            },
          },
          {
            id: 'ff9900ee-0000-4000-8000-000000000002',
            enrollmentId: 'enr-2',
            storageKey: null,
            originalFileName: null,
            text: 'Bai lam van ban cua Binh',
            submittedAt: new Date('2026-11-19T02:00:00.000Z'),
            updatedAt: new Date('2026-11-19T02:00:00.000Z'),
            learner: {
              id: 'stu-2',
              fullName: 'Nguyễn Văn Bình',
              email: 'binh@example.com',
            },
          },
        ]),
      },
      $queryRawUnsafe: jest.fn(async (sql: string, _actId: string, enrId: string) => {
        if (sql.includes('lms_local_assignment_submission_files')) {
          return enrId === 'enr-1'
            ? [
                {
                  storage_key: 'sub-1.txt',
                  original_file_name: 'bai_lam_tuan1.txt',
                  created_at: new Date('2026-11-18T18:29:00.000Z'),
                },
              ]
            : [];
        }
        return [];
      }),
    };

    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;

    const lms = {
      activity: jest.fn().mockResolvedValue({
        id: 'act-1',
        type: 'ASSIGNMENT',
        title: 'Đề bài Tuần 1',
      }),
      run: jest.fn(async (_actor, _classId, fn) =>
        fn(tx, { teacher: true, enrollment: null, now: new Date('2026-11-19T05:00:00Z') }),
      ),
    } as any;

    const svc = new LmsLocalService(prisma, lms);
    (svc as any).localFilesRoot = tempRoot;
    (svc as any).legacyFilesRoot = tempRoot;
    (svc as any).tablesReady = true;

    const result = await svc.downloadAllSubmissionsZip(
      { id: 'inst-1', sessionId: 'sess-1' },
      'class-1',
      'act-1',
    );

    expect(result.fileName).toBe('De_bai_Tuan_1-tat-ca-bai-nop.zip');
    expect(result.buffer.subarray(0, 4).toString('binary')).toBe('PK\x03\x04');
    expect(
      result.buffer.includes(Buffer.from('Doan_Minh_Anh_2026-11-19_a1b2c3/bai_lam_tuan1.txt', 'utf8')),
    ).toBe(true);
    expect(
      result.buffer.includes(Buffer.from('Nguyen_Van_Binh_2026-11-19_ff9900/bai-lam-van-ban.txt', 'utf8')),
    ).toBe(true);
  });
});
