begin;

-- Enum additions commit separately because PostgreSQL cannot safely use a new
-- enum value in policies or indexes until the transaction that added it ends.
alter type public.professional_document_kind add value if not exists 'national_id_front';
alter type public.professional_document_kind add value if not exists 'national_id_back';

commit;
