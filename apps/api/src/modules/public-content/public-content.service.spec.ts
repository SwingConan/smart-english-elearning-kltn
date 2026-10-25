import { BadRequestException } from '@nestjs/common';
import { PublicContentFormat } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PublicContentAssetStorage } from './public-content-asset.storage';
import { PublicContentService } from './public-content.service';

describe('PublicContentService CMS security', () => {
  const prisma = {
    publicContentCategory: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    publicContentAsset: { findFirst: jest.fn() },
    publicContent: { create: jest.fn(), count: jest.fn() },
  };
  const storage = { put: jest.fn(), open: jest.fn(), delete: jest.fn() };
  const service = new PublicContentService(
    prisma as unknown as PrismaService,
    storage as unknown as PublicContentAssetStorage,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.publicContentCategory.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
    prisma.publicContent.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: 'article', category: {}, coverAsset: null }),
    );
  });

  it('rejects executable rich HTML and unsafe image URLs', async () => {
    await expect(
      service.create('admin', input('<script>alert(1)</script><p>Safe article body</p>')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('admin', input('<p>Safe article body</p><img src="https://evil.test/a.png">')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores sanitized rich HTML and real audit actors', async () => {
    await service.create(
      'admin',
      input('<h2>Heading</h2><p><strong>Safe</strong> article body.</p>'),
    );
    expect(prisma.publicContent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'admin',
          updatedById: 'admin',
          contentFormat: PublicContentFormat.RICH_HTML,
        }),
      }),
    );
  });

  it('deactivates a used category instead of deleting it', async () => {
    prisma.publicContent.count.mockResolvedValue(2);
    prisma.publicContentCategory.update.mockResolvedValue({ id: 'category', isActive: false });
    await expect(service.deleteCategory('admin', 'category')).resolves.toEqual({
      id: 'category',
      isActive: false,
    });
    expect(prisma.publicContentCategory.delete).not.toHaveBeenCalled();
  });

  function input(bodyHtml: string) {
    return {
      slug: 'safe-article',
      categoryId: '11111111-1111-4111-8111-111111111111',
      title: 'Safe article',
      excerpt: 'A sufficiently long excerpt.',
      contentFormat: PublicContentFormat.RICH_HTML,
      bodyHtml,
    };
  }
});
