import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  const sessionIds = new Set<string>();
  const unique = `${Date.now()}-${process.pid}`;
  const email = `vs01-auth-${unique}@example.com`;
  const unknownEmail = `vs01-unknown-${unique}@example.com`;
  const password = 'AuthE2e!2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    agent = request.agent(app.getHttpServer());
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.userSession.deleteMany({
        where: { sid: { in: [...sessionIds] } },
      });
      await prisma.user.deleteMany({ where: { email } });
    }
    if (app) {
      await app.close();
    }
  });

  it('rejects oversized registration and login inputs', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `oversized-${unique}@example.com`,
        password: 'A'.repeat(129),
        fullName: 'Valid Name',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `oversized-name-${unique}@example.com`,
        password,
        fullName: 'N'.repeat(201),
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'e'.repeat(309) + '@example.com', password })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: unknownEmail, password: 'A'.repeat(129) })
      .expect(400);
  });

  it('registers, logs in, persists a PostgreSQL session, and logs out', async () => {
    const registration = await agent
      .post('/api/auth/register')
      .send({
        email: `  ${email.toUpperCase()}  `,
        password,
        fullName: 'VS01 Student',
      })
      .expect(201);

    expect(registration.body).toMatchObject({
      email,
      fullName: 'VS01 Student',
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    expect(registration.body).not.toHaveProperty('passwordHash');

    await agent.get('/api/auth/me').expect(401);

    const duplicate = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, fullName: 'Duplicate Student' })
      .expect(409);
    expect(duplicate.body.message).toBe(
      'An account with this email already exists',
    );

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword!2026' })
      .expect(401);
    const unknownUser = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: unknownEmail, password: 'WrongPassword!2026' })
      .expect(401);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
    expect(unknownUser.body.message).toBe(wrongPassword.body.message);

    const login = await agent
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body).not.toHaveProperty('passwordHash');

    const cookie = getCookie(login.headers['set-cookie']);
    expect(cookie).toContain('sel.sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const sessionId = extractSessionId(cookie);
    sessionIds.add(sessionId);
    await expect(
      prisma.userSession.findUnique({ where: { sid: sessionId } }),
    ).resolves.not.toBeNull();

    const currentUser = await agent.get('/api/auth/me').expect(200);
    expect(currentUser.body).toMatchObject({ email, role: 'STUDENT' });
    expect(currentUser.body).not.toHaveProperty('passwordHash');

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
    await expect(
      prisma.userSession.findUnique({ where: { sid: sessionId } }),
    ).resolves.toBeNull();
  });
});

function getCookie(setCookieHeader: string[] | string | undefined): string {
  const cookie = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!cookie) {
    throw new Error('Expected a session cookie');
  }
  return cookie;
}

function extractSessionId(cookie: string): string {
  const encodedValue = cookie.split(';', 1)[0]?.split('=', 2)[1];
  if (!encodedValue) {
    throw new Error('Expected a session cookie value');
  }

  const signedValue = decodeURIComponent(encodedValue);
  const unsignedValue = signedValue.startsWith('s:')
    ? signedValue.slice(2)
    : signedValue;
  const signatureSeparator = unsignedValue.lastIndexOf('.');
  if (signatureSeparator < 1) {
    throw new Error('Expected a signed session cookie');
  }
  return unsignedValue.slice(0, signatureSeparator);
}
