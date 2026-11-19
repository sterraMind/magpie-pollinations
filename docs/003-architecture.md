# magpie-pollination 项目架构与接口契约

版本：0.1.0
日期：2026-11-17
状态：开发中

## 目标

把 Pollinations（https://gen.pollinations.ai）接入 Magpie 作为 provider 插件，支持：

1. 密钥登录（sk_ 手动粘贴）+ 设备码登录（pk_ 发起，换取 sk_）
2. 动态发现 OpenAI 兼容的 text 模型（保留 `publisher/model` 形式的 ID）
3. 余额看板（Pollen 余额、Quest Pollen、已购 Pollen）
4. 任务（Quest）状态读取（只读）；不实现自动签到——上游无每日签到赠送、quest 领取只能在网页端，详见 005 测试报告第九节
5. 用量读取（账号用量 + 密钥用量），供 Magpie 的 quota 与路由使用

## 目录结构

```
magpie-pollination/
├── AGENTS.md                     项目规范
├── MEMORY.md                     项目记忆
├── docs/
│   ├── 001-api-contract.md       Pollinations HTTP API 契约（子代理产出）
│   ├── 002-auth-flow.md          登录与授权流程（子代理产出）
│   ├── 003-architecture.md       本文件
│   ├── 004-publishing.md         发布流程与权限（子代理产出）
│   └── 005-test-report.md        验收报告（子代理产出）
└── packages/
    └── pollinations/
        ├── package.json
        ├── index.mjs             主插件（集成者写）
        ├── api.mjs               HTTP 客户端（子代理写）
        ├── models.mjs            模型目录转换（子代理写）
        ├── usage.mjs             余额/任务/用量映射（子代理写）
        ├── opencode.mjs          OpenCode 1.x 重导出
        ├── opencode2.mjs         OpenCode 2.x 适配器（从社区仓库复制）
        ├── README.md
        ├── LICENSE
        ├── api.test.mjs          HTTP 客户端测试（子代理写）
        ├── models.test.mjs       模型转换测试（子代理写）
        ├── usage.test.mjs        用量映射测试（子代理写）
        └── index.test.mjs        主插件测试（集成者写）
```

## 模块边界与导出接口

各模块只依赖 `node:` 内置模块和 `fetch`，不引入第三方运行时依赖。这样插件在 Magpie 的 Bun 宿主和 Node 测试环境都能运行。

### api.mjs（HTTP 客户端）

```js
export const GEN = "https://gen.pollinations.ai"
export const ENTER = "https://enter.pollinations.ai"

export class PollinationsError extends Error {
  constructor(code, { status = 0, signIn = "kept" } = {})
  // code: 稳定的机器可读错误码，例如 "unauthorized" / "forbidden" / "rate_limited" / "network_error" / "invalid_response"
  // signIn: "expired" 表示必须重新登录；"kept" 表示凭据保留、稍后重试
}

export async function apiGet(path, { key, signal, timeout = 15000, fetchImpl = fetch } = {})
// 返回 { status, ok, data, headers }；data 为解析后的 JSON；非 2xx 不抛错，交给调用方判断
// key 以 Authorization: Bearer 发送；不把 key 放进 URL 查询参数
// 仅允许 path 以 "/" 开头且不含 "//"，拒绝任何绝对 URL，避免把密钥送到别的域名
// fetchImpl 用于测试注入，默认用全局 fetch。所有 fetchXxx 函数都接受并透传 fetchImpl。

export async function fetchModels({ key, signal, fetchImpl = fetch } = {})
// GET /models（公开，无需 key）；带 key 时也走同一路径
// 返回原始目录数组

export async function fetchBalance(key, { signal, fetchImpl = fetch } = {})
// GET /account/balance；返回 { balance, accountBalance?: {total,tier,paid,heldTier?,questPollenRestricted?} }

export async function fetchQuests(key, { signal, fetchImpl = fetch } = {})
// GET /account/quests；返回 { quests: [...] }

export async function fetchUsage(key, { signal, limit = 100, before, fetchImpl = fetch } = {})
// GET /account/usage?limit=...&before_event_id=...；返回 { usage: [...], count? }

export async function fetchKeyInfo(key, { signal, fetchImpl = fetch } = {})
// GET /account/key；返回 key 的 valid/type/permissions/预算信息
```

### models.mjs（模型目录转换）

