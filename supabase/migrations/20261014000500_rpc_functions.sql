-- 吴记云饺 · 业务函数（全部 security definer，权限判定写在函数体内，客户端无法绕过）
--
-- 客户端只拿到 anon key，所有写操作都通过这些函数完成：
--   submit_order / cancel_order / my_orders / order_detail —— 顾客
--   assign_pickup_code / complete_pickup / available_pickup_codes / staff_orders —— 商家、管理员
--   search_users —— 商家与管理员；set_user_role —— 仅管理员

-- ---------------------------------------------------------------------------
-- 计价内核：份按整数（1~99）、斤按 0.1 精度（0.5~20 斤），金额按分取整
-- ---------------------------------------------------------------------------
create or replace function public.wuji_normalize_quantity(p_is_raw boolean, p_quantity numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_is_raw
      then least(20::numeric, greatest(0.5::numeric, round(coalesce(p_quantity, 1)::numeric * 10) / 10))
    else least(99::numeric, greatest(1::numeric, floor(coalesce(p_quantity, 1)::numeric)))
  end;
$$;

create or replace function public.wuji_money(p numeric)
returns numeric
language sql
immutable
as $$
  select round(coalesce(p, 0)::numeric, 2);
$$;

-- 1.5 -> "1.5"，2.0 -> "2"
create or replace function public.wuji_qty_text(p numeric)
returns text
language sql
immutable
as $$
  select trim_scale(round(coalesce(p, 0)::numeric, 1))::text;
$$;

-- ---------------------------------------------------------------------------
-- 单笔订单详情（含明细）。RLS 已限制只能看到自己的或（商家）全部，越权返回 null
-- ---------------------------------------------------------------------------
create or replace function public.order_detail(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(o) || jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'product_id', i.product_id, 'is_raw', i.is_raw,
               'name', i.name, 'spec_name', i.spec_name, 'options', i.options,
               'unit', i.unit, 'unit_price', i.unit_price,
               'quantity', i.quantity, 'subtotal', i.subtotal)
             order by i.sort_index),
           '[]'::jsonb))
  )
  from public.orders o
  where o.id = p_order_id
    and (o.user_id = auth.uid() or public.wuji_is_staff());
$$;

