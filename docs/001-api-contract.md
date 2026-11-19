# Pollinations HTTP API 契约

版本：0.1.0  
日期：2026-11-17

## 来源与标注约定

- 主要依据：官方 OpenAPI 文档 <https://gen.pollinations.ai/openapi.json>，协议 OpenAPI 3.1.0，文档版本 0.3.0，共 88 个 path，文件 762894 字节，2026-11-17 获取。
- 实测依据：2026-11-17 用 Node `fetch` 经本机代理调用公开端点，以及用无密钥请求调用账户端点取得真实 401 响应体。
- 标注含义：
  - 【OpenAPI 已确认】：OpenAPI 原文明确写出。
  - 【实测已确认】：2026-11-17 实际请求返回的观察结果。
  - 【未确认】：本次没有取得证据，文档不做推断。

## 一、结论

1. **余额端点**：`GET /account/balance`。必须带 API key。带预算的密钥在顶层 `balance` 看到的是该密钥的剩余预算，不是账号总额；账号总额放在 `accountBalance` 里，且只有调用方具备 `account:usage` 权限时才返回。
2. **任务端点**：认证账号的任务状态用 `GET /account/quests`，需要 key 且需要 `account:usage` 权限；公开任务目录用 `GET /quests/catalog`，不需要 key。任务奖励列表另有 `GET /account/quests/rewards`。
3. **claim 端点**：**没有**。OpenAPI 全部 88 个 path 中，路径含 `quest` 的只有三个：`/account/quests`、`/account/quests/rewards`、`/quests/catalog`，全部是 `GET`，没有领取动作的端点。`GET /account/quests` 的描述原文写明 “Claiming rewards remains dashboard-only.”，也就是领取只能在网页完成。

## 二、认证与权限

### 2.1 认证方式

| 项目 | 结论 | 依据 |
| --- | --- | --- |
| 服务端 Bearer 头 | 全局默认认证方式。请求头写 `Authorization: Bearer <sk_...>`。 | 【OpenAPI 已确认】`components.securitySchemes.bearerAuth`：`type: http`，`scheme: bearer`，`bearerFormat: API Key`，描述为 “Secret pollinations.ai API key (sk_)”。全局 `security: [{bearerAuth: []}]`。 |
| `?key=` 查询参数 | 生成类端点支持。多个生成端点的 401 响应消息原文为 “Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.”；`/realtime`、`/v1/realtime`、`/3d/{prompt}`、`/audio/{text}` 显式声明了名为 `key` 的 query 参数。账户类端点 `/account/*` 没有声明 `key` query 参数，本次也没有用有效密钥验证，因此账户端点是否接受 `?key=` 属于【未确认】。 | 【OpenAPI 已确认】生成端点；【未确认】账户端点。 |
| `sk_` 与 `pk_` 的区别 | `sk_` 是 secret key，用于调用 API，Bearer 认证的正式凭据。`pk_` 是 publishable app key，用于 BYOP（Bring Your Own Pollen）流程，由应用交给用户去 Pollinations 授权；用户批准之后，Pollinations 返回带作用域的 `sk_` 用户密钥供 API 调用。公开文档还说明 publishable（`pk_`）密钥不能上传文件。`/account/key` 返回的 `type` 枚举为 `publishable` 或 `secret`。 | 【OpenAPI 已确认】 |

### 2.2 权限对象

`GET /account/key` 响应里的 `permissions` 对象只有两个字段，且都是必填。【OpenAPI 已确认】

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `models` | `string[]` 或 `null` | 该密钥可使用的模型类别（text、image、video、audio、3d、embedding、realtime、decision）与模型 ID；`null` 表示允许全部模型。 |
| `account` | `string[]` 或 `null` | 账户权限列表；`null` 表示没有任何账户访问权限。 |

账户使用权限在各端点描述中写作 `account:usage`，在 `permissions` 对象里体现为 `account` 数组中包含字符串 `"usage"`。OpenAPI 自带的示例是 `"permissions": {"models": null, "account": ["usage"]}`。【OpenAPI 已确认】

## 三、端点明细

### 3.1 `GET /models`

