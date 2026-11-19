// packages/pollinations/api.test.mjs
// 版本：0.1.0
// 日期：2026-11-17
// 所有请求用注入的 mock fetchImpl 拦截，禁止访问真实网络。

import { describe, it, expect } from "bun:test";
import {
  GEN,
  ENTER,
  PollinationsError,
  apiGet,
  fetchModels,
  fetchBalance,
  fetchUsage,
  fetchKeyInfo,
} from "./api.mjs";

const KEY = "sk_test_secret_abcdef0123456789";

/** 构造伪造的 fetch：捕获 url 与 init，返回伪造的 Response。 */
function mockFetch(body, { status = 200, headers = { "content-type": "application/json" } } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers });
  };
  impl.calls = calls;
  return impl;
}

describe("GEN / ENTER 常量", () => {
  it("指向官方白名单主机", () => {
    expect(GEN).toBe("https://gen.pollinations.ai");
    expect(ENTER).toBe("https://enter.pollinations.ai");
  });
});

describe("fetchXxx 成功路径", () => {
  it("fetchModels 请求 GEN /models，公开接口不带 Authorization", async () => {
    const catalog = [{ id: "openai/gpt", category: "text" }];
    const fetchImpl = mockFetch(catalog);
    const data = await fetchModels({ fetchImpl });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0].url).toBe(`${GEN}/models`);
    expect(fetchImpl.calls[0].init.method).toBe("GET");
    expect(fetchImpl.calls[0].init.headers.Authorization).toBeUndefined();
    expect(data).toEqual(catalog);
  });

  it("fetchBalance 请求 GEN /account/balance 并带 Bearer", async () => {
    const payload = { balance: 12.5, accountBalance: { total: 12.5, tier: 2, paid: 10.5 } };
    const fetchImpl = mockFetch(payload);
    const data = await fetchBalance(KEY, { fetchImpl });
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0].url).toBe(`${GEN}/account/balance`);
    expect(fetchImpl.calls[0].init.method).toBe("GET");
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(data).toEqual(payload);
  });

  it("fetchUsage 把 limit 与 before 映射为查询参数", async () => {
    const payload = { usage: [{ id: "e1" }], count: 1 };
    const fetchImpl = mockFetch(payload);
    const data = await fetchUsage(KEY, { limit: 50, before: "evt_123", fetchImpl });
    const url = new URL(fetchImpl.calls[0].url);
    expect(url.origin).toBe(GEN);
    expect(url.pathname).toBe("/account/usage");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("before_event_id")).toBe("evt_123");
    expect(fetchImpl.calls[0].init.method).toBe("GET");
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(data).toEqual(payload);
  });

  it("fetchUsage 默认 limit=100 且不带 before_event_id", async () => {
    const fetchImpl = mockFetch({ usage: [] });
    await fetchUsage(KEY, { fetchImpl });
    const url = new URL(fetchImpl.calls[0].url);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("before_event_id")).toBe(false);
  });

  it("fetchKeyInfo 请求 GEN /account/key 并带 Bearer", async () => {
    const payload = { valid: true, type: "secret", permissions: ["read"], budget: 5 };
    const fetchImpl = mockFetch(payload);
    const data = await fetchKeyInfo(KEY, { fetchImpl });
    expect(fetchImpl.calls[0].url).toBe(`${GEN}/account/key`);
    expect(fetchImpl.calls[0].init.method).toBe("GET");
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(data).toEqual(payload);
  });
});

describe("密钥与路径安全", () => {
  it("密钥只出现在 Authorization 头，不出现在 URL", async () => {
    const fetchImpl = mockFetch({ balance: 1 });
    await fetchBalance(KEY, { fetchImpl });
    expect(fetchImpl.calls[0].url.includes(KEY)).toBe(false);
    expect(fetchImpl.calls[0].url.includes("key=")).toBe(false);
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("拒绝绝对 URL、双斜杠、无前导斜杠等非法 path，且不发起请求", async () => {
    const fetchImpl = mockFetch({});
    const invalidPaths = [
      "https://evil.example/account/balance",
      "//evil.example/x",
      "account/balance",
      "/account//balance",
    ];
    for (const path of invalidPaths) {
      let thrown;
      try {
        await apiGet(path, { key: KEY, fetchImpl });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(PollinationsError);
      expect(thrown.code).toBe("invalid_path");
    }
    expect(fetchImpl.calls).toHaveLength(0);
  });
});

describe("apiGet 错误处理", () => {
  it("网络错误抛出 PollinationsError('network_error')，消息不含密钥", async () => {
    const fetchImpl = async () => {
      throw new Error("socket closed");
    };
    let thrown;
    try {
      await apiGet("/account/balance", { key: KEY, fetchImpl });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PollinationsError);
    expect(thrown.code).toBe("network_error");
    expect(thrown.signIn).toBe("kept");
    expect(thrown.message.includes(KEY)).toBe(false);
  });

  it("401/403 不抛错，error 带 signIn:'expired'", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = mockFetch({ message: "denied" }, { status });
      const result = await apiGet("/account/balance", { key: KEY, fetchImpl });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(status);
      expect(result.error).toBeInstanceOf(PollinationsError);
      expect(result.error.signIn).toBe("expired");
      expect(result.error.message.includes(KEY)).toBe(false);
    }
  });

  it("非 2xx 不抛错，除 401/403 外 error 的 signIn 为 kept", async () => {
    const fetchImpl = mockFetch({ message: "boom" }, { status: 500 });
    const result = await apiGet("/models", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error.signIn).toBe("kept");
  });

  it("JSON 解析失败时 data 为原始文本", async () => {
    const fetchImpl = mockFetch("not-json");
    const result = await apiGet("/models", { fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.data).toBe("not-json");
    expect(result.headers.get("content-type")).toContain("application/json");
  });

  it("透传 signal 并与超时 signal 合并", async () => {
    const controller = new AbortController();
    const fetchImpl = mockFetch({ ok: true });
    const result = await apiGet("/models", { signal: controller.signal, fetchImpl });
    expect(result.ok).toBe(true);
    const passed = fetchImpl.calls[0].init.signal;
    expect(passed).toBeInstanceOf(AbortSignal);
    expect(passed).not.toBe(controller.signal);
    controller.abort(new Error("caller aborted"));
    await Promise.resolve();
    expect(passed.aborted).toBe(true);
  });

  it("轮询封装在 401 时返回的数据上保留不可枚举的 error 提示", async () => {
    const fetchImpl = mockFetch({ message: "expired" }, { status: 401 });
    const data = await fetchBalance(KEY, { fetchImpl });
    expect(data.error).toBeInstanceOf(PollinationsError);
    expect(data.error.signIn).toBe("expired");
    expect(JSON.stringify(data).includes("error")).toBe(false);
  });
});
