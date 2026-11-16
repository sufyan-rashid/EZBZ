
-- TRUNCATE bypasses RLS entirely; the app never needs it, nor TRIGGER or
-- REFERENCES, so signed-in users don't get them on any app table.
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated, anon;
