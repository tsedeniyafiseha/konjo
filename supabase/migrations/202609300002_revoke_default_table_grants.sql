begin;

-- Supabase's default privileges grant anon and authenticated every table
-- privilege, including TRUNCATE, REFERENCES and TRIGGER, which row security
-- does not cover. These three tables still carried them. Reads and writes
-- stay governed by their RLS policies and the API's service role.
revoke truncate, references, trigger on public.client_identity_documents from anon, authenticated;
revoke truncate, references, trigger on public.legal_acceptances from anon, authenticated;
revoke truncate, references, trigger on public.professional_registration_drafts from anon, authenticated;
revoke all on public.legal_acceptances from anon;

commit;
