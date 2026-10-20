-- Baseline migration (chunk 0.4). It creates no tables: it proves the
-- migration workflow end to end and starts the journal in the `drizzle`
-- schema. The first tables arrive with authentication (chunk 0.6).
--
-- Generated with `pnpm db:generate --custom --name=init`. Use the same
-- command for hand-written SQL that Drizzle can't express; see README >
-- Database and migrations.
SELECT 1;
