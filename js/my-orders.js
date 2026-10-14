/**
 * 吴记云饺 - 我的订单
 * 只能看到自己的订单（服务端 RLS + my_orders 函数保证），未分配取餐码的可取消。
 */

(function () {
  const orderList = document.getElementById("orderList");
  const statusFilter = document.getElementById("statusFilter");
  const refreshBtn = document.getElementById("refreshBtn");
  const backBtn = document.getElementById("backBtn");
  const cancelModalOverlay = document.getElementById("cancelModalOverlay");
  const cancelModalCloseBtn = document.getElementById("cancelModalCloseBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const toast = document.getElementById("toast");

  const backendOn = () => Boolean(window.WujiApi && WujiApi.enabled());
  const fmtJin = () => WujiStore.formatJin;

  const STATUS_TEXT = {
    pending: "待分配取餐码",
    assigned: "待取餐",
    completed: "已取餐",
    cancelled: "已取消"
  };

  let orders = [];
  let filter = "all";
  let pendingCancelId = null;
  let stopWatch = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function money(v) { return Number(v || 0).toFixed(2); }

  function timeText(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function load() {
    if (!backendOn()) {
      orders = (WujiStore.getOrders() || []).map((o) => ({
        id: o.id, code: "", status: "completed",
        dining_type: o.diningType, pickup_time: o.pickupTime, note: o.note,
        created_at: o.createdAt, final_total: o.finalTotal,
        portion_count: o.portionCount ?? 0, raw_weight_jin: o.rawWeightJin ?? 0,
        items: (o.items || []).map((i) => ({
          name: i.name, spec_name: i.specName, options: i.options,
          unit: i.unit, unit_price: i.price, quantity: i.quantity, subtotal: i.subtotal, is_raw: i.isRaw
        }))
      }));
      render();
      return;
    }
    try {
      orders = await WujiApi.myOrders(50);
      render();
    } catch (e) {
      console.error(e);
      showToast("订单加载失败，请稍后重试");
    }
  }

  function render() {
    const list = filter === "all" ? orders : orders.filter((o) => o.status === filter);

    if (list.length === 0) {
      orderList.innerHTML = `
        <div class="mo-empty">
          <div style="font-size: 34px; margin-bottom: 8px;">📋</div>
          ${backendOn() ? "还没有符合条件的订单" : "本地还没有历史订单"}
        </div>`;
      return;
    }

    orderList.innerHTML = list.map((o) => {
      const items = (o.items || []).map((i) => {
        const qty = Number(i.quantity);
        const qtyText = i.is_raw ? `${fmtJin()(qty)} 斤` : `x${qty}`;
        return `
          <div class="mo-item">
            <div class="mo-item-name">
              ${i.name}
              <div class="mo-item-spec">${i.spec_name || ""}${i.options ? " · " + i.options : ""}</div>
            </div>
            <div class="mo-item-qty">${qtyText}</div>
          </div>`;
      }).join("");

      const codeRow = o.code
        ? `<div class="mo-code-row">
             <span class="mo-code-label">取餐码</span>
             <span class="mo-code-value">${o.code}</span>
           </div>`
        : `<div class="mo-code-row empty">
             <span class="mo-code-label">取餐码</span>
             <span class="mo-code-value wait">${o.status === "pending" ? "等待商家分配" : "未分配"}</span>
           </div>`;

      const canCancel = backendOn() && o.status === "pending";
      const actions = [
        `<a class="mo-btn" href="pay.html?orderId=${encodeURIComponent(o.id)}" style="text-decoration:none;">凭证与付款码</a>`,
        canCancel ? `<button class="mo-btn danger" data-cancel="${o.id}">取消订单</button>` : ""
      ].join("");

      return `
        <article class="mo-card">
          <div class="mo-card-head">
            <div class="mo-order-id">${o.id}</div>
            <span class="mo-status ${o.status}">${STATUS_TEXT[o.status] || o.status}</span>
          </div>
          ${codeRow}
          <div class="mo-items">${items}</div>
          <div class="mo-meta">
            <span>${o.dining_type === "pickup" ? "🛍️ 打包自取" : "🍽️ 堂食就餐"}</span>
            <span>⏰ ${o.pickup_time || "尽快出餐"}</span>
            <span>🕒 ${timeText(o.created_at)}</span>
            ${o.note ? `<span>📝 ${o.note}</span>` : ""}
          </div>
          <div class="mo-foot">
            <div class="mo-total">￥${money(o.final_total)}</div>
            <div class="mo-actions">${actions}</div>
          </div>
        </article>`;
    }).join("");

    orderList.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => askCancel(btn.dataset.cancel));
    });
  }

  function askCancel(id) {
    pendingCancelId = id;
    cancelModalOverlay.classList.add("active");
  }

  async function doCancel() {
    if (!pendingCancelId) return;
    confirmCancelBtn.disabled = true;
    confirmCancelBtn.textContent = "正在取消...";
    try {
      await WujiApi.cancelOrder(pendingCancelId);
      cancelModalOverlay.classList.remove("active");
      showToast("订单已取消，请进订餐群联系档口办理退款");
      await load();
    } catch (e) {
      showToast(e?.message || "取消失败，请重试");
    } finally {
      confirmCancelBtn.disabled = false;
      confirmCancelBtn.textContent = "确认取消订单";
      pendingCancelId = null;
    }
  }

  async function init() {
    if (backendOn()) {
      const session = await WujiApi.session().catch(() => null);
      if (!session) {
        location.href = "login.html?next=my-orders.html";
        return;
      }
      stopWatch = WujiApi.watchOrders(load, { pollMs: (window.WUJI_CONFIG && WUJI_CONFIG.clientPollMs) || 20000 });
    }

    load();

    statusFilter.querySelectorAll(".mo-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.status;
        statusFilter.querySelectorAll(".mo-filter").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render();
      });
    });

    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      await load();
      refreshBtn.disabled = false;
      showToast("已刷新");
    });

    backBtn.addEventListener("click", () => { location.href = "index.html"; });
    cancelModalCloseBtn.addEventListener("click", () => {
      cancelModalOverlay.classList.remove("active");
      pendingCancelId = null;
    });
    cancelModalOverlay.addEventListener("click", (e) => {
      if (e.target === cancelModalOverlay) cancelModalOverlay.classList.remove("active");
    });
    confirmCancelBtn.addEventListener("click", doCancel);
  }

  window.addEventListener("pagehide", () => { if (stopWatch) stopWatch(); });
  document.addEventListener("DOMContentLoaded", init);
})();
