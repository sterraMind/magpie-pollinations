// packages/pollinations/models.mjs
// 版本：0.1.0  日期：2026-11-17
// 职责：把 Pollinations GET /models 的原始目录转换成 Magpie 的 config 表与运行时模型行。
// 只依赖 JavaScript 内置能力，不引入第三方运行时依赖。

const CHAT_ENDPOINT = "/v1/chat/completions"
const PROVIDER_NPM = "@ai-sdk/openai-compatible"
// 上游 pricing 的单位是「每 token 的 pollen」，Magpie cost 的单位是「每百万 token 的 pollen」。
const TOKEN_SCALE = 1e6

/** 安全地把任意值转成有限数字；NaN、Infinity、null、空字符串一律按 0 处理。 */
function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** pricing -> Magpie cost。pricing 缺失或为 null 时全部字段都是 0。 */
function toCost(pricing) {
  const p = pricing && typeof pricing === "object" ? pricing : {}
  const input = toFiniteNumber(p.promptTextTokens) * TOKEN_SCALE
  const output = toFiniteNumber(p.completionTextTokens) * TOKEN_SCALE
  const cacheRead = toFiniteNumber(p.promptCachedTokens) * TOKEN_SCALE
  // 上游没有缓存写入价格，按约定填 0。
  const cacheWrite = 0
  return {
    input,
    output,
    // 架构文档 003 写的是扁平字段 cache_read；Magpie 运行时实际读的是 cache.read / cache.write。
    // 两种形状都输出，config 与 provider.models 共用同一份 cost 结果。
    cache_read: cacheRead,
    cache_write: cacheWrite,
    cache: { read: cacheRead, write: cacheWrite },
  }
}

/** context_length -> context；max_completion_tokens -> output，缺失时回退到 context 的四分之一。
 *  Magpie 的 Go 侧 Model.limit 字段是整型（Model.models.output of type int），
 *  上游目录里 context_length 可能是偶数除不尽的情况（如 32778/4=8194.5），
 *  所以这里统一取整，避免 magpie 反序列化报 "cannot unmarshal number 8194.5 into ... int"。
 */
function toLimit(model) {
  const context = Math.round(toFiniteNumber(model.context_length))
  const raw = model.max_completion_tokens
  const output = raw === undefined || raw === null || raw === ""
    ? Math.round(context / 4)
    : Math.round(toFiniteNumber(raw))
  return { context, output }
}

function toModalities(model) {
  return {
    input: Array.isArray(model.input_modalities) ? model.input_modalities.slice() : [],
    output: Array.isArray(model.output_modalities) ? model.output_modalities.slice() : [],
  }
}

/** 只接受 category 为 text 且支持 /v1/chat/completions 的模型。 */
function isChatTextModel(model) {
  return Boolean(
    model &&
    model.category === "text" &&
    Array.isArray(model.supported_endpoints) &&
    model.supported_endpoints.includes(CHAT_ENDPOINT) &&
    typeof model.name === "string" &&
    model.name.length > 0
  )
}

function isReasoning(model) {
  return model.reasoning === true ||
    (Array.isArray(model.capabilities) && model.capabilities.includes("reasoning"))
}

function isToolCall(model) {
  return model.tools === true ||
    (Array.isArray(model.capabilities) && model.capabilities.includes("tool_calling"))
}

/**
 * paid_only 只说明上游「是否需要付费」，不等于 Magpie 面向用户的免费标记。
 * 只有明确 paid_only === false 才置 free:true；缺失、true 或非布尔值一律 free:false。
 */
function isFree(model) {
  return model.paid_only === false
}

function configRow(model) {
  return {
    name: model.title || model.name,
    limit: toLimit(model),
    modalities: toModalities(model),
    cost: toCost(model.pricing),
    reasoning: isReasoning(model),
    tool_call: isToolCall(model),
    free: isFree(model),
  }
}

/**
 * configModels(catalog)
 * catalog: GET /models 返回的原始数组。
 * 返回 Magpie config() 用的表，键保留 publisher/model 完整 ID（含斜杠）。
 */
export function configModels(catalog) {
  const out = {}
  if (!Array.isArray(catalog)) return out
  for (const model of catalog) {
    if (!isChatTextModel(model)) continue
    out[model.name] = configRow(model)
  }
  return out
}

const KNOWN_MODALITIES = [
  "text", "image", "audio", "video", "pdf", "3d", "embedding", "realtime", "decision",
]

function toCapabilityMap(list) {
  const present = Array.isArray(list) ? list.filter((x) => typeof x === "string") : []
  const map = {}
  for (const key of KNOWN_MODALITIES) map[key] = present.includes(key)
  for (const key of present) if (!(key in map)) map[key] = true
  return map
}

/**
 * runtimeModels(catalog, provider, baseURL)
 * 返回 Magpie provider.models 钩子用的运行时行，ID 中的斜杠原样保留。
 */
export function runtimeModels(catalog, provider, baseURL) {
  const out = {}
  if (!Array.isArray(catalog)) return out
  for (const model of catalog) {
    if (!isChatTextModel(model)) continue
    const id = model.name
    const modalities = toModalities(model)
    out[id] = {
      id,
      providerID: provider,
      name: model.title || model.name,
      api: { id, url: baseURL, npm: PROVIDER_NPM },
      status: "active",
      headers: {},
      options: {},
      cost: toCost(model.pricing),
      limit: toLimit(model),
      capabilities: {
        temperature: true,
        reasoning: isReasoning(model),
        toolcall: isToolCall(model),
        input: toCapabilityMap(modalities.input),
        output: toCapabilityMap(modalities.output),
        interleaved: false,
        attachment: false,
      },
      variants: {},
      free: isFree(model),
    }
  }
  return out
}

// 接口不可用时的兜底目录，形状与 configModels 的返回值一致。
const SEED_CATALOG = [
  {
    name: "openai/gpt-5.4-nano",
    title: "GPT-5.4 Nano",
    category: "text",
    publisher: "OpenAI",
    community: false,
    pricing: {
      currency: "pollen",
      promptTextTokens: "0.00000015",
      promptCachedTokens: "0.000000015",
      completionTextTokens: "0.0000009375",
    },
    description: "Fast, affordable all-rounder",
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    supported_endpoints: [CHAT_ENDPOINT, "/text", "/v1/responses", "/v1/messages"],
    capabilities: ["tool_calling", "reasoning"],
    tools: true,
    reasoning: true,
    context_length: 400000,
    max_completion_tokens: 32000,
    paid_only: false,
  },
]

export const SEED_MODELS = configModels(SEED_CATALOG)