- 方法 / 路径：`GET /models`。
- 是否需要 key：不需要，公开调用。【OpenAPI 已确认】【实测已确认】带密钥调用时结果会按密钥权限过滤，并包含调用方私有的社区模型。
- 需要什么权限：无。
- 请求参数（query）：`reliability`（`reliable`|`all`，默认 `reliable`）、`source`（`official`|`community`）、`community`（`0`|`1`|`true`|`false`，旧版过滤）、`query`（大小写不敏感搜索名称、别名、标题、描述、发布者）、`category`（`text`|`image`|`audio`|`video`|`3d`|`embedding`|`realtime`|`decision`）、`capabilities`（逗号分隔，模型必须全部具备）、`agent`（`0`|`1`|`true`|`false`）、`limit`（整数 1–500）。另有同名语义的 header `pollinations-model-source` 与 `pollinations-model-reliability`。【OpenAPI 已确认】
- 响应 schema（关键字段）：顶层是数组。每项字段包括 `name`、`aliases`、`category`、`publisher`、`community`、`pricing{currency, promptTextTokens, promptCachedTokens, completionTextTokens}`、`title`、`description`、`input_modalities`、`output_modalities`、`supported_endpoints`、`capabilities[]`、`supported_parameters[]`、`tools`、`reasoning`、`context_length`、`max_completion_tokens`、`paid_only`、`health{status, success_rate, requests}`。实测还出现 `max_reference_images`、`is_specialized`、`added_date`、`pricing_adjustments`、`pricing_variants`、`per_user_rpm`、`supports_structured_output`、`voices`、`alpha`、`flat_rate`、`resolutions`、`brand_url` 等可选字段。【OpenAPI 已确认】【实测已确认】
- 真实样例（2026-11-17 实测，展示数组第一项）：

```json
{
  "name": "openai/gpt-5.4-nano",
  "aliases": ["gpt-5.4-nano", "openai"],
  "category": "text",
  "publisher": "OpenAI",
  "community": false,
  "pricing": {
    "currency": "pollen",
    "promptTextTokens": "0.00000015",
    "promptCachedTokens": "0.000000015",
    "completionTextTokens": "0.0000009375"
  },
  "title": "GPT-5.4 Nano",
  "description": "Fast, affordable all-rounder for everyday chat and image questions",
  "input_modalities": ["text", "image"],
  "output_modalities": ["text"],
  "supported_endpoints": ["/v1/chat/completions", "/text", "/text/{prompt}", "/v1/responses", "/v1/messages"],
  "max_reference_images": 10,
  "capabilities": ["tool_calling", "reasoning"],
  "supported_parameters": ["max_tokens", "max_completion_tokens", "stream", "tools", "tool_choice", "response_format", "reasoning_effort", "parallel_tool_calls", "verbosity"],
  "tools": true,
  "reasoning": true,
  "context_length": 400000,
  "is_specialized": false,
  "paid_only": false,
  "added_date": 1759795200000,
  "health": { "status": "healthy", "success_rate": 99.98949027850762, "requests": 57090 }
}
```

- 数量说明：调研任务给出的快照是 444 项、text 265 项；2026-11-17 实测为 **450 项**，类别分布为 text 278、image 79、audio 42、video 25、embedding 8、decision 8、realtime 6、3d 4。模型目录会随时间变化，实现时不要写死数量。【实测已确认】

### 3.2 `GET /v1/models`

- 方法 / 路径：`GET /v1/models`。
- 是否需要 key：不需要。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：无。
- 请求参数：与 `GET /models` 相同的 query 参数与 header 参数。【OpenAPI 已确认】
- 响应 schema（关键字段）：`{object: "list", data: [...]}`。`data` 每项包含 `id`、`object`（`model`）、`created`、`owned_by`、`aliases`、`category`、`community`、`tags`、`title`、`description`、`input_modalities`、`output_modalities`、`required_safety`、`supported_endpoints`、`paid_only`、`pricing`、`top_provider{max_completion_tokens}`、`capabilities`、`supported_parameters`、`tools`、`reasoning`、`context_length`、`max_reference_images`、`health`。【OpenAPI 已确认】【实测已确认】
- 真实样例（2026-11-17 实测，`data` 第一项，字段保留原样）：

