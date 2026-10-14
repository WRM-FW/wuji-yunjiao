-- 吴记云饺 · 商品表（商家可在后台增删改与上下架，无需改代码或重新部署）
--
-- 计价方式 pricing_mode：
--   portion  按份卖（馄饨类）
--   weight   按斤卖（只卖生饺的商品）
--   both     一份商品两种卖法：熟食按份 + 生饺按斤（水饺类）
-- 下单时以本表价格为唯一权威来源，客户端传来的金额一律忽略。

create table if not exists public.products (
  id                 text primary key,
  name               text not null,
  category           text not null default 'jiaozi_cooked'
                     check (category in ('jiaozi_cooked', 'wonton')),
  pricing_mode       text not null default 'portion'
                     check (pricing_mode in ('portion', 'weight', 'both')),
  price_cooked       numeric(6, 2) not null default 0 check (price_cooked >= 0),
  unit_cooked        text not null default '份',
  support_raw        boolean not null default false,
  price_raw          numeric(6, 2) not null default 0 check (price_raw >= 0),
  unit_raw           text not null default '斤',
  raw_discount       numeric(6, 2) not null default 0 check (raw_discount >= 0),
  desc_text          text not null default '',
  tags               jsonb not null default '[]'::jsonb,
  options            jsonb not null default '{}'::jsonb,
  listing_status     text not null default 'on' check (listing_status in ('on', 'off')),
  sold_out           boolean not null default false,
  sort_order         integer not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- 按斤卖的商品必须有斤价；按份卖的商品必须有份价
  check (
    (pricing_mode in ('portion', 'both') and price_cooked > 0)
    or (pricing_mode = 'weight' and price_raw > 0)
  )
);

comment on table public.products is '商品主数据，商家端直接维护';
comment on column public.products.listing_status is 'on=上架可购买，off=下架（客户端不再展示，也不可选购）';
comment on column public.products.sold_out is '今日售罄：仍展示但不可下单';
comment on column public.products.raw_discount is '生饺每斤立减金额，用于展示"每斤立减1元"';

create index if not exists products_listing_idx on public.products (listing_status, category, sort_order);

create or replace function public.wuji_touch_products()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wuji_products_touch on public.products;
create trigger wuji_products_touch
  before update on public.products
  for each row execute function public.wuji_touch_products();

