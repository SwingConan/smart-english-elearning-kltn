import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import type { ConsultationCommandDto } from './consultation.dto';
import { learnerConsultationActions } from './learner-actions';
type Tx = Prisma.TransactionClient;
@Injectable()
export class ConsultationsService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly db: PrismaService) {}
  private timer?: ReturnType<typeof setInterval>;
  onModuleInit() {
    if (process.env.W05B_ENABLED === 'DEV_DEC060' && process.env.NODE_ENV !== 'production') {
      this.timer = setInterval(() => {
        void this.db.$queryRaw`SELECT w05b_sweep()`.catch(() => {
          // Preserve failed sweep as an operational warning; commands retry expiry under the lock.
          console.warn('W05B_EXPIRY_SWEEP_FAILED');
        });
      }, 10000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private enabled() {
    if (process.env.W05B_ENABLED !== 'DEV_DEC060' || process.env.NODE_ENV === 'production')
      throw new NotFoundException();
  }
  private async user(tx: Tx, a: AuthorityActor) {
    const [actor] = await tx.$queryRaw<
      { role: string | null }[]
    >`SELECT w05b_actor(${a.id}::uuid,${a.sessionId}) AS role`;
    if (!actor?.role || !['STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER'].includes(actor.role))
      throw new NotFoundException();
    return tx.user.findUniqueOrThrow({ where: { id: a.id } });
  }
  private async read<T>(a: AuthorityActor, work: (tx: Tx, u: User) => Promise<T>) {
    this.enabled();
    return this.db.$transaction(
      async (tx) => {
        const u = await this.user(tx, a);
        return work(tx, u);
      },
      { timeout: 15000 },
    );
  }
  async command(a: AuthorityActor, input: ConsultationCommandDto) {
    this.enabled();
    const { key, ...payload } = input;
    try {
      const [row] = await this.db.$queryRaw<
        { result: Prisma.JsonValue }[]
      >`SELECT w05b_command(${a.id}::uuid,${a.sessionId},${key}::uuid,${JSON.stringify(payload)}::jsonb) AS result`;
      return row.result;
    } catch (e) {
      const detail = String(e) + JSON.stringify(e);
      if (/42501|W05B_NOT_FOUND|W05B_AUTH_REQUIRED|W05B_ROLE_DENIED|W05B_INDEPENDENT/.test(detail))
        throw new NotFoundException('Không có quyền hoặc yêu cầu không tồn tại.');
      if (/W05B_|23P01|23514|23502|23505|22P02/.test(detail))
        throw new ConflictException({
          code: 'CONSULTATION_STALE_OR_UNAVAILABLE',
          message:
            'Dữ liệu đã đổi, lịch không còn trống hoặc thiếu thông tin. Tải lại để kiểm tra; không tự đặt lại.',
        });
      throw e;
    }
  }
  profiles(a: AuthorityActor) {
    return this.read(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      return tx.$queryRaw`SELECT p.id,p."teacherId",r.id AS "revisionId",r.number,r."displayName",r.bio,r.specialties
        FROM w05b_profiles p JOIN w05b_profile_revisions r ON r."profileId"=p.id AND r.number=p."currentRevision"
        JOIN users u ON u.id=p."teacherId" AND u.status='ACTIVE' AND u.role='INSTRUCTOR'
        WHERE p.enabled AND r.state='APPROVED' ORDER BY r."displayName",p.id LIMIT 100`;
    });
  }
  slots(a: AuthorityActor, teacherId: string) {
    return this.read(a, async (tx, u) => {
      if (u.role !== 'STUDENT') throw new NotFoundException();
      return tx.$queryRaw`SELECT st AS "startsAt",st+interval '30 minutes' AS "endsAt" FROM
        generate_series(date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh',
        clock_timestamp()+interval '14 days',interval '30 minutes') st
        WHERE EXISTS(SELECT 1 FROM w05b_profiles p JOIN w05b_profile_revisions r ON r."profileId"=p.id AND r.number=p."currentRevision"
          WHERE p."teacherId"=${teacherId}::uuid AND p.enabled AND r.state='APPROVED')
        AND w05b_request_at(clock_timestamp(),st) AND w05b_slot(${teacherId}::uuid,st,st+interval '30 minutes')
        AND NOT EXISTS(SELECT 1 FROM w05b_bookings b WHERE b."teacherId"=${teacherId}::uuid AND
          (b.state='CONFIRMED' OR (b.state IN ('HOLD','PENDING_GV') AND b."expiresAt">clock_timestamp()))
          AND tstzrange(b."reservedFrom",b."reservedUntil",'[)') && tstzrange(st-interval '10 minutes',st+interval '40 minutes','[)'))
        ORDER BY st LIMIT 400`;
    });
  }
  bookings(a: AuthorityActor, month?: string) {
    return this.read(a, async (tx, u) => {
      if (!['STUDENT', 'INSTRUCTOR'].includes(u.role)) throw new NotFoundException();
      if (month && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new NotFoundException();
      const rows = await tx.$queryRaw<
        Record<string, unknown>[]
      >`SELECT b.id,b."teacherId",b."learnerId",b."startsAt",b."endsAt",b.state,b."expiresAt",b.topic,b.version,b."linkRevision",b."replacesId",
        r."displayName",r.bio,r.specialties,r.number AS "profileNumber",w05b_visible_link(b,${u.id}::uuid) AS "joinUrl",
        CASE WHEN ${u.role}='INSTRUCTOR' THEN lu."fullName" ELSE NULL END AS "learnerName",
        CASE WHEN ${u.role}='INSTRUCTOR' THEN lu.email ELSE NULL END AS "learnerEmail",
        CASE WHEN EXISTS(SELECT 1 FROM w05b_links l WHERE l."bookingId"=b.id AND l.number=b."linkRevision" AND l.state='APPROVED' AND NOT w05b_link_clear(l.id)) THEN 'BLOCKED_CLASS_COLLISION' ELSE NULL END AS "linkBlockReason",
        (SELECT jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'reason',c.reason,'state',c.state,'newStartsAt',c."newStartsAt",'makerId',c."makerId")) FROM w05b_changes c WHERE c."bookingId"=b.id) AS changes,
        (SELECT jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'makerId',q."makerId",'evidence',q.evidence,'parentId',q."parentId")) FROM w05b_reports q WHERE q."bookingId"=b.id) AS reports
        FROM w05b_bookings b JOIN w05b_profile_revisions r ON r.id=b."profileRevisionId"
        LEFT JOIN users lu ON lu.id=b."learnerId"
        WHERE ((${u.role}='STUDENT' AND b."learnerId"=${u.id}::uuid) OR (${u.role}='INSTRUCTOR' AND b."teacherId"=${u.id}::uuid))
        AND (${month ?? null}::text IS NULL OR to_char(b."startsAt" AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')=${month ?? null}::text)
        ORDER BY b."startsAt",b.id LIMIT 200`;
      const [time] = await tx.$queryRaw<
        { serverTime: string }[]
      >`SELECT clock_timestamp()::text AS "serverTime"`;
      return {
        data: rows.map(row=>u.role==='STUDENT' ? {
          ...row,
          actions: learnerConsultationActions(row as unknown as Parameters<typeof learnerConsultationActions>[0],u.id,new Date(time.serverTime)),
        } : row),
        ...time, limit: 200,
      };
    });
  }
  workspace(a: AuthorityActor) {
    return this.read(a, async (tx, u) => {
      if (u.role === 'STUDENT') return { profiles: [], availability: [], links: [], changes: [] };
      const profiles =
        await tx.$queryRaw`SELECT p.id,p."teacherId",p.enabled,r.id AS "revisionId",r.number,r.state,r."displayName",r.bio,r.specialties,r."reviewReason",
        w05b_permit(${u.id}::uuid,'consultation.profile.approve',p."teacherId") AS "canReview"
        FROM w05b_profiles p JOIN w05b_profile_revisions r ON r."profileId"=p.id AND r.number=p."currentRevision"
        WHERE (${u.role}='INSTRUCTOR' AND p."teacherId"=${u.id}::uuid) OR w05b_permit(${u.id}::uuid,'consultation.profile.approve',p."teacherId") ORDER BY p.id LIMIT 100`;
      const availability =
        u.role === 'INSTRUCTOR'
          ? await tx.w05BAvailability.findMany({
              where: { teacherId: u.id },
              orderBy: { createdAt: 'desc' },
              take: 100,
            })
          : [];
      // Author/reviewer editing surface; students never receive draft or future URLs.
      const links =
        await tx.$queryRaw`SELECT l.id,l."bookingId",l.number,l.state,CASE WHEN w05b_link_clear(l.id) THEN l.url ELSE NULL END AS url,
        CASE WHEN w05b_link_clear(l.id) THEN l.reason ELSE NULL END AS reason,
        CASE WHEN w05b_link_clear(l.id) THEN l."reviewReason" ELSE NULL END AS "reviewReason",b."teacherId",b."startsAt",
        t."fullName" AS "teacherName",lr."fullName" AS "learnerName",
        w05b_link_clear(l.id) AS "linkClear",
        (l.state='PENDING' AND w05b_link_clear(l.id) AND w05b_permit(${u.id}::uuid,'consultation.link.approve',b."teacherId")) AS "canReview"
        FROM w05b_links l JOIN w05b_bookings b ON b.id=l."bookingId" AND l.number=b."linkRevision" AND b.state='CONFIRMED'
        LEFT JOIN users t ON t.id=b."teacherId" LEFT JOIN users lr ON lr.id=b."learnerId"
        WHERE (${u.role}='INSTRUCTOR' AND b."teacherId"=${u.id}::uuid) OR w05b_permit(${u.id}::uuid,'consultation.link.approve',b."teacherId") ORDER BY l."createdAt" DESC LIMIT 100`;
      const changes =
        await tx.$queryRaw`SELECT c.id,c.kind,c.state,c.reason,c."newStartsAt",c."makerId",b."teacherId",b."startsAt"
        FROM w05b_changes c JOIN w05b_bookings b ON b.id=c."bookingId"
        WHERE c.state='PENDING' AND b.state IN ('PENDING_GV','CONFIRMED') AND c."baseVersion"=b.version AND ((${u.role}='INSTRUCTOR' AND b."teacherId"=${u.id}::uuid AND c."makerId"<>${u.id}::uuid) OR w05b_permit(${u.id}::uuid,'consultation.booking.review',b."teacherId")) ORDER BY c."createdAt" LIMIT 100`;
      return { profiles, availability, links, changes };
    });
  }
  notifications(a: AuthorityActor) {
    return this.read(
      a,
      (tx, u) =>
        tx.$queryRaw`SELECT o.id,e."objectId",e.kind,
          CASE WHEN e.kind IN ('LINK_PROPOSE','LINK_APPROVE','LINK_REJECT')
          THEN 'Cập nhật link tư vấn. Lý do chi tiết dành cho người soạn và học vụ được phân quyền.' ELSE e.reason END AS reason,
          e."createdAt" FROM w05b_outbox o JOIN w05b_events e ON e.id=o."eventId" WHERE o."recipientId"=${u.id}::uuid AND w05b_review_notice_allowed(e,${u.id}::uuid) ORDER BY o."createdAt" DESC LIMIT 100`,
    );
  }
}
