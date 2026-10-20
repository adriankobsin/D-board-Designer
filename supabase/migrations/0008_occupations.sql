-- Adds Marine Electrician and ETO (Electro-Technical Officer) to the allowed occupations.
alter table public.profiles drop constraint if exists profiles_occupation_check;
alter table public.profiles add constraint profiles_occupation_check check (occupation is null or occupation in
  ('Electrical Engineer','Electrician','Marine Electrician','ETO (Electro-Technical Officer)','Panel Builder','System Integrator','Student','Other'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  occ text := nullif(btrim(m ->> 'occupation'), '');
begin
  if occ is not null and occ not in ('Electrical Engineer','Electrician','Marine Electrician','ETO (Electro-Technical Officer)','Panel Builder','System Integrator','Student','Other') then
    occ := 'Other';
  end if;
  insert into public.profiles (id, email, first_name, last_name, company, country, occupation, accepted_terms_at)
  values (
    new.id,
    new.email,
    left(coalesce(btrim(m ->> 'first_name'), ''), 80),
    left(coalesce(btrim(m ->> 'last_name'), ''), 80),
    left(nullif(btrim(m ->> 'company'), ''), 120),
    left(nullif(btrim(m ->> 'country'), ''), 80),
    occ,
    case when (m ->> 'accepted_terms') = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;
