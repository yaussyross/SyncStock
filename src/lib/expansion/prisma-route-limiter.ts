import { Prisma, PrismaClient } from '@prisma/client';
import { createSharedRouteLimiter } from './shared-route-limiter.mjs';

// The SQL is parameterized. Database time selects fixed windows consistently
// across workers; an older window can never reset a newer counter. One row per
// tenant/action bounds storage. The FK also prevents deleted users creating work.
export function createPrismaRouteLimiter(client: Pick<PrismaClient, '$transaction'>) {
  return createSharedRouteLimiter({
    reserve: async ({tenantId,action,limit,windowSeconds}) => {
      const rows=await client.$transaction(async tx=>{
        await tx.$executeRaw`SELECT set_config('statement_timeout','1000ms',true), set_config('lock_timeout','500ms',true)`;
        return tx.$queryRaw<Array<{usageCount:number;retryAfterSeconds:number}>>(Prisma.sql`
        WITH tick AS (SELECT statement_timestamp() AS now),
        bucket AS (
          SELECT to_timestamp(floor(extract(epoch FROM now) / ${windowSeconds}::numeric) * ${windowSeconds}::numeric) AS starts, now FROM tick
        ), changed AS (
          INSERT INTO "ExpansionRouteLimit" ("tenantId","action","windowStartedAt","windowEndsAt","usageCount","updatedAt")
          SELECT ${tenantId},${action},starts,starts + (${windowSeconds} * interval '1 second'),1,now FROM bucket
          ON CONFLICT ("tenantId","action") DO UPDATE SET
            "usageCount" = CASE WHEN EXCLUDED."windowStartedAt" > "ExpansionRouteLimit"."windowStartedAt" THEN 1 ELSE LEAST("ExpansionRouteLimit"."usageCount", ${limit}) + 1 END,
            "windowStartedAt" = GREATEST("ExpansionRouteLimit"."windowStartedAt",EXCLUDED."windowStartedAt"),
            "windowEndsAt" = GREATEST("ExpansionRouteLimit"."windowEndsAt",EXCLUDED."windowEndsAt"),
            "updatedAt" = EXCLUDED."updatedAt"
          RETURNING "usageCount","windowEndsAt"
        )
        SELECT "usageCount", GREATEST(1,LEAST(3600,ceil(extract(epoch FROM ("windowEndsAt" - (SELECT now FROM tick))))))::integer AS "retryAfterSeconds" FROM changed
      `);
      },{maxWait:500,timeout:1200});
      if(rows.length!==1)throw new Error('Shared route limit did not return one row');
      return rows[0];
    },
  });
}
