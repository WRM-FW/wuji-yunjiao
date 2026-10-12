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

    // 可信金额核算逻辑（严格依据商品ID与生饺优惠规则计算）
    calculateTrustedOrder(cartItems) {
      const products = this.getProducts();
      let originalTotal = 0;
      let discountAmount = 0;
      let itemsCount = 0;
      const verifiedItems = [];

      for (const item of cartItems) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;
        if (product.status === "sold_out") {
          throw new Error(`商品「${product.name}」已售罄，请移出购物车`);
        }

        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        itemsCount += qty;

        const isRaw = Boolean(item.isRaw);
        let unitPrice = isRaw ? product.priceRaw : product.priceCooked;
        let itemOriginalPrice = isRaw ? (product.priceCooked || product.priceRaw) : product.priceCooked;

        // 生饺每斤优惠1元业务规则
        let itemDiscount = 0;
        if (isRaw && product.supportRaw) {
          const nominalDiff = Math.max(0, (product.priceCooked || 0) - product.priceRaw);
          itemDiscount = nominalDiff * qty;
        }

        const subtotal = Math.round(unitPrice * qty * 100) / 100;
        originalTotal += (itemOriginalPrice * qty);
        discountAmount += itemDiscount;

        verifiedItems.push({
          productId: product.id,
          name: product.name,
          isRaw,
          specName: isRaw ? `生饺一斤 (立减优惠)` : `熟食单份 (${product.unitCooked})`,
          price: unitPrice,
          originalPrice: itemOriginalPrice,
          quantity: qty,
          subtotal,
          options: item.options || ""
        });
      }

      originalTotal = Math.round(originalTotal * 100) / 100;
      discountAmount = Math.round(discountAmount * 100) / 100;
      const packageFee = 0.0; // 全单免收打包费
      const finalTotal = Math.round((originalTotal - discountAmount + packageFee) * 100) / 100;

      return {
        itemsCount,
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
      const cart = this.getCart();
      const existing = cart.find(
        (i) => i.productId === productId && i.isRaw === isRaw && i.options === options
      );

      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({
          cartItemId: "c_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          productId,
          isRaw,
          options,
          quantity
        });
      }
      this.saveCart(cart);
      return cart;
    }

    updateCartItemQty(cartItemId, newQty) {
      let cart = this.getCart();
      if (newQty <= 0) {
        cart = cart.filter((i) => i.cartItemId !== cartItemId);
      } else {
        const item = cart.find((i) => i.cartItemId === cartItemId);
        if (item) item.quantity = newQty;
      }
      this.saveCart(cart);
      return cart;
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
        pickupTime: pickupTime.trim() || "尽快出餐",
        note: note.trim(),
        items: calculation.verifiedItems,
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

  global.WujiStore = new WujiStore();
})(typeof window !== "undefined" ? window : globalThis);
