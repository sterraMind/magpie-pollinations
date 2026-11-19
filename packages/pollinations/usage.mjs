// usage.mjs — Pollinations 余额、任务与用量到 Magpie auth.usage 契约的映射
// 版本：0.1.0  日期：2026-11-17
// 只使用 ECMAScript 全局能力与 node: 内置模块，不引入第三方运行时依赖。

// 只接受有限、非负的 number。null / undefined / 字符串 / NaN / Infinity / 负数一律过滤。
function safeNumber(value) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

// 固定 en-US 以匹配契约示例 "6,291 Pollen left"，避免不同环境千分位不一致。
const numberFormatter = new Intl.NumberFormat("en-US");
function displayPollen(value) {
  return `${numberFormatter.format(value)} Pollen left`;
}

// profile 可能是字符串，也可能是带常见标识字段的对象。取不到标识时返回 null（调用方省略 user）。
function userFrom(profile) {
  if (typeof profile === "string") return profile.length > 0 ? profile : null;
  if (typeof profile === "number" && Number.isFinite(profile)) return String(profile);
  if (profile && typeof profile === "object") {
    for (const key of ["username", "name", "login", "email", "id", "userId", "accountId"]) {
      const value = profile[key];
      if (typeof value === "string" && value.length > 0) return value;
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
  }
  return null;
}

// 识别上游错误对象，返回友好文案与是否为凭据过期。
function errorInfoFrom(balance) {
  if (!balance || typeof balance !== "object") return { message: null, expired: false };

  let raw = null;
  if (balance instanceof Error) raw = balance.message;
  else if (balance.error) raw = balance.error;

  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw && typeof raw === "object") {
    if (typeof raw.message === "string") text = raw.message;
    else if (typeof raw.code === "string") text = raw.code;
  }

  const code = typeof balance.code === "string" ? balance.code : "";
  const signIn = balance.signIn === "expired" ? "expired" : "";
  const combined = `${text} ${code} ${signIn}`.toLowerCase();
  const expired =
    signIn === "expired" ||
    /unauthor|expire|invalid.?key|invalid.?token|401|forbidden|过期|凭据|重新登录|re-?login/.test(combined);

  return {
    message: raw != null ? "Pollinations 余额暂不可用，请稍后重试" : null,
    expired,
  };
}

/**
 * 返回 Magpie auth.usage 契约对象。
 * @param {{ balance?: object, profile?: string|object }} input
 */
export function usageFrom({ balance, profile } = {}) {
  const accountBalance =
    balance && typeof balance === "object" && balance.accountBalance && typeof balance.accountBalance === "object"
      ? balance.accountBalance
      : null;

  const windows = [];

  // 顶层余额窗口：accountBalance 存在时必须取 accountBalance.total，不能用顶层 balance 覆盖。
  const totalValue = accountBalance ? safeNumber(accountBalance.total) : safeNumber(balance && balance.balance);
  if (totalValue !== null) {
    windows.push({
      name: "Pollen · total",
      balance: totalValue,
      unit: "Pollen",
      display: displayPollen(totalValue),
    });
  }

  // accountBalance 存在时追加两个旁注窗口；单个数值无效只省略该窗口。
  if (accountBalance) {
    const tierValue = safeNumber(accountBalance.tier);
    if (tierValue !== null) {
      windows.push({
        name: "Pollen · Quest",
        balance: tierValue,
        unit: "Pollen",
        aside: true,
        display: displayPollen(tierValue),
      });
    }
    const paidValue = safeNumber(accountBalance.paid);
    if (paidValue !== null) {
      windows.push({
        name: "Pollen · paid",
        balance: paidValue,
        unit: "Pollen",
        aside: true,
        display: displayPollen(paidValue),
      });
    }
  }

  const result = { plan: "Pollinations" };
  const user = userFrom(profile);
  if (user !== null) result.user = user;
  result.windows = windows;

  const errorInfo = errorInfoFrom(balance);
  if (errorInfo.message !== null) result.error = errorInfo.message;
  result.signIn = errorInfo.expired ? "expired" : "kept";

  return result;
}
