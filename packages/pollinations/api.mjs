// packages/pollinations/api.mjs
// 版本：0.1.0
// 日期：2026-11-17
// HTTP 客户端：仅依赖 node: 内置能力与全局 fetch，不引入第三方运行时依赖。

export const GEN = "https://gen.pollinations.ai";
export const ENTER = "https://enter.pollinations.ai";

const ALLOWED_ORIGINS = new Set([GEN, ENTER]);

/**
 * 稳定的机器可读错误。
 * code: "unauthorized" | "forbidden" | "rate_limited" | "network_error" | "invalid_response" | "invalid_path"
 * signIn: "expired" 表示必须重新登录；"kept" 表示凭据保留、稍后重试。
 * 错误消息只用 code，绝不拼接密钥。
 */
export class PollinationsError extends Error {
  constructor(code, { status = 0, signIn = "kept" } = {}) {
    super(code);
    this.name = "PollinationsError";
    this.code = code;
    this.status = status;
    this.signIn = signIn;
  }
}

/** 校验 path 只允许站内相对路径，避免把密钥送到别的域名。 */
function assertSafePath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.includes("//") ||
    path.includes("\\") ||
    // 控制字符可能干扰 URL 解析，一并拒绝。
    /[\u0000-\u001F\u007F]/.test(path)
  ) {
    throw new PollinationsError("invalid_path");
  }
}

/** 所有 GET 接口都走 GEN；构建 URL 只使用白名单主机，绝不引入外部域名。 */
function buildUrl(path) {
  assertSafePath(path);
  const base = GEN;
  let url;
  try {
    url = new URL(base + path);
  } catch {
    throw new PollinationsError("invalid_path");
  }
  if (!ALLOWED_ORIGINS.has(url.origin)) {
    throw new PollinationsError("invalid_path");
  }
  return url.toString();
}

/** 合并调用方 signal 与超时 signal；任一触发都会中止请求。 */
function combineSignals(signal, timeout) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  // 兼容未实现 AbortSignal.any 的运行时。
  const controller = new AbortController();
  const abort = (reason) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  for (const candidate of [signal, timeoutSignal]) {
    if (candidate.aborted) abort(candidate.reason);
    else candidate.addEventListener("abort", () => abort(candidate.reason), { once: true });
  }
  return controller.signal;
}

/**
 * 发起 GET 请求。
 * 返回 { status, ok, data, headers }；data 为解析后的 JSON，解析失败则是原始文本。
 * 非 2xx 不抛错，交给调用方判断；401/403 时在 error 字段给出 signIn:"expired"。
 * 只有网络错误才抛 PollinationsError("network_error")。
 */
export async function apiGet(path, { key, signal, timeout = 15000, fetchImpl = fetch } = {}) {
  const url = buildUrl(path);
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: combineSignals(signal, timeout),
    });
  } catch {
    throw new PollinationsError("network_error", { signIn: "kept" });
  }

  const status = response.status;
  const ok = response.ok;

  let raw = "";
  try {
    raw = await response.text();
  } catch {
    raw = "";
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  let error;
  if (!ok) {
    const expired = status === 401 || status === 403;
    const code = status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "invalid_response";
    error = new PollinationsError(code, { status, signIn: expired ? "expired" : "kept" });
  }

  return {
    status,
    ok,
    data,
    headers: response.headers,
    ...(error ? { error } : {}),
  };
}

/** 薄封装统一返回解析后的 data；非 2xx 时把 error 以不可枚举属性带上，便于上游读取 signIn。 */
function unwrap(result) {
  const { data, error } = result;
  if (error && data !== null && typeof data === "object") {
    try {
      Object.defineProperty(data, "error", { value: error, enumerable: false, configurable: true });
    } catch {
      // data 可能是冻结对象；此时忽略，调用方仍可通过 apiGet 直接拿到 error。
    }
  }
  return data;
}

/** GET /models（公开）；带 key 时也走同一路径。返回原始目录数组。 */
export async function fetchModels({ key, signal, fetchImpl = fetch } = {}) {
  return unwrap(await apiGet("/models", { key, signal, fetchImpl }));
}

/** GET /account/balance；返回 { balance, accountBalance? }。 */
export async function fetchBalance(key, { signal, fetchImpl = fetch } = {}) {
  return unwrap(await apiGet("/account/balance", { key, signal, fetchImpl }));
}

/** GET /account/usage?limit=...&before_event_id=...；返回 { usage: [...], count? }。 */
export async function fetchUsage(key, { signal, limit = 100, before, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (before !== undefined && before !== null && before !== "") {
    params.set("before_event_id", String(before));
  }
  return unwrap(await apiGet(`/account/usage?${params.toString()}`, { key, signal, fetchImpl }));
}

/** GET /account/key；返回 key 的 valid/type/permissions/预算信息。 */
export async function fetchKeyInfo(key, { signal, fetchImpl = fetch } = {}) {
  return unwrap(await apiGet("/account/key", { key, signal, fetchImpl }));
}
