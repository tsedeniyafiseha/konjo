begin;

-- Keep authorization helpers outside PostgREST's exposed public schema while
-- preserving their use from RLS policies.
create schema if not exists private;
revoke all on schema private from public;
alter function public.is_admin() set schema private;
grant usage on schema private to anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

-- The domain-event outbox is server-only. An explicit deny policy documents
-- that boundary and prevents accidental client access if grants change later.
create policy domain_event_outbox_server_only on public.domain_event_outbox
for all to anon, authenticated using (false) with check (false);

-- Separate write policies from public/participant SELECT policies so Postgres
-- evaluates only one permissive policy for each read.
drop policy zones_admin_write on public.zones;
create policy zones_admin_insert on public.zones
for insert to authenticated with check (private.is_admin());
create policy zones_admin_update on public.zones
for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy zones_admin_delete on public.zones
for delete to authenticated using (private.is_admin());

drop policy categories_admin_write on public.service_categories;
create policy categories_admin_insert on public.service_categories
for insert to authenticated with check (private.is_admin());
create policy categories_admin_update on public.service_categories
for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy categories_admin_delete on public.service_categories
for delete to authenticated using (private.is_admin());

drop policy promotions_admin_write on public.promotions;
create policy promotions_admin_insert on public.promotions
for insert to authenticated with check (private.is_admin());
create policy promotions_admin_update on public.promotions
for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy promotions_admin_delete on public.promotions
for delete to authenticated using (private.is_admin());

drop policy professional_services_owner_or_admin_write on public.professional_services;
create policy professional_services_owner_or_admin_insert on public.professional_services
for insert to authenticated
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy professional_services_owner_or_admin_update on public.professional_services
for update to authenticated
using (professional_id = (select auth.uid()) or private.is_admin())
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy professional_services_owner_or_admin_delete on public.professional_services
for delete to authenticated
using (professional_id = (select auth.uid()) or private.is_admin());

drop policy working_hours_owner_or_admin_write on public.professional_working_hours;
create policy working_hours_owner_or_admin_insert on public.professional_working_hours
for insert to authenticated
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy working_hours_owner_or_admin_update on public.professional_working_hours
for update to authenticated
using (professional_id = (select auth.uid()) or private.is_admin())
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy working_hours_owner_or_admin_delete on public.professional_working_hours
for delete to authenticated
using (professional_id = (select auth.uid()) or private.is_admin());

drop policy travel_zones_owner_or_admin_write on public.professional_travel_zones;
create policy travel_zones_owner_or_admin_insert on public.professional_travel_zones
for insert to authenticated
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy travel_zones_owner_or_admin_update on public.professional_travel_zones
for update to authenticated
using (professional_id = (select auth.uid()) or private.is_admin())
with check (professional_id = (select auth.uid()) or private.is_admin());
create policy travel_zones_owner_or_admin_delete on public.professional_travel_zones
for delete to authenticated
using (professional_id = (select auth.uid()) or private.is_admin());

-- Cover every foreign key reported by the production database advisor.
create index admin_audit_logs_admin_idx on public.admin_audit_logs (admin_id);
create index admin_broadcasts_admin_idx on public.admin_broadcasts (admin_id);
create index booking_assignments_professional_idx on public.booking_assignments (professional_id);
create index booking_disputes_client_idx on public.booking_disputes (client_id);
create index booking_status_events_changed_by_idx on public.booking_status_events (changed_by);
create index bookings_service_idx on public.bookings (service_id);
create index client_addresses_zone_idx on public.client_addresses (zone_id);
create index favorites_professional_idx on public.favorites (professional_id);
create index ledger_entries_payment_intent_idx on public.ledger_entries (payment_intent_id);
create index notification_outbox_user_idx on public.notification_outbox (user_id);
create index payment_events_payment_intent_idx on public.payment_events (payment_intent_id);
create index professional_applications_reviewer_idx on public.professional_applications (reviewed_by);
create index professional_documents_reviewer_idx on public.professional_documents (reviewed_by);
create index professional_earnings_payout_idx on public.professional_earnings (payout_id);
create index professional_quality_flags_professional_idx on public.professional_quality_flags (professional_id);
create index professional_travel_zones_zone_idx on public.professional_travel_zones (zone_id);
create index reviews_client_idx on public.reviews (client_id);
create index safety_incidents_booking_idx on public.safety_incidents (booking_id);
create index safety_incidents_reporter_idx on public.safety_incidents (reported_by_id);

commit;
