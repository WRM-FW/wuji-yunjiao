# 吴记云饺 - 河南信息科技学院三楼移动端订餐网站

专为**河南信息科技学院三楼**校内档口「吴记云饺」定制研发的高效移动端纯前端订餐系统。系统全面贯彻**纯前端架构**，无任何后端与商家后台依赖，针对学生下课订餐与微信群截图核验场景进行了针对性优化。

---

## 一、系统定位与架构原则

1. **纯前端架构**
   - 网站仅依赖标准前端能力（HTML5 / CSS3 / JavaScript ES6+ / LocalStorage），无需 Node.js 后端、数据库或第三方 API 服务。
   - 彻底移除商家后台管理模块（`/admin.html`）及相关服务端接口，避免引入不必要的管理负担和运维成本。
2. **纯前端架构的能力限制说明**
   - **支付验证边界**：页面展示的学校统一收款二维码仅供顾客扫码转账，前端页面**无法感知银行或第三方支付的真实到账状态**，亦不会进行虚假自动支付验证。
   - **订单确认边界**：顾客在前端点击提交生成的订单，仅保存在当前浏览器的本地存储中并用于生成截图凭证，**不代表已被商家后台云端自动接收**；订单的真实确认与出餐排单完全依赖顾客按照指引将截图发送至订餐群后，由档口工作人员人工核验。

---

## 二、功能与交互流程

```text
[选餐首页 index.html]
       │
       ▼ （纯文字菜品浏览、规格定制：熟食/生饺、辣度、葱花香菜、加购）
[订单结算 checkout.html]
       │
       ▼ （选择堂食/自取、自由选择/输入出餐时间、填写备注，无联系人信息）
[扫码支付与凭证页 pay.html]
       │
       ▼ （展示核心四要素、金额、中银收款码，用户截图发送至订餐群）
[微信订餐群人工核验出餐]
```

### 1. 计价规则：熟食按份、生饺按斤
- **熟食现煮**按「份」卖，数量为整数份，单价即 `priceCooked` 元/份。
- **生饺带走**按「斤」卖，单价为 `priceRaw` 元/斤，顾客可自由输入重量：0.1 斤为一档，0.5 斤起售，单笔上限 20 斤，另配 1 / 1.5 / 2 / 3 斤快捷档。规则集中在 `js/mock-data.js` 的 `RAW_SELL_CONFIG`，改档位只改这一处。
- **每斤立减 1 元**按重量线性计算：优惠额 =（熟食价 − 生饺价）× 斤数，1.5 斤即减 1.5 元；金额一律按分（两位小数）取整后再汇总。
- **件数与重量分列**：底部角标与「共 N 件」里的件数 = 熟食份数 + 生饺袋数（1.5 斤生饺算 1 件），生饺总重量另起一行显示「生饺共 X 斤」，避免把份和斤加在同一个数字里。
- 福袋馄饨只有熟食一种形态，`supportRaw: false` 时即使传入按斤参数也会被强制回落为按份计价。
- 规格抽屉里「数量/重量」紧随食用方式之后（配料选项排在其后），横屏手机等矮窗口打开时会自动把重量输入框滚进可视区，不需要顾客自己找。

### 2. 屏幕适配与滚动
- 首页是**应用外壳**：`body.app-shell-body` 禁滚，顶栏、公告条、标签条、底部结算栏固定，只有左侧分类栏和右侧商品列表各自 `overflow-y: auto` 且 `overscroll-behavior: contain`，滚动互不传染。
- 视口 meta 为 `width=device-width, initial-scale=1.0, viewport-fit=cover`，**不锁缩放**；高度用 `100dvh`（老内核回退 `100vh`），刘海与横屏安全区由 `env(safe-area-inset-*)` 补齐。
- 断点：`≤400px` 收窄侧栏与内边距；`≤340px` 再压一档；`≥761px`（平板/大屏）容器放宽到 1024px、商品改**双列网格**；`横屏且高度 ≤560px` 时压缩顶栏、隐藏标签条、抽屉占满 94dvh 并隐藏说明文字，保证重量输入框首屏可见。
- 结算页 `≥900px` 走左右两栏；支付凭证页始终限制在 620px 宽，保证截图发群的版式不变形。
- 「💬 订餐群」与「📜 实体大菜单」两个入口放在顶栏右侧（≤400px 允许换行），不再以悬浮按钮压在商品卡的操作按钮上。

