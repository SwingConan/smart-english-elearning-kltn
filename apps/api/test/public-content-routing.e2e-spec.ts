import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Admin public-content routing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;
  const unique = `${Date.now()}-${process.pid}`;
  const password = 'M11-Uc47!2026';
  const ids: { admin?: string; category?: string; content?: string } = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const user = await prisma.user.create({
      data: {
        email: `m11-uc47-admin-${unique}@example.test`,
        fullName: 'M11 UC47 Admin',
        passwordHash: await argon2.hash(password),
        role: UserRole.ADMIN_COORDINATOR,
        status: UserStatus.ACTIVE,
      },
    });
    ids.admin = user.id;
    admin = request.agent(app.getHttpServer());
    await admin.post('/api/auth/login').send({ email: user.email, password }).expect(200);

    const category = await admin
      .post('/api/admin/public-content/categories')
      .send({
        name: `UC47 category ${unique}`,
        slug: `uc47-category-${unique}`,
        description: 'Routing regression fixture',
      })
      .expect(201);
    ids.category = category.body.id;

    const content = await admin
      .post('/api/admin/public-content')
      .send({
        slug: `uc47-content-${unique}`,
        categoryId: ids.category,
        title: 'UC47 routing fixture',
        excerpt: 'A focused fixture for static and dynamic admin CMS routing.',
        contentFormat: 'MARKDOWN',
        bodyMarkdown: '# UC47 routing\n\nStatic routes must take precedence over dynamic IDs.',
      })
      .expect(201);
    ids.content = content.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (ids.content) await prisma.publicContent.deleteMany({ where: { id: ids.content } });
      if (ids.category) {
        await prisma.publicContentCategory.deleteMany({ where: { id: ids.category } });
      }
      if (ids.admin) await prisma.user.deleteMany({ where: { id: ids.admin } });
    }
    if (app) await app.close();
  });

  it('keeps static collections ahead of the UUID detail route', async () => {
    const categories = await admin.get('/api/admin/public-content/categories').expect(200);
    expect(categories.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.category })]),
    );

    const assets = await admin.get('/api/admin/public-content/assets').expect(200);
    expect(assets.body).toEqual(expect.any(Array));

    const detail = await admin.get(`/api/admin/public-content/${ids.content}`).expect(200);
    expect(detail.body).toMatchObject({ id: ids.content, categoryId: ids.category });

    await admin
      .get('/api/admin/public-content/not-a-uuid')
      .expect(400)
      .expect(({ body }) => expect(body.message).toContain('uuid is expected'));

    const list = await admin.get('/api/admin/public-content').expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.content })]),
    );
  });
});
