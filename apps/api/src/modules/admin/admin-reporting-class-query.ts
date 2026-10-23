import { ClassOfferingStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AdminReportClassesQueryDto } from './dto/admin-system-report-query.dto';

export interface ReportingClassPage {
  ids: string[];
  total: number;
}

export interface ReportingClassSnapshot {
  draftNotReady: number;
  openFull: number;
  totalOperationalClasses: number;
  capacityIds: string[];
}

type ClassPageQueryRow = { ids: string[] | null; total: number | bigint };
type ClassSnapshotQueryRow = {
  capacityIds: string[] | null;
  draftNotReady: number | bigint;
  openFull: number | bigint;
  totalOperationalClasses: number | bigint;
};

// Exact ECMAScript String.prototype.trim() character set used by hasScheduleDestination().
const javascriptTrimCharacters =
  ' \t\n\r\f\v\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

const activeEnrollmentCount = Prisma.sql`enrollment_count."activeEnrollments"`;

const operationalReadiness = Prisma.sql`
  course."isPublished"
  AND instructor."id" IS NOT NULL
  AND instructor."role"::text = 'INSTRUCTOR'
  AND instructor."status"::text = 'ACTIVE'
  AND offering."classStart" IS NOT NULL
  AND offering."classEnd" IS NOT NULL
  AND offering."classStart" < offering."classEnd"
  AND EXISTS (
    SELECT 1
    FROM "class_schedule_slots" schedule
    WHERE schedule."classOfferingId" = offering."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "class_schedule_slots" schedule
    WHERE schedule."classOfferingId" = offering."id"
      AND BTRIM(COALESCE(schedule."locationText", ''), ${javascriptTrimCharacters}) = ''
      AND BTRIM(COALESCE(schedule."meetingUrl", ''), ${javascriptTrimCharacters}) = ''
  )
`;

function registrationState(now: Date) {
  return Prisma.sql`
    CASE
      WHEN NOT course."isPublished" OR offering."status"::text <> 'OPEN' THEN 'CLOSED'
      WHEN offering."enrollmentStart" IS NOT NULL
        AND ${now} < offering."enrollmentStart" THEN 'UPCOMING'
      WHEN offering."enrollmentEnd" IS NOT NULL
        AND ${now} > offering."enrollmentEnd" THEN 'CLOSED'
      WHEN offering."maxStudents" IS NOT NULL
        AND ${activeEnrollmentCount} >= offering."maxStudents" THEN 'FULL'
      ELSE 'AVAILABLE'
    END
  `;
}

function projectedClasses(where: Prisma.Sql, now: Date) {
  return Prisma.sql`
    SELECT
      offering."id",
      offering."status"::text AS "status",
      offering."classStart" AS "classStart",
      ${activeEnrollmentCount} AS "activeEnrollments",
      (${operationalReadiness}) AS "isReady",
      (${registrationState(now)}) AS "registrationState"
    FROM "class_offerings" offering
    INNER JOIN "courses" course ON course."id" = offering."courseId"
    LEFT JOIN "users" instructor ON instructor."id" = offering."instructorId"
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS "activeEnrollments"
      FROM "enrollments" enrollment
      WHERE enrollment."classOfferingId" = offering."id"
        AND enrollment."status"::text = 'ACTIVE'
    ) enrollment_count ON TRUE
    WHERE ${where}
  `;
}

