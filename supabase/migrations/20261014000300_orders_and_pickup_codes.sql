-- 吴记云饺 · 订单、订单明细与取餐码
--
-- 取餐码规则：001~300 共 300 个号码，纯数字且保留前导零。
-- 号码的"占用"不另存状态位，而是直接看有没有 status='assigned' 的订单挂着它：
--   唯一部分索引 orders_active_code_ux 保证同一个号码不会同时挂在两笔未完成取餐的订单上，
--   商家标记已取餐（completed）后该号码自动回到可分配范围，天然避免"状态位与实际占用不一致"。

create table if not exists public.pickup_codes (
  code text primary key check (code ~ '^[0-9]{3}$' and code between '001' and '300')
);

comment on table public.pickup_codes is '取餐码号池 001-300，仅作合法性校验；是否被占用由订单状态推导';

insert into public.pickup_codes (code)
select lpad(g::text, 3, '0') from generate_series(1, 300) as g
on conflict (code) do nothing;

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete restrict,
  code             text references public.pickup_codes (code) on delete restrict,
  status           text not null default 'pending'
                   check (status in ('pending', 'assigned', 'completed', 'cancelled')),
  dining_type      text not null default 'dine_in'
                   check (dining_type in ('dine_in', 'pickup')),
  pickup_time      text not null default '尽快出餐',
  note             text not null default '',
  contact_nickname text not null default '',
  contact_phone    text not null default '',
  items_count      integer not null default 0 check (items_count >= 0),
  portion_count    integer not null default 0 check (portion_count >= 0),
  raw_weight_jin   numeric(8, 1) not null default 0 check (raw_weight_jin >= 0),
  original_total   numeric(10, 2) not null default 0 check (original_total >= 0),
  discount_amount  numeric(10, 2) not null default 0 check (discount_amount >= 0),
  package_fee      numeric(10, 2) not null default 0 check (package_fee >= 0),
  final_total      numeric(10, 2) not null default 0 check (final_total >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  assigned_at      timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  -- 同内容重复提交的判定指纹（30 秒窗口内命中就直接返回原单，不新建）
  submit_fingerprint text not null default '',
  -- 分配了号码的订单必须处于 assigned/completed；pending/cancelled 不应带号
  check ((code is null) or status in ('assigned', 'completed'))
);

comment on column public.orders.status is 'pending 待分配取餐码 / assigned 已分配待取餐 / completed 已取餐 / cancelled 用户已取消';
comment on column public.orders.contact_nickname is '下单时昵称快照，改昵称不影响历史订单';
comment on column public.orders.contact_phone is '下单时手机号快照，供商家核对';

-- 同一号码不能同时挂在两笔未完成取餐的订单上（并发抢码由这条索引兜底）
create unique index if not exists orders_active_code_ux
  on public.orders (code)
  where code is not null and status = 'assigned';

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at);
create index if not exists orders_pending_recent_idx on public.orders (user_id, created_at desc)
  where status = 'pending';

create table if not exists public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   text references public.products (id) on delete set null,
  is_raw       boolean not null default false,
  name         text not null,
  spec_name    text not null default '',
  options      text not null default '',
  unit         text not null default '份',
  unit_price   numeric(6, 2) not null default 0,
  quantity     numeric(8, 1) not null check (quantity > 0),
  subtotal     numeric(10, 2) not null check (subtotal >= 0),
  sort_index   integer not null default 0
);

comment on table public.order_items is '订单明细快照：商品改名/改价/下架都不影响历史订单，product_id 仅用于溯源';

create index if not exists order_items_order_idx on public.order_items (order_id, sort_index);

-- ---------------------------------------------------------------------------
-- 下单后同步订单上的汇总数量（避免客户端自报）
-- ---------------------------------------------------------------------------
create or replace function public.wuji_touch_orders()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wuji_orders_touch on public.orders;
create trigger wuji_orders_touch
  before update on public.orders
  for each row execute function public.wuji_touch_orders();
