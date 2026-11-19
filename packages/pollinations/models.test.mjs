// packages/pollinations/models.test.mjs
// 版本：0.1.0  日期：2026-11-17
// 纯数据测试，不访问网络。

import { describe, expect, test } from "bun:test"
import { SEED_MODELS, configModels, runtimeModels } from "./models.mjs"

const CHAT = "/v1/chat/completions"
const BASE_URL = "https://gen.pollinations.ai/v1"
const PROVIDER = "pollinations"

const nano = {
  name: "openai/gpt-5.4-nano",
  aliases: ["gpt-5.4-nano", "openai"],
  category: "text",
  publisher: "OpenAI",
  community: false,
  pricing: {
    currency: "pollen",
    promptTextTokens: "0.00000015",
    promptCachedTokens: "0.000000015",
    completionTextTokens: "0.0000009375",
  },
  title: "GPT-5.4 Nano",
  description: "Fast, affordable all-rounder",
  input_modalities: ["text", "image"],
  output_modalities: ["text"],
  supported_endpoints: [CHAT, "/text", "/v1/responses", "/v1/messages"],
  capabilities: ["tool_calling", "reasoning"],
  supported_parameters: ["max_tokens", "stream", "tools", "reasoning_effort"],
  tools: true,
  reasoning: true,
  context_length: 400000,
  max_completion_tokens: 32000,
  paid_only: false,
  health: { status: "healthy", success_rate: 99.96 },
}

const imageModel = {
  name: "black-forest-labs/flux-pro",
  category: "image",
  title: "FLUX Pro",
  pricing: { promptTextTokens: "0.0001", completionTextTokens: "0.0002" },
  input_modalities: ["text"],
  output_modalities: ["image"],
  supported_endpoints: [CHAT],
  context_length: 1000,
}

const noPricingModel = {
  name: "acme/free-chat",
  category: "text",
  supported_endpoints: [CHAT],
  input_modalities: ["text"],
  output_modalities: ["text"],
  context_length: 8000,
}

const chatlessModel = {
  name: "acme/embeddings",
  category: "text",
  supported_endpoints: ["/v1/embeddings"],
  context_length: 8192,
}

const catalog = [nano, imageModel, noPricingModel, chatlessModel]

describe("configModels", () => {
  test("保留完整 ID 中的斜杠", () => {
    const models = configModels(catalog)
    expect(Object.keys(models)).toContain("openai/gpt-5.4-nano")
    expect(models["openai/gpt-5.4-nano"]).toBeDefined()
    expect(models["gpt-5.4-nano"]).toBeUndefined()
  })

  test("cost 换算正确：每 token 乘 1e6 变每百万 token", () => {
    const row = configModels(catalog)["openai/gpt-5.4-nano"]
    expect(row.cost.input).toBe(0.15)
    expect(row.cost.output).toBe(0.9375)
    expect(row.cost.cache.read).toBe(0.015)
    expect(row.cost.cache_read).toBe(0.015)
    expect(row.cost.cache.write).toBe(0)
  })

  test("过滤 image 类模型与不支持 chat 端点的模型", () => {
    const models = configModels(catalog)
    expect(Object.keys(models)).toHaveLength(2)
    expect(models["black-forest-labs/flux-pro"]).toBeUndefined()
    expect(models["acme/embeddings"]).toBeUndefined()
  })

  test("limit、modalities、reasoning、tool_call、free 映射正确", () => {
    const row = configModels(catalog)["openai/gpt-5.4-nano"]
    expect(row.name).toBe("GPT-5.4 Nano")
    expect(row.limit).toEqual({ context: 400000, output: 32000 })
    expect(row.modalities.input).toEqual(["text", "image"])
    expect(row.modalities.output).toEqual(["text"])
    expect(row.reasoning).toBe(true)
    expect(row.tool_call).toBe(true)
    expect(row.free).toBe(true)
  })

  test("缺失 max_completion_tokens 时 output 回退到 context 的四分之一", () => {
    const row = configModels(catalog)["acme/free-chat"]
    expect(row.limit).toEqual({ context: 8000, output: 2000 })
  })

  test("pricing 缺失或为 null 时不抛错且 cost 字段为 0", () => {
    expect(() => configModels(catalog)).not.toThrow()
    const withNull = configModels([{ ...nano, pricing: null }])
    for (const row of [configModels(catalog)["acme/free-chat"], withNull["openai/gpt-5.4-nano"]]) {
      expect(row.cost.input).toBe(0)
      expect(row.cost.output).toBe(0)
      expect(row.cost.cache.read).toBe(0)
      expect(row.cost.cache.write).toBe(0)
    }
  })

  test("非数字字符串按 0 处理", () => {
    const bad = { ...nano, pricing: { promptTextTokens: "abc", completionTextTokens: "N/A", promptCachedTokens: undefined } }
    const row = configModels([bad])["openai/gpt-5.4-nano"]
    expect(row.cost.input).toBe(0)
    expect(row.cost.output).toBe(0)
    expect(row.cost.cache.read).toBe(0)
  })

  test("paid_only 不确定时 free 为 false", () => {
    expect(configModels([{ ...nano, paid_only: true }])["openai/gpt-5.4-nano"].free).toBe(false)
    expect(configModels([{ ...nano, paid_only: undefined }])["openai/gpt-5.4-nano"].free).toBe(false)
  })

  test("非数组输入返回空对象", () => {
    expect(configModels(null)).toEqual({})
    expect(configModels(undefined)).toEqual({})
  })
})