### 3. 餐厅信息与菜单分类
- **餐厅地点**：河南信息科技学院三楼。
- **左侧菜单分类顺序**：
  1. `全部商品`
  2. `热食水饺`
  3. `福袋馄炖`（调整至「生饺称斤」上方）
  4. `生饺称斤`（每斤立减1元）
- **已移除分类与选项**：
  - 已彻底删除「小料与饮品」分类及其关联商品。
  - 已删除规格弹窗中的「配赠蘸料」选项。
- **纯文字商品展示**：
  - 彻底移除菜品图片，采用精致的中式面点纯文字排版。
  - 重点突出餐品名称、特色标签、单价、份量单位及生饺优惠，页面紧凑舒适，无任何视觉留白空缺。

### 4. 下单流程与信息收集
- **用餐方式**：提供【堂食就餐】与【打包自取】两种大按钮切换，并在最终支付确认页最醒目位置展示。
- **预约出餐时间**：
  - 支持快捷选择【尽快出餐 (约10-15分钟)】；
  - 支持【指定具体时间】，用户可通过时间选择器选择或自由输入具体时间（如“12:10”、“12:25”等），完全不受预设固定分段限制。
- **联系人信息精简**：已彻底删除顾客姓名、电话等相关字段，仅保留灵活的【订单备注】输入项。
- **直接进入支付**：提交订单后直接生成订单并跳转至扫码支付页面，**不生成也不展示任何取餐码**，流程干脆利落。

### 5. 扫码支付与订单截图页面 (`pay.html`)
专门针对**手机整屏截图与微信群分享**深度设计：
- **四大核心信息最高视觉层级**：
  1. **用餐方式**（堂食或自取）：醒目高亮大号胶囊徽章。
  2. **具体出餐时间**：大号时钟高亮展示。
  3. **商品名称与数量**：清晰的清单表格，商品名称与数量（如 `x2`）大字加粗，核验人员一眼即知。
  4. **订单金额**：展示商品单价、各商品对应金额、商品总价及最终应付金额，前后保持一致。
- **学校统一收款码**：
  - 清晰居中展示中国银行「中银来聚财」收款二维码（商户终端号：41088491），支持微信、支付宝、云闪付扫码。
  - 清晰提示扫码支付的精确金额。
- **付款后简洁醒目操作说明**：
  > 📢 **付款完成后操作说明**：付款完成后，请将**当前订单页面截图**和**支付成功截图**一并发送至订餐群，以便核对订单和付款情况。
- **已删除内容**：已删除所有信息收集表单（付款人姓名、单号尾数、凭证截图上传），已删除咨询电话（138-0000-8888）。

---

## 三、项目文件结构