```json
{
  "id": "openai/gpt-5.4-nano",
  "object": "model",
  "created": 1759795200,
  "owned_by": "OpenAI",
  "aliases": ["gpt-5.4-nano", "openai"],
  "category": "text",
  "community": false,
  "tags": [{ "name": "text" }],
  "title": "GPT-5.4 Nano",
  "description": "Fast, affordable all-rounder for everyday chat and image questions",
  "input_modalities": ["text", "image"],
  "output_modalities": ["text"],
  "required_safety": [],
  "supported_endpoints": ["/v1/chat/completions", "/text", "/text/{prompt}", "/v1/responses", "/v1/messages"],
  "paid_only": false,
  "pricing": { "currency": "pollen", "promptTextTokens": "0.00000015", "promptCachedTokens": "0.000000015", "completionTextTokens": "0.0000009375" },
  "top_provider": { "max_completion_tokens": null },
  "capabilities": ["tool_calling", "reasoning"],
  "supported_parameters": ["max_tokens", "max_completion_tokens", "stream", "tools", "tool_choice", "response_format", "reasoning_effort", "parallel_tool_calls", "verbosity"],
  "tools": true,
  "reasoning": true,
  "context_length": 400000,
  "max_reference_images": 10,
  "health": { "status": "healthy", "success_rate": 99.98949027850762, "requests": 57090 }
}
```

- 实测 `object` 为 `"list"`，`data` 长度 450，与 `/models` 一致。【实测已确认】

### 3.3 `POST /v1/chat/completions`

- 方法 / 路径：`POST /v1/chat/completions`。
- 是否需要 key：OpenAPI 全局声明 bearerAuth；但 2026-11-17 实测不带密钥也可以成功调用，返回 HTTP 200。OpenAPI 描述说明相同请求可能命中共享缓存，包括没有密钥的调用方。带密钥时用于计费与更高配额。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：无额外账户权限；受密钥自身的 `models` 权限约束。
- 请求参数：OpenAI Chat Completions 兼容的 JSON body，核心字段 `messages`（数组，role 支持 system、developer、user、assistant、tool）、`model`、`stream`、`tools`、`tool_choice`、`response_format`、`reasoning_effort` 等。内联媒体 data URI 时 JSON body 最大 100 MiB。【OpenAPI 已确认】
- 响应 schema（关键字段）：`choices[]`，每项含 `message{role, content, refusal, annotations}`、`finish_reason`、`index`；还有 `id`、`object`（`chat.completion`）、`created`、`model`、`usage{prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details, completion_tokens_details}`。文本流式响应在 `[DONE]` 之前会给出一个 usage chunk。【OpenAPI 已确认】
- 真实样例（2026-11-17 实测，无密钥请求，响应已按原样给出）：

```json
{
  "choices": [{
    "finish_reason": "stop",
    "index": 0,
    "message": { "annotations": [], "content": "Hi! 👋 How can I help you today?", "refusal": null, "role": "assistant" }
  }],
  "created": 1788803629,
  "id": "chatcmpl-ELXpNIB6UbOBVQ2u6a6ju4w5wqobT",
  "model": "gpt-5.4-nano-2026-03-17",
  "object": "chat.completion",
  "service_tier": "default",
  "usage": {
    "completion_tokens": 15,
    "prompt_tokens": 7,
    "total_tokens": 22,
    "prompt_tokens_details": { "audio_tokens": 0, "cached_tokens": 0 }
  }
}
```

（实测响应还包含 `content_filter_results`、`prompt_filter_results`、`routing`、`system_fingerprint`、`usage.latency_checkpoint` 等字段，此处为保持可读做了删减。）

### 3.4 `GET /account/balance`

- 方法 / 路径：`GET /account/balance`。
- 是否需要 key：需要。无密钥实测返回 401。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：带预算的密钥读取顶层 `balance` 不需要额外权限；要拿到 `accountBalance`，调用方必须是 dashboard session 或具备 `account:usage` 权限。没有预算的密钥若缺少 `account:usage`，返回 403。【OpenAPI 已确认】
- 请求参数：无。【OpenAPI 已确认】
- 响应 schema（关键字段）：
  - `balance: number`：对带预算的密钥是密钥剩余预算；对 session 与无预算密钥是账号总额（Quest Pollen 加付费 Pollen）。
  - `accountBalance?: object`：仅在调用方可查看账户使用时返回。字段为 `total`（Quest Pollen 加付费 Pollen，可在普通模型消费）、`tier`（可用 Quest Pollen，永不为负；受限时为 0）、`paid`（剩余付费 Pollen，永不为负）、`heldTier?`（锁定的 Quest Pollen，不计入 `total` 和 `tier`）、`questPollenRestricted?`（Quest Pollen 消费是否被锁定，直到发生购买或账户审核）。【OpenAPI 已确认】
- 真实样例：本调研没有有效密钥，无法给出 200 的真实响应。OpenAPI 对 200 只给了字段定义，没有自带 example，所以 200 的取值组合属于【未确认】。401 的真实响应体见第四节。

### 3.5 `GET /account/key`

