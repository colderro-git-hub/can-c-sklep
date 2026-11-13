-- 017: SEO - przekierowania 301 i dziennik błędów 404 (panel: SEO → Przekierowania).
-- Zapis i odczyt wyłącznie kluczem secret z Workera (RLS włączone, bez polityk dla klientów).

create table if not exists public.redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null unique check (from_path like '/%' and length(from_path) <= 500),
  to_url      text not null check (length(to_url) <= 1000),
  code        smallint not null default 301 check (code in (301, 302, 307, 308)),
  hits        integer not null default 0,
  last_hit_at timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text
);
alter table public.redirects enable row level security;

create table if not exists public.not_found_log (
  path        text primary key check (length(path) <= 500),
  hits        integer not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  referrer    text,
  user_agent  text,
  ignored     boolean not null default false
);
alter table public.not_found_log enable row level security;
create index if not exists not_found_log_hits_idx on public.not_found_log (ignored, hits desc);

-- Zliczanie 404 jednym wywołaniem (atomowo); dziennik ograniczony do 5000 adresów
create or replace function public.log_not_found(p_path text, p_ref text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into not_found_log (path, referrer, user_agent)
  values (left(p_path, 500), left(p_ref, 500), left(p_ua, 300))
  on conflict (path) do update
    set hits = not_found_log.hits + 1, last_seen = now(),
        referrer = coalesce(excluded.referrer, not_found_log.referrer),
        user_agent = excluded.user_agent;
  if (select count(*) from not_found_log) > 5000 then
    delete from not_found_log where path in (
      select path from not_found_log where ignored = false order by last_seen asc limit 100);
  end if;
end $$;

create or replace function public.redirect_hit(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update redirects set hits = hits + 1, last_hit_at = now() where id = p_id;
$$;

revoke execute on function public.log_not_found(text, text, text) from public, anon, authenticated;
revoke execute on function public.redirect_hit(uuid) from public, anon, authenticated;
