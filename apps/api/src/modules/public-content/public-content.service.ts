import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PublicContentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PublicContentQueryDto,
  SavePublicContentDto,
  UpdatePublicContentDto,
} from './public-content.dto';

@Injectable()
export class PublicContentService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: PublicContentQueryDto) {
    const where: Prisma.PublicContentWhereInput = {
      status: PublicContentStatus.PUBLISHED,
      publishedAt: { lte: new Date() },
      ...(query.category ? { category: query.category } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.publicContent.findMany({
        where,
        select: {
          id: true,
          slug: true,
          category: true,
          title: true,
          excerpt: true,
          coverKey: true,
          coverImageUrl: true,
          featured: true,
          publishedAt: true,
        },
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publicContent.count({ where }),
    ]);
    return {
      data,
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
      },
      select: {
        id: true,
        slug: true,
        category: true,
        title: true,
        excerpt: true,
        bodyMarkdown: true,
        coverKey: true,
        coverImageUrl: true,
        featured: true,
        publishedAt: true,
      },
    });
    if (!item) throw new NotFoundException('Published content not found');
    return item;
  }

  listAdmin(query: PublicContentQueryDto) {
    return this.prisma.publicContent.findMany({
      where: query.category ? { category: query.category } : {},
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
  }

  async adminDetail(id: string) {
    const item = await this.prisma.publicContent.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Public content not found');
    return item;
  }

  create(actorId: string, input: SavePublicContentDto) {
    this.validateCover(input);
    return this.guardUnique(() =>
      this.prisma.publicContent.create({
        data: { ...this.data(input), createdById: actorId, updatedById: actorId },
      }),
    );
  }

  update(actorId: string, id: string, input: UpdatePublicContentDto) {
    this.validateCover(input);
    return this.guardUnique(() =>
      this.prisma.publicContent.update({
        where: { id },
        data: { ...this.updateData(input), updatedById: actorId },
      }),
    );
  }

  async publish(actorId: string, id: string) {
    await this.adminDetail(id);
    return this.prisma.publicContent.update({
      where: { id },
      data: {
        status: PublicContentStatus.PUBLISHED,
        publishedAt: new Date(),
        updatedById: actorId,
      },
    });
  }

  async archive(actorId: string, id: string) {
    await this.adminDetail(id);
    return this.prisma.publicContent.update({
      where: { id },
      data: { status: PublicContentStatus.ARCHIVED, updatedById: actorId },
    });
  }

  private data(input: SavePublicContentDto) {
    return {
      slug: this.slug(input.slug),
      category: input.category,
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      bodyMarkdown: input.bodyMarkdown.trim(),
      coverKey: input.coverKey?.trim() || null,
      coverImageUrl: input.coverImageUrl?.trim() || null,
      featured: input.featured ?? false,
    };
  }

  private updateData(input: UpdatePublicContentDto): Prisma.PublicContentUncheckedUpdateInput {
    return {
      ...(input.slug !== undefined ? { slug: this.slug(input.slug) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt.trim() } : {}),
      ...(input.bodyMarkdown !== undefined ? { bodyMarkdown: input.bodyMarkdown.trim() } : {}),
      ...(input.coverKey !== undefined ? { coverKey: input.coverKey.trim() || null } : {}),
      ...(input.coverImageUrl !== undefined
        ? { coverImageUrl: input.coverImageUrl.trim() || null }
        : {}),
      ...(input.featured !== undefined ? { featured: input.featured } : {}),
    };
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
    if (!slug) throw new BadRequestException('Slug is invalid');
    return slug;
  }

  private validateCover(input: Pick<UpdatePublicContentDto, 'coverKey'>) {
    if (input.coverKey && !/^[a-z0-9-]{1,80}$/.test(input.coverKey))
      throw new BadRequestException('coverKey is not allowed');
  }

  private async guardUnique<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Slug already exists');
      throw error;
    }
  }
}