- 方法 / 路径：`GET /account/key`。
- 是否需要 key：需要。无密钥实测返回 401，消息为 “API key required. This endpoint validates API keys.”。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：无额外权限，校验当前请求使用的密钥本身。
- 请求参数：无。【OpenAPI 已确认】
- 响应 schema（关键字段）：`id`、`valid`、`type`（`publishable`|`secret`）、`name`（string|null）、`expiresAt`（string|null，ISO 8601）、`expiresIn`（number|null，秒）、`permissions{models, account}`（见 2.2）、`pollenBudget`（number|null，null 表示不限额，使用用户余额）、`questPollenOnly`（boolean，是否只花 Quest Pollen）、`userId`（string|null，服务端 attest 的拥有者 id）、`byopApp`（object|null，包含 `clientKeyId`、`name`、`appUser`）。【OpenAPI 已确认】
- 真实样例：OpenAPI 自带 example（非本次实测）。【OpenAPI 已确认】

```json
{
  "valid": true,
  "type": "secret",
  "name": "my-bot",
  "expiresAt": null,
  "expiresIn": null,
  "permissions": { "models": null, "account": ["usage"] },
  "pollenBudget": null
}
```

### 3.6 `GET /account/usage`

- 方法 / 路径：`GET /account/usage`。
- 是否需要 key：需要。无密钥实测返回 401。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：API key 需要只读的 `account:usage` 权限。【OpenAPI 已确认】
- 请求参数（query，均为可选）：【OpenAPI 已确认】
  - `format`：`json`|`csv`，默认 `json`。
  - `limit`：整数 1–50000，默认 100。单次响应上限 50000 行。
  - `before`：时间戳，接受 `YYYY-MM-DD HH:mm:ss` 或 ISO 8601 date-time。
  - `before_event_id`：字符串，稳定游标。与 `before` 一起用于稳定分页。
  - `days`：整数 1–90，默认 30。
  - `granularity`：`day`|`week`|`month`。
  - `period`：字符串。
  - `timezone`：IANA 时区名，默认 UTC；请求时间戳仍为 UTC。
  - `api_key_ids`、`models`：字符串过滤条件。
- 响应 schema（关键字段）：`{usage: [...], count: number}`。每条 entry 的字段包括 `timestamp`（UTC，`YYYY-MM-DD HH:mm:ss`）、`cursor_event_id`（配合 `before_event_id` 做稳定分页）、`type`（如 `generate.image`、`generate.text`）、`model`、`api_key_id`、`api_key`、`api_key_type`（`secret`|`publishable`）、`meter_source`（`tier`=Quest Pollen，`pack`=付费余额）、`input_text_tokens`、`input_cached_tokens`、`input_cache_write_tokens`、`input_audio_tokens`、`input_audio_seconds`、`input_image_tokens`、`output_text_tokens`、`output_reasoning_tokens`、`output_audio_tokens`、`output_audio_seconds`、`output_image_tokens`、`output_video_seconds`、`cost_usd`、`response_time_ms`。以上字段全部必填。【OpenAPI 已确认】
- 真实样例：本调研没有带 `account:usage` 权限的密钥，200 响应属于【未确认】；401 真实响应体见第四节。

### 3.7 `GET /account/usage/daily`

- 方法 / 路径：`GET /account/usage/daily`。
- 是否需要 key：需要。【OpenAPI 已确认】
- 需要什么权限：使用 API key 时需要 `account:usage`。【OpenAPI 已确认】
- 请求参数（query，均为可选）：`format`（`json`|`csv`，默认 `json`）、`days`（整数 1–90，默认 90）、`granularity`（`day`|`week`|`month`）、`period`、`timezone`（IANA，默认 UTC）、`api_key_ids`。本端点没有 `limit`、`before`、`before_event_id` 参数。【OpenAPI 已确认】
- 响应 schema（关键字段）：`{usage: [...], count: number}`。每条 entry 字段为 `date`（请求时区下的日期桶，`YYYY-MM-DD`；当 `granularity=day` 时为 `YYYY-MM-DD HH:00:00`）、`api_key_id`、`api_key`、`model`、`meter_source`（`tier`|`pack`）、`requests`、`cost_usd`，全部必填。【OpenAPI 已确认】
- 真实样例：需要有效密钥，本调研未取得，属于【未确认】。

### 3.8 `GET /account/quests`

