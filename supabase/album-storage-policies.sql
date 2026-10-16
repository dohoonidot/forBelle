-- ForBelle private album storage policies
-- Run once in the Supabase SQL Editor after creating a PRIVATE bucket named couple-album.
-- Firebase tokens currently map to the `anon` Postgres role because the existing
-- Firebase users do not carry a custom `role: authenticated` claim. Every policy
-- therefore validates the token issuer, audience and email explicitly.

create or replace function public.is_forbelle_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    auth.jwt()->>'iss' = 'https://securetoken.google.com/forbelle-d9825'
    and auth.jwt()->>'aud' = 'forbelle-d9825'
    and lower(coalesce(auth.jwt()->>'email', '')) in (
      'admin@forbelle.local',
      'belle@kim.com'
    );
$$;

drop policy if exists "ForBelle members can view album" on storage.objects;
create policy "ForBelle members can view album"
on storage.objects for select
to anon
using (
  bucket_id = 'couple-album'
  and (select public.is_forbelle_member())
);

drop policy if exists "ForBelle members can upload album" on storage.objects;
create policy "ForBelle members can upload album"
on storage.objects for insert
to anon
with check (
  bucket_id = 'couple-album'
  and (select public.is_forbelle_member())
  and (storage.foldername(name))[1] = 'album'
  and storage.extension(name) = 'webp'
);

drop policy if exists "ForBelle owners can delete album" on storage.objects;
create policy "ForBelle owners can delete album"
on storage.objects for delete
to anon
using (
  bucket_id = 'couple-album'
  and (select public.is_forbelle_member())
  and owner_id = (select auth.uid()::text)
);
