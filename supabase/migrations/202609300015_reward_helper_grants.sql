begin;

-- The transition wrapper runs as the API role (security invoker) and awards
-- the loyalty coupon on checkout, so that private helper must be callable by
-- service_role. The other reward helpers get the same grant for consistency;
-- clients never reach them (revoked from anon/authenticated).
grant execute on function private.award_reward_coupon(uuid) to service_role;
grant execute on function private.client_reward_setting(text, integer) to service_role;
grant execute on function private.available_reward_coupon(uuid) to service_role;
grant execute on function private.client_reward_offer(uuid) to service_role;
grant execute on function private.professional_jobs_with_extras(jsonb) to service_role;
grant execute on function private.professional_jobs_with_reschedule(jsonb) to service_role;

commit;
