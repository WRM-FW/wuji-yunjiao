-- 吴记云饺 · 给只读业务函数补上角色闸门
--
-- 上一版里 available_pickup_codes() 只依赖 pickup_codes 的 RLS 限制读取，
-- 但函数是 security definer、以属主（postgres）身份执行，RLS 被绕过，
-- 结果任何登录用户都能枚举整个号池。实测已确认（普通用户调用返回 300 个号）。
--
-- security definer 函数里的权限判断必须写在函数体内，不能只靠表策略。
-- 这里给三个商家向的只读函数都加上显式闸门，越权直接 42501。

create or replace function public.available_pickup_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.wuji_is_staff() then
    raise exception '只有商家或管理员可以查看取餐码号池' using errcode = '42501';
  end if;

  with occupied as (
    select distinct code
    from public.orders
    where status = 'assigned' and code is not null
  ), free_codes as (
    select pc.code
    from public.pickup_codes pc
    left join occupied o on o.code = pc.code
    where o.code is null
  )
  select jsonb_build_object(
    'total',      (select count(*) from public.pickup_codes),
    'used',       (select count(*) from occupied),
    'free_count', (select count(*) from free_codes),
    'free_codes', (select coalesce(jsonb_agg(code order by code), '[]'::jsonb) from free_codes)
  ) into result;

  return result;
end;
$$;

create or replace function public.staff_orders(p_status text default null, p_limit integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.wuji_is_staff() then
    raise exception '只有商家或管理员可以查看全部订单' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(t.row order by t.pri desc, t.created_at desc), '[]'::jsonb) into result
  from (
    select o.created_at,
           (o.status = 'pending')::int as pri,
           public.order_detail(o.id) as row
    from public.orders o
    where p_status is null or p_status = 'all' or o.status = p_status
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 80), 1), 200)
  ) t;

  return result;
end;
$$;

create or replace function public.search_users(p_query text default '', p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  kw text := trim(coalesce(p_query, ''));
begin
  if not public.wuji_is_staff() then
    raise exception '只有商家或管理员可以查询用户' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(t.row), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
             'id', p.id, 'nickname', p.nickname, 'contact_phone', p.contact_phone,
             'contact_email', p.contact_email, 'role', p.role, 'created_at', p.created_at
           ) as row
    from public.profiles p
    where kw = ''
      or replace(coalesce(p.contact_phone, ''), ' ', '') like '%' || replace(kw, ' ', '') || '%'
      or lower(coalesce(p.contact_email, '')) like '%' || lower(kw) || '%'
      or coalesce(p.nickname, '') ilike '%' || kw || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) t;

  return result;
end;
$$;