describe("runtimeModels", () => {
  test("保留完整 ID，api.npm 为 @ai-sdk/openai-compatible", () => {
    const models = runtimeModels(catalog, PROVIDER, BASE_URL)
    const row = models["openai/gpt-5.4-nano"]
    expect(row.id).toBe("openai/gpt-5.4-nano")
    expect(row.providerID).toBe(PROVIDER)
    expect(row.api).toEqual({ id: "openai/gpt-5.4-nano", url: BASE_URL, npm: "@ai-sdk/openai-compatible" })
    expect(row.status).toBe("active")
    expect(row.variants).toEqual({})
  })

  test("capabilities 按 modalities 与 tools/reasoning 映射", () => {
    const row = runtimeModels(catalog, PROVIDER, BASE_URL)["openai/gpt-5.4-nano"]
    expect(row.capabilities.temperature).toBe(true)
    expect(row.capabilities.reasoning).toBe(true)
    expect(row.capabilities.toolcall).toBe(true)
    expect(row.capabilities.interleaved).toBe(false)
    expect(row.capabilities.attachment).toBe(false)
    expect(row.capabilities.input.text).toBe(true)
    expect(row.capabilities.input.image).toBe(true)
    expect(row.capabilities.input.audio).toBe(false)
    expect(row.capabilities.output.text).toBe(true)
    expect(row.capabilities.output.image).toBe(false)
  })

  test("运行时行同样过滤 image 类模型", () => {
    const models = runtimeModels(catalog, PROVIDER, BASE_URL)
    expect(Object.keys(models)).toHaveLength(2)
    expect(models["black-forest-labs/flux-pro"]).toBeUndefined()
  })

  test("运行时 cost/limit/free 与 config 一致，缺失 pricing 不抛错", () => {
    const models = runtimeModels(catalog, PROVIDER, BASE_URL)
    expect(() => runtimeModels(catalog, PROVIDER, BASE_URL)).not.toThrow()
    expect(models["openai/gpt-5.4-nano"].cost.input).toBe(0.15)
    expect(models["openai/gpt-5.4-nano"].limit).toEqual({ context: 400000, output: 32000 })
    expect(models["openai/gpt-5.4-nano"].free).toBe(true)
    expect(models["acme/free-chat"].cost.input).toBe(0)
    expect(models["acme/free-chat"].free).toBe(false)
  })
})

describe("SEED_MODELS", () => {
  test("至少含一个 text 模型且键为完整 ID", () => {
    expect(Object.keys(SEED_MODELS)).toContain("openai/gpt-5.4-nano")
    expect(SEED_MODELS["openai/gpt-5.4-nano"].limit.context).toBeGreaterThan(0)
  })
})