```text
wuji-yunjiao/
├── index.html                   # 顾客选餐首页（纯文字商品列表、分类联动、规格弹窗、购物车）
├── checkout.html                # 订单结算页（堂食/自取、自由选择出餐时间、备注、可信核算）
├── pay.html                     # 扫码支付与订单确认页（专为截图核验设计：四大核心信息、中银收款码、群指引）
├── login.html                   # 统一注册 / 登录入口（手机号或邮箱 + 密码，无短信验证）
├── my-orders.html               # 我的订单：状态、取餐码、未分配前可取消（含退款指引与订餐群码）
├── staff.html                   # 商家端：订单与取餐码、商品上下架与新增编辑、用户身份
├── css/
│   ├── style.css                # 应用外壳、双栏点餐、断点与计价文案、主题变量
│   └── components.css           # 抽屉、弹窗、步进器、重量输入、Toast 等通用组件
├── js/
│   ├── config.js                # Supabase URL / anon key（可公开值）与刷新间隔
│   ├── api.js                   # 后端访问层：认证、商品、订单、取餐码、Realtime + 轮询兜底
│   ├── vendor/supabase-*.js     # supabase-js UMD（随仓库发布，不依赖外部 CDN）
│   ├── mock-data.js             # 纯前端回退用的菜单种子 + RAW_SELL_CONFIG（生饺称重档位）
│   ├── store.js                 # 本地购物车与前端算费预览（下单金额以数据库为准）
│   ├── app.js                   # 首页：分类、双列/单列列表、份数与重量选购、账号条
│   ├── login.js                 # 注册登录页逻辑
│   ├── checkout.js              # 结算页：调用 submit_order 把订单提交到后端
│   ├── my-orders.js             # 我的订单列表与取消
│   ├── staff.js                 # 商家端三块面板、号池与商品表单
│   └── pay.js                   # 支付凭证页：订单详情、取餐码自动出现、份/斤明细
├── supabase/
│   └── migrations/              # 建表、RLS、业务函数、Realtime，按时间戳顺序 db push
├── assets/
│   └── images/
│       ├── logo_mascot.png      # 品牌吉祥物（欢迎光临饺子娃娃）
│       ├── payment_qr.png       # 学校统一中银来聚财收款码（41088491）
│       ├── wechat_group.jpg     # 订餐福利群二维码
│       └── menu_full.jpg        # 档口现场原版纸质大菜单图
├── .gitignore                   # 忽略本地设计物料与改版后不再引用的 8 张菜品图
├── .nojekyll                    # GitHub Pages 分支直发时跳过 Jekyll 处理
├── wrangler.toml                # 可选的 Cloudflare Pages 静态部署配置
├── package.json                 # 项目元数据与脚本
└── README.md                    # 本文档
```

---

## 四、线上地址与本地运行

- **GitHub Pages 线上地址**：https://wrm-fw.github.io/wuji-yunjiao/ （源码仓库 https://github.com/WRM-FW/wuji-yunjiao ）
- 站点为纯静态，仓库根目录即发布目录，`main` 分支推送后由 GitHub Pages 自动重新构建。
- **本地运行**：直接在浏览器双击打开 `index.html` 即可完整体验，亦可通过静态服务器打开：
  ```bash
  npx serve .
  ```

### 可选：Cloudflare Pages 部署
`wrangler.toml` 保留了 Cloudflare Pages 的配置（`pages_build_output_dir = "."`），如需换用 CF 域名：

- **Framework preset**：None；
- **Build command**：留空；
- **Build output directory**：`.`（根目录）。

---

## 五、后端与权限（Supabase）

### 数据表
| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `profiles` | 昵称、手机号、邮箱、角色 | `role ∈ user/merchant/admin`；列级 `revoke update (role)` + 触发器双重挡越权 |
| `products` | 商品主数据（商家端直接维护） | `pricing_mode ∈ portion/weight/both`；`listing_status ∈ on/off`；`sold_out` |
| `orders` | 订单主表 | 状态机 `pending → assigned → completed`，`pending` 可 `cancelled`；`check ((code is null) or status in ('assigned','completed'))` |
| `order_items` | 订单明细快照 | 商品改名/改价/下架都不影响历史订单，金额与单位在下单瞬间冻结 |
| `pickup_codes` | 取餐码号池 001–300 | `check (code ~ '^[0-9]{3}$' and code between '001' and '300')` |

取餐码的"占用"不额外存状态位，而是看有没有 `status='assigned'` 的订单挂着它：
`create unique index orders_active_code_ux on orders(code) where status='assigned'`
这一条索引就是并发抢码的最终防线——同一个号同时挂两笔未完成订单在数据库层直接失败；
商家标记已取餐后号码自动回到可分配范围，不存在"状态位忘记释放"这类不一致。

### 权限模型
- 读：`orders` / `order_items` 的 RLS 策略是 `user_id = auth.uid() or wuji_is_staff()`，
  顾客越权读别人的订单会拿到空结果；`products` 对匿名只放开 `listing_status='on'`。
- 写：`orders`、`order_items`、`pickup_codes` 对 `authenticated` **只给 select**，
  所有写入必须走 `security definer` 函数（`submit_order` / `cancel_order` /
  `assign_pickup_code` / `complete_pickup` / `set_user_role`），函数体内再判一次角色。