-- ---------------------------------------------------------------------------
-- 初始商品：从纯前端版本的 js/mock-data.js 原样迁入（15 款，价格与单位保持一致）
-- ---------------------------------------------------------------------------
insert into public.products (
  id, name, category, pricing_mode, price_cooked, unit_cooked,
  support_raw, price_raw, unit_raw, raw_discount,
  desc_text, tags, options, listing_status, sort_order
) values
  ('p1', '玉米鲜肉饺子', 'jiaozi_cooked', 'both', 11.60, '份', true, 10.60, '斤', 1.00,
   '精选冷鲜猪前腿肉搭配甜玉米粒，颗颗爆汁，香甜多汁。',
   '["招牌热销","玉米香甜饱满","人气推荐"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 10),
  ('p2', '韭菜鸡蛋饺子', 'jiaozi_cooked', 'both', 11.80, '份', true, 10.80, '斤', 1.00,
   '清晨现割鲜嫩韭菜，配优质土鸡蛋现炒，清爽滑嫩，鲜香扑鼻。',
   '["经典素馅","鲜嫩爽口","素食优选"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 20),
  ('p3', '韭菜鲜肉饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '传统经典配方，鲜嫩韭菜混合醇香猪前尖肉，油润多汁，口感饱满。',
   '["传统风味","肉质香浓"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 30),
  ('p4', '大葱鲜肉饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '北方正宗大葱鲜肉调馅，葱白细剁提味，肉馅紧实弹牙，回味醇香。',
   '["北方传统","葱香浓郁"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 40),
  ('p5', '香菇素三鲜饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '优质干香菇温水泡发切丁，辅以鲜脆木耳与嫩豆腐，菌香浓郁，清爽开胃。',
   '["菌菇清香","低脂健康"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 50),
  ('p6', '芹菜鲜肉饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '香脆小芹菜细切入馅，纤维丰富脆爽多汁，搭配鲜猪肉荤素均衡解油腻。',
   '["清脆爽口","解腻回甘"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 60),
  ('p7', '白菜鲜肉饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '精选清甜大白菜，锁住原汁甘甜，一口咬下爆出清甜肉汁。',
   '["百财聚来","清甜多汁"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 70),
  ('p8', '茴香鲜肉饺子', 'jiaozi_cooked', 'both', 12.80, '份', true, 11.80, '斤', 1.00,
   '精选小茴香嫩苗，散发特有清芬香气，与鲜猪肉黄金配比，地道特色老味。',
   '["特色风味","香气独特"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 80),
  ('p9', '虾仁鲜肉饺子', 'jiaozi_cooked', 'both', 17.80, '份', true, 16.80, '斤', 1.00,
   '每只饺子包入整颗大虾仁与冷鲜猪肉，0添加防腐剂，Q弹鲜甜，肉馅紧致饱满。',
   '["整颗大虾仁","0添加防腐剂","豪华鲜品"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 90),
  ('p10', '羊肉大葱饺子', 'jiaozi_cooked', 'both', 17.80, '份', true, 16.80, '斤', 1.00,
   '严选优质嫩羊肉，佐以香浓大葱去膻提鲜，暖胃滋补，汤汁醇厚浓郁。',
   '["滋补暖胃","醇厚鲜香"]',
   '{"spiciness":["不辣","微辣","香辣"],"condiments":["正常葱花香菜","免葱免香菜","只要葱花","只要香菜"]}',
   'on', 100),
  ('p11', '纯鲜肉馄饨', 'wonton', 'portion', 11.80, '份', false, 11.80, '份', 0.00,
   '传统福袋包法，大颗饱满纯肉馅，慢熬骨汤打底，配虾皮、紫菜与香葱碎。',
   '["大颗福袋","浓郁骨汤"]',
   '{"spiciness":["清汤原味","微辣红油","香辣红油"],"condiments":["经典紫菜虾皮葱花","免葱花","免香菜","多加紫菜虾皮"]}',
   'on', 110),
  ('p12', '玉米鲜肉馄饨', 'wonton', 'portion', 11.80, '份', false, 11.80, '份', 0.00,
   '薄皮大馅，香甜玉米粒与鲜嫩肉馅交织，入口清甜爽滑，暖胃舒心。',
   '["香甜滑嫩","清甜回甘"]',
   '{"spiciness":["清汤原味","微辣红油","香辣红油"],"condiments":["经典紫菜虾皮葱花","免葱花","免香菜","多加紫菜虾皮"]}',
   'on', 120),
  ('p13', '马蹄鲜肉馄饨', 'wonton', 'portion', 12.80, '份', false, 12.80, '份', 0.00,
   '新鲜荸荠（马蹄）切碎入馅，清甜爽脆，肉质细嫩，口感层次丰富解油腻。',
   '["马蹄爽脆","清润解腻"]',
   '{"spiciness":["清汤原味","微辣红油","香辣红油"],"condiments":["经典紫菜虾皮葱花","免葱花","免香菜","多加紫菜虾皮"]}',
   'on', 130),
  ('p14', '皮蛋鲜肉馄饨', 'wonton', 'portion', 12.80, '份', false, 12.80, '份', 0.00,
   '特色溏心松花皮蛋切丁融于鲜肉中，鲜醇甘香，骨汤提味，风味独特。',
   '["溏心皮蛋","鲜醇回味"]',
   '{"spiciness":["清汤原味","微辣红油","香辣红油"],"condiments":["经典紫菜虾皮葱花","免葱花","免香菜","多加紫菜虾皮"]}',
   'on', 140),
  ('p15', '虾仁鲜肉馄饨', 'wonton', 'portion', 13.80, '份', false, 13.80, '份', 0.00,
   '选用原只优质大青虾仁与精细鲜猪肉，每颗馄饨均有弹牙虾肉，鲜美多汁。',
   '["原只大虾","鲜美弹牙","招牌福袋"]',
   '{"spiciness":["清汤原味","微辣红油","香辣红油"],"condiments":["经典紫菜虾皮葱花","免葱花","免香菜","多加紫菜虾皮"]}',
   'on', 150)
on conflict (id) do nothing;
