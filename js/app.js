/**
 * 吴记云饺 - 顾客移动端主应用逻辑
 * 纯文字商品列表 + 分类独立滚动 + 熟食按份 / 生饺按斤两套选购与计价
 */

(function () {
  let currentModalProduct = null;
  let currentModalIsRaw = false;
  let currentModalOptions = {
    spiciness: "",
    condiment: ""
  };
  let currentModalQty = 1; // 熟食 = 份数(整数)，生饺 = 斤数(0.1 精度)

  const categorySidebar = document.getElementById("categorySidebar");
  const productContentWrap = document.getElementById("productContentWrap");
  const cartIconBtn = document.getElementById("cartIconBtn");
  const cartBadge = document.getElementById("cartBadge");
  const cartTotalPrice = document.getElementById("cartTotalPrice");
  const cartDiscountTip = document.getElementById("cartDiscountTip");
  const cartWeightTip = document.getElementById("cartWeightTip");
  const goToCheckoutBtn = document.getElementById("goToCheckoutBtn");

  const specModalOverlay = document.getElementById("specModalOverlay");
  const specModalCloseBtn = document.getElementById("specModalCloseBtn");
  const specModalTitle = document.getElementById("specModalTitle");
  const specModalBody = document.getElementById("specModalBody");
  const specSubtotalPrice = document.getElementById("specSubtotalPrice");
  const specConfirmAddBtn = document.getElementById("specConfirmAddBtn");

  const cartDrawerOverlay = document.getElementById("cartDrawerOverlay");
  const cartDrawerBody = document.getElementById("cartDrawerBody");
  const cartItemsCountLabel = document.getElementById("cartItemsCountLabel");
  const cartDrawerTotalPrice = document.getElementById("cartDrawerTotalPrice");
  const clearCartBtn = document.getElementById("clearCartBtn");
  const cartDrawerCheckoutBtn = document.getElementById("cartDrawerCheckoutBtn");

  const wechatFloatBtn = document.getElementById("wechatFloatBtn");
  const wechatModalOverlay = document.getElementById("wechatModalOverlay");
  const wechatModalCloseBtn = document.getElementById("wechatModalCloseBtn");
  const viewMenuImageBtn = document.getElementById("viewMenuImageBtn");
  const menuModalOverlay = document.getElementById("menuModalOverlay");
  const menuModalCloseBtn = document.getElementById("menuModalCloseBtn");
  const toast = document.getElementById("toast");

  let activeCategoryId = "all";

  const RAW_CFG = WujiStore.RAW_CONFIG;
  const fmtJin = WujiStore.formatJin;

  function init() {
    renderCategories();
    renderProducts("all");
    updateCartDisplay();

    WujiStore.subscribe((event) => {
      if (event.type === "CART_UPDATED") {
        updateCartDisplay();
      }
    });

    bindEvents();
  }

  // 渲染分类导航（福袋馄炖位于生饺称斤上方）
  function renderCategories() {
    categorySidebar.innerHTML = "";
    INITIAL_CATEGORIES.forEach((cat) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `category-tab ${cat.id === activeCategoryId ? "active" : ""}`;
      tab.dataset.id = cat.id;
      tab.innerHTML = `
        <span class="tab-icon">${cat.icon}</span>
        <span>${cat.name}</span>
      `;
      tab.addEventListener("click", () => {
        if (activeCategoryId === cat.id) {
          productContentWrap.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        activeCategoryId = cat.id;
        categorySidebar.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderProducts(cat.id);
        productContentWrap.scrollTop = 0;
      });
      categorySidebar.appendChild(tab);
    });
  }

  // 纯文字方式渲染商品列表（手机单列 / 平板双列由 CSS 断点决定）
  function renderProducts(categoryId) {
    const allProducts = WujiStore.getProducts();
    let filtered = allProducts;

    if (categoryId === "jiaozi_cooked") {
      filtered = allProducts.filter((p) => p.category === "jiaozi_cooked");
    } else if (categoryId === "wonton") {
      filtered = allProducts.filter((p) => p.category === "wonton");
    } else if (categoryId === "jiaozi_raw") {
      filtered = allProducts.filter((p) => p.supportRaw);
    }

    productContentWrap.innerHTML = "";

    if (filtered.length === 0) {
      productContentWrap.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🥟</div>
          <div>暂无该分类商品</div>
        </div>
      `;
      return;
    }

    const isRawCategory = categoryId === "jiaozi_raw";
    const catObj = INITIAL_CATEGORIES.find((c) => c.id === categoryId);
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "category-section-title";
    sectionTitle.innerHTML = `
      <span>${catObj ? catObj.name : "商品列表"} (${filtered.length}款)</span>
      <span class="category-section-desc">${
        isRawCategory ? `按斤计价 · 每斤立减￥${RAW_CFG.discountPerJin}` : "纯手工现包 · 免打包费"
      }</span>
    `;
    productContentWrap.appendChild(sectionTitle);

    const grid = document.createElement("div");
    grid.className = "product-grid";
    productContentWrap.appendChild(grid);

    filtered.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-text-card";

      const displayPrice = isRawCategory ? product.priceRaw : product.priceCooked;
      const displayUnit = isRawCategory ? (product.unitRaw || "斤") : (product.unitCooked || "份");
      const discountTag = product.supportRaw
        ? `<span class="price-discount-tag">生饺立减￥${RAW_CFG.discountPerJin}/斤</span>`
        : "";

      const tagHtml = (product.tags || [])
        .map((t) => `<span class="tag-pill ${t.includes("招牌") ? "red" : "gold"}">${t}</span>`)
        .join("");

      const isSoldOut = product.status === "sold_out";
      const icon = product.category === "wonton" ? "🥣" : "🥟";
      // 按斤分类下按钮写「选重量」，避免顾客以为是一份
      const btnLabel = isSoldOut
        ? ""
        : isRawCategory
          ? "选重量"
          : product.supportRaw
            ? "选规格"
            : "选口味";

      card.innerHTML = `
        <div class="product-title-row">
          <span class="dish-icon-badge">${icon}</span>
          <span class="product-text-name">${product.name}</span>
        </div>

        <div class="product-text-desc">${product.desc || ""}</div>

        <div class="product-text-tags">
          ${tagHtml}
          ${discountTag}
        </div>

        <div class="product-action-bar">
          <div class="price-box">
            <span class="price-currency">￥</span>
            <span class="price-amount">${displayPrice.toFixed(1)}</span>
            <span class="price-unit">/${displayUnit}</span>
          </div>
          <div class="btn-wrap">
            ${
              isSoldOut
                ? `<span class="sold-out-badge">今日售罄</span>`
                : `<button type="button" class="spec-btn" data-id="${product.id}">${btnLabel}</button>`
            }
          </div>
        </div>
      `;

      const btn = card.querySelector(".spec-btn");
      if (btn) {
        btn.addEventListener("click", () => {
          openSpecModal(product, isRawCategory);
        });
      }

      grid.appendChild(card);
    });
  }

  // 打开规格弹窗（熟食按份 / 生饺按斤）
  function openSpecModal(product, preferRaw = false) {
    currentModalProduct = product;
    currentModalIsRaw = preferRaw && product.supportRaw;
    currentModalQty = currentModalIsRaw ? defaultWeight() : 1;
    currentModalOptions = {
      spiciness: product.options?.spiciness ? product.options.spiciness[0] : "",
      condiment: product.options?.condiments ? product.options.condiments[0] : ""
    };

    specModalTitle.textContent = currentModalIsRaw
      ? `${product.name} - 选择重量`
      : `${product.name} - 规格定制`;
    renderSpecModalContent();
    updateSpecSubtotal();

    specModalOverlay.classList.add("active");
  }

  function defaultWeight() {
    // 默认 1 斤，若最低起售量更高则用最低值
    return WujiStore.normalizeWeight(Math.max(1, RAW_CFG.minJin));
  }

  function activeUnitPrice() {
    const p = currentModalProduct;
    return WujiStore.round2(currentModalIsRaw ? p.priceRaw : p.priceCooked);
  }

  function activeUnit() {
    const p = currentModalProduct;
    return currentModalIsRaw ? (p.unitRaw || RAW_CFG.unit) : (p.unitCooked || "份");
  }

  function renderSpecModalContent() {
    const p = currentModalProduct;
    if (!p) return;

    let html = `
      <div class="spec-header-text-block">
        <div class="spec-text-title">${p.name}</div>
        <div class="spec-text-desc">${p.desc || ""}</div>
        <div class="spec-text-price-line">
          ￥<span id="specActivePrice">${activeUnitPrice().toFixed(1)}</span>
          <span class="unit">/${activeUnit()}</span>
          ${
            currentModalIsRaw
              ? `<span class="price-discount-tag" style="margin-left: 8px;">生饺每斤立减￥${RAW_CFG.discountPerJin}</span>`
              : ""
          }
        </div>
      </div>
    `;

    // 1. 食用形态选择（熟食按份 vs 生饺按斤）
    if (p.supportRaw) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">
            <span>食用方式</span>
            <span style="color: var(--accent-gold); font-size: 11px;">生饺每斤优惠￥${RAW_CFG.discountPerJin}</span>
          </div>
          <div class="spec-pills-row" id="formPillsRow">
            <div class="spec-pill-option ${!currentModalIsRaw ? "active" : ""}" data-type="cooked">
              熟食现煮 <span class="sub-badge">按份</span>
            </div>
            <div class="spec-pill-option ${currentModalIsRaw ? "active" : ""}" data-type="raw">
              生饺带走 <span class="sub-badge">按斤</span>
            </div>
          </div>
        </div>
      `;
    }

    // 2. 数量/重量紧随食用方式：这是决定金额的关键项，不能被配料选项挤到折叠线以下
    html += currentModalIsRaw ? renderWeightGroupHtml() : renderPortionGroupHtml();

    // 3. 辣度选项
    if (p.options?.spiciness?.length) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">${currentModalIsRaw ? "蘸料与口味偏好" : "辣度偏好"}</div>
          <div class="spec-pills-row" id="spicinessPillsRow">
            ${p.options.spiciness
              .map(
                (opt) =>
                  `<div class="spec-pill-option ${currentModalOptions.spiciness === opt ? "active" : ""}" data-opt="${opt}">${opt}</div>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // 4. 葱花香菜配料（生饺带走时提示为随附配料）
    if (p.options?.condiments?.length) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">${currentModalIsRaw ? "随附配料（生饺自带）" : "配料细节"}</div>
          <div class="spec-pills-row" id="condimentPillsRow">
            ${p.options.condiments
              .map(
                (opt) =>
                  `<div class="spec-pill-option ${currentModalOptions.condiment === opt ? "active" : ""}" data-opt="${opt}">${opt}</div>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    specModalBody.innerHTML = html;
    bindSpecModalInnerEvents();
    ensureWeightVisible();
  }

  // 矮屏（如 844x390 横屏手机）抽屉里放不下全部内容：
  // 打开时把重量输入框滚进可视区，而不是让顾客自己往下找
  function ensureWeightVisible() {
    const input = document.getElementById("weightInput");
    if (!input) return;
    const bb = specModalBody.getBoundingClientRect();
    const ib = input.getBoundingClientRect();
    if (ib.bottom > bb.bottom - 8) {
      specModalBody.scrollTop += ib.bottom - bb.bottom + 16;
    }
  }

  function renderPortionGroupHtml() {
    return `
      <div class="spec-group spec-group-qty">
        <div class="spec-group-title" style="margin-bottom: 0;">
          选购数量 <span class="unit-tag">按份计（1 份 = ￥${activeUnitPrice().toFixed(1)}）</span>
        </div>
        <div class="quantity-stepper">
          <button type="button" class="stepper-btn" id="modalMinusQtyBtn" aria-label="减少一份">-</button>
          <span class="stepper-num" id="modalQtyDisplay">${currentModalQty} 份</span>
          <button type="button" class="stepper-btn" id="modalPlusQtyBtn" aria-label="增加一份">+</button>
        </div>
      </div>
    `;
  }

  function renderWeightGroupHtml() {
    const quick = RAW_CFG.quickJin
      .map(
        (j) =>
          `<button type="button" class="weight-chip ${Number(currentModalQty) === Number(j) ? "active" : ""}" data-jin="${j}">${fmtJin(j)} 斤</button>`
      )
      .join("");

    return `
      <div class="spec-group spec-group-weight">
        <div class="spec-group-title">
          <span>选购重量 <span class="unit-tag">按斤计价（1 斤 = ￥${activeUnitPrice().toFixed(1)}）</span></span>
          <span style="color: var(--accent-gold); font-size: 11px;">已含每斤立减￥${RAW_CFG.discountPerJin}</span>
        </div>
        <div class="weight-field">
          <div class="weight-stepper">
            <button type="button" class="stepper-btn" id="weightMinusBtn" aria-label="减少 0.1 斤">-</button>
          </div>
          <div class="weight-input-wrap">
            <input type="number" id="weightInput" class="weight-input" inputmode="decimal"
                   step="${RAW_CFG.stepJin}" min="${RAW_CFG.minJin}" max="${RAW_CFG.maxJin}"
                   value="${fmtJin(currentModalQty)}" aria-label="生饺重量，单位斤" />
            <span class="weight-suffix">斤</span>
          </div>
          <div class="weight-stepper">
            <button type="button" class="stepper-btn" id="weightPlusBtn" aria-label="增加 0.1 斤">+</button>
          </div>
        </div>
        <div class="weight-chip-row" id="weightQuickRow">${quick}</div>
        <div class="weight-hint">${RAW_CFG.note}；可选范围 ${fmtJin(RAW_CFG.minJin)} ~ ${fmtJin(RAW_CFG.maxJin)} 斤。</div>
        <div class="weight-formula" id="weightFormula"></div>
      </div>
    `;
  }

  function bindSpecModalInnerEvents() {
    specModalBody.querySelectorAll("#formPillsRow .spec-pill-option").forEach((pill) => {
      pill.addEventListener("click", () => {
        const nextRaw = pill.dataset.type === "raw";
        if (nextRaw === currentModalIsRaw) return;
        currentModalIsRaw = nextRaw;
        // 切换形态时数量语义不同，重置为各自起点
        currentModalQty = nextRaw ? defaultWeight() : 1;
        renderSpecModalContent();
        updateSpecSubtotal();
      });
    });

    specModalBody.querySelectorAll("#spicinessPillsRow .spec-pill-option").forEach((pill) => {
      pill.addEventListener("click", () => {
        currentModalOptions.spiciness = pill.dataset.opt;
        specModalBody.querySelectorAll("#spicinessPillsRow .spec-pill-option").forEach((x) => x.classList.remove("active"));
        pill.classList.add("active");
      });
    });

    specModalBody.querySelectorAll("#condimentPillsRow .spec-pill-option").forEach((pill) => {
      pill.addEventListener("click", () => {
        currentModalOptions.condiment = pill.dataset.opt;
        specModalBody.querySelectorAll("#condimentPillsRow .spec-pill-option").forEach((x) => x.classList.remove("active"));
        pill.classList.add("active");
      });
    });

    if (currentModalIsRaw) {
      bindWeightEvents();
    } else {
      const minusBtn = document.getElementById("modalMinusQtyBtn");
      const plusBtn = document.getElementById("modalPlusQtyBtn");
      minusBtn?.addEventListener("click", () => changePortions(-1));
      plusBtn?.addEventListener("click", () => changePortions(1));
    }
  }

  function changePortions(delta) {
    currentModalQty = WujiStore.normalizePortions(currentModalQty + delta);
    const disp = document.getElementById("modalQtyDisplay");
    if (disp) disp.textContent = `${currentModalQty} 份`;
    updateSpecSubtotal();
  }

  function bindWeightEvents() {
    const input = document.getElementById("weightInput");
    const minus = document.getElementById("weightMinusBtn");
    const plus = document.getElementById("weightPlusBtn");

    const commit = (value) => {
      currentModalQty = WujiStore.normalizeWeight(value);
      if (input) input.value = fmtJin(currentModalQty);
      syncWeightChips();
      updateSpecSubtotal();
    };

    input?.addEventListener("input", () => {
      // 输入过程中只做预览计算，越界值在 blur/change 时归位
      const v = parseFloat(input.value);
      if (isFinite(v) && v >= RAW_CFG.minJin && v <= RAW_CFG.maxJin) {
        currentModalQty = WujiStore.normalizeWeight(v);
        syncWeightChips();
        updateSpecSubtotal();
      }
    });
    input?.addEventListener("blur", () => commit(input.value));
    input?.addEventListener("change", () => commit(input.value));

    minus?.addEventListener("click", () => commit(Number(currentModalQty) - RAW_CFG.stepJin));
    plus?.addEventListener("click", () => commit(Number(currentModalQty) + RAW_CFG.stepJin));

    specModalBody.querySelectorAll("#weightQuickRow .weight-chip").forEach((chip) => {
      chip.addEventListener("click", () => commit(parseFloat(chip.dataset.jin)));
    });
  }

  function syncWeightChips() {
    specModalBody.querySelectorAll("#weightQuickRow .weight-chip").forEach((chip) => {
      chip.classList.toggle("active", WujiStore.round2(parseFloat(chip.dataset.jin)) === WujiStore.round2(currentModalQty));
    });
  }

  function updateSpecSubtotal() {
    if (!currentModalProduct) return;
    const unitPrice = activeUnitPrice();
    const subtotal = WujiStore.round2(unitPrice * currentModalQty);
    specSubtotalPrice.textContent = subtotal.toFixed(2);

    const formula = document.getElementById("weightFormula");
    if (formula && currentModalIsRaw) {
      formula.innerHTML = `￥${unitPrice.toFixed(1)}/斤 × ${fmtJin(currentModalQty)} 斤 = <strong>￥${subtotal.toFixed(2)}</strong>`;
    }
  }

  function updateCartDisplay() {
    const cart = WujiStore.getCart();
    if (!cart || cart.length === 0) {
      cartBadge.style.display = "none";
      cartTotalPrice.textContent = "0.00";
      cartDiscountTip.style.display = "none";
      if (cartWeightTip) cartWeightTip.style.display = "none";
      goToCheckoutBtn.disabled = true;
      renderCartDrawerItems([], null);
      return;
    }

    try {
      const calculation = WujiStore.calculateTrustedOrder(cart);
      cartBadge.style.display = "flex";
      cartBadge.textContent = calculation.itemsCount;
      cartTotalPrice.textContent = calculation.finalTotal.toFixed(2);

      if (calculation.discountAmount > 0) {
        cartDiscountTip.style.display = "block";
        cartDiscountTip.textContent = `已省 ￥${calculation.discountAmount.toFixed(2)}（生饺立减）`;
      } else {
        cartDiscountTip.style.display = "none";
      }

      if (cartWeightTip) {
        if (calculation.rawWeightJin > 0) {
          cartWeightTip.style.display = "block";
          const portionText = calculation.portionCount > 0 ? `熟食 ${calculation.portionCount} 份 · ` : "";
          cartWeightTip.textContent = `${portionText}生饺共 ${fmtJin(calculation.rawWeightJin)} 斤`;
        } else {
          cartWeightTip.style.display = "none";
        }
      }

      goToCheckoutBtn.disabled = false;
      renderCartDrawerItems(calculation.verifiedItems, calculation);
    } catch (e) {
      console.error("Cart calculation error", e);
      cartBadge.style.display = "none";
      goToCheckoutBtn.disabled = true;
      renderCartDrawerItems([], null);
    }
  }

  function renderCartDrawerItems(items, calc = null) {
    cartItemsCountLabel.textContent = calc
      ? `(${calc.itemsCount}件${calc.rawWeightJin > 0 ? ` · 生饺${fmtJin(calc.rawWeightJin)}斤` : ""})`
      : "(0件)";
    cartDrawerTotalPrice.textContent = calc ? calc.finalTotal.toFixed(2) : "0.00";

    if (!items || items.length === 0) {
      cartDrawerBody.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🛒</div>
          <div>购物车空空如也，快去挑选几份手工云饺吧</div>
        </div>
      `;
      return;
    }

    let html = `<div class="cart-items-list">`;

    items.forEach((item) => {
      html += `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-spec-desc">
              <span style="color: var(--primary); font-weight: 600;">${item.specName}</span>
              <span class="unit-tag">￥${item.price.toFixed(1)}/${item.unit}</span>
              ${item.options ? ` · ${item.options}` : ""}
            </div>
          </div>
          <div class="cart-item-price">￥${item.subtotal.toFixed(2)}</div>
          <div class="quantity-stepper">
            <button type="button" class="stepper-btn cart-step-btn" data-id="${item.cartItemId}" data-delta="-1" aria-label="减少">-</button>
            <span class="stepper-num">${item.qtyLabel}</span>
            <button type="button" class="stepper-btn cart-step-btn" data-id="${item.cartItemId}" data-delta="1" aria-label="增加">+</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    cartDrawerBody.innerHTML = html;

    cartDrawerBody.querySelectorAll(".cart-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        WujiStore.stepCartItemQty(btn.dataset.id, parseInt(btn.dataset.delta, 10));
      });
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

  function qtyText() {
    return currentModalIsRaw ? `${fmtJin(currentModalQty)} 斤` : `${currentModalQty} 份`;
  }

  function bindEvents() {
    specModalCloseBtn?.addEventListener("click", () => {
      specModalOverlay.classList.remove("active");
    });
    specModalOverlay?.addEventListener("click", (e) => {
      if (e.target === specModalOverlay) {
        specModalOverlay.classList.remove("active");
      }
    });

    specConfirmAddBtn?.addEventListener("click", () => {
      if (!currentModalProduct) return;
      const opts = [currentModalOptions.spiciness, currentModalOptions.condiment].filter(Boolean).join(" · ");

      WujiStore.addToCart(currentModalProduct.id, currentModalIsRaw, opts, currentModalQty);
      specModalOverlay.classList.remove("active");
      showToast(`已添加「${currentModalProduct.name}」${qtyText()}`);
    });

    cartIconBtn?.addEventListener("click", () => {
      cartDrawerOverlay.classList.toggle("active");
    });
    cartDrawerOverlay?.addEventListener("click", (e) => {
      if (e.target === cartDrawerOverlay) {
        cartDrawerOverlay.classList.remove("active");
      }
    });

    clearCartBtn?.addEventListener("click", () => {
      if (confirm("确定要清空购物车吗？")) {
        WujiStore.clearCart();
        cartDrawerOverlay.classList.remove("active");
        showToast("购物车已清空");
      }
    });

    const goToCheckout = () => {
      const cart = WujiStore.getCart();
      if (!cart || cart.length === 0) {
        showToast("购物车为空");
        return;
      }
      cartDrawerOverlay.classList.remove("active");
      window.location.href = "checkout.html";
    };

    goToCheckoutBtn?.addEventListener("click", goToCheckout);
    cartDrawerCheckoutBtn?.addEventListener("click", goToCheckout);

    wechatFloatBtn?.addEventListener("click", () => {
      wechatModalOverlay.classList.add("active");
    });
    wechatModalCloseBtn?.addEventListener("click", () => {
      wechatModalOverlay.classList.remove("active");
    });
    wechatModalOverlay?.addEventListener("click", (e) => {
      if (e.target === wechatModalOverlay) {
        wechatModalOverlay.classList.remove("active");
      }
    });

    viewMenuImageBtn?.addEventListener("click", () => {
      menuModalOverlay.classList.add("active");
    });
    menuModalCloseBtn?.addEventListener("click", () => {
      menuModalOverlay.classList.remove("active");
    });
    menuModalOverlay?.addEventListener("click", (e) => {
      if (e.target === menuModalOverlay) {
        menuModalOverlay.classList.remove("active");
      }
    });

    // 弹窗打开时 Esc 关闭，桌面/平板外接键盘也能用
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      [specModalOverlay, cartDrawerOverlay, wechatModalOverlay, menuModalOverlay].forEach((ov) => {
        if (ov && ov.classList.contains("active")) ov.classList.remove("active");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