-- ---------------------------------------------------------------------------
-- 提交订单：价格与优惠一律以 products 当前数据为准，客户端只报商品与数量
-- ---------------------------------------------------------------------------
create or replace function public.submit_order(
  p_items       jsonb,
  p_dining_type text default 'dine_in',
  p_pickup_time text default '尽快出餐',
  p_note        text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_raw         jsonb;
  v_product     public.products%rowtype;
  v_is_raw      boolean;
  v_qty         numeric;
  v_unit_price  numeric;
  v_nominal     numeric;
  v_subtotal    numeric;
  v_line_disc   numeric;
  v_options     text;
  v_order_id    uuid;
  v_existing    uuid;
  v_items       jsonb := '[]'::jsonb;
  v_original    numeric := 0;
  v_discount    numeric := 0;
  v_portions    integer := 0;
  v_raw_lines   integer := 0;
  v_raw_jin     numeric := 0;
  v_final       numeric;
  v_nickname    text;
  v_phone       text;
  v_time        text;
  v_note        text;
  v_fp          text;
begin
  if v_uid is null then
    raise exception '请先登录后再下单' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '购物车为空，无法提交订单';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception '单笔订单最多 30 个条目，请分单提交';
  end if;
  if p_dining_type not in ('dine_in', 'pickup') then
    raise exception '取餐方式只能是堂食（dine_in）或自取（pickup）';
  end if;

  select coalesce(nickname, ''), coalesce(contact_phone, '')
    into v_nickname, v_phone
  from public.profiles
  where id = v_uid;

  v_time := left(coalesce(nullif(trim(p_pickup_time), ''), '尽快出餐'), 40);
  v_note := left(coalesce(p_note, ''), 200);

  for v_raw in select * from jsonb_array_elements(p_items)
  loop
    v_options := left(coalesce(v_raw ->> 'options', ''), 120);

    select * into v_product
    from public.products
    where id = nullif(trim(coalesce(v_raw ->> 'product_id', '')), '');

    if not found then
      raise exception '商品不存在，请刷新菜单后重试';
    end if;
    if v_product.listing_status <> 'on' then
      raise exception '「%」已下架，无法下单', v_product.name;
    end if;
    if v_product.sold_out then
      raise exception '「%」今日售罄', v_product.name;
    end if;

    -- pricing_mode 决定这条到底按份还是按斤，客户端说了不算
    v_is_raw := coalesce((v_raw ->> 'is_raw')::boolean, false);
    if v_product.pricing_mode = 'portion' then
      v_is_raw := false;
    elsif v_product.pricing_mode = 'weight' then
      v_is_raw := true;
    end if;

    v_qty        := public.wuji_normalize_quantity(v_is_raw, (v_raw ->> 'quantity')::numeric);
    v_unit_price := public.wuji_money(case when v_is_raw then v_product.price_raw else v_product.price_cooked end);
    v_nominal    := public.wuji_money(v_product.price_cooked);
    v_subtotal   := public.wuji_money(v_unit_price * v_qty);
    v_line_disc  := case when v_is_raw
                         then public.wuji_money(greatest(0, v_nominal - v_unit_price) * v_qty)
                         else 0 end;

    if v_subtotal <= 0 then
      raise exception '「%」价格设置有误，请联系档口', v_product.name;
    end if;

    v_original := v_original + public.wuji_money(v_nominal * v_qty);
    v_discount := v_discount + v_line_disc;

    if v_is_raw then
      v_raw_lines := v_raw_lines + 1;
      v_raw_jin   := v_raw_jin + v_qty;
    else
      v_portions  := v_portions + v_qty::integer;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'is_raw',     v_is_raw,
      'name',       v_product.name,
      'spec_name',  case when v_is_raw
                         then '生饺称重 ' || public.wuji_qty_text(v_qty) || ' 斤'
                         else '熟食现煮 ' || v_qty::integer || ' 份' end,
      'options',    v_options,
      'unit',       case when v_is_raw then v_product.unit_raw else v_product.unit_cooked end,
      'unit_price', v_unit_price,
      'quantity',   v_qty,
      'subtotal',   v_subtotal
    ));
  end loop;

  v_final := greatest(0.01, public.wuji_money(v_original - v_discount));

  -- 30 秒窗口内同内容重复提交视为连点，直接返回原单，不新建第二笔
  v_fp := md5(v_items::text || '|' || p_dining_type || '|' || v_time || '|' || v_note);
  select id into v_existing
  from public.orders
  where user_id = v_uid
    and status = 'pending'
    and submit_fingerprint = v_fp
    and created_at > now() - interval '30 seconds'
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return public.order_detail(v_existing);
  end if;

  insert into public.orders (
    user_id, status, dining_type, pickup_time, note,
    contact_nickname, contact_phone,
    items_count, portion_count, raw_weight_jin,
    original_total, discount_amount, package_fee, final_total, submit_fingerprint
  ) values (
    v_uid, 'pending', p_dining_type, v_time, v_note,
    v_nickname, v_phone,
    v_portions + v_raw_lines, v_portions, round(v_raw_jin, 1),
    public.wuji_money(v_original), public.wuji_money(v_discount), 0, v_final, v_fp
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, is_raw, name, spec_name, options, unit,
    unit_price, quantity, subtotal, sort_index
  )
  select v_order_id,
         i ->> 'product_id',
         (i ->> 'is_raw')::boolean,
         i ->> 'name',
         i ->> 'spec_name',
         i ->> 'options',
         i ->> 'unit',
         (i ->> 'unit_price')::numeric,
         (i ->> 'quantity')::numeric,
         (i ->> 'subtotal')::numeric,
         ord
  from jsonb_array_elements(v_items) with ordinality as t(i, ord);

  return public.order_detail(v_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 我的订单（含明细），只可能是自己的
-- ---------------------------------------------------------------------------
create or replace function public.my_orders(p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row order by t.created_at desc), '[]'::jsonb)
  from (
    select o.created_at, public.order_detail(o.id) as row
    from public.orders o
    where o.user_id = auth.uid()
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 取消订单：仅本人、仅未分配取餐码
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception '请先登录' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;
  if v_order.user_id <> auth.uid() then
    raise exception '只能取消自己的订单' using errcode = '42501';
  end if;
  if v_order.status <> 'pending' or v_order.code is not null then
    raise exception '该订单已分配取餐码，客户端不能取消，请进订餐群联系档口';
  end if;

  update public.orders
     set status = 'cancelled', cancelled_at = now()
   where id = p_order_id;

  return public.order_detail(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 分配取餐码：商家/管理员手动指定；行锁 + 唯一部分索引双保险防抢码
-- ---------------------------------------------------------------------------
create or replace function public.assign_pickup_code(p_order_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := trim(coalesce(p_code, ''));
  v_order public.orders%rowtype;
  v_taken uuid;
begin
  if not public.wuji_is_staff() then
    raise exception '只有商家或管理员可以分配取餐码' using errcode = '42501';
  end if;
  if v_code !~ '^[0-9]{3}$' or v_code not between '001' and '300' then
    raise exception '取餐码必须是 001~300 之间的三位数字（前导零保留）';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception '订单已结束，不能再分配取餐码';
  end if;

  select id into v_taken
  from public.orders
  where code = v_code and status = 'assigned' and id <> p_order_id
  for update;

  if v_taken is not null then
    raise exception '号码 % 已被其他待取餐订单占用', v_code;
  end if;

  update public.orders
     set code = v_code, status = 'assigned', assigned_at = coalesce(assigned_at, now())
   where id = p_order_id;

  return public.order_detail(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 标记已取餐：号码随之离开 assigned 集合，自动回到可分配范围
-- ---------------------------------------------------------------------------
create or replace function public.complete_pickup(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.wuji_is_staff() then
    raise exception '只有商家或管理员可以确认取餐' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '订单不存在';
  end if;
  if v_order.status <> 'assigned' then
    raise exception '只有已分配取餐码的订单才能标记为已取餐';
  end if;

  update public.orders
     set status = 'completed', completed_at = now()
   where id = p_order_id;

  return public.order_detail(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 剩余可用号码（assigned 占用；completed/cancelled 视为已回收）
-- ---------------------------------------------------------------------------
create or replace function public.available_pickup_codes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
  );
$$;

-- ---------------------------------------------------------------------------
-- 商家端订单列表：一次请求拿全卡片数据，待分配的排最前
-- ---------------------------------------------------------------------------
create or replace function public.staff_orders(p_status text default null, p_limit integer default 80)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row order by t.pri desc, t.created_at desc), '[]'::jsonb)
  from (
    select o.created_at,
           (o.status = 'pending')::int as pri,
           public.order_detail(o.id) as row
    from public.orders o
    where public.wuji_is_staff()
      and (p_status is null or p_status = 'all' or o.status = p_status)
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 80), 1), 200)
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 用户检索（商家与管理员都要按手机号/邮箱找人）
-- ---------------------------------------------------------------------------
create or replace function public.search_users(p_query text default '', p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', p.id, 'nickname', p.nickname, 'contact_phone', p.contact_phone,
             'contact_email', p.contact_email, 'role', p.role, 'created_at', p.created_at
           ) as row
    from public.profiles p
    where public.wuji_is_staff()
      and (
        coalesce(trim(p_query), '') = ''
        or replace(coalesce(p.contact_phone, ''), ' ', '') like '%' || replace(trim(coalesce(p_query, '')), ' ', '') || '%'
        or lower(coalesce(p.contact_email, '')) like '%' || lower(trim(coalesce(p_query, ''))) || '%'
        or coalesce(p.nickname, '') ilike '%' || trim(coalesce(p_query, '')) || '%'
      )
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 设置身份：仅管理员；不能改自己（防止把自己降级后没人能改回来）
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
begin
  if not public.wuji_is_admin() then
    raise exception '只有管理员可以设置用户身份' using errcode = '42501';
  end if;
  if p_role not in ('user', 'merchant', 'admin') then
    raise exception '身份只能是 user / merchant / admin';
  end if;
  if p_user_id = auth.uid() then
    raise exception '不能修改自己的身份，请由其他管理员操作';
  end if;

  select nickname into v_nickname from public.profiles where id = p_user_id for update;
  if v_nickname is null then
    raise exception '用户不存在';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  return jsonb_build_object('id', p_user_id, 'role', p_role, 'nickname', v_nickname);
end;
$$;

-- ---------------------------------------------------------------------------
-- 函数权限：只开放给登录用户（匿名一律 403）
-- ---------------------------------------------------------------------------
revoke all on function public.order_detail(uuid)                     from public;
revoke all on function public.submit_order(jsonb, text, text, text)   from public;
revoke all on function public.my_orders(integer)                      from public;
revoke all on function public.cancel_order(uuid)                      from public;
revoke all on function public.assign_pickup_code(uuid, text)          from public;
revoke all on function public.complete_pickup(uuid)                   from public;
revoke all on function public.available_pickup_codes()                from public;
revoke all on function public.staff_orders(text, integer)             from public;
revoke all on function public.search_users(text, integer)             from public;
revoke all on function public.set_user_role(uuid, text)               from public;

grant execute on function public.order_detail(uuid)                   to authenticated;
grant execute on function public.submit_order(jsonb, text, text, text) to authenticated;
grant execute on function public.my_orders(integer)                   to authenticated;
grant execute on function public.cancel_order(uuid)                   to authenticated;
grant execute on function public.assign_pickup_code(uuid, text)       to authenticated;
grant execute on function public.complete_pickup(uuid)                to authenticated;
grant execute on function public.available_pickup_codes()             to authenticated;
grant execute on function public.staff_orders(text, integer)          to authenticated;
grant execute on function public.search_users(text, integer)          to authenticated;
grant execute on function public.set_user_role(uuid, text)            to authenticated;
