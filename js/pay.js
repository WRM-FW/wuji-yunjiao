/**
 * 吴记云饺 - 扫码支付与订单确认逻辑 (截图分享优化版)
 */

(function () {
  const orderIdText = document.getElementById("orderIdText");
  const orderTimeText = document.getElementById("orderTimeText");
  const heroDiningBadge = document.getElementById("heroDiningBadge");
  const heroTimeVal = document.getElementById("heroTimeVal");
  const receiptItemsTbody = document.getElementById("receiptItemsTbody");
  const receiptQtySummary = document.getElementById("receiptQtySummary");

  const receiptNoteRow = document.getElementById("receiptNoteRow");
  const receiptNoteVal = document.getElementById("receiptNoteVal");

  const amountOriginalTotal = document.getElementById("amountOriginalTotal");
  const discountLineRow = document.getElementById("discountLineRow");
  const amountDiscount = document.getElementById("amountDiscount");
  const amountFinalTotal = document.getElementById("amountFinalTotal");
  const qrAmountSpan = document.getElementById("qrAmountSpan");

  function init() {
    const urlParams = new URLSearchParams(window.location.search);
    let orderId = urlParams.get("orderId");

    if (!orderId) {
      const orders = WujiStore.getOrders();
      if (orders && orders.length > 0) {
        orderId = orders[0].id;
      }
    }

    if (!orderId) {
      alert("未找到有效订单，返回主页");
      window.location.href = "index.html";
      return;
    }

    const order = WujiStore.getOrderById(orderId);
    if (!order) {
      alert("订单不存在");
      window.location.href = "index.html";
      return;
    }

    renderReceipt(order);
  }

  function renderReceipt(order) {
    // 基础单号与时间
    orderIdText.textContent = order.id;
    orderTimeText.textContent = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 核心信息 1: 用餐方式（堂食 vs 自取）
    if (order.diningType === "pickup") {
      heroDiningBadge.textContent = "🛍️ 打包自取";
      heroDiningBadge.className = "hero-dining-badge pickup";
    } else {
      heroDiningBadge.textContent = "🍽️ 堂食就餐";
      heroDiningBadge.className = "hero-dining-badge dine_in";
    }

    // 核心信息 2: 具体出餐时间
    heroTimeVal.textContent = order.pickupTime || "尽快出餐";

    // 核心信息 3 & 4: 商品名称与数量列表（熟食按份 / 生饺按斤，单位一律写清）
    const fmtJin = WujiStore.formatJin;
    let rowsHtml = "";
    order.items.forEach((item) => {
      const unit = item.unit || (item.isRaw ? "斤" : "份");
      const qtyLabel = item.qtyLabel || (item.isRaw ? `${fmtJin(item.quantity)} 斤` : `x${item.quantity}`);
      const priceLabel = item.priceLabel || `￥${Number(item.price).toFixed(1)}/${unit}`;

      rowsHtml += `
        <tr>
          <td>
            <div class="item-name-cell">${item.name}</div>
            <div class="item-spec-text">[${item.specName}]</div>
            ${item.options ? `<div class="item-opts-text">${item.options}</div>` : ""}
          </td>
          <td class="item-qty-cell">
            ${qtyLabel}
          </td>
          <td class="item-price-cell">
            ${priceLabel}
          </td>
          <td class="item-subtotal-cell">
            ￥${item.subtotal.toFixed(2)}
          </td>
        </tr>
      `;
    });
    receiptItemsTbody.innerHTML = rowsHtml;

    // 份数与重量分列合计，方便档口按秤复核
    const portionCount = order.portionCount ?? order.items.filter((i) => !i.isRaw).reduce((s, i) => s + i.quantity, 0);
    const rawWeightJin = order.rawWeightJin ?? order.items.filter((i) => i.isRaw).reduce((s, i) => s + Number(i.quantity), 0);
    const summaryParts = [];
    if (portionCount > 0) summaryParts.push(`熟食现煮 <strong>${portionCount} 份</strong>`);
    if (rawWeightJin > 0) summaryParts.push(`生饺称重 <strong>${fmtJin(rawWeightJin)} 斤</strong>（现场以电子秤复核）`);
    if (summaryParts.length > 0) {
      receiptQtySummary.innerHTML = `合计：${summaryParts.join(" ＋ ")}`;
      receiptQtySummary.style.display = "block";
    } else {
      receiptQtySummary.style.display = "none";
    }

    // 订单备注
    if (order.note && order.note.trim()) {
      receiptNoteRow.style.display = "block";
      receiptNoteVal.textContent = order.note;
    } else {
      receiptNoteRow.style.display = "none";
    }

    // 金额汇总
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

  document.addEventListener("DOMContentLoaded", init);
})();
