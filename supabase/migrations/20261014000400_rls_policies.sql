-- 吴记云饺 · 行级安全（RLS）
-- 原则：读按身份收窄，写一律走 security definer 函数或 staff 策略；
--       普通用户即便直接构造 REST 请求，也拿不到别人的订单、改不了商品和角色。

alter table public.profiles     enable row level security;
alter table public.products     enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.pickup_codes enable row level security;

-- 默认收回所有客户端角色的直接写权限，后面按表逐项放开
revoke all on public.profiles     from anon, authenticated;
revoke all on public.products     from anon, authenticated;
revoke all on public.orders       from anon, authenticated;
revoke all on public.order_items  from anon, authenticated;
revoke all on public.pickup_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (nickname, contact_phone, contact_email) on public.profiles to authenticated;

drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.wuji_is_staff());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- products：顾客看得到已上架商品；商家看全部（含已下架），并能增删改
-- ---------------------------------------------------------------------------
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists products_select_on_sale_or_staff on public.products;
create policy products_select_on_sale_or_staff on public.products
  for select to anon, authenticated
  using (listing_status = 'on' or public.wuji_is_staff());

drop policy if exists products_write_staff on public.products;
create policy products_write_staff on public.products
  for insert to authenticated
  with check (public.wuji_is_staff());

drop policy if exists products_update_staff on public.products;
create policy products_update_staff on public.products
  for update to authenticated
  using (public.wuji_is_staff())
  with check (public.wuji_is_staff());

drop policy if exists products_delete_staff on public.products;
create policy products_delete_staff on public.products
  for delete to authenticated
  using (public.wuji_is_staff());

-- ---------------------------------------------------------------------------
-- orders / order_items：只能读自己的（商家读全部）；写全部走 RPC
-- ---------------------------------------------------------------------------
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

drop policy if exists orders_select_own_or_staff on public.orders;
create policy orders_select_own_or_staff on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.wuji_is_staff());

drop policy if exists order_items_select_own_or_staff on public.order_items;
create policy order_items_select_own_or_staff on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = auth.uid() or public.wuji_is_staff())
    )
  );

-- ---------------------------------------------------------------------------
-- pickup_codes：号池只给商家/管理员读（顾客不需要知道剩哪些号）
-- ---------------------------------------------------------------------------
grant select on public.pickup_codes to authenticated;

drop policy if exists pickup_codes_select_staff on public.pickup_codes;
create policy pickup_codes_select_staff on public.pickup_codes
  for select to authenticated
  using (public.wuji_is_staff());
