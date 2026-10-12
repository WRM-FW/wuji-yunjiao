/**
 * 吴记云饺 - 顾客移动端主应用逻辑 (纯文字展示与规范化按钮)
 */

(function () {
  let currentModalProduct = null;
  let currentModalIsRaw = false;
  let currentModalOptions = {
    spiciness: "",
    condiment: ""
  };
  let currentModalQty = 1;

  const categorySidebar = document.getElementById("categorySidebar");
  const productContentWrap = document.getElementById("productContentWrap");
  const cartIconBtn = document.getElementById("cartIconBtn");
  const cartBadge = document.getElementById("cartBadge");
  const cartTotalPrice = document.getElementById("cartTotalPrice");
  const cartDiscountTip = document.getElementById("cartDiscountTip");
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
      const tab = document.createElement("div");
      tab.className = `category-tab ${cat.id === activeCategoryId ? "active" : ""}`;
      tab.dataset.id = cat.id;
      tab.innerHTML = `
        <span class="tab-icon">${cat.icon}</span>
        <span>${cat.name}</span>
      `;
      tab.addEventListener("click", () => {
        activeCategoryId = cat.id;
        document.querySelectorAll(".category-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderProducts(cat.id);
      });
      categorySidebar.appendChild(tab);
    });
  }

  // 纯文字方式渲染商品列表（按钮统一、标签独立排版）
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

    const catObj = INITIAL_CATEGORIES.find((c) => c.id === categoryId);
    const catTitle = catObj ? catObj.name : "商品列表";
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "category-section-title";
    sectionTitle.innerHTML = `
      <span>${catTitle} (${filtered.length}款)</span>
      <span class="category-section-desc">${categoryId === "jiaozi_raw" ? "生饺立减1元/斤" : "纯手工现包 · 免打包费"}</span>
    `;
    productContentWrap.appendChild(sectionTitle);

    filtered.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-text-card";

      const isRawCategory = categoryId === "jiaozi_raw";
      const displayPrice = isRawCategory ? product.priceRaw : product.priceCooked;
      const displayUnit = isRawCategory ? product.unitRaw : product.unitCooked;
      const discountTag = product.supportRaw ? `<span class="price-discount-tag">生饺立减￥1/斤</span>` : "";

      const tagHtml = (product.tags || [])
        .map((t) => `<span class="tag-pill ${t.includes('Top') || t.includes('招牌') ? 'red' : 'gold'}">${t}</span>`)
        .join("");

      const isSoldOut = product.status === "sold_out";
      const icon = product.category === "wonton" ? "🥣" : "🥟";

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
                : `<button class="spec-btn" data-id="${product.id}" data-raw="${isRawCategory}">选规格</button>`
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

      productContentWrap.appendChild(card);
    });
  }

  // 打开规格弹窗（纯文字形式，无图片）
  function openSpecModal(product, preferRaw = false) {
    currentModalProduct = product;
    currentModalIsRaw = preferRaw && product.supportRaw;
    currentModalQty = 1;
    currentModalOptions = {
      spiciness: product.options?.spiciness ? product.options.spiciness[0] : "",
      condiment: product.options?.condiments ? product.options.condiments[0] : ""
    };

    specModalTitle.textContent = `${product.name} - 规格定制`;
    renderSpecModalContent();
    updateSpecSubtotal();

    specModalOverlay.classList.add("active");
  }

  function renderSpecModalContent() {
    const p = currentModalProduct;
    if (!p) return;

    let html = `
      <div class="spec-header-text-block">
        <div class="spec-text-title">${p.name}</div>
        <div class="spec-text-desc">${p.desc || ""}</div>
        <div class="spec-text-price-line">
          ￥<span id="specActivePrice">${(currentModalIsRaw ? p.priceRaw : p.priceCooked).toFixed(1)}</span>
          <span class="unit">/${currentModalIsRaw ? p.unitRaw : p.unitCooked}</span>
          ${currentModalIsRaw ? '<span class="price-discount-tag" style="margin-left: 8px;">生饺立减1元</span>' : ''}
        </div>
      </div>
    `;

    // 1. 食用形态选择（熟食一份 vs 生饺一斤）
    if (p.supportRaw) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">
            <span>食用方式</span>
            <span style="color: var(--accent-gold); font-size: 11px;">生饺每斤优惠1元</span>
          </div>
          <div class="spec-pills-row" id="formPillsRow">
            <div class="spec-pill-option ${!currentModalIsRaw ? 'active' : ''}" data-type="cooked">
              熟食现煮 (单份)
            </div>
            <div class="spec-pill-option ${currentModalIsRaw ? 'active' : ''}" data-type="raw">
              生饺带走 (按斤) <span class="sub-badge">省￥1</span>
            </div>
          </div>
        </div>
      `;
    }

    // 2. 辣度选项
    if (p.options?.spiciness?.length) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">辣度偏好</div>
          <div class="spec-pills-row" id="spicinessPillsRow">
            ${p.options.spiciness
              .map(
                (opt) =>
                  `<div class="spec-pill-option ${currentModalOptions.spiciness === opt ? 'active' : ''}" data-opt="${opt}">${opt}</div>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // 3. 葱花香菜配料
    if (p.options?.condiments?.length) {
      html += `
        <div class="spec-group">
          <div class="spec-group-title">配料细节</div>
          <div class="spec-pills-row" id="condimentPillsRow">
            ${p.options.condiments
              .map(
                (opt) =>
                  `<div class="spec-pill-option ${currentModalOptions.condiment === opt ? 'active' : ''}" data-opt="${opt}">${opt}</div>`
              )
              .join("")}
          </div>
        </div>
      `;
    }

    // 4. 数量加减器
    html += `
      <div class="spec-group" style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px;">
        <div class="spec-group-title" style="margin-bottom: 0;">选购数量</div>
        <div class="quantity-stepper">
          <button class="stepper-btn" id="modalMinusQtyBtn">-</button>
          <span class="stepper-num" id="modalQtyDisplay">${currentModalQty}</span>
          <button class="stepper-btn" id="modalPlusQtyBtn">+</button>
        </div>
      </div>
    `;

    specModalBody.innerHTML = html;

    const formPills = specModalBody.querySelectorAll("#formPillsRow .spec-pill-option");
    formPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        currentModalIsRaw = pill.dataset.type === "raw";
        renderSpecModalContent();
        updateSpecSubtotal();
      });
    });

    const spicePills = specModalBody.querySelectorAll("#spicinessPillsRow .spec-pill-option");
    spicePills.forEach((pill) => {
      pill.addEventListener("click", () => {
        currentModalOptions.spiciness = pill.dataset.opt;
        spicePills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
      });
    });

    const condPills = specModalBody.querySelectorAll("#condimentPillsRow .spec-pill-option");
    condPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        currentModalOptions.condiment = pill.dataset.opt;
        condPills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
      });
    });

    const minusBtn = document.getElementById("modalMinusQtyBtn");
    const plusBtn = document.getElementById("modalPlusQtyBtn");
    const qtyDisplay = document.getElementById("modalQtyDisplay");

    minusBtn?.addEventListener("click", () => {
      if (currentModalQty > 1) {
        currentModalQty--;
        qtyDisplay.textContent = currentModalQty;
        updateSpecSubtotal();
      }
    });

    plusBtn?.addEventListener("click", () => {
      currentModalQty++;
      qtyDisplay.textContent = currentModalQty;
      updateSpecSubtotal();
    });
  }

  function updateSpecSubtotal() {
    if (!currentModalProduct) return;
    const unitPrice = currentModalIsRaw ? currentModalProduct.priceRaw : currentModalProduct.priceCooked;
    const subtotal = unitPrice * currentModalQty;
    specSubtotalPrice.textContent = subtotal.toFixed(2);
  }

  function updateCartDisplay() {
    const cart = WujiStore.getCart();
    if (!cart || cart.length === 0) {
      cartBadge.style.display = "none";
      cartTotalPrice.textContent = "0.00";
      cartDiscountTip.style.display = "none";
      goToCheckoutBtn.disabled = true;
      renderCartDrawerItems([]);
      return;
    }

    try {
      const calculation = WujiStore.calculateTrustedOrder(cart);
      cartBadge.style.display = "flex";
      cartBadge.textContent = calculation.itemsCount;
      cartTotalPrice.textContent = calculation.finalTotal.toFixed(2);

      if (calculation.discountAmount > 0) {
        cartDiscountTip.style.display = "block";
        cartDiscountTip.textContent = `已省 ￥${calculation.discountAmount.toFixed(2)} (生饺立减)`;
      } else {
        cartDiscountTip.style.display = "none";
      }

      goToCheckoutBtn.disabled = false;
      renderCartDrawerItems(calculation.verifiedItems, calculation);
    } catch (e) {
      console.error("Cart calculation error", e);
    }
  }

  function renderCartDrawerItems(items, calc = null) {
    cartItemsCountLabel.textContent = `(${items.length}种商品)`;
    cartDrawerTotalPrice.textContent = calc ? calc.finalTotal.toFixed(2) : "0.00";

    if (items.length === 0) {
      cartDrawerBody.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🛒</div>
          <div>购物车空空如也，快去挑选几份手工云饺吧</div>
        </div>
      `;
      return;
    }

    const cart = WujiStore.getCart();
    let html = `<div class="cart-items-list">`;

    items.forEach((item, index) => {
      const originalCartItem = cart[index];
      html += `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-title">${item.name}</div>
            <div class="cart-item-spec-desc">
              <span style="color: var(--primary); font-weight: 600;">${item.specName}</span>
              ${item.options ? ` · ${item.options}` : ""}
            </div>
          </div>
          <div class="cart-item-price">
            ￥${item.subtotal.toFixed(2)}
          </div>
          <div class="quantity-stepper">
            <button class="stepper-btn cart-minus-btn" data-id="${originalCartItem?.cartItemId}">-</button>
            <span class="stepper-num">${item.quantity}</span>
            <button class="stepper-btn cart-plus-btn" data-id="${originalCartItem?.cartItemId}">+</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    cartDrawerBody.innerHTML = html;

    cartDrawerBody.querySelectorAll(".cart-minus-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const it = cart.find((c) => c.cartItemId === id);
        if (it) {
          WujiStore.updateCartItemQty(id, it.quantity - 1);
        }
      });
    });

    cartDrawerBody.querySelectorAll(".cart-plus-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const it = cart.find((c) => c.cartItemId === id);
        if (it) {
          WujiStore.updateCartItemQty(id, it.quantity + 1);
        }
      });
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
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
      const opts = [
        currentModalOptions.spiciness,
        currentModalOptions.condiment
      ]
        .filter(Boolean)
        .join(" · ");

      WujiStore.addToCart(currentModalProduct.id, currentModalIsRaw, opts, currentModalQty);
      specModalOverlay.classList.remove("active");
      showToast(`已添加「${currentModalProduct.name}」x${currentModalQty}`);
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
  }

  document.addEventListener("DOMContentLoaded", init);
})();