```js
export const SEED_MODELS
// 静态种子表，接口不可用时的兜底。至少含一个 text 模型。
// 键为 vendor/model 形式的完整 ID，不截断斜杠。

export function configModels(catalog)
// catalog: /models 返回的数组
// 返回 Magpie config() 用的表：{ [id]: { name, limit:{context,output}, modalities:{input,output}, cost:{input,output,cache_read}, reasoning, tool_call, free } }
// 只保留 category === "text" 且 supported_endpoints 含 "/v1/chat/completions" 的模型

export function runtimeModels(catalog, provider, baseURL)
// 返回 Magpie provider.models 钩子用的运行时行：{ [id]: { id, providerID, name, api:{id,url,npm}, status:"active", headers:{}, options:{}, cost, limit, capabilities, variants:{}, free } }
// npm 固定为 "@ai-sdk/openai-compatible"
// ID 中的斜杠必须原样保留
```

`cost` 换算：上游 `pricing` 字段是字符串，单位是每 token 的 Pollen 数量（`promptTextTokens`、`promptCachedTokens`、`completionTextTokens`）。Magpie 的 `cost` 用每百万 token 的数额，所以转换时乘以 1e6，并保留数值精度。上游没有缓存写入价格时填 0。

`limit` 换算：`context_length` → `context`；`max_completion_tokens` → `output`，缺失时回退到 `context_length` 的四分之一。

### usage.mjs（余额与用量映射）

```js
export function usageFrom({ balance, profile })
// 返回 Magpie auth.usage 契约对象：
// {
//   plan: "Pollinations",
//   user?: string,
//   windows: [
//     { name:"Pollen · total", balance: number, unit:"Pollen", display:"... Pollen" },
//     { name:"Pollen · Quest", balance: number, unit:"Pollen", aside:true, display:"..." },
//     { name:"Pollen · paid",  balance: number, unit:"Pollen", aside:true, display:"..." }
//   ],
//   error?: string,
//   signIn: "kept" | "expired"
// }
// balance.accountBalance 不存在时，只返回 total 窗口，其余省略
// Quest 窗口的余额取 accountBalance.tier；paid 窗口取 accountBalance.paid
// accountBalance.total 是两者之和，不要用上游的顶层 balance 覆盖它（顶层 balance 可能是密钥预算）
```

### index.mjs（主插件，集成者负责）

```js
export const PollinationsPlugin = async ({ client } = {}) => ({
  async config(cfg) { /* 填 cfg.provider.pollinations */ },
  auth: {
    provider: "pollinations",
    methods: [
      { type:"api", label:"Secret key (sk_)", placeholder:"sk-...", prompts:[...] },
      { type:"oauth", label:"Device code (recommended)", authorize: ... }
    ],
    loader: async (getAuth) => ({ baseURL: GEN + "/v1", apiKey: "..." , fetch: ... }),
    usage: async (getAuth) => ...,
    calls: async (getAuth, provider, {since, signal}) => ...,
  },
  provider: {
    id: "pollinations",
    async models(provider, {auth}) { ... }
  }
})
```

关键约束（来自 Magpie 宿主）：

- `auth.loader` 返回值只能有 `baseURL`、`apiKey`、`headers`、`fetch` 四个字段。
- `authorize()` 必须返回 `{ url, instructions, method:"code"|"auto", opened?, callback }`；`callback(code)` 必须返回 `{ type:"success", access, refresh, expires, accountId? }` 或 `{ type:"failed", error }`。
- `provider.models` 钩子存在的条件是 `hooks.provider.id === auth.provider`。
- 模型 ID 含斜杠时，Magpie 会把它当命名空间处理；参考 `packages/nous` 的做法，运行时行的 `api.id` 保留完整 ID。

## 测试约定

- 测试框架：`bun test`
- 被测模块必须通过依赖注入接受 `fetch`，禁止在测试里访问真实网络。
- `api.mjs` 的每个导出函数都要有一个成功路径和一个失败路径的测试。
- `models.mjs` 的测试要断言 ID 中的斜杠被保留，且缓存价格按 1e6 换算。
- `usage.mjs` 的测试要断言余额窗口换算正确（total 取 `accountBalance.total`，Quest/paid 分别取 `tier`/`paid`）。

## 发布约束

当前账号没有 `magpie-community/plugins` 的推送权限，npm 也没有登录。所以发布分为两步：

1. 在本仓库完成开发、测试、验收，产出可直接复制到 `packages/pollinations/` 的完整包。
2. 由有权限的维护者执行发布（fork 后开 PR，或本地推送）。具体步骤见 `docs/004-publishing.md`。

发布前必须通过社区仓库的校验：

- `bun scripts/check.mjs`（在社区仓库根目录运行，指向本包）
- `opencode2.mjs` 与社区仓库的 `scripts/opencode2.mjs` 字节一致
- `registry.json` 增加条目，且不与已有 provider 冲突