- 方法 / 路径：`GET /account/quests`。
- 是否需要 key：需要。无密钥实测返回 401。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：API key 需要只读的 `account:usage` 权限。【OpenAPI 已确认】
- 请求参数：无。【OpenAPI 已确认】
- 响应 schema（关键字段）：`{quests: [...]}`。每条 quest 字段：
  - `id`、`title`、`description`。
  - `category`：`setup`|`grow`|`build`|`contribute`|`community`|`easteregg`。
  - `state`：`available`|`completed`|`coming_soon`。全局已完成的任务和本账号已获得的任务都返回 `completed`。
  - `status`：`open`|`completed`|`coming_soon`。这是与 `state` 并列的另一个字段，调研任务给出的快照没有列出它。
  - `rewardAmount: number`、`balanceBucket`：`tier`|`pack`、`url`（string|null）。
  - `reward`: object 或 null，字段为 `id`、`questId`（string|null）、`title`、`pollenAmount`、`balanceBucket`、`earnedAt`、`claimedAt`（string|null）。【OpenAPI 已确认】
- 真实样例：需要有效密钥，200 响应属于【未确认】。401 真实响应体见第四节。描述原文明确 “Claiming rewards remains dashboard-only.”，不存在 API 领取方式。【OpenAPI 已确认】

### 3.9 `GET /quests/catalog`

- 方法 / 路径：`GET /quests/catalog`。
- 是否需要 key：不需要，OpenAPI 对该操作显式声明 `security: []`。【OpenAPI 已确认】【实测已确认】
- 需要什么权限：无。
- 请求参数：无。【OpenAPI 已确认】
- 响应 schema（关键字段）：`{quests: [...]}`。每条 quest 字段为 `id`、`title`、`description`、`category`、`state`、`rewardAmount`、`balanceBucket`、`url`（string|null），可选 `goal`（例如 `{"target": 100, "unit": "pollen"}`）。【OpenAPI 已确认】【实测已确认】
- 真实样例（2026-11-17 实测，前几项）：

```json
{
  "quests": [
    {
      "id": "first_api_key",
      "title": "Create your first API key",
      "description": "Create an API [key](/keys).",
      "category": "setup",
      "rewardAmount": 0.25,
      "balanceBucket": "tier",
      "state": "available",
      "url": null
    },
    {
      "id": "early_adopter",
      "title": "Early adopter",
      "description": "Your Pollinations account is at least nine months old.",
      "category": "grow",
      "rewardAmount": 2,
      "balanceBucket": "tier",
      "state": "coming_soon",
      "url": null
    },
    {
      "id": "top_up_100_since_launch",
      "title": "Top up 100 Pollen",
      "description": "You have [topped up](/pollen#buy-pollen) 100 Pollen or more. _(from 21/06/26)_",
      "category": "grow",
      "rewardAmount": 50,
      "balanceBucket": "tier",
      "goal": { "target": 100, "unit": "pollen" },
      "state": "available",
      "url": null
    }
  ]
}
```

- 与调研任务快照的差异：快照写 `category: "setup"`、`state: "available"`、`url` 为字符串；实测包含 `grow` 等多个 category、`coming_soon` 与 `completed` 等 state，`url` 可以是 null。实现时要按枚举和可为 null 处理。【实测已确认】

### 3.10 补充端点

以下两个端点在 OpenAPI 中存在，与插件能力相关，一并记录。【OpenAPI 已确认】

| 端点 | 说明 | key 与权限 |
| --- | --- | --- |
| `GET /account/quests/rewards` | 返回账号已获得的全部奖励，按时间从新到旧排序，含领取状态。响应 `{rewards: [...]}`，entry 字段 `id`、`questId`、`title`、`pollenAmount`、`balanceBucket`、`earnedAt`、`claimedAt`、`url`。 | 需要 key 和 `account:usage`。 |
| `GET /account/key/usage` | 返回当前密钥自己的使用记录，不需要任何 scope。参数与响应结构和 `/account/usage` 相同，但只覆盖当前密钥。 | 需要 key，不需要额外权限。账户级使用记录仍用 `/account/usage`。 |

## 四、错误响应格式

### 4.1 账户端点（`/account/*`）

OpenAPI 对这些端点的 401、403 只写了 description，没有定义响应体 schema，因此 OpenAPI 层面的 body 格式属于【未确认】。2026-11-17 实测无密钥请求得到了真实 401 响应体，格式如下。【实测已确认】

- `GET /account/balance`、`GET /account/quests`、`GET /account/key/usage` 等账户端点（无密钥或在 `Authorization` 里给一个无效 `sk_`）：

