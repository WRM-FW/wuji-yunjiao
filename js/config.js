/**
 * 吴记云饺 · 运行配置
 *
 * 这里只放可以公开的值：Supabase 的 Project URL 与 anon key 本来就是给浏览器用的，
 * 真正的权限由数据库 RLS 与 security definer 函数把关。
 * service_role key 绝对不能出现在这个文件或任何前端代码里。
 */
window.WUJI_CONFIG = {
  supabaseUrl: "REPLACE_WITH_PROJECT_URL",
  supabaseAnonKey: "REPLACE_WITH_ANON_KEY",

  // 手机号注册时映射成虚拟邮箱的内部域名（不发邮件，仅作 auth.users 的账号标识）
  phoneEmailDomain: "@phone.wuji.app",

  // 商家端刷新策略：Realtime 推送为主，页面隐藏/断线时退回轮询
  staffPollMs: 12000,
  clientPollMs: 20000,

  store: {
    name: "吴记云饺",
    campusLocation: "河南信息科技学院三楼",
    businessHours: "10:30 - 20:30",
    paymentBocNumber: "41088491"
  }
};
