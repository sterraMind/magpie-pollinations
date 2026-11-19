// index.test.mjs — 主插件的契约测试。用 mock fetch，不访问真实网络。
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { PollinationsPlugin, ID } from "./index.mjs"

const realFetch = globalThis.fetch
let calls
let handler

beforeEach(() => {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("PollinationsPlugin", () => {
  it("exports the pollinations provider id", () => {
    expect(ID).toBe("pollinations")
  })

  it("config() fills an OpenAI-compatible provider with model seeds", async () => {
    const plugin = await PollinationsPlugin()
    const cfg = { provider: {} }
    await plugin.config(cfg)
    expect(cfg.provider[ID]).toBeDefined()
    expect(cfg.provider[ID].npm).toBe("@ai-sdk/openai-compatible")
    expect(cfg.provider[ID].api).toContain("gen.pollinations.ai/v1")
    expect(Object.keys(cfg.provider[ID].models).length).toBeGreaterThan(0)
  })

  it("config() keeps existing user model overrides", async () => {
    const plugin = await PollinationsPlugin()
    const cfg = { provider: { [ID]: { models: { "custom/model": { name: "Custom" } } } } }
    await plugin.config(cfg)
    expect(cfg.provider[ID].models["custom/model"]).toEqual({ name: "Custom" })
  })

  it("declares two sign-in methods: device code and secret key", async () => {
    const plugin = await PollinationsPlugin()
    expect(plugin.auth.provider).toBe(ID)
    expect(plugin.auth.methods.length).toBe(2)
    expect(plugin.auth.methods.find((m) => m.type === "oauth")).toBeDefined()
    expect(plugin.auth.methods.find((m) => m.type === "api" && m.placeholder?.includes("sk"))).toBeDefined()
  })

  it("loader() returns baseURL and apiKey from an api sign-in", async () => {
    const plugin = await PollinationsPlugin()
    const opts = await plugin.auth.loader(async () => ({ type: "api", key: "sk-test" }))
    expect(opts.baseURL).toContain("gen.pollinations.ai/v1")
    expect(opts.apiKey).toBe("sk-test")
  })

  it("loader() returns empty when not signed in", async () => {
    const plugin = await PollinationsPlugin()
    const opts = await plugin.auth.loader(async () => ({}))
    expect(opts).toEqual({})
  })

  it("usage() maps balance windows and never sends the key in the URL", async () => {
    handler = (url) => {
      if (url.includes("/account/balance")) {
        return json({ balance: 100, accountBalance: { total: 100, tier: 60, paid: 40 } })
      }
      return json({})
    }
    const plugin = await PollinationsPlugin()
    const result = await plugin.auth.usage(async () => ({ type: "api", key: "sk-secret-123" }))
    expect(result.plan).toBe("Pollinations")
    expect(result.windows.length).toBe(3)
    expect(result.windows[0].balance).toBe(100)
    expect(result.windows[0].name).toBe("Pollen · total")
    for (const c of calls) expect(c.url).not.toContain("sk-secret-123")
  })

  it("usage() reports expired sign-in on 401", async () => {
    handler = (url) => {
      if (url.includes("/account/balance")) return json({ error: "unauthorized" }, 401)
      return json({})
    }
    const plugin = await PollinationsPlugin()
    const result = await plugin.auth.usage(async () => ({ type: "api", key: "sk-bad" }))
    expect(result.signIn).toBe("expired")
  })

  it("provider.models() converts the live catalog and preserves slash ids", async () => {
    handler = (url) => {
      if (url.includes("/models")) {
        return json([{
          name: "openai/gpt-5.4-nano",
          category: "text",
          title: "GPT-5.4 Nano",
          pricing: { promptTextTokens: "0.00000015", completionTextTokens: "0.0000009375" },
          supported_endpoints: ["/v1/chat/completions"],
          input_modalities: ["text"],
          output_modalities: ["text"],
          context_length: 400000,
        }])
      }
      return json({})
    }
    const plugin = await PollinationsPlugin()
    const models = await plugin.provider.models({ id: ID, models: {} }, { auth: { type: "api", key: "sk-test" } })
    expect(models["openai/gpt-5.4-nano"]).toBeDefined()
    expect(models["openai/gpt-5.4-nano"].api.id).toBe("openai/gpt-5.4-nano")
  })

  it("calls() maps usage rows and filters by since", async () => {
    handler = (url) => {
      if (url.includes("/account/usage")) {
        return json({ usage: [
          { id: "e1", timestamp: "2026-11-16T10:00:00Z", model: "openai/gpt-5.4-nano", input_text_tokens: 10, output_text_tokens: 20, cost_usd: 0.01 },
          { id: "e2", timestamp: "2020-01-01T00:00:00Z", model: "old", input_text_tokens: 1, output_text_tokens: 1 },
        ] })
      }
      return json({})
    }
    const plugin = await PollinationsPlugin()
    const result = await plugin.auth.calls(async () => ({ type: "api", key: "sk-test" }), {}, { since: Date.parse("2026-01-01") })
    expect(result.calls.length).toBe(1)
    expect(result.calls[0].rid).toBe("e1")
    expect(result.calls[0].in).toBe(10)
    expect(result.calls[0].cost).toBe(0.01)
  })
})