```json
{
  "success": false,
  "error": {
    "message": "A valid API key is required. Get one at https://enter.pollinations.ai/keys, or buy one with USDC (x402) at https://enter.pollinations.ai/api/x402/keys",
    "code": "UNAUTHORIZED",
    "timestamp": "2026-11-17T05:10:05.701Z"
  },
  "status": 401
}
```

- `GET /account/key`（无密钥）的 `error.message` 是 “API key required. This endpoint validates API keys.”；`GET /account/usage`（无密钥）的是 “Authentication required to view usage history”。其余字段结构相同。【实测已确认】
- 403 需要“有效但权限不足”的密钥才能触发，本调研没有这样的密钥，账户端点 403 的真实 body 属于【未确认】。OpenAPI 描述为 `Permission denied - API key missing account:usage permission`；对 `/account/balance` 的描述是 `Permission denied - API key has no budget and is missing account:usage permission`。【OpenAPI 已确认】

### 4.2 生成类端点（例如 `/v1/chat/completions`）

OpenAPI 定义了结构化错误体。【OpenAPI 已确认】

```json
{
  "status": 401,
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide an API key via Authorization header (Bearer token) or ?key= query parameter.",
    "timestamp": "...",
    "details": { "name": "...", "upstreamStatus": 0, "upstreamHost": "...", "upstreamBody": "..." },
    "requestId": "...",
    "fixUrl": "..."
  }
}
```

- 401 的 `error.code` 固定为 `UNAUTHORIZED`；403 的 `error.code` 固定为 `FORBIDDEN`，消息为 “Access denied! You don't have the required permissions for this resource or model.”。
- `error.details` 引用 `ErrorDetails` schema：`name`（必填）、`upstreamStatus`（integer）、`upstreamHost`（string）、`upstreamBody`（string，上游原始响应体，不做脱敏或截断）。
- 注意：账户端点实测返回的 body 比生成端点少 `details`、`requestId`、`fixUrl` 三个字段，解析错误时不能假定它们一定存在。

## 五、实现插件最关键的 3 条注意事项

1. **余额语义与权限门槛**：`GET /account/balance` 的顶层 `balance` 对带预算密钥只是密钥预算，不是账号总额。要展示账号总额必须读 `accountBalance`，而该对象仅在调用方有 `account:usage` 权限（在 `/account/key` 里是 `permissions.account` 包含 `"usage"`）时才出现。没有预算且没有该权限的密钥会得到 403。插件应在授权后先调 `GET /account/key` 判断 `permissions.account`，再决定展示哪一层余额。【OpenAPI 已确认】
2. **没有任务领取端点**：所有 quest 路径都是只读的 `GET`，领取只能在网页做。插件能做的最多是展示状态、显示 `rewardAmount` 与 `claimedAt`，并在用户点击时跳到 Pollinations 网页；不要实现调用 API 领取的逻辑。`GET /quests/catalog` 的 `url` 可以为 null，跳转目标需要另外准备网页地址。【OpenAPI 已确认】【实测已确认】
3. **认证与错误解析要分开处理**：密钥只放在 `Authorization: Bearer <sk_...>` 请求头，账户端点的 `?key=` 支持属于【未确认】，不要使用；`pk_` 是应用标识，不是调用 API 的凭据。错误处理要区分 401 与 403：401 表示凭据无效或缺失，需要重新登录；403 表示权限不足，需要引导用户到网页授权 `account:usage`。账户端点的错误体只有 `success`、`error{message, code, timestamp}`、`status` 四层，不要按生成端点的完整 schema 强行读取 `requestId` 或 `fixUrl`。【OpenAPI 已确认】【实测已确认】

## 六、未确认清单

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 账户端点是否接受 `?key=` 查询参数 | 未确认 | OpenAPI 没有为 `/account/*` 声明 `key` query 参数，本次没有有效密钥可测。 |
| `GET /account/balance` 200 的真实响应样例 | 未确认 | OpenAPI 只给了字段 schema，没有 example；本调研没有有效密钥。 |
| `GET /account/quests` 200 的真实响应样例 | 未确认 | 同上。 |
| `GET /account/usage` 与 `/account/usage/daily` 200 的真实响应样例 | 未确认 | 同上。 |
| 账户端点 403 的真实响应体 | 未确认 | 需要有效但缺少 `account:usage` 权限的密钥。 |
| `pk_` 密钥能否直接调用账户端点 | 未确认 | OpenAPI 只说明它用于 BYOP 应用标识，且不能上传文件。 |
