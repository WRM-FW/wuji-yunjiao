/**
 * 吴记云饺 · 商家管理端
 *
 * 权限全部由数据库把关：本页面只是入口，普通用户即使直接打开这个网址，
 * staff_orders / assign_pickup_code / available_pickup_codes / set_user_role
 * 这些函数也会因为 RLS 与函数内的角色判断直接报错。
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const fmtJin = () => WujiStore.formatJin;

  const ordersGrid = $("ordersGrid");
  const productsGrid = $("productsGrid");
  const usersList = $("usersList");
  const poolSummary = $("poolSummary");
  const poolCodes = $("poolCodes");
  const poolToggleBtn = $("poolToggleBtn");
  const poolUpdatedAt = $("poolUpdatedAt");
  const whoText = $("whoText");
  const toast = $("toast");

  const STATUS_TEXT = { pending: "待分配", assigned: "待取餐", completed: "已取餐", cancelled: "已取消" };
  const MODE_TEXT = { portion: "按份", weight: "按斤", both: "按份 + 按斤" };

  let me = null;
  let orderFilter = "pending";
  let productFilter = "all";
  let orders = [];
  let products = [];
  let pool = null;
  let knownOrderIds = new Set();
  let firstOrderLoad = true;
  let editingProduct = null;

  // 商家正在输入但还没提交的取餐码，刷新列表时不能被覆盖
  const draftCodes = new Map();

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function errText(e) { return String(e?.message || e || "操作失败"); }

  function timeText(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ------------------------------------------------------------------
  // 标签页
  // ------------------------------------------------------------------
  function bindTabs() {
    document.querySelectorAll(".st-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".st-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".st-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        $("panel" + tab.dataset.panel[0].toUpperCase() + tab.dataset.panel.slice(1)).classList.add("active");
        tab.querySelector(".st-new-dot")?.remove();
        if (tab.dataset.panel === "products") loadProducts();
        if (tab.dataset.panel === "users") loadUsers();
      });
    });
  }

  // ------------------------------------------------------------------
  // 订单
  // ------------------------------------------------------------------
  async function loadOrders() {
    try {
      const list = await WujiApi.staffOrders(orderFilter === "all" ? null : orderFilter, 120);
      orders = list || [];

      if (!firstOrderLoad) {
        const fresh = orders.filter((o) => !knownOrderIds.has(o.id));
        if (fresh.length > 0) {
          showToast(`新到 ${fresh.length} 笔订单`);
          markTabNew();
        }
      }
      firstOrderLoad = false;
      knownOrderIds = new Set(orders.map((o) => o.id));
      renderOrders();
    } catch (e) {
      showToast("订单加载失败：" + errText(e));
    }
  }

  function markTabNew() {
    const tab = document.querySelector('.st-tab[data-panel="orders"]');
    if (tab && !tab.querySelector(".st-new-dot")) {
      const dot = document.createElement("span");
      dot.className = "st-new-dot";
      tab.appendChild(dot);
    }
  }

  function renderOrders() {
    if (orders.length === 0) {
      ordersGrid.innerHTML = `<div class="st-empty" style="grid-column: 1/-1;">这个状态下暂无订单</div>`;
      return;
    }

    ordersGrid.innerHTML = orders.map((o) => {
      const items = (o.items || []).map((i) => {
        const qty = Number(i.quantity);
        const qtyText = i.is_raw ? `${fmtJin()(qty)} 斤` : `x${qty}`;
        return `
          <div class="st-item">
            <div>
              <div>${esc(i.name)}</div>
              <div class="st-item-sub">${esc(i.spec_name || "")}${i.options ? " · " + esc(i.options) : ""}
                · ￥${Number(i.unit_price).toFixed(1)}/${esc(i.unit)}</div>
            </div>
            <div class="st-item-qty">${qtyText}<div class="st-item-sub" style="text-align:right;">￥${Number(i.subtotal).toFixed(2)}</div></div>
          </div>`;
      }).join("");

      const weightNote = Number(o.raw_weight_jin) > 0 ? `<div class="st-item-sub">生饺共 ${fmtJin()(Number(o.raw_weight_jin))} 斤，出餐前请过秤</div>` : "";

      const codeBlock = o.status === "pending"
        ? `
          <div class="st-code-area">
            <div class="st-code-row">
              <input class="st-code-input" inputmode="numeric" maxlength="3" placeholder="000"
                     data-code-input="${esc(o.id)}" value="${esc(draftCodes.get(o.id) || "")}" aria-label="取餐码" />
              <button class="st-btn primary" data-assign="${esc(o.id)}">分配取餐码</button>
              <button class="st-btn ghost" data-suggest="${esc(o.id)}">用最小可用号</button>
            </div>
            <div class="st-note">号码范围 001–300，也可在上方号池里点选；已被占用的号码会被服务端拒绝。</div>
          </div>`
        : o.code
          ? `
            <div class="st-code-area">
              <div class="st-code-row" style="justify-content: space-between;">
                <div>
                  <div class="st-note">取餐码</div>
                  <div class="st-current-code">${esc(o.code)}</div>
                </div>
                ${o.status === "assigned"
                  ? `<button class="st-btn dark" data-complete="${esc(o.id)}">已取餐 · 释放号码</button>`
                  : `<span class="st-badge ${esc(o.status)}">${STATUS_TEXT[o.status] || esc(o.status)}</span>`}
              </div>
            </div>`
          : "";

      return `
        <article class="st-card" data-order="${esc(o.id)}">
          <div class="st-card-head">
            <div class="st-order-id">${esc(o.id).slice(0, 8)}… · ${timeText(o.created_at)}</div>
            <span class="st-badge ${esc(o.status)}">${STATUS_TEXT[o.status] || esc(o.status)}</span>
          </div>
          <div class="st-customer">
            <strong>${esc(o.contact_nickname || "未填昵称")}</strong>
            ${o.contact_phone ? " · " + esc(o.contact_phone) : ""}
          </div>
          <div class="st-items">${items}${weightNote}</div>
          <div class="st-meta">
            <span>${o.dining_type === "pickup" ? "🛍️ 打包自取" : "🍽️ 堂食就餐"}</span>
            <span>⏰ ${esc(o.pickup_time || "尽快出餐")}</span>
            ${o.note ? `<span>📝 ${esc(o.note)}</span>` : ""}
          </div>
          <div style="display:flex; align-items:center; justify-content: space-between;">
            <div class="st-total">￥${Number(o.final_total).toFixed(2)}</div>
            <div class="st-note">${o.items_count || (o.items || []).length} 件</div>
          </div>
          ${codeBlock}
        </article>`;
    }).join("");

    ordersGrid.querySelectorAll("[data-code-input]").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^\d]/g, "").slice(0, 3);
        draftCodes.set(input.dataset.codeInput, input.value);
      });
    });
    ordersGrid.querySelectorAll("[data-assign]").forEach((btn) => {
      btn.addEventListener("click", () => assignCode(btn.dataset.assign));
    });
    ordersGrid.querySelectorAll("[data-suggest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = ordersGrid.querySelector(`[data-code-input="${btn.dataset.suggest}"]`);
        const next = smallestFreeCode();
        if (!next) { showToast("号池已无可用号码"); return; }
        if (input) { input.value = next; draftCodes.set(btn.dataset.suggest, next); }
      });
    });
    ordersGrid.querySelectorAll("[data-complete]").forEach((btn) => {
      btn.addEventListener("click", () => completePickup(btn.dataset.complete));
    });
  }

  function smallestFreeCode() {
    const free = pool?.free_codes || [];
    return free.length ? free[0] : "";
  }

  async function assignCode(orderId) {
    const input = ordersGrid.querySelector(`[data-code-input="${orderId}"]`);
    const code = (input?.value || "").trim();
    if (!/^\d{3}$/.test(code)) { showToast("请输入三位数字取餐码，例如 007"); return; }

    const btn = ordersGrid.querySelector(`[data-assign="${orderId}"]`);
    if (btn) btn.disabled = true;
    try {
      await WujiApi.assignPickupCode(orderId, code);
      draftCodes.delete(orderId);
      showToast(`已分配取餐码 ${code}`);
      await Promise.all([loadOrders(), loadPool()]);
    } catch (e) {
      showToast(errText(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function completePickup(orderId) {
    const btn = ordersGrid.querySelector(`[data-complete="${orderId}"]`);
    if (btn) btn.disabled = true;
    try {
      const row = await WujiApi.completePickup(orderId);
      showToast(`订单已标记取餐，号码 ${row.code || ""} 已释放`);
      await Promise.all([loadOrders(), loadPool()]);
    } catch (e) {
      showToast(errText(e));
      if (btn) btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // 号池
  // ------------------------------------------------------------------
  async function loadPool() {
    try {
      pool = await WujiApi.availableCodes();
      if (!pool) return;
      poolSummary.innerHTML = `剩余 <b>${pool.free_count}</b> 个可用 · 已占用 ${pool.used} 个`;
      poolCodes.innerHTML = (pool.free_codes || [])
        .map((c) => `<div class="st-code-cell" data-pick="${esc(c)}">${esc(c)}</div>`)
        .join("");
      poolUpdatedAt.textContent = "更新于 " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      poolCodes.querySelectorAll("[data-pick]").forEach((cell) => {
        cell.addEventListener("click", () => {
          const target = ordersGrid.querySelector("[data-code-input]:not([value=''])")
            || ordersGrid.querySelector("[data-code-input]");
          if (!target) { showToast("下面没有待分配的订单"); return; }
          target.value = cell.dataset.pick;
          draftCodes.set(target.dataset.codeInput, target.value);
          poolCodes.querySelectorAll(".st-code-cell").forEach((x) => x.classList.remove("picked"));
          cell.classList.add("picked");
        });
      });
    } catch (e) {
      console.error(e);
    }
  }

  // ------------------------------------------------------------------
  // 商品
  // ------------------------------------------------------------------
  async function loadProducts() {
    try {
      const list = await WujiApi.allProducts();
      if (Array.isArray(list)) {
        products = list;
        renderProducts();
      }
    } catch (e) {
      showToast("商品加载失败：" + errText(e));
    }
  }

  function renderProducts() {
    const list = productFilter === "all" ? products : products.filter((p) => p.listingStatus === productFilter);
    if (list.length === 0) {
      productsGrid.innerHTML = `<div class="st-empty" style="grid-column: 1/-1;">暂无商品</div>`;
      return;
    }
    productsGrid.innerHTML = list.map((p) => `
      <article class="st-card">
        <div class="pd-card-head">
          <div class="pd-name">${p.category === "wonton" ? "🥣 " : "🥟 "}${esc(p.name)}</div>
          <span class="pd-tag ${p.listingStatus === "on" ? "on" : "off"}">${p.listingStatus === "on" ? "在售" : "已下架"}</span>
        </div>
        <div class="pd-price">${priceSummary(p)}</div>
        <div class="st-item-sub">${esc(p.desc || "")}</div>
        <div class="pd-tags">
          <span class="pd-tag">${MODE_TEXT[p.pricingMode] || p.pricingMode}</span>
          ${p.soldOut ? '<span class="pd-tag sold">今日售罄</span>' : ""}
          ${(p.tags || []).slice(0, 3).map((t) => `<span class="pd-tag">${esc(t)}</span>`).join("")}
        </div>
        <div class="pd-actions">
          <button class="st-btn sm" data-toggle-listing="${esc(p.id)}">${p.listingStatus === "on" ? "下架" : "上架"}</button>
          <button class="st-btn sm ghost" data-toggle-sold="${esc(p.id)}">${p.soldOut ? "取消售罄" : "标记售罄"}</button>
          <button class="st-btn sm ghost" data-edit="${esc(p.id)}">编辑</button>
        </div>
      </article>`).join("");

    productsGrid.querySelectorAll("[data-toggle-listing]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = products.find((x) => x.id === btn.dataset.toggleListing);
        try {
          await WujiApi.setProductListing(p.id, p.listingStatus !== "on");
          showToast(p.listingStatus === "on" ? "已下架，客户端不再展示" : "已上架");
          await loadProducts();
        } catch (e) { showToast(errText(e)); }
      });
    });
    productsGrid.querySelectorAll("[data-toggle-sold]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = products.find((x) => x.id === btn.dataset.toggleSold);
        try {
          await WujiApi.setProductSoldOut(p.id, !p.soldOut);
          showToast(p.soldOut ? "已恢复供应" : "已标记今日售罄");
          await loadProducts();
        } catch (e) { showToast(errText(e)); }
      });
    });
    productsGrid.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openProductForm(products.find((x) => x.id === btn.dataset.edit)));
    });
  }

  function priceSummary(p) {
    if (p.pricingMode === "weight") return `￥${p.priceRaw.toFixed(1)}/${p.unitRaw}`;
    if (p.pricingMode === "portion") return `￥${p.priceCooked.toFixed(1)}/${p.unitCooked}`;
    return `熟食 ￥${p.priceCooked.toFixed(1)}/${p.unitCooked}　生饺 ￥${p.priceRaw.toFixed(1)}/${p.unitRaw}（每斤立减￥${p.rawDiscount.toFixed(0)}）`;
  }

  function openProductForm(p) {
    editingProduct = p || null;
    $("productDrawerTitle").textContent = p ? `编辑商品 · ${p.name}` : "新增商品";
    $("pfName").value = p?.name || "";
    $("pfCategory").value = p?.category || "jiaozi_cooked";
    $("pfMode").value = p?.pricingMode || "portion";
    $("pfPriceCooked").value = p ? p.priceCooked : "";
    $("pfUnitCooked").value = p?.unitCooked || "份";
    $("pfPriceRaw").value = p ? p.priceRaw : "";
    $("pfUnitRaw").value = p?.unitRaw || "斤";
    $("pfRawDiscount").value = p ? p.rawDiscount : 1;
    $("pfDesc").value = p?.desc || "";
    $("pfTags").value = (p?.tags || []).join(" ");
    $("pfSort").value = p?.sortOrder || (products.length ? Math.max(...products.map((x) => x.sortOrder)) + 10 : 160);
    $("pfSpiciness").value = ((p?.options?.spiciness) || ["不辣", "微辣", "香辣"]).join(" ");
    $("pfCondiments").value = ((p?.options?.condiments) || ["正常葱花香菜", "免葱免香菜"]).join(" ");
    $("pfListingOn").checked = p ? p.listingStatus === "on" : true;
    $("pfSoldOut").checked = p ? Boolean(p.soldOut) : false;
    syncModeFields();
    updatePreview();
    $("productDrawerOverlay").classList.add("active");
  }

  function formFromDrawer() {
    const mode = $("pfMode").value;
    const split = (id) => String($(id).value || "").split(/[\s,，、]+/).filter(Boolean);
    return {
      isNew: !editingProduct,
      id: editingProduct ? editingProduct.id : "p_" + Date.now().toString(36),
      name: $("pfName").value.trim(),
      category: $("pfCategory").value,
      pricingMode: mode,
      priceCooked: Number($("pfPriceCooked").value) || 0,
      unitCooked: $("pfUnitCooked").value.trim() || "份",
      priceRaw: Number($("pfPriceRaw").value) || 0,
      unitRaw: $("pfUnitRaw").value.trim() || "斤",
      rawDiscount: Number($("pfRawDiscount").value) || 0,
      desc: $("pfDesc").value.trim(),
      tags: split("pfTags"),
      options: { spiciness: split("pfSpiciness"), condiments: split("pfCondiments") },
      listingStatus: $("pfListingOn").checked ? "on" : "off",
      soldOut: $("pfSoldOut").checked,
      sortOrder: Number($("pfSort").value) || 100
    };
  }

  function syncModeFields() {
    const mode = $("pfMode").value;
    $("pfCookedRow").style.display = mode === "weight" ? "none" : "grid";
    $("pfRawRow").style.display = mode === "portion" ? "none" : "grid";
    $("pfDiscountRow").style.display = mode === "portion" ? "none" : "block";
    if (mode === "weight" && $("pfUnitRaw").value === "斤") $("pfPriceRaw").focus?.();
    updatePreview();
  }

  function updatePreview() {
    const f = formFromDrawer();
    $("pfFooterName").textContent = f.name || "未命名商品";
    const modeLine = MODE_TEXT[f.pricingMode];
    let priceLine = "";
    if (f.pricingMode === "portion") priceLine = `￥${f.priceCooked.toFixed(1)}/${f.unitCooked}，顾客按份数选购（1 份起，整数）`;
    else if (f.pricingMode === "weight") priceLine = `￥${f.priceRaw.toFixed(1)}/${f.unitRaw}，顾客按重量选购（0.5~20 ${f.unitRaw}，0.1 一档）`;
    else priceLine = `熟食 ￥${f.priceCooked.toFixed(1)}/${f.unitCooked}；生饺 ￥${f.priceRaw.toFixed(1)}/${f.unitRaw}（每斤立减 ￥${f.rawDiscount.toFixed(1)}）`;
    $("pfPreview").innerHTML =
      `<strong>${esc(f.name || "商品名")}</strong>　${esc(priceLine)}<br>` +
      `分类：${f.category === "wonton" ? "福袋馄炖" : "热食水饺"} · 计价方式：${modeLine} · ` +
      `${f.listingStatus === "on" ? "上架" : "下架"}${f.soldOut ? " · 今日售罄" : ""}`;
  }

  async function saveProduct() {
    const f = formFromDrawer();
    if (!f.name) { showToast("请填写商品名称"); return; }
    if (f.pricingMode !== "weight" && f.priceCooked <= 0) { showToast("按份卖的商品要填熟食单价"); return; }
    if (f.pricingMode !== "portion" && f.priceRaw <= 0) { showToast("按斤卖的商品要填生饺单价"); return; }
    if (f.pricingMode === "both" && f.priceRaw > f.priceCooked) {
      showToast("生饺单价不应高于熟食单价，否则立减为负数");
      return;
    }

    const btn = $("saveProductBtn");
    btn.disabled = true;
    btn.textContent = "保存中...";
    try {
      const saved = await WujiApi.saveProduct(f);
      $("productDrawerOverlay").classList.remove("active");
      showToast(`${f.isNew ? "已新增" : "已更新"}「${saved.name}」，${saved.listingStatus === "on" ? "已在客户端上架" : "保持下架"}`);
      await loadProducts();
    } catch (e) {
      showToast("保存失败：" + errText(e));
    } finally {
      btn.disabled = false;
      btn.textContent = "保存商品";
    }
  }

  // ------------------------------------------------------------------
  // 用户与身份
  // ------------------------------------------------------------------
  async function loadUsers() {
    const q = $("userSearchInput").value.trim();
    try {
      const list = await WujiApi.searchUsers(q, 50);
      const isAdmin = me && me.role === "admin";
      $("roleHint").textContent = isAdmin
        ? "你是管理员：可以按手机号/邮箱/昵称找人，并把用户设为商家或收回商家身份。"
        : "你是商家：可以查看与检索用户，但设置身份需要管理员操作。";
      if (!list || list.length === 0) {
        usersList.innerHTML = `<div class="st-empty">没有匹配的用户</div>`;
        return;
      }
      usersList.innerHTML = list.map((u) => {
        const isSelf = me && u.id === me.id;
        const buttons = !isAdmin || isSelf
          ? ""
          : (u.role === "user"
              ? `<button class="st-btn sm primary" data-role="${esc(u.id)}" data-to="merchant">设为商家</button>`
              : `<button class="st-btn sm" data-role="${esc(u.id)}" data-to="user">收回商家</button>`);
        return `
          <div class="us-row">
            <div class="us-main">
              <div class="us-name">${esc(u.nickname || "未填昵称")}${isSelf ? "（我）" : ""}</div>
              <div class="us-sub">${esc(u.contact_phone || "无手机号")} · ${esc(u.contact_email || "")}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="us-role ${esc(u.role)}">${u.role === "admin" ? "管理员" : u.role === "merchant" ? "商家" : "普通用户"}</span>
              ${buttons}
            </div>
          </div>`;
      }).join("");

      usersList.querySelectorAll("[data-role]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const target = list.find((u) => u.id === btn.dataset.role);
          const to = btn.dataset.to;
          if (!confirm(`确定把「${target.nickname || target.contact_phone || target.contact_email}」设为${to === "merchant" ? "商家" : "普通用户"}？`)) return;
          btn.disabled = true;
          try {
            await WujiApi.setUserRole(btn.dataset.role, to);
            showToast("身份已更新");
            await loadUsers();
          } catch (e) {
            showToast(errText(e));
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      showToast("用户查询失败：" + errText(e));
    }
  }

  // ------------------------------------------------------------------
  // 绑定与启动
  // ------------------------------------------------------------------
  function bindEvents() {
    bindTabs();

    $("orderFilter").querySelectorAll(".st-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        orderFilter = chip.dataset.status;
        $("orderFilter").querySelectorAll(".st-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        loadOrders();
      });
    });
    $("refreshOrdersBtn").addEventListener("click", async () => {
      await Promise.all([loadOrders(), loadPool()]);
      showToast("已刷新");
    });

    poolToggleBtn.addEventListener("click", () => {
      const show = poolCodes.classList.toggle("show");
      poolToggleBtn.textContent = show ? "收起可用号码" : "展开可用号码";
    });

    document.querySelectorAll("[data-pfilter]").forEach((chip) => {
      chip.addEventListener("click", () => {
        productFilter = chip.dataset.pfilter;
        document.querySelectorAll("[data-pfilter]").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderProducts();
      });
    });
    $("newProductBtn").addEventListener("click", () => openProductForm(null));
    $("productDrawerCloseBtn").addEventListener("click", () => $("productDrawerOverlay").classList.remove("active"));
    $("productDrawerOverlay").addEventListener("click", (e) => {
      if (e.target === $("productDrawerOverlay")) $("productDrawerOverlay").classList.remove("active");
    });
    $("saveProductBtn").addEventListener("click", saveProduct);
    ["pfName", "pfPriceCooked", "pfPriceRaw", "pfRawDiscount", "pfDesc", "pfTags", "pfSort",
     "pfSpiciness", "pfCondiments", "pfUnitCooked", "pfUnitRaw"].forEach((id) => {
      $(id).addEventListener("input", updatePreview);
    });
    $("pfMode").addEventListener("change", syncModeFields);
    $("pfCategory").addEventListener("change", updatePreview);
    $("pfListingOn").addEventListener("change", updatePreview);
    $("pfSoldOut").addEventListener("change", updatePreview);

    $("userSearchBtn").addEventListener("click", loadUsers);
    $("userSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadUsers(); });

    $("backToMenuBtn").addEventListener("click", () => { location.href = "index.html"; });
    $("logoutBtn").addEventListener("click", async () => {
      await WujiApi.logout();
      location.href = "index.html";
    });

    WujiApi.watchOrders(async () => {
      await Promise.all([loadOrders(), loadPool()]);
    }, { pollMs: (window.WUJI_CONFIG && WUJI_CONFIG.staffPollMs) || 12000 });
  }

  async function init() {
    if (!WujiApi.enabled()) {
      whoText.textContent = "后端未配置，商家端不可用";
      ordersGrid.innerHTML = `<div class="st-empty">站点还没有接入 Supabase 后端，商家端暂时不可用。</div>`;
      return;
    }
    try {
      me = await WujiApi.currentUser();
    } catch (e) {
      me = null;
    }
    if (!me) {
      location.href = "login.html?next=staff.html";
      return;
    }
    if (me.role !== "merchant" && me.role !== "admin") {
      whoText.textContent = `${me.nickname || "未填昵称"} · 普通用户`;
      ordersGrid.innerHTML = `<div class="st-empty">当前账号是普通用户，看不到商家功能。需要商家权限请让管理员在「用户与身份」里设置。</div>`;
      $("panelProducts").style.display = "none";
      $("panelUsers").style.display = "none";
      return;
    }

    whoText.textContent = `${me.nickname || "未填昵称"} · ${me.role === "admin" ? "管理员" : "商家"}`;
    bindEvents();
    await Promise.all([loadOrders(), loadPool(), loadProducts()]);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
