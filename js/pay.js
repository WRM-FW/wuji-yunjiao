/**
 * 吴记云饺 - 扫码支付与订单确认页
 *
 * 两种数据来源：
 *   1) 接入后端：按 orderId 从数据库读订单（RLS 保证只能读到自己的单），
 *      并用 Realtime + 轮询兜底，商家分配取餐码后本页会自动出现取餐码。
 *   2) 纯前端回退：读浏览器本地存的订单快照，行为与 v2.0.0 一致。
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const orderIdText = $("orderIdText");
  const orderTimeText = $("orderTimeText");
  const heroDiningBadge = $("heroDiningBadge");
  const heroTimeVal = $("heroTimeVal");
  const receiptItemsTbody = $("receiptItemsTbody");
  const receiptQtySummary = $("receiptQtySummary");
  const receiptNoteRow = $("receiptNoteRow");
  const receiptNoteVal = $("receiptNoteVal");
  const amountOriginalTotal = $("amountOriginalTotal");
  const discountLineRow = $("discountLineRow");
  const amountDiscount = $("amountDiscount");
  const amountFinalTotal = $("amountFinalTotal");
  const qrAmountSpan = $("qrAmountSpan");
  const pickupCodeBanner = $("pickupCodeBanner");
  const pickupCodeLabel = $("pickupCodeLabel");
  const pickupCodeValue = $("pickupCodeValue");
  const pickupCodeHint = $("pickupCodeHint");

  const backendOn = () => Boolean(window.WujiApi && WujiApi.enabled());
  const fmtJin = () => WujiStore.formatJin;

  let orderId = null;
  let stopWatch = null;
  let lastRendered = "";

  // ------------------------------------------------------------------
  // 服务端行 / 本地对象 → 统一渲染模型
  // ------------------------------------------------------------------
  function normalizeOrder(o) {
    const items = (o.items || []).map((i) => {
      const isRaw = i.is_raw ?? i.isRaw ?? false;
      const unit = i.unit || (isRaw ? "斤" : "份");
      const quantity = Number(i.quantity);
      const price = Number(i.unit_price ?? i.price);
      return {
        name: i.name,
        specName: i.spec_name ?? i.specName ?? "",
        options: i.options || "",
        unit,
        isRaw,
        quantity,
        price,
        subtotal: Number(i.subtotal),
        qtyLabel: isRaw ? `${fmtJin()(quantity)} 斤` : `x${quantity}`,
        priceLabel: `￥${price.toFixed(1)}/${unit}`
      };
    });

    return {
      id: o.id,
      code: o.code || "",
      status: o.status || "pending",
      diningType: o.dining_type ?? o.diningType ?? "dine_in",
      pickupTime: o.pickup_time ?? o.pickupTime ?? "尽快出餐",
      note: o.note || "",
      createdAt: o.created_at ?? o.createdAt,
      updatedAt: o.updated_at ?? o.updatedAt ?? "",
      items,
      portionCount: Number(o.portion_count ?? o.portionCount ?? items.filter((i) => !i.isRaw).reduce((s, i) => s + i.quantity, 0)),
      rawWeightJin: Number(o.raw_weight_jin ?? o.rawWeightJin ?? items.filter((i) => i.isRaw).reduce((s, i) => s + i.quantity, 0)),
      originalTotal: Number(o.original_total ?? o.originalTotal ?? 0),
      discountAmount: Number(o.discount_amount ?? o.discountAmount ?? 0),
      finalTotal: Number(o.final_total ?? o.finalTotal ?? 0)
    };
  }

  async function loadOrder() {
    if (backendOn()) {
      const row = await WujiApi.orderDetail(orderId);
      return row ? normalizeOrder(row) : null;
    }
    const local = WujiStore.getOrderById(orderId);
    return local ? normalizeOrder(local) : null;
  }

  async function render() {
    let order = null;
    try {
      order = await loadOrder();
    } catch (e) {
      console.error(e);
      return;
    }
    if (!order) {
      heroTimeVal.textContent = "订单不存在或无权查看";
      return;
    }

    // 内容没变就不重绘，避免 Realtime 抖动打断用户长按保存二维码
    const stamp = JSON.stringify([order.status, order.code, order.finalTotal, order.updated_at]);
    if (stamp === lastRendered) return;
    lastRendered = stamp;

    orderIdText.textContent = order.id;
    orderTimeText.textContent = order.createdAt
      ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "";

    if (order.diningType === "pickup") {
      heroDiningBadge.textContent = "🛍️ 打包自取";
      heroDiningBadge.className = "hero-dining-badge pickup";
    } else {
      heroDiningBadge.textContent = "🍽️ 堂食就餐";
      heroDiningBadge.className = "hero-dining-badge dine_in";
    }
    heroTimeVal.textContent = order.pickupTime || "尽快出餐";

    renderPickupCode(order);
    renderItems(order);

    if (order.note && order.note.trim()) {
      receiptNoteRow.style.display = "block";
      receiptNoteVal.textContent = order.note;
    } else {
      receiptNoteRow.style.display = "none";
    }

    amountOriginalTotal.textContent = order.originalTotal.toFixed(2);
    amountFinalTotal.textContent = order.finalTotal.toFixed(2);
    qrAmountSpan.textContent = order.finalTotal.toFixed(2);

    if (order.discountAmount > 0) {
      discountLineRow.style.display = "flex";
      amountDiscount.textContent = order.discountAmount.toFixed(2);
    } else {
      discountLineRow.style.display = "none";
    }
  }

  function renderPickupCode(order) {
    if (!pickupCodeBanner) return;
    pickupCodeBanner.style.display = "flex";
    pickupCodeBanner.dataset.state = order.status;

    if (order.status === "cancelled") {
      pickupCodeLabel.textContent = "订单状态";
      pickupCodeValue.textContent = "已取消";
      pickupCodeHint.textContent = "如需退款请进订餐群联系档口";
      return;
    }
    if (order.status === "completed") {
      pickupCodeLabel.textContent = "取餐码（已完成）";
      pickupCodeValue.textContent = order.code || "--";
      pickupCodeHint.textContent = "本单已取餐，号码已回到号池";
      return;
    }
    if (order.code) {
      pickupCodeLabel.textContent = "你的取餐码";
      pickupCodeValue.textContent = order.code;
      pickupCodeHint.textContent = "出餐后凭取餐码 + 含时间的付款截图取餐";
      return;
    }
    pickupCodeLabel.textContent = "取餐码";
    pickupCodeValue.textContent = "等待分配";
    pickupCodeHint.textContent = backendOn()
      ? "商家接单后会分配取餐码，本页会自动更新"
      : "本地订单无取餐码，请截图发订餐群";
  }

  function renderItems(order) {
    let rowsHtml = "";
    order.items.forEach((item) => {
      rowsHtml += `
        <tr>
          <td>
            <div class="item-name-cell">${item.name}</div>
            <div class="item-spec-text">[${item.specName}]</div>
            ${item.options ? `<div class="item-opts-text">${item.options}</div>` : ""}
          </td>
          <td class="item-qty-cell">${item.qtyLabel}</td>
          <td class="item-price-cell">${item.priceLabel}</td>
          <td class="item-subtotal-cell">￥${item.subtotal.toFixed(2)}</td>
        </tr>
      `;
    });
    receiptItemsTbody.innerHTML = rowsHtml;

    const parts = [];
    if (order.portionCount > 0) parts.push(`熟食现煮 <strong>${order.portionCount} 份</strong>`);
    if (order.rawWeightJin > 0) parts.push(`生饺称重 <strong>${fmtJin()(order.rawWeightJin)} 斤</strong>（现场以电子秤复核）`);
    if (parts.length > 0) {
      receiptQtySummary.innerHTML = `合计：${parts.join(" ＋ ")}`;
      receiptQtySummary.style.display = "block";
    } else {
      receiptQtySummary.style.display = "none";
    }
  }

  async function init() {
    const params = new URLSearchParams(location.search);
    orderId = params.get("orderId");

    if (!orderId) {
      if (backendOn()) {
        location.href = "my-orders.html";
        return;
      }
      const orders = WujiStore.getOrders();
      orderId = orders && orders.length ? orders[0].id : null;
    }

    if (!orderId) {
      alert("未找到有效订单，返回主页");
      window.location.href = "index.html";
      return;
    }

    await render();

    if (backendOn()) {
      stopWatch = WujiApi.watchOrders(render, {
        pollMs: (window.WUJI_CONFIG && WUJI_CONFIG.clientPollMs) || 20000
      });
    }
  }

  window.addEventListener("pagehide", () => { if (stopWatch) stopWatch(); });
  document.addEventListener("DOMContentLoaded", init);
})();
