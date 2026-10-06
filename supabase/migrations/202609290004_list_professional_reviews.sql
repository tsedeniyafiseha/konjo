begin;

-- ---------------------------------------------------------------------------
-- Published reviews for a professional's public profile.
--
-- The API's marketplace adapter has called list_professional_reviews since
-- reviews shipped, but the function was never created in Postgres, so the
-- reviews request 404ed at Supabase and the profile's review list failed.
-- Mirrors the SQLite projection: newest first, published only, client shown
-- by first name.
-- ---------------------------------------------------------------------------

create or replace function public.list_professional_reviews(
  p_professional_id uuid,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', review.id,
    'clientName', coalesce(nullif(split_part(trim(client.full_name), ' ', 1), ''), 'Client'),
    'techniqueRating', review.technique_rating,
    'professionalismRating', review.professionalism_rating,
    'averageRating', round((review.technique_rating + review.professionalism_rating) / 2.0, 1),
    'tags', to_jsonb(review.tags),
    'reviewText', review.review_text,
    'createdAt', review.created_at
  ) order by review.created_at desc), '[]'::jsonb)
  from (
    select * from public.reviews
    where professional_id = p_professional_id and moderation_status = 'published'
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) review
  left join public.profiles client on client.user_id = review.client_id;
$$;

revoke all on function public.list_professional_reviews(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_professional_reviews(uuid, integer) to service_role;

commit;
