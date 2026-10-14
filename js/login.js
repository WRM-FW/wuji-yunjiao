/**
 * 吴记云饺 · 登录与注册页逻辑
 * 手机号或邮箱 + 密码，注册即进入站点，不做短信/邮件验证。
 */

(function () {
  const tabRegister = document.getElementById("tabRegister");
  const tabLogin = document.getElementById("tabLogin");
  const nicknameField = document.getElementById("nicknameField");
  const nicknameInput = document.getElementById("nicknameInput");
  const identifierInput = document.getElementById("identifierInput");
  const passwordInput = document.getElementById("passwordInput");
  const submitAuthBtn = document.getElementById("submitAuthBtn");
  const authError = document.getElementById("authError");
  const loggedInBox = document.getElementById("loggedInBox");
  const loggedInText = document.getElementById("loggedInText");
  const logoutBtn = document.getElementById("logoutBtn");

  let mode = "register";
  const MODE_KEY = "wuji_auth_mode";

  const params = new URLSearchParams(location.search);
  const returnTo = sanitizeReturn(params.get("next") || "index.html");

  function sanitizeReturn(target) {
    // 只允许站内相对路径，避免变成开放重定向
    if (!/^[a-z0-9._-]+\.html/i.test(target)) return "index.html";
    return target;
  }

  function setMode(next, remember = true) {
    mode = next;
    if (remember) {
      try { localStorage.setItem(MODE_KEY, next); } catch (e) { /* 隐私模式忽略 */ }
    }
    tabRegister.classList.toggle("active", next === "register");
    tabLogin.classList.toggle("active", next === "login");
    nicknameField.style.display = next === "register" ? "block" : "none";
    submitAuthBtn.textContent = next === "register" ? "注册并开始点餐" : "登录";
    passwordInput.setAttribute("autocomplete", next === "register" ? "new-password" : "current-password");
    const hint = document.getElementById("modeHint");
    if (hint) {
      hint.textContent = next === "register"
        ? "已有账号？点上方「已有账号登录」"
        : "第一次来？点上方「新用户注册」填个昵称";
    }
    hideError();
  }

  function showError(msg) {
    authError.textContent = msg;
    authError.classList.add("show");
  }

  function hideError() {
    authError.classList.remove("show");
  }

  const ROLE_TEXT = { user: "普通用户", merchant: "商家", admin: "管理员" };

  async function refreshLoginState() {
    if (!WujiApi.enabled()) return;
    try {
      const me = await WujiApi.currentUser();
      if (!me) {
        loggedInBox.classList.remove("show");
        return;
      }
      loggedInText.textContent = `${me.nickname || "未填昵称"} · ${ROLE_TEXT[me.role] || "普通用户"}`;
      loggedInBox.classList.add("show");
    } catch (e) {
      console.error(e);
    }
  }

  function friendlyError(err) {
    const msg = String(err?.message || err || "");
    if (/Invalid login credentials/i.test(msg)) return "手机号或邮箱与密码不匹配，请核对后重试";
    if (/already registered|already exists/i.test(msg)) return "这个账号已经注册过了，直接登录即可";
    if (/Email not confirmed/i.test(msg)) return "账号尚未激活，请联系档口管理员";
    if (/rate limit|too many/i.test(msg)) return "操作过于频繁，请稍后再试";
    if (/NetworkError|Failed to fetch|fetch failed/i.test(msg)) return "网络不通，请检查手机网络后重试";
    return msg || "操作失败，请重试";
  }

  async function doLogin(identifier, password) {
    await WujiApi.login({ identifier, password });
    location.href = returnTo;
  }

  async function submit() {
    hideError();
    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;
    const nickname = nicknameInput.value.trim();

    if (!WujiApi.enabled()) {
      showError("站点尚未接入后端（Supabase 未配置），暂时不能注册登录。");
      return;
    }
    if (!identifier) { showError("请填写手机号或邮箱"); return; }
    if (password.length < 6) { showError("密码至少 6 位"); return; }

    // 注册标签下没填昵称，几乎只有一种可能：这是回来登录的老用户。
    // 直接按登录试一次，别再用"请填写昵称"把人挡在门外。
    if (mode === "register" && !nickname) {
      submitAuthBtn.disabled = true;
      submitAuthBtn.textContent = "正在登录...";
      try {
        await doLogin(identifier, password);
        return;
      } catch (e) {
        setMode("register", false);
        showError("这个账号还没注册过，或者密码不对。新用户请在昵称一栏填个称呼后注册；已有账号请点上方「已有账号登录」。");
      } finally {
        submitAuthBtn.disabled = false;
        submitAuthBtn.textContent = "注册并开始点餐";
      }
      return;
    }

    submitAuthBtn.disabled = true;
    submitAuthBtn.textContent = mode === "register" ? "正在注册..." : "正在登录...";
    try {
      if (mode === "register") {
        await WujiApi.register({ identifier, password, nickname });
      } else {
        await WujiApi.login({ identifier, password });
      }
      location.href = returnTo;
    } catch (e) {
      const msg = String(e?.message || e);
      if (mode === "register" && /already registered|already exists/i.test(msg)) {
        // 注册撞上已存在账号：就地切成登录并直接重试，用户不用再操作一遍
        setMode("login");
        try {
          await doLogin(identifier, password);
          return;
        } catch (e2) {
          showError("这个手机号/邮箱已经注册过了，但密码对不上，请回想一下或联系档口。");
        }
      } else {
        showError(friendlyError(e));
      }
    } finally {
      submitAuthBtn.disabled = false;
      submitAuthBtn.textContent = mode === "register" ? "注册并开始点餐" : "登录";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 默认标签：URL 指定 > 上次用过的 > 注册
    let initial = params.get("mode");
    if (initial !== "login" && initial !== "register") {
      let remembered = "";
      try { remembered = localStorage.getItem(MODE_KEY) || ""; } catch (e) { /* 忽略 */ }
      initial = remembered === "login" ? "login" : "register";
    }
    setMode(initial, false);
    refreshLoginState();

    tabRegister.addEventListener("click", () => setMode("register"));
    tabLogin.addEventListener("click", () => setMode("login"));
    submitAuthBtn.addEventListener("click", submit);
    passwordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

    logoutBtn.addEventListener("click", async () => {
      await WujiApi.logout();
      loggedInBox.classList.remove("show");
      location.href = "index.html";
    });
  });
})();
