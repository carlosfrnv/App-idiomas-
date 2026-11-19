-- SONORA STUDIO — esquema inicial (Fase 3, preparado; NO aplicado todavía)
-- Postgres + Auth + Storage de Supabase. Cada usuario sólo accede a sus datos (RLS).

-- ---------------------------------------------------------------- planes y perfiles
create table if not exists public.plans (
  id text primary key,                          -- 'free' | 'pro'
  name text not null,
  limits jsonb not null                         -- espejo de src/config/plans.ts
);

insert into public.plans (id, name, limits) values
  ('free', 'Gratis', '{"maxProjects":5,"maxStorageBytes":524288000,"advancedEffects":false,"proPresets":false,"exportFormats":["wav16"],"pitchCorrection":false}'),
  ('pro',  'Pro',    '{"maxProjects":500,"maxStorageBytes":53687091200,"advancedEffects":true,"proPresets":true,"exportFormats":["wav16","wav24","wav32f","mp3"],"pitchCorrection":true}')
on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  plan_id text not null default 'free' references public.plans (id),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null check (status in ('trialing','active','past_due','canceled')),
  provider text,                                -- p. ej. 'stripe' (Fase 5)
  provider_ref text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- proyectos y audio
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  doc jsonb not null,                           -- ProjectDoc (src/types/project.ts)
  thumbnail jsonb,
  duration_sec real,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- papelera / retención configurable
);
create index if not exists projects_owner_updated on public.projects (owner_id, updated_at desc);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  mime_type text not null check (mime_type like 'audio/%'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 209715200),
  duration real not null,
  sample_rate integer not null,
  channels smallint not null,
  kind text not null check (kind in ('import','recording','demo','processed')),
  storage_path text not null unique,            -- <owner_id>/<asset_id>.<ext> en el bucket 'audio'
  created_at timestamptz not null default now()
);

create table if not exists public.project_assets (
  project_id uuid not null references public.projects (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete restrict,
  primary key (project_id, asset_id)
);

create table if not exists public.usage_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null,                          -- 'export', 'record', 'import'...
  meta jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.project_assets enable row level security;
alter table public.usage_events enable row level security;
alter table public.plans enable row level security;

create policy "plans legibles" on public.plans for select using (true);
create policy "perfil propio" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid() and plan_id = (select plan_id from public.profiles where id = auth.uid()));
create policy "suscripción propia (lectura)" on public.subscriptions for select using (user_id = auth.uid());
create policy "proyectos propios" on public.projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "audios propios" on public.assets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "relaciones propias" on public.project_assets for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    and exists (select 1 from public.assets a where a.id = asset_id and a.owner_id = auth.uid())
  );
create policy "eventos propios (insertar)" on public.usage_events for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 209715200,
  array['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/flac','audio/aac','audio/mp4','audio/webm'])
on conflict (id) do nothing;

create policy "audio: leer lo propio" on storage.objects for select
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio: subir a su carpeta" on storage.objects for insert
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio: borrar lo propio" on storage.objects for delete
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- utilidades
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id) values (new.id) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Retención: purga definitiva de proyectos en la papelera (programar con pg_cron).
create or replace function public.purge_deleted_projects(retention interval default interval '30 days')
returns integer language sql security definer set search_path = public as $$
  with d as (delete from public.projects where deleted_at is not null and deleted_at < now() - retention returning 1)
  select count(*)::int from d;
$$;
