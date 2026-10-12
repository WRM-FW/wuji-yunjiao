/**
 * 吴记云饺 - 结算与订单创建逻辑 (无联系人/自选时间/纯文字明细)
 */

(function () {
  let selectedDiningType = "dine_in"; // 默认堂食
  let isCustomTime = false;
  let trustedCalculation = null;

  const backToHomeBtn = document.getElementById("backToHomeBtn");
  const typeDineIn = document.getElementById("typeDineIn");
  const typePickup = document.getElementById("typePickup");

  const timeAsapBtn = document.getElementById("timeAsapBtn");
  const timeCustomBtn = document.getElementById("timeCustomBtn");
  const customTimeInputContainer = document.getElementById("customTimeInputContainer");
  const timePickerInput = document.getElementById("timePickerInput");
  const customTimeTextInput = document.getElementById("customTimeTextInput");

  const orderNoteInput = document.getElementById("orderNoteInput");
  const checkoutItemsList = document.getElementById("checkoutItemsList");
  const itemsSummaryCount = document.getElementById("itemsSummaryCount");
  const feeOriginalTotal = document.getElementById("feeOriginalTotal");
  const feeDiscountAmount = document.getElementById("feeDiscountAmount");
  const discountFeeRow = document.getElementById("discountFeeRow");
  const feeFinalTotal = document.getElementById("feeFinalTotal");
  const bottomFinalPrice = document.getElementById("bottomFinalPrice");
  const submitOrderBtn = document.getElementById("submitOrderBtn");
  const toast = document.getElementById("toast");

  function init() {
    const cart = WujiStore.getCart();
    if (!cart || cart.length === 0) {
      alert("购物车为空，请先挑选餐品");
      window.location.href = "index.html";
      return;
    }

    renderOrderItems(cart);
    bindEvents();
  }

  function renderOrderItems(cart) {
    try {
      trustedCalculation = WujiStore.calculateTrustedOrder(cart);

      itemsSummaryCount.textContent = `共 ${trustedCalculation.itemsCount} 件`;
      feeOriginalTotal.textContent = trustedCalculation.originalTotal.toFixed(2);
      feeFinalTotal.textContent = trustedCalculation.finalTotal.toFixed(2);
      bottomFinalPrice.textContent = trustedCalculation.finalTotal.toFixed(2);

      if (trustedCalculation.discountAmount > 0) {
        discountFeeRow.style.display = "flex";
        feeDiscountAmount.textContent = trustedCalculation.discountAmount.toFixed(2);
      } else {
        discountFeeRow.style.display = "none";
      }

      let html = "";
      trustedCalculation.verifiedItems.forEach((item) => {
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-light);">
            <div style="flex: 1; min-width: 0; padding-right: 8px;">
              <div style="font-size: 14px; font-weight: 700; color: var(--text-main);">${item.name}</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">
                <span style="color: var(--primary); font-weight: 600;">[${item.specName}]</span>
                ${item.options ? ` · ${item.options}` : ""}
              </div>
            </div>
            <div style="font-size: 13px; color: var(--text-muted); padding: 0 8px; font-weight: 600;">
              x${item.quantity}
            </div>
            <div style="font-size: 14px; font-weight: 800; color: var(--text-main); text-align: right; min-width: 55px;">
              ￥${item.subtotal.toFixed(2)}
            </div>
          </div>
        `;
      });

      checkoutItemsList.innerHTML = html;
    } catch (e) {
      alert("订单核算异常：" + e.message);
      window.location.href = "index.html";
    }
  }

  function getFinalPickupTime() {
    if (!isCustomTime) {
      return "尽快出餐 (约10-15分钟)";
    }
    const customText = customTimeTextInput.value.trim();
    if (customText) {
      return customText;
    }
    const pickerTime = timePickerInput.value.trim();
    if (pickerTime) {
      return `${pickerTime} 出餐`;
    }
    return "尽快出餐";
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
  }

  function bindEvents() {
    backToHomeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    // 用餐方式切换（堂食 vs 自取）
    typeDineIn.addEventListener("click", () => {
      selectedDiningType = "dine_in";
      typeDineIn.classList.add("active");
      typePickup.classList.remove("active");
    });

    typePickup.addEventListener("click", () => {
      selectedDiningType = "pickup";
      typePickup.classList.add("active");
      typeDineIn.classList.remove("active");
    });

    // 出餐时间模式切换
    timeAsapBtn.addEventListener("click", () => {
      isCustomTime = false;
      timeAsapBtn.classList.add("active");
      timeCustomBtn.classList.remove("active");
      customTimeInputContainer.style.display = "none";
    });

    timeCustomBtn.addEventListener("click", () => {
      isCustomTime = true;
      timeCustomBtn.classList.add("active");
      timeAsapBtn.classList.remove("active");
      customTimeInputContainer.style.display = "block";
    });

    // 快捷时间标签
    document.querySelectorAll(".time-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const t = chip.dataset.time;
        timePickerInput.value = t;
        customTimeTextInput.value = `${t} 出餐`;
      });
    });

    // 备注快捷标签
    document.querySelectorAll(".note-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const text = chip.dataset.note;
        if (orderNoteInput.value) {
          orderNoteInput.value += `，${text}`;
        } else {
          orderNoteInput.value = text;
        }
      });
    });

    // 提交订单（无需联系人信息，直接进入扫码支付）
    submitOrderBtn.addEventListener("click", () => {
      const pickupTime = getFinalPickupTime();
      const note = orderNoteInput.value.trim();
      const cart = WujiStore.getCart();

      if (!cart || cart.length === 0) {
        showToast("购物车为空");
        return;
      }

      try {
        submitOrderBtn.disabled = true;
        submitOrderBtn.textContent = "正在提交订单...";

        const order = WujiStore.createOrder({
          diningType: selectedDiningType,
          pickupTime,
          note,
          cartItems: cart
        });

        // 提交成功，直接跳转扫码支付与订单确认页
        window.location.href = `pay.html?orderId=${encodeURIComponent(order.id)}`;
      } catch (err) {
        alert("提交订单失败：" + err.message);
        submitOrderBtn.disabled = false;
        submitOrderBtn.textContent = "提交订单，前往扫码支付";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
