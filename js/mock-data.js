/**
 * 吴记云饺 - 基础业务与商品数据定义
 * 餐厅地点：河南信息科技学院三楼
 * 纯前端架构配置
 */

(function (global) {
  const INITIAL_STORE_INFO = {
    name: "吴记云饺",
    slogan: "皮薄肉多 正宗风味 · 纯手工零添加 · 天天新鲜",
    campusLocation: "河南信息科技学院三楼",
    businessHours: "10:30 - 20:30",
    wechatGroupText: "付款后请将【订单截图】与【支付成功截图】发送至订餐群核对",
    qualityPromises: [
      "皮薄肉多 正宗风味",
      "精选食材 天天新鲜",
      "假一赔十 纯手工零添加",
      "所有生饺子每斤优惠1元",
      "全单免收打包费",
      "如有任何不满意免费重新做一份"
    ],
    paymentBocNumber: "41088491", // 中银来聚财商户终端号
    announcement: "【校内订餐】欢迎光临吴记云饺！纯手工现包，所有生饺每斤立减1元，全单免收打包费！"
  };

  // 左侧分类导航：将「福袋馄炖」调整至「生饺称斤」上方，并删除「小料与饮品」
  const INITIAL_CATEGORIES = [
    { id: "all", name: "全部商品", icon: "🥢" },
    { id: "jiaozi_cooked", name: "热食水饺", icon: "🥟", desc: "现包现煮，热气腾腾" },
    { id: "wonton", name: "福袋馄炖", icon: "🥣", desc: "皮薄馅鲜，鲜香骨汤" },
    { id: "jiaozi_raw", name: "生饺称斤", icon: "🧺", desc: "每斤立减1元，外带优选" }
  ];

  // 生饺称重销售规则：按斤计价，顾客可自由输入重量（0.1 斤一档）
  const RAW_SELL_CONFIG = {
    unit: "斤",
    stepJin: 0.1,      // 输入精度与加减步进
    coarseStepJin: 0.5, // 购物车里快速加减用 0.5 斤
    minJin: 0.5,       // 最低 0.5 斤起卖
    maxJin: 20,        // 单笔上限，超出请分单或联系档口
    quickJin: [1, 1.5, 2, 3],
    discountPerJin: 1, // 每斤立减 1 元（priceRaw = priceCooked - 1）
    note: "生饺按斤称重计价，0.1 斤为一档；档口现场以电子秤复核，多退少补"
  };

  // 商品数据：仅保留10款水饺与5款福袋馄饨，删除小料与饮品，删除配赠蘸料选项
  const INITIAL_PRODUCTS = [
    // 饺子类 - 10款经典口味
    {
      id: "p1",
      name: "玉米鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 11.6, // 元/份
      priceRaw: 10.6,    // 原价11.6元/斤，生饺每斤优惠1元
      unitCooked: "份",
      unitRaw: "斤",
      desc: "精选冷鲜猪前腿肉搭配甜玉米粒，颗颗爆汁，香甜多汁。",
      tags: ["招牌热销", "玉米香甜饱满", "人气推荐"],
      status: "available",
      sales: 1280,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p2",
      name: "韭菜鸡蛋饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 11.8,
      priceRaw: 10.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "清晨现割鲜嫩韭菜，配优质土鸡蛋现炒，清爽滑嫩，鲜香扑鼻。",
      tags: ["经典素馅", "鲜嫩爽口", "素食优选"],
      status: "available",
      sales: 960,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p3",
      name: "韭菜鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "传统经典配方，鲜嫩韭菜混合醇香猪前尖肉，油润多汁，口感饱满。",
      tags: ["传统风味", "肉质香浓"],
      status: "available",
      sales: 1150,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p4",
      name: "大葱鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "北方正宗大葱鲜肉调馅，葱白细剁提味，肉馅紧实弹牙，回味醇香。",
      tags: ["北方传统", "葱香浓郁"],
      status: "available",
      sales: 890,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p5",
      name: "香菇素三鲜饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "优质干香菇温水泡发切丁，辅以鲜脆木耳与嫩豆腐，菌香浓郁，清爽开胃。",
      tags: ["菌菇清香", "低脂健康"],
      status: "available",
      sales: 780,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p6",
      name: "芹菜鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "香脆小芹菜细切入馅，纤维丰富脆爽多汁，搭配鲜猪肉荤素均衡解油腻。",
      tags: ["清脆爽口", "解腻回甘"],
      status: "available",
      sales: 720,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p7",
      name: "白菜鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "精选清甜大白菜，锁住原汁甘甜，一口咬下爆出清甜肉汁。",
      tags: ["百财聚来", "清甜多汁"],
      status: "available",
      sales: 840,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p8",
      name: "茴香鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 12.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "精选小茴香嫩苗，散发特有清芬香气，与鲜猪肉黄金配比，地道特色老味。",
      tags: ["特色风味", "香气独特"],
      status: "available",
      sales: 650,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p9",
      name: "虾仁鲜肉饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 17.8,
      priceRaw: 16.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "每只饺子包入整颗大虾仁与冷鲜猪肉，0添加防腐剂，Q弹鲜甜，肉馅紧致饱满。",
      tags: ["整颗大虾仁", "0添加防腐剂", "豪华鲜品"],
      status: "available",
      sales: 1420,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },
    {
      id: "p10",
      name: "羊肉大葱饺子",
      category: "jiaozi_cooked",
      supportRaw: true,
      priceCooked: 17.8,
      priceRaw: 16.8,
      unitCooked: "份",
      unitRaw: "斤",
      desc: "严选优质嫩羊肉，佐以香浓大葱去膻提鲜，暖胃滋补，汤汁醇厚浓郁。",
      tags: ["滋补暖胃", "醇厚鲜香"],
      status: "available",
      sales: 610,
      options: {
        spiciness: ["不辣", "微辣", "香辣"],
        condiments: ["正常葱花香菜", "免葱免香菜", "只要葱花", "只要香菜"]
      }
    },

    // 福袋馄饨类 - 5款
    {
      id: "p11",
      name: "纯鲜肉馄饨",
      category: "wonton",
      supportRaw: false,
      priceCooked: 11.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "份",
      desc: "传统福袋包法，大颗饱满纯肉馅，慢熬骨汤打底，配虾皮、紫菜与香葱碎。",
      tags: ["大颗福袋", "浓郁骨汤"],
      status: "available",
      sales: 870,
      options: {
        spiciness: ["清汤原味", "微辣红油", "香辣红油"],
        condiments: ["经典紫菜虾皮葱花", "免葱花", "免香菜", "多加紫菜虾皮"]
      }
    },
    {
      id: "p12",
      name: "玉米鲜肉馄饨",
      category: "wonton",
      supportRaw: false,
      priceCooked: 11.8,
      priceRaw: 11.8,
      unitCooked: "份",
      unitRaw: "份",
      desc: "薄皮大馅，香甜玉米粒与鲜嫩肉馅交织，入口清甜爽滑，暖胃舒心。",
      tags: ["香甜滑嫩", "清甜回甘"],
      status: "available",
      sales: 920,
      options: {
        spiciness: ["清汤原味", "微辣红油", "香辣红油"],
        condiments: ["经典紫菜虾皮葱花", "免葱花", "免香菜", "多加紫菜虾皮"]
      }
    },
    {
      id: "p13",
      name: "马蹄鲜肉馄饨",
      category: "wonton",
      supportRaw: false,
      priceCooked: 12.8,
      priceRaw: 12.8,
      unitCooked: "份",
      unitRaw: "份",
      desc: "新鲜荸荠（马蹄）切碎入馅，清甜爽脆，肉质细嫩，口感层次丰富解油腻。",
      tags: ["马蹄爽脆", "清润解腻"],
      status: "available",
      sales: 740,
      options: {
        spiciness: ["清汤原味", "微辣红油", "香辣红油"],
        condiments: ["经典紫菜虾皮葱花", "免葱花", "免香菜", "多加紫菜虾皮"]
      }
    },
    {
      id: "p14",
      name: "皮蛋鲜肉馄饨",
      category: "wonton",
      supportRaw: false,
      priceCooked: 12.8,
      priceRaw: 12.8,
      unitCooked: "份",
      unitRaw: "份",
      desc: "特色溏心松花皮蛋切丁融于鲜肉中，鲜醇甘香，骨汤提味，风味独特。",
      tags: ["溏心皮蛋", "鲜醇回味"],
      status: "available",
      sales: 580,
      options: {
        spiciness: ["清汤原味", "微辣红油", "香辣红油"],
        condiments: ["经典紫菜虾皮葱花", "免葱花", "免香菜", "多加紫菜虾皮"]
      }
    },
    {
      id: "p15",
      name: "虾仁鲜肉馄饨",
      category: "wonton",
      supportRaw: false,
      priceCooked: 13.8,
      priceRaw: 13.8,
      unitCooked: "份",
      unitRaw: "份",
      desc: "选用原只优质大青虾仁与精细鲜猪肉，每颗馄饨均有弹牙虾肉，鲜美多汁。",
      tags: ["原只大虾", "鲜美弹牙", "招牌福袋"],
      status: "available",
      sales: 1100,
      options: {
        spiciness: ["清汤原味", "微辣红油", "香辣红油"],
        condiments: ["经典紫菜虾皮葱花", "免葱花", "免香菜", "多加紫菜虾皮"]
      }
    }
  ];

  global.INITIAL_STORE_INFO = INITIAL_STORE_INFO;
  global.INITIAL_CATEGORIES = INITIAL_CATEGORIES;
  global.INITIAL_PRODUCTS = INITIAL_PRODUCTS;
  global.RAW_SELL_CONFIG = RAW_SELL_CONFIG;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { INITIAL_STORE_INFO, INITIAL_CATEGORIES, INITIAL_PRODUCTS, RAW_SELL_CONFIG };
  }
})(typeof window !== "undefined" ? window : globalThis);
