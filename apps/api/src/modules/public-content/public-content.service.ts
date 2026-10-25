import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createRequire } from 'node:module';
import { Prisma, PublicContentFormat, PublicContentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PUBLIC_CONTENT_COVER_KEYS,
  PublicContentQueryDto,
  SavePublicContentCategoryDto,
  SavePublicContentDto,
  UpdatePublicContentCategoryDto,
  UpdatePublicContentDto,
} from './public-content.dto';
import {
  PUBLIC_CONTENT_ASSET_URL_PREFIX,
  PublicContentAssetStorage,
} from './public-content-asset.storage';

// Jest 29 cannot traverse sanitize-html 2.18's ESM-only parser dependency; Node 22's
// native loader bridges it while production and tests execute the same sanitizer.
const sanitizeHtml = createRequire(__filename)('sanitize-html') as typeof import('sanitize-html');

const articleInclude = {
  category: true,
  coverAsset: {
    select: { id: true, storageKey: true, originalName: true, mimeType: true, sizeBytes: true },
  },
} as const;

@Injectable()
export class PublicContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: PublicContentAssetStorage,
  ) {}

  async listPublic(query: PublicContentQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.PublicContentWhereInput = {
      status: PublicContentStatus.PUBLISHED,
      publishedAt: { lte: new Date() },
      category: { isActive: true, ...(query.category ? { slug: query.category } : {}) },
      ...(search ? { OR: this.search(search) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.publicContent.findMany({
        where,
        include: articleInclude,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publicContent.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.present(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async publicDetail(slug: string) {
    const item = await this.prisma.publicContent.findFirst({
      where: {
        slug: this.slug(slug),
        status: PublicContentStatus.PUBLISHED,
        publishedAt: { lte: new Date() },
        category: { isActive: true },
      },
      include: articleInclude,
    });
    if (!item) throw new NotFoundException('Không tìm thấy nội dung đã xuất bản.');
    return this.present(item);
  }

  async listAdmin(query: PublicContentQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.PublicContentWhereInput = {
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(search ? { OR: this.search(search) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.publicContent.findMany({
        where,
        include: articleInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publicContent.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.present(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async adminDetail(id: string) {
    const item = await this.prisma.publicContent.findUnique({
      where: { id },
      include: articleInclude,
    });
    if (!item) throw new NotFoundException('Không tìm thấy nội dung.');
    return this.present(item);
  }

  async create(actorId: string, input: SavePublicContentDto) {
    await this.validateRelations(input.categoryId, input.coverAssetId);
    const data = this.articleData(input);
    return this.guardUnique(async () =>
      this.present(
        await this.prisma.publicContent.create({
          data: { ...data, origin: 'ADMIN_AUTHORED', createdById: actorId, updatedById: actorId },
          include: articleInclude,
        }),
      ),
    );
  }

  async update(actorId: string, id: string, input: UpdatePublicContentDto) {
    const current = await this.prisma.publicContent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy nội dung.');
    await this.validateRelations(
      input.categoryId ?? current.categoryId,
      input.coverAssetId === undefined ? current.coverAssetId : input.coverAssetId,
    );
    const merged = {
      contentFormat: input.contentFormat ?? current.contentFormat,
      bodyMarkdown: input.bodyMarkdown === undefined ? current.bodyMarkdown : input.bodyMarkdown,
      bodyHtml: input.bodyHtml === undefined ? current.bodyHtml : input.bodyHtml,
    };
    const bodies = this.validatedBodies(merged.contentFormat, merged.bodyMarkdown, merged.bodyHtml);
    return this.guardUnique(async () =>
      this.present(
        await this.prisma.publicContent.update({
          where: { id },
          data: {
            ...(input.slug !== undefined ? { slug: this.slug(input.slug) } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.excerpt !== undefined ? { excerpt: input.excerpt.trim() } : {}),
            ...(input.contentFormat !== undefined ? { contentFormat: input.contentFormat } : {}),
            ...bodies,
            ...(input.coverKey !== undefined ? { coverKey: this.coverKey(input.coverKey) } : {}),
            ...(input.coverAssetId !== undefined
              ? { coverAssetId: input.coverAssetId || null }
              : {}),
            ...(input.featured !== undefined ? { featured: input.featured } : {}),
            ...(input.publishedAt !== undefined
              ? { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null }
              : {}),
            updatedById: actorId,
          },
          include: articleInclude,
        }),
      ),
    );
  }

  async publish(actorId: string, id: string) {
    const current = await this.prisma.publicContent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Không tìm thấy nội dung.');
    this.validatedBodies(current.contentFormat, current.bodyMarkdown, current.bodyHtml);
    return this.prisma.publicContent
      .update({
        where: { id },
        data: {
          status: PublicContentStatus.PUBLISHED,
          publishedAt: current.publishedAt ?? new Date(),
          updatedById: actorId,
        },
        include: articleInclude,
      })
      .then((row) => this.present(row));
  }

  async archive(actorId: string, id: string) {
    await this.adminDetail(id);
    return this.prisma.publicContent
      .update({
        where: { id },
        data: { status: PublicContentStatus.ARCHIVED, updatedById: actorId },
        include: articleInclude,
      })
      .then((row) => this.present(row));
  }

  categories(admin = false) {
    return this.prisma.publicContentCategory.findMany({
      where: admin ? {} : { isActive: true },
      include: { _count: { select: { content: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  createCategory(actorId: string, input: SavePublicContentCategoryDto) {
    return this.guardUnique(() =>
      this.prisma.publicContentCategory.create({
        data: {
          name: input.name.trim(),
          slug: this.slug(input.slug),
          description: input.description?.trim() || null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          createdById: actorId,
          updatedById: actorId,
        },
      }),
    );
  }

  updateCategory(actorId: string, id: string, input: UpdatePublicContentCategoryDto) {
    return this.guardUnique(() =>
      this.prisma.publicContentCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined ? { slug: this.slug(input.slug) } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedById: actorId,
        },
      }),
    );
  }

  async deleteCategory(actorId: string, id: string) {
    const used = await this.prisma.publicContent.count({ where: { categoryId: id } });
    if (used) {
      return this.prisma.publicContentCategory.update({
        where: { id },
        data: { isActive: false, updatedById: actorId },
      });
    }
    await this.prisma.publicContentCategory.delete({ where: { id } });
    return { deleted: true };
  }

  async uploadAsset(
    actorId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const stored = await this.assets.put(file);
    try {
      return await this.prisma.publicContentAsset
        .create({
          data: {
            storageKey: stored.key,
            originalName: file.originalname,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            createdById: actorId,
          },
        })
        .then((asset) => this.presentAsset(asset));
    } catch (error) {
      await this.assets.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async listAssets() {
    const assets = await this.prisma.publicContentAsset.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return assets.map((asset) => this.presentAsset(asset));
  }

  async removeAsset(id: string) {
    const asset = await this.prisma.publicContentAsset.findFirst({
      where: { id, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Không tìm thấy ảnh.');
    const referenced = await this.prisma.publicContent.count({
      where: { OR: [{ coverAssetId: id }, { bodyHtml: { contains: asset.storageKey } }] },
    });
    if (referenced) throw new ConflictException('Ảnh đang được sử dụng và không thể xóa.');
    await this.prisma.publicContentAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.assets.delete(asset.storageKey);
    return { deleted: true };
  }

  async openAsset(key: string) {
    const asset = await this.prisma.publicContentAsset.findFirst({
      where: { storageKey: key, deletedAt: null },
      select: { id: true },
    });
    if (!asset) throw new NotFoundException('Không tìm thấy ảnh.');
    return this.assets.open(key);
  }

  private articleData(input: SavePublicContentDto): Prisma.PublicContentUncheckedCreateInput {
    const bodies = this.validatedBodies(input.contentFormat, input.bodyMarkdown, input.bodyHtml);
    return {
      slug: this.slug(input.slug),
      categoryId: input.categoryId,
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      contentFormat: input.contentFormat,
      ...bodies,
      coverKey: this.coverKey(input.coverKey),
      coverAssetId: input.coverAssetId || null,
      coverImageUrl: null,
      featured: input.featured ?? false,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
    };
  }

  private validatedBodies(
    format: PublicContentFormat,
    markdown?: string | null,
    html?: string | null,
  ) {
    if (format === PublicContentFormat.MARKDOWN) {
      const value = markdown?.trim();
      if (!value) throw new BadRequestException('Nội dung Markdown không được để trống.');
      return { bodyMarkdown: value, bodyHtml: null };
    }
    const value = html?.trim();
    if (!value) throw new BadRequestException('Nội dung bài viết không được để trống.');
    if (/<(?:script|style|iframe)|\son\w+\s*=|(?:javascript|data):/i.test(value)) {
      throw new BadRequestException('Nội dung chứa mã hoặc địa chỉ không an toàn.');
    }
    const sanitized = sanitizeHtml(value, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'em',
        'h2',
        'h3',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'img',
      ],
      allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title'] },
      allowedSchemes: ['http', 'https'],
      allowedSchemesAppliedToAttributes: ['href', 'src'],
      allowProtocolRelative: false,
      transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true) },
    });
    const imageSources = [...sanitized.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(
      (match) => match[1],
    );
    if (imageSources.some((source) => !source.startsWith(PUBLIC_CONTENT_ASSET_URL_PREFIX)))
      throw new BadRequestException('Ảnh trong bài viết phải là ảnh đã tải lên hệ thống.');
    return { bodyMarkdown: null, bodyHtml: sanitized };
  }

  private async validateRelations(categoryId: string, coverAssetId?: string | null) {
    const category = await this.prisma.publicContentCategory.findFirst({
      where: { id: categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('Danh mục không tồn tại hoặc đã ngừng sử dụng.');
    if (coverAssetId) {
      const asset = await this.prisma.publicContentAsset.findFirst({
        where: { id: coverAssetId, deletedAt: null },
        select: { id: true },
      });
      if (!asset) throw new BadRequestException('Ảnh bìa không tồn tại.');
    }
  }

  private present<T extends { coverAsset: { storageKey: string } | null }>(item: T) {
    return {
      ...item,
      coverImageUrl: item.coverAsset
        ? `${PUBLIC_CONTENT_ASSET_URL_PREFIX}${item.coverAsset.storageKey}`
        : (item as T & { coverImageUrl?: string | null }).coverImageUrl,
    };
  }

  private presentAsset<T extends { storageKey: string }>(asset: T) {
    return { ...asset, url: `${PUBLIC_CONTENT_ASSET_URL_PREFIX}${asset.storageKey}` };
  }
  private search(value: string): Prisma.PublicContentWhereInput[] {
    const text = value.trim();
    return text
      ? [
          { title: { contains: text, mode: 'insensitive' } },
          { excerpt: { contains: text, mode: 'insensitive' } },
        ]
      : [];
  }
  private coverKey(value?: string | null) {
    if (!value) return null;
    if (!(PUBLIC_CONTENT_COVER_KEYS as readonly string[]).includes(value))
      throw new BadRequestException('Ảnh bìa dựng sẵn không hợp lệ.');
    return value;
  }
  private slug(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) throw new BadRequestException('Đường dẫn không hợp lệ.');
    return slug;
  }
  private async guardUnique<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Tên hoặc đường dẫn đã tồn tại.');
      throw error;
    }
  }
}