export async function queryReportingClassPage(
  prisma: PrismaService,
  query: AdminReportClassesQueryDto,
  now: Date,
): Promise<ReportingClassPage> {
  const predicates: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.scope === 'OPERATIONAL') {
    predicates.push(Prisma.sql`offering."status"::text IN ('OPEN', 'IN_PROGRESS')`);
  } else if (query.status) {
    predicates.push(Prisma.sql`offering."status"::text = ${query.status}`);
  }
  if (query.search) {
    const search = `%${query.search}%`;
    predicates.push(Prisma.sql`(
      offering."code" ILIKE ${search}
      OR offering."name" ILIKE ${search}
      OR course."title" ILIKE ${search}
      OR instructor."fullName" ILIKE ${search}
    )`);
  }

  const derivedPredicates: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (query.readiness) {
    derivedPredicates.push(Prisma.sql`projected."isReady" = ${query.readiness === 'READY'}`);
  }
  if (query.registrationState) {
    derivedPredicates.push(Prisma.sql`projected."registrationState" = ${query.registrationState}`);
  }

  const rows = await prisma.$queryRaw<ClassPageQueryRow[]>(Prisma.sql`
    WITH projected AS (
      ${projectedClasses(Prisma.join(predicates, ' AND '), now)}
    ), filtered AS (
      SELECT *
      FROM projected
      WHERE ${Prisma.join(derivedPredicates, ' AND ')}
    ), page AS (
      SELECT "id", "classStart"
      FROM filtered
      ORDER BY "classStart" ASC NULLS LAST, "id" ASC
      OFFSET ${(query.page - 1) * query.limit}
      LIMIT ${query.limit}
    )
    SELECT
      (SELECT COUNT(*)::integer FROM filtered) AS "total",
      COALESCE(
        ARRAY_AGG(page."id"::text ORDER BY page."classStart" ASC NULLS LAST, page."id" ASC)
          FILTER (WHERE page."id" IS NOT NULL),
        ARRAY[]::text[]
      ) AS "ids"
    FROM page
  `);
  const row = rows[0];
  return { ids: row?.ids ?? [], total: Number(row?.total ?? 0) };
}

export async function queryReportingClassSnapshot(
  prisma: PrismaService,
  now: Date,
  limit: number,
): Promise<ReportingClassSnapshot> {
  const rows = await prisma.$queryRaw<ClassSnapshotQueryRow[]>(Prisma.sql`
    WITH projected AS (
      ${projectedClasses(
        Prisma.sql`offering."status"::text IN ('DRAFT', 'OPEN', 'IN_PROGRESS')`,
        now,
      )}
    ), stats AS (
      SELECT
        COUNT(*) FILTER (
          WHERE "status" = 'DRAFT' AND NOT "isReady"
        )::integer AS "draftNotReady",
        COUNT(*) FILTER (
          WHERE "status" = 'OPEN' AND "registrationState" = 'FULL'
        )::integer AS "openFull",
        COUNT(*) FILTER (
          WHERE "status" IN ('OPEN', 'IN_PROGRESS')
        )::integer AS "totalOperationalClasses"
      FROM projected
    ), capacity AS (
      SELECT "id", "classStart", "activeEnrollments", "registrationState"
      FROM projected
      WHERE "status" IN ('OPEN', 'IN_PROGRESS')
      ORDER BY
        ("registrationState" = 'FULL') DESC,
        "classStart" ASC NULLS LAST,
        "activeEnrollments" DESC,
        "id" ASC
      LIMIT ${limit}
    )
    SELECT
      stats."draftNotReady",
      stats."openFull",
      stats."totalOperationalClasses",
      COALESCE(
        ARRAY_AGG(
          capacity."id"::text
          ORDER BY
            (capacity."registrationState" = 'FULL') DESC,
            capacity."classStart" ASC NULLS LAST,
            capacity."activeEnrollments" DESC,
            capacity."id" ASC
        ) FILTER (WHERE capacity."id" IS NOT NULL),
        ARRAY[]::text[]
      ) AS "capacityIds"
    FROM stats
    LEFT JOIN capacity ON TRUE
    GROUP BY stats."draftNotReady", stats."openFull", stats."totalOperationalClasses"
  `);
  const row = rows[0];
  return {
    draftNotReady: Number(row?.draftNotReady ?? 0),
    openFull: Number(row?.openFull ?? 0),
    totalOperationalClasses: Number(row?.totalOperationalClasses ?? 0),
    capacityIds: row?.capacityIds ?? [],
  };
}

export function isOperationalStatus(status: ClassOfferingStatus): boolean {
  return status === ClassOfferingStatus.OPEN || status === ClassOfferingStatus.IN_PROGRESS;
}
