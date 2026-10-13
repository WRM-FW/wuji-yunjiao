/**
 * 吴记云饺 - 前端数据存储与可信算费核心 (Pure Frontend Store)
 * 纯前端架构：基于 LocalStorage 进行数据持久化与可信金额防篡改计算
 */

(function (global) {
  const STORAGE_KEYS = {
    STORE_INFO: "wuji_store_info_v2",
    PRODUCTS: "wuji_products_v2",
    ORDERS: "wuji_orders_v2",
    CART: "wuji_cart_v2"
  };

  const FALLBACK_RAW_CONFIG = {
    unit: "斤", stepJin: 0.1, coarseStepJin: 0.5, minJin: 0.5, maxJin: 20,
    quickJin: [1, 1.5, 2, 3], discountPerJin: 1,
    note: "生饺按斤称重计价，0.1 斤为一档"
  };

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function rawConfig() {
    return Object.assign({}, FALLBACK_RAW_CONFIG, global.RAW_SELL_CONFIG || {});
  }

  // 生饺按斤：0.1 斤精度，限制在 [minJin, maxJin]
  function normalizeWeight(input) {
    const cfg = rawConfig();
    let v = typeof input === "number" ? input : parseFloat(input);
    if (!isFinite(v) || v <= 0) v = cfg.minJin;
    v = Math.round(v / cfg.stepJin) * cfg.stepJin;
    v = Math.min(cfg.maxJin, Math.max(cfg.minJin, v));
    return round2(v);
  }

  // 熟食按份：整数，1 ~ 99
  function normalizePortions(input) {
    let v = parseInt(input, 10);
    if (!isFinite(v) || v < 1) v = 1;
    return Math.min(99, v);
  }

  function formatJin(v) {
    const n = round2(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/0$/, "");
  }

  class WujiStore {
    constructor() {
      this.listeners = [];
      this.initStorage();
    }

    initStorage() {
      if (!localStorage.getItem(STORAGE_KEYS.STORE_INFO)) {
        localStorage.setItem(STORAGE_KEYS.STORE_INFO, JSON.stringify(global.INITIAL_STORE_INFO || {}));
      }
      if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(global.INITIAL_PRODUCTS || []));
      }
      if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
      }
    }

    subscribe(callback) {
      if (typeof callback === "function") {
        this.listeners.push(callback);
      }
      return () => {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
      };
    }

    notifyListeners(payload) {
      this.listeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error("Listener error:", err);
        }
      });
    }

    getStoreInfo() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.STORE_INFO)) || (global.INITIAL_STORE_INFO || {});
      } catch {
        return global.INITIAL_STORE_INFO || {};
      }
    }

    getProducts() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.PRODUCTS)) || (global.INITIAL_PRODUCTS || []);
      } catch {
        return global.INITIAL_PRODUCTS || [];
      }
    }

    getProductById(id) {
      const products = this.getProducts();
      return products.find((p) => p.id === id) || null;
    }

    // 可信金额核算：熟食按份（整数）、生饺按斤（0.1 斤精度），金额按分取整
    calculateTrustedOrder(cartItems) {
      const products = this.getProducts();
      const cfg = rawConfig();
      let originalTotal = 0;
      let discountAmount = 0;
      let portionCount = 0;   // 熟食份数合计
      let rawLineCount = 0;   // 生饺袋数合计
      let rawWeightJin = 0;   // 生饺重量合计（斤）
      const verifiedItems = [];

      for (const item of cartItems || []) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;
        if (product.status === "sold_out") {
          throw new Error(`商品「${product.name}」已售罄，请移出购物车`);
        }

        const isRaw = Boolean(item.isRaw) && Boolean(product.supportRaw);
        const quantity = isRaw ? normalizeWeight(item.quantity) : normalizePortions(item.quantity);
        const unit = isRaw ? cfg.unit : (product.unitCooked || "份");
        const unitPrice = round2(isRaw ? product.priceRaw : product.priceCooked);
        const nominalPrice = round2(isRaw ? (product.priceCooked || product.priceRaw) : product.priceCooked);

        const subtotal = round2(unitPrice * quantity);
        const lineOriginal = round2(nominalPrice * quantity);
        // 生饺每斤立减 1 元：优惠额 =（熟食价 − 生饺价）× 斤数
        const lineDiscount = isRaw ? round2(Math.max(0, nominalPrice - unitPrice) * quantity) : 0;

        originalTotal = round2(originalTotal + lineOriginal);
        discountAmount = round2(discountAmount + lineDiscount);

        if (isRaw) {
          rawLineCount += 1;
          rawWeightJin = round2(rawWeightJin + quantity);
        } else {
          portionCount += quantity;
        }

        verifiedItems.push({
          cartItemId: item.cartItemId || "",
          productId: product.id,
          name: product.name,
          isRaw,
          unit,
          quantity,
          qtyLabel: isRaw ? `${formatJin(quantity)} 斤` : `x${quantity}`,
          specName: isRaw ? `生饺称重 ${formatJin(quantity)} 斤` : `熟食现煮 ${quantity} 份`,
          price: unitPrice,
          priceLabel: `￥${unitPrice.toFixed(1)}/${unit}`,
          originalPrice: nominalPrice,
          discount: lineDiscount,
          subtotal,
          options: item.options || ""
        });
      }

      if (verifiedItems.length === 0) {
        throw new Error("购物车为空，无法结算");
      }

      const packageFee = 0.0; // 全单免收打包费
      const finalTotal = round2(originalTotal - discountAmount + packageFee);

      return {
        // 件数 = 熟食份数 + 生饺袋数（2.5 斤生饺算 1 件），重量单列避免单位混算
        itemsCount: portionCount + rawLineCount,
        portionCount,
        rawLineCount,
        rawWeightJin,
        verifiedItems,
        originalTotal,
        discountAmount,
        packageFee,
        finalTotal: Math.max(0.01, finalTotal)
      };
    }

    // ==================== 购物车管理 ====================
    getCart() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CART)) || [];
      } catch {
        return [];
      }
    }

    saveCart(cart) {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
      this.notifyListeners({ type: "CART_UPDATED", data: cart });
    }

    addToCart(productId, isRaw = false, options = "", quantity = 1) {
      const product = this.getProductById(productId);
      const raw = Boolean(isRaw) && Boolean(product && product.supportRaw);
      const qty = raw ? normalizeWeight(quantity) : normalizePortions(quantity);
      const cart = this.getCart();
      const existing = cart.find(
        (i) => i.productId === productId && Boolean(i.isRaw) === raw && i.options === options
      );

      if (existing) {
        existing.quantity = raw
          ? normalizeWeight(Number(existing.quantity) + qty)
          : normalizePortions(Number(existing.quantity) + qty);
      } else {
        cart.push({
          cartItemId: "c_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          productId,
          isRaw: raw,
          options,
          quantity: qty
        });
      }
      this.saveCart(cart);
      return cart;
    }

    updateCartItemQty(cartItemId, newQty) {
      let cart = this.getCart();
      const item = cart.find((i) => i.cartItemId === cartItemId);
      const numeric = Number(newQty);
      if (!item || !isFinite(numeric)) return cart;

      // 生饺低于最低起售重量、熟食少于 1 份时直接移除该条目
      const minQty = item.isRaw ? rawConfig().minJin : 1;
      if (numeric < minQty) {
        cart = cart.filter((i) => i.cartItemId !== cartItemId);
      } else {
        item.quantity = item.isRaw ? normalizeWeight(numeric) : normalizePortions(numeric);
      }
      this.saveCart(cart);
      return cart;
    }

    // 购物车内快速加减：熟食 ±1 份，生饺 ±0.5 斤
    stepCartItemQty(cartItemId, delta) {
      const cart = this.getCart();
      const item = cart.find((i) => i.cartItemId === cartItemId);
      if (!item) return cart;
      const step = item.isRaw ? rawConfig().coarseStepJin : 1;
      return this.updateCartItemQty(cartItemId, Number(item.quantity) + delta * step);
    }

    clearCart() {
      localStorage.removeItem(STORAGE_KEYS.CART);
      this.notifyListeners({ type: "CART_UPDATED", data: [] });
    }

    // ==================== 订单管理 ====================
    getOrders() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS)) || [];
      } catch {
        return [];
      }
    }

    getOrderById(id) {
      const orders = this.getOrders();
      return orders.find((o) => o.id === id) || null;
    }

    createOrder(customerInput) {
      const {
        diningType = "pickup",
        pickupTime = "尽快出餐",
        note = "",
        cartItems = []
      } = customerInput;

      if (!cartItems || cartItems.length === 0) {
        throw new Error("购物车为空，无法提交订单");
      }

      // 可信算法二次计算总金额，防止客户端数据篡改
      const calculation = this.calculateTrustedOrder(cartItems);

      // 生成订单编号 WJ-YYYYMMDD-随机4位
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const orderId = `WJ-${todayStr}-${randomCode}`;

      const newOrder = {
        id: orderId,
        createdAt: new Date().toISOString(),
        diningType: diningType === "dine_in" ? "dine_in" : "pickup",
        pickupTime: String(pickupTime || "尽快出餐").trim() || "尽快出餐",
        note: String(note || "").trim(),
        items: calculation.verifiedItems,
        itemsCount: calculation.itemsCount,
        portionCount: calculation.portionCount,
        rawLineCount: calculation.rawLineCount,
        rawWeightJin: calculation.rawWeightJin,
        originalTotal: calculation.originalTotal,
        discountAmount: calculation.discountAmount,
        packageFee: calculation.packageFee,
        finalTotal: calculation.finalTotal,
        payment: {
          method: "boc_unified_qr",
          bocNumber: (this.getStoreInfo()?.paymentBocNumber || "41088491")
        }
      };

      const existingOrders = this.getOrders();
      existingOrders.unshift(newOrder);
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(existingOrders));
      this.clearCart();
      return newOrder;
    }
  }

  const storeInstance = new WujiStore();
  // 暴露计价工具，供页面渲染重量输入与文案复用同一套规则
  storeInstance.RAW_CONFIG = rawConfig();
  storeInstance.normalizeWeight = normalizeWeight;
  storeInstance.normalizePortions = normalizePortions;
  storeInstance.formatJin = formatJin;
  storeInstance.round2 = round2;

  global.WujiStore = storeInstance;
})(typeof window !== "undefined" ? window : globalThis);