- `products` 允许商家/管理员直接增删改，由 RLS 的 `wuji_is_staff()` 把关；普通用户 PATCH 返回 403。
- 角色变更只允许 admin，且不允许改自己（防止把自己降级后没人能改回来）。
- 前端只持有 anon key（`js/config.js`），service_role key 不进仓库、不进浏览器。

### 手机号登录的处理
Supabase 的手机密码登录是企业版功能、手机注册强制短信验证，与"不做短信验证"冲突。
本项目把手机号映射成 `<数字>@phone.wuji.app` 形式的账号标识走邮箱密码认证，
真实手机号另存 `profiles.contact_phone` 供商家按号筛选；控制台需关闭
Email Confirmation（`SITE_URL` 可留空），注册后即可直接登录。

### 初始化步骤
```bash
supabase login                       # 或 export SUPABASE_ACCESS_TOKEN=...
supabase projects create wuji-yunjiao
supabase link --project-ref <ref>
supabase db push                     # 按 supabase/migrations/ 顺序建表、策略与函数
supabase users create --email admin@wuji.app --password '<随机密码>' \
  --email-confirm --role authenticated   # 初始管理员
# 再用 service_role 或 Studio 把该账号的 profiles.role 改成 admin
node _tools/supabase_acceptance.mjs     # 端到端验收
```
把 `supabase projects api-keys` 拿到的 anon key 与项目 URL 填进 `js/config.js` 即可上线；
未填时站点自动退回 v2.0.0 的纯前端形态（本地菜单 + 本地订单），不会白屏。

### 商家端刷新策略
`js/api.js` 的 `watchOrders()` 以 Realtime `postgres_changes`（orders / order_items）为主，
12 秒轮询兜底，并在页面重新可见、网络恢复时立刻补一次刷新；
商家正在输入但尚未提交的取餐码存放在 `draftCodes` 里，列表重绘时回填，不会被刷新冲掉。

### 验收
`_tools/supabase_acceptance.mjs` 直接打 Supabase 的 REST / Auth 接口跑完整业务链：
注册（手机号与邮箱）→ 下单计价 → 重复提交幂等 → 越权读别人订单 → 普通用户改商品/自升角色被拒 →
管理员设商家 → 分配 007 → 号池余量变化 → 分配后顾客不能取消 → 两商家并发抢 085 只有一个成功 →
标记已取餐释放号码并可再分配 → 新增商品客户端可见并下单 → 下架后不可新购 → 重新上架恢复 →
改价改售罄不影响历史订单快照 → 我的订单互不重叠。


## 六、回归验证（改完必跑）

三个脚本都在仓库外的 `RestWeb_Develop/_tools/`，不随站点发布：

1. **计价回归**：`node _tools/test_pricing.mjs`
   在 Node 沙箱里加载 `mock-data.js` + `store.js`，用 stub localStorage 跑真实算费代码，覆盖按份/按斤、0.1 斤精度与上下限、每斤立减线性计算、金额按分取整、混合单件数与斤数分列、购物车合并与 ±0.5 斤步进、订单落库字段，共 50 项断言。
2. **多视口布局与交互回归**：`node _tools/cdp_layout_check.mjs`
   起本地静态服务，用 headless Edge 的 CDP `Emulation.setDeviceMetricsOverride` 精确模拟 13 档视口（320×568 到 1280×800，含 844×390 手机横屏与 iPad 横竖屏），逐档校验：无横向溢出、整页不滚、商品列表与分类栏独立滚动、滚动时顶栏不动、底部结算栏可见、触控高度、网格列数，并在 7 档视口下真跑一遍「生饺输入 1.5 斤 → +0.1 → 加购 → 混合单结算 → 支付页」，断言小计、角标件数、斤数提示与页面单位文案；截图输出到 `_tools/layout-shots/`。
   - 只跑部分视口：`ONLY=844x390-phone-landscape,768x1024-ipad-portrait node _tools/cdp_layout_check.mjs`
   - 注意：headless 下 CSS transition 不随时间推进，脚本会在量几何前注入 `transition:none`，否则读到的是抽屉滑入前的位置。
