-- 吴记云饺 · Realtime 订阅与副本标识
-- 商家端与"我的订单"依赖 postgres_changes 推送；断线时前端会退回轮询。
-- 重复执行时（表已在发布里）忽略异常，保证迁移可重跑。

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object or undefined_object then null;
  when others then
    if sqlerrm ilike '%already included%' then null; else raise; end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception
  when duplicate_object or undefined_object then null;
  when others then
    if sqlerrm ilike '%already included%' then null; else raise; end if;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.products;
exception
  when duplicate_object or undefined_object then null;
  when others then
    if sqlerrm ilike '%already included%' then null; else raise; end if;
end;
$$;

-- 让 UPDATE/DELETE 事件带上变更前的行，前端增量刷新更稳
alter table public.orders      replica identity full;
alter table public.order_items replica identity full;
alter table public.products    replica identity full;
