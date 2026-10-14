-- 吴记云饺 · 用户档案与角色权限
-- 角色：user（普通顾客）/ merchant（商家）/ admin（管理员）
-- 设计要点：
--   1) 角色存在 profiles.role，不由用户自己改（列级 REVOKE + 触发器双重拦截）
--   2) 业务判定统一走 security definer 函数，避免在 RLS 策略里直接读 profiles 造成递归
--   3) auth.users 新建时自动补 profiles，昵称/手机号/邮箱从 user_metadata 落库

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nickname      text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  role          text not null default 'user'
                check (role in ('user', 'merchant', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is '用户档案与角色；auth.users 的扩展表';
comment on column public.profiles.role is 'user / merchant / admin，只能由管理员通过 set_user_role 修改';

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_phone_idx on public.profiles (lower(contact_phone));
create index if not exists profiles_email_idx on public.profiles (lower(contact_email));

-- ---------------------------------------------------------------------------
-- 角色判定：security definer，绕过 RLS 读取，避免策略递归
-- ---------------------------------------------------------------------------
create or replace function public.wuji_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'anon'
  );
$$;

create or replace function public.wuji_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.wuji_current_role() in ('merchant', 'admin');
$$;

create or replace function public.wuji_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.wuji_current_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- 注册时自动建档
-- ---------------------------------------------------------------------------
create or replace function public.wuji_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_phone text  := coalesce(v_meta ->> 'phone', '');
begin
  insert into public.profiles (id, nickname, contact_phone, contact_email)
  values (
    new.id,
    trim(coalesce(v_meta ->> 'nickname', '')),
    case when v_phone ~ '^[0-9+\-() ]{6,20}$' then v_phone else '' end,
    coalesce(new.email, '')
  )
  on conflict (id) do update
    set nickname      = excluded.nickname,
        contact_phone = excluded.contact_phone,
        contact_email = excluded.contact_email;
  return new;
end;
$$;

drop trigger if exists wuji_on_auth_user_created on auth.users;
create trigger wuji_on_auth_user_created
  after insert on auth.users
  for each row execute function public.wuji_handle_new_user();

-- ---------------------------------------------------------------------------
-- 兜底：给已存在但没有档案的用户补一行（幂等）
-- ---------------------------------------------------------------------------
insert into public.profiles (id, nickname, contact_email)
select u.id,
       trim(coalesce(u.raw_user_meta_data ->> 'nickname', '')),
       coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 防越权改角色：客户端即使绕过界面直接 update role 也会被挡
-- ---------------------------------------------------------------------------
create or replace function public.wuji_guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- 只有管理员（或 postgres 拥有的 security definer 函数）可以改角色
    if not public.wuji_is_admin() then
      raise exception '只有管理员可以修改用户身份'
        using errcode = '42501';
    end if;
    if new.id = auth.uid() then
      raise exception '不能修改自己的身份，请由其他管理员操作'
        using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wuji_profiles_guard on public.profiles;
create trigger wuji_profiles_guard
  before update on public.profiles
  for each row execute function public.wuji_guard_profile_update();

-- 列级权限：普通登录用户根本拿不到改 role 的权限（RLS 之前就被拒）
revoke update (role) on public.profiles from authenticated, anon;
grant update (nickname, contact_phone, contact_email) on public.profiles to authenticated;
