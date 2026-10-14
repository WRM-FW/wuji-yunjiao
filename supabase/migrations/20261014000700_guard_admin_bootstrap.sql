-- 吴记云饺 · 角色守卫放行数据库管理通道
--
-- 上一条迁移里的 wuji_guard_profile_update() 对任何改 role 的行为都报错，
-- 包括初始管理员的引导（第一次提权没有"已有管理员"可用，会死锁）。
--
-- 这里改成只放行 session_user 为数据库管理角色的连接：
--   · 控制台 SQL Editor / supabase db query 以 postgres 直连 -> session_user = 'postgres'
--   · 浏览器经 PostgREST 进来时，连接池以 authenticator 登录再 set role authenticated/anon，
--     session_user 是 'authenticator'，永远不等于 postgres，因此越权路径依然被挡。
-- 注意必须用 session_user 而不是 current_user：本函数是 security definer，
-- current_user 在函数内会变成属主 postgres，那样判断就形同虚设。

create or replace function public.wuji_guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if session_user in ('postgres', 'supabase_admin') then
      -- 数据库管理通道（控制台 / CLI），用于初始引导与运维救火
      new.updated_at := now();
      return new;
    end if;
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
