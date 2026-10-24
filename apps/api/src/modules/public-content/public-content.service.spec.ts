import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PublicContentService } from './public-content.service';

describe('PublicContentService R2 semantics', () => {
  it('clears cover and schedule explicitly and records the real updating actor', async () => {
    const prisma = {
      publicContent: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'content', coverKey: 'reading', coverImageUrl: null }),
        update: jest.fn().mockResolvedValue({ id: 'content' }),
      },
    };
    const service = new PublicContentService(prisma as unknown as PrismaService);
    await service.update('admin-real', 'content', { coverKey: null, publishedAt: null });
    expect(prisma.publicContent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coverKey: null,
          publishedAt: null,
          updatedById: 'admin-real',
        }),
      }),
    );
  });

  it('rejects two simultaneous cover sources', async () => {
    const prisma = {
      publicContent: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'content', coverKey: null, coverImageUrl: null }),
      },
    };
    const service = new PublicContentService(prisma as unknown as PrismaService);
    await expect(
      service.update('admin', 'content', {
        coverKey: 'reading',
        coverImageUrl: 'https://example.com/cover.jpg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
