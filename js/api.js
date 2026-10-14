/**
 * 吴记云饺 · 后端访问层（Supabase）
 *
 * 职责：
 *   1) 统一封装认证（手机号/邮箱 + 密码，注册不需要短信与邮件验证）
 *   2) 统一封装读写：商品、订单、取餐码、用户与角色，全部走 RLS 保护的表与函数
 *   3) Realtime 订阅 + 轮询兜底（页面切回前台、断网恢复时立即补一次刷新）
 *
 * 未配置 Supabase（URL 还是占位值）时 enabled() 返回 false，
 * 站点会退回纯前端形态（本地菜单 + 本地订单），方便离线开发与回退。
 */

(function (global) {
  const CFG = global.WUJI_CONFIG || {};
  const PLACEHOLDER = "REPLACE_WITH";

  let client = null;
  let channel = null;
  let lastError = null;

  function configured() {
    return Boolean(CFG.supabaseUrl && CFG.supabaseAnonKey &&
      CFG.supabaseUrl.indexOf(PLACEHOLDER) < 0 &&
      CFG.supabaseAnonKey.indexOf(PLACEHOLDER) < 0);
  }

  function sb() {
    if (client || !configured()) return client;
    if (!global.supabase || !global.supabase.createClient) {
      lastError = "supabase-js 未加载";
      return null;
    }
    client = global.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return client;
  }

  const digits = (s) => String(s || "").replace(/[^\d+]/g, "");

  // 手机号账号 → 虚拟邮箱（真实手机号另存 profiles.contact_phone）
  function toAccount(identifier) {
    const raw = String(identifier || "").trim();
    if (raw.includes("@")) return { email: raw.toLowerCase(), phone: "" };
    const phone = digits(raw);
    if (!/^1[3-9]\d{9}$/.test(phone) && !/^\d{6,20}$/.test(phone)) {
      throw new Error("请输入正确的手机号或邮箱");
    }
    return { email: phone + (CFG.phoneEmailDomain || "@phone.wuji.app"), phone };
  }

  function unwrap(res) {
    if (res.error) {
      lastError = res.error.message || String(res.error);
      throw res.error;
    }
    return res.data;
  }

  const Api = {
    configured,
    enabled: () => Boolean(sb()),
    lastError: () => lastError,

    // ==================== 认证 ====================
    async session() {
      const c = sb();
      if (!c) return null;
      const { data } = await c.auth.getSession();
      return data?.session || null;
    },

    async currentUser() {
      const c = sb();
      if (!c) return null;
      const session = await Api.session();
      if (!session?.user) return null;
      const { data, error } = await c.from("profiles")
        .select("id,nickname,contact_phone,contact_email,role")
        .eq("id", session.user.id).maybeSingle();
      if (error) throw error;
      return {
        id: session.user.id,
        nickname: data?.nickname || "",
        phone: data?.contact_phone || "",
        email: data?.contact_email || session.user.email || "",
        role: data?.role || "user"
      };
    },

    async register({ identifier, password, nickname }) {
      const c = sb();
      if (!c) throw new Error("后端未配置，无法注册");
      const name = String(nickname || "").trim();
      if (!name) throw new Error("请填写昵称");
      if (String(password || "").length < 6) throw new Error("密码至少 6 位");
      const acct = toAccount(identifier);
      const { data, error } = await c.auth.signUp({
        email: acct.email,
        password,
        options: {
          data: { nickname: name, phone: acct.phone },
          email_confirm: true
        }
      });
      unwrap({ data, error });
      // email_confirm=true + 控制台关闭验证后，部分版本仍会返回 session=null，
      // 这时立刻用同一组账号密码补一次登录，保证注册后直接进站点
      if (!data.session) {
        return Api.login({ identifier, password });
      }
      return { user: data.user, session: data.session, nickname: name };
    },

    async login({ identifier, password }) {
      const c = sb();
      if (!c) throw new Error("后端未配置，无法登录");
      const acct = toAccount(identifier);
      const { data, error } = await c.auth.signInWithPassword({
        email: acct.email,
        password
      });
      unwrap({ data, error });
      return { user: data.user, session: data.session };
    },

    async logout() {
      const c = sb();
      if (!c) return;
      await c.auth.signOut();
    },

    onAuthChange(cb) {
      const c = sb();
      if (!c) return () => {};
      const { data } = c.auth.onAuthStateChange((event, session) => {
        try { cb(event, session); } catch (e) { console.error(e); }
      });
      return () => data?.subscription?.unsubscribe?.();
    },

    // ==================== 商品 ====================
    async products({ includeOff = false } = {}) {
      const c = sb();
      if (!c) return null;
      let query = c.from("products").select("*").order("sort_order", { ascending: true });
      if (!includeOff) query = query.eq("listing_status", "on");
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapProduct);
    },

    async allProducts() {
      return Api.products({ includeOff: true });
    },

    async saveProduct(form) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const row = productToRow(form);
      if (form.isNew) {
        const { data, error } = await c.from("products").insert(row).select("*").single();
        unwrap({ data, error });
        return mapProduct(data);
      }
      const { data, error } = await c.from("products")
        .update(row).eq("id", form.id).select("*").single();
      unwrap({ data, error });
      return mapProduct(data);
    },

    async setProductListing(id, on) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { error } = await c.from("products")
        .update({ listing_status: on ? "on" : "off" }).eq("id", id);
      unwrap({ data: true, error });
    },

    async setProductSoldOut(id, soldOut) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { error } = await c.from("products")
        .update({ sold_out: Boolean(soldOut) }).eq("id", id);
      unwrap({ data: true, error });
    },

    // ==================== 订单（顾客） ====================
    async submitOrder({ items, diningType, pickupTime, note }) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      // 页面侧（camelCase）与直连调用（snake_case）两种写法都接受，
      // 之前只认 productId 导致 checkout 传来的 product_id 被映射成 undefined
      const payload = (items || []).map((i) => ({
        product_id: i.product_id || i.productId,
        is_raw: i.is_raw ?? i.isRaw ?? false,
        quantity: Number(i.quantity),
        options: i.options || ""
      }));
      const { data, error } = await c.rpc("submit_order", {
        p_items: payload,
        p_dining_type: diningType,
        p_pickup_time: pickupTime,
        p_note: note || ""
      });
      unwrap({ data, error });
      return data;
    },

    async myOrders(limit = 30) {
      const c = sb();
      if (!c) return null;
      const { data, error } = await c.rpc("my_orders", { p_limit: limit });
      unwrap({ data, error });
      return data || [];
    },

    async cancelOrder(id) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { data, error } = await c.rpc("cancel_order", { p_order_id: id });
      unwrap({ data, error });
      return data;
    },

    async orderDetail(id) {
      const c = sb();
      if (!c) return null;
      const { data, error } = await c.rpc("order_detail", { p_order_id: id });
      unwrap({ data, error });
      return data;
    },

    // ==================== 订单与取餐码（商家） ====================
    async staffOrders(status = "all", limit = 80) {
      const c = sb();
      if (!c) return null;
      const { data, error } = await c.rpc("staff_orders", { p_status: status, p_limit: limit });
      unwrap({ data, error });
      return data || [];
    },

    async availableCodes() {
      const c = sb();
      if (!c) return null;
      const { data, error } = await c.rpc("available_pickup_codes");
      unwrap({ data, error });
      return data;
    },

    async assignPickupCode(orderId, code) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { data, error } = await c.rpc("assign_pickup_code", {
        p_order_id: orderId, p_code: String(code).trim()
      });
      unwrap({ data, error });
      return data;
    },

    async completePickup(orderId) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { data, error } = await c.rpc("complete_pickup", { p_order_id: orderId });
      unwrap({ data, error });
      return data;
    },

    // ==================== 用户与角色 ====================
    async searchUsers(query = "", limit = 30) {
      const c = sb();
      if (!c) return null;
      const { data, error } = await c.rpc("search_users", { p_query: query, p_limit: limit });
      unwrap({ data, error });
      return data || [];
    },

    async setUserRole(userId, role) {
      const c = sb();
      if (!c) throw new Error("后端未配置");
      const { data, error } = await c.rpc("set_user_role", { p_user_id: userId, p_role: role });
      unwrap({ data, error });
      return data;
    },

    // ==================== 实时与刷新 ====================
    /**
     * 订阅订单变化。Realtime 断开或页面隐藏时由 pollMs 轮询兜底；
     * 重新可见 / 网络恢复时立刻补一次刷新，避免漏单。
     */
    watchOrders(onChange, { pollMs = CFG.staffPollMs || 12000 } = {}) {
      const c = sb();
      let stopped = false;
      let timer = null;

      const ping = (reason) => { if (!stopped) Promise.resolve(onChange(reason)).catch(() => {}); };

      if (c) {
        channel = c.channel("wuji-orders-changes")
          .on("postgres_changes",
            { event: "*", schema: "public", table: "orders" },
            () => ping("realtime"))
          .on("postgres_changes",
            { event: "*", schema: "public", table: "order_items" },
            () => ping("realtime"))
          .subscribe();
      }

      timer = setInterval(() => {
        if (document.visibilityState === "visible") ping("poll");
      }, pollMs);

      const onVisible = () => { if (document.visibilityState === "visible") ping("visible"); };
      const onOnline = () => ping("online");
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);

      return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onOnline);
        if (channel && c) c.removeChannel(channel);
        channel = null;
      };
    },

    watchProducts(onChange, { pollMs = 30000 } = {}) {
      const c = sb();
      let stopped = false;
      const ping = () => { if (!stopped) Promise.resolve(onChange()).catch(() => {}); };
      const timer = setInterval(() => {
        if (document.visibilityState === "visible") ping();
      }, pollMs);
      let ch = null;
      if (c) {
        ch = c.channel("wuji-products-changes")
          .on("postgres_changes", { event: "*", schema: "public", table: "products" }, ping)
          .subscribe();
      }
      return () => {
        stopped = true;
        clearInterval(timer);
        if (ch && c) c.removeChannel(ch);
      };
    }
  };

  // ---------------------------------------------------------------------
  // 行数据 → 前端商品模型（沿用纯前端版本的字段名，复用既有渲染与计价代码）
  // ---------------------------------------------------------------------
  function mapProduct(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      pricingMode: row.pricing_mode,
      supportRaw: row.pricing_mode === "both" || row.pricing_mode === "weight",
      priceCooked: Number(row.price_cooked),
      priceRaw: Number(row.price_raw),
      unitCooked: row.unit_cooked,
      unitRaw: row.unit_raw,
      rawDiscount: Number(row.raw_discount),
      desc: row.desc_text || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      options: row.options && typeof row.options === "object" ? row.options : {},
      listingStatus: row.listing_status,
      soldOut: Boolean(row.sold_out),
      sortOrder: Number(row.sort_order) || 100,
      updatedAt: row.updated_at
    };
  }

  function productToRow(form) {
    const mode = form.pricingMode || "portion";
    const supportRaw = mode === "both" || mode === "weight";
    return {
      id: form.id,
      name: String(form.name || "").trim(),
      category: form.category || "jiaozi_cooked",
      pricing_mode: mode,
      price_cooked: Number(form.priceCooked) || 0,
      unit_cooked: form.unitCooked || "份",
      support_raw: supportRaw,
      price_raw: Number(form.priceRaw) || 0,
      unit_raw: form.unitRaw || "斤",
      raw_discount: Number(form.rawDiscount) || 0,
      desc_text: String(form.desc || "").trim(),
      tags: form.tags || [],
      options: form.options || {},
      listing_status: form.listingStatus === "off" ? "off" : "on",
      sold_out: Boolean(form.soldOut),
      sort_order: Number(form.sortOrder) || 100
    };
  }

  global.WujiApi = Api;
})(typeof window !== "undefined" ? window : globalThis);
