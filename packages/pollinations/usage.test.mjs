// usage.test.mjs — 用量映射模块的纯数据测试，不访问网络
// 版本：0.1.0  日期：2026-11-17
import { describe, it, expect } from "bun:test";
import { usageFrom } from "./usage.mjs";

describe("usageFrom", () => {
  it("accountBalance 存在时返回三个窗口，且 total 取 accountBalance.total 而非顶层 balance", () => {
    const result = usageFrom({
      balance: {
        balance: 7,
        accountBalance: { total: 6291, tier: 291, paid: 6000 },
      },
      profile: { username: "tester" },
    });

    expect(result.plan).toBe("Pollinations");
    expect(result.windows.length).toBe(3);
    expect(result.windows[0]).toMatchObject({
      name: "Pollen · total",
      balance: 6291,
      unit: "Pollen",
      display: "6,291 Pollen left",
    });
    expect(result.windows[0].balance).not.toBe(7);
    expect(result.windows[1]).toMatchObject({ name: "Pollen · Quest", balance: 291, aside: true });
    expect(result.windows[2]).toMatchObject({ name: "Pollen · paid", balance: 6000, aside: true });
    expect(result.user).toBe("tester");
    expect(result.signIn).toBe("kept");
  });

  it("accountBalance 不存在时只有一个 total 窗口，且无标识时省略 user", () => {
    const result = usageFrom({ balance: { balance: 42.5 }, profile: {} });

    expect(result.windows.length).toBe(1);
    expect(result.windows[0]).toMatchObject({
      name: "Pollen · total",
      balance: 42.5,
      unit: "Pollen",
    });
    expect("user" in result).toBe(false);
    expect("error" in result).toBe(false);
  });

  it("非有限数、负数、null 与 undefined 被过滤，不产生无效窗口", () => {
    const withAccount = usageFrom({
      balance: { balance: 100, accountBalance: { total: Infinity, tier: -1, paid: null } },
    });
    expect(withAccount.windows.length).toBe(0);

    const withNaN = usageFrom({ balance: { balance: NaN } });
    expect(withNaN.windows.length).toBe(0);

    const withUndefined = usageFrom({ balance: { balance: undefined } });
    expect(withUndefined.windows.length).toBe(0);
  });

  it("上游 error 字段产生友好文案，凭据过期时 signIn 为 expired", () => {
    const kept = usageFrom({ balance: { error: "service temporarily unavailable" } });
    expect(typeof kept.error).toBe("string");
    expect(kept.signIn).toBe("kept");

    const expired = usageFrom({ balance: { error: { code: "unauthorized" } } });
    expect(typeof expired.error).toBe("string");
    expect(expired.signIn).toBe("expired");
  });
});


