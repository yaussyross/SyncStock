-- SyncStock uses server-side Prisma over a direct Postgres connection.
-- It does not use Supabase's anon/authenticated Data API roles.
-- Remove direct Data API access to accounting and OAuth-token tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
