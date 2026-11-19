# Pollinations 设备码登录流程与密钥机制

版本：0.1.0
日期：2026-11-17
状态：调研完成，供 magpie-pollination 插件实现参考
适用范围：只描述登录、授权与密钥机制，不包含生成接口与用量接口的契约

## 1. 确认状态总览

下表记录本次调研中每一项结论的来源与确认状态。

| 结论 | 来源 | 确认状态 |
| --- | --- | --- |
| `APP_CLIENT_ID = 'pk_QPDopXO7XzKugYVr'` 是 publishable app key，作为 OAuth `client_id` 使用 | opencode 插件源码 `.drafts/ref-pollinations/opencode-pollinations-plugin/src/server/commands.ts:510-513` | 已核对源码 |
| 设备码请求为 `POST https://enter.pollinations.ai/api/device/code`，请求体含 `client_id` 与 `scope` | 源码 `commands.ts:558-561`；Pollinations 官方 OpenAPI 文字说明；本次实测 | 已核对源码 + 官方文档 + 实测 |
| 轮询令牌为 `POST https://enter.pollinations.ai/api/device/token`，请求体含 `device_code` | 源码 `commands.ts:599`；Pollinations 官方 OpenAPI 文字说明 | 已核对源码 + 官方文档；未实测（需要用户在浏览器确认后才能拿到令牌） |
| `/api/device/code` 的响应字段与取值 | 本次 Node fetch 实测，HTTP 200 | 已实测 |
| `/api/device/token` 成功响应含 `access_token`（即 `sk_` 密钥）与 `token_type` | Pollinations 官方 OpenAPI 文字说明 | 官方文档记录；未实测 |
| `sk_` 用于 API 请求，`pk_` 仅用于标识应用；单独使用 `pk_` 请求 API 返回 401 | 本次 Node fetch 实测 `GET https://gen.pollinations.ai/account/key`，HTTP 401 | 已实测 |
| `enter.pollinations.ai` 没有可用的 OpenAPI 文档路径 | 本次实测 `/openapi.json`、`/api/openapi.json`、`/docs` 均返回 404 | 已实测 |
| `gen.pollinations.ai/openapi.json` 存在，并在说明文字中描述设备码流程 | 本次实测，HTTP 200，OpenAPI 3.1.0，Pollinations API 0.3.0 | 已实测 |
| 超时、轮询间隔、错误处理与降级逻辑 | 源码 `commands.ts:21-67`、`481-506`、`526-654` | 已核对源码 |
| Magpie `authorize()` 契约 | `docs/003-architecture.md:161` | 已核对项目文档 |

## 2. 设备码流程逐步说明

本流程来自 opencode 插件实现，并用真实请求核对了第一段。整个过程分为申请设备码、引导用户在浏览器确认、轮询换取密钥、验证密钥与权限四个阶段。

### 2.1 申请设备码

请求信息与源码位置如下。

- 方法：`POST`
- 完整地址：`https://enter.pollinations.ai/api/device/code`
- 请求头：`Content-Type: application/json`
- 请求体：`{"client_id":"pk_QPDopXO7XzKugYVr","scope":"profile usage"}`
- 源码位置：`commands.ts:558-561`、`commands.ts:481-506`
- 超时：`postJsonEnter()` 使用 `req.setTimeout(15000, ...)`，即 15 秒；超时后销毁请求并抛出 `Error('Timeout')`（`commands.ts:502`）
- `scope` 说明：源码注释写明 `profile usage` 是最小权限，用来读取余额与任务，默认不申请 `keys`（账号管理权限）（`commands.ts:560`）
- `client_id` 说明：`pk_QPDopXO7XzKugYVr` 是可公开内嵌的 publishable app key，用于 BYOP 归属，让授权页显示插件来源并把流量记到该应用下；源码注释写明 `earningsEnabled=false`，用户不会因此多付费（`commands.ts:510-513`）

本次实测返回的完整字段如下。`device_code` 是短时效凭据，文档中做了脱敏处理，其余字段按原样记录。

| 字段名 | 实测值 | 含义 |
| --- | --- | --- |
| `device_code` | 40 位字符串，前缀 `Vq9zGX`，已脱敏 | 轮询令牌时使用的设备码 |
| `user_code` | `PYUZUCY3` | 用户在授权页面输入的短码，实测为 8 位大写字母与数字 |
| `verification_uri` | `https://enter.pollinations.ai/device` | 授权页面地址 |
| `verification_uri_complete` | `https://enter.pollinations.ai/device?user_code=PYUZUCY3` | 直接打开并预填用户码的地址 |
| `expires_in` | `1800` | 设备码有效期，单位秒，即 30 分钟 |
| `interval` | `5` | 建议轮询间隔，单位秒 |

源码对响应字段做了默认值处理（`commands.ts:566-575`）：`verification_uri` 缺省时用 `https://enter.pollinations.ai/device`；`verification_uri_complete` 缺省时用 `${verification_uri}?user_code=${user_code}`；`interval` 缺省为 5 秒；`expires_in` 缺省为 900 秒。本次实测的 `expires_in` 为 1800 秒，源码用 `Math.min(expires_in, 30 * 60 * 1000)` 把本地截止时间限制在 30 分钟（`commands.ts:585`），与实测值一致。源码还检查 `user_code` 与 `device_code` 是否存在，任一缺失就返回 `no code returned` 错误（`commands.ts:577-579`）。

### 2.2 引导用户在浏览器确认

源码先调用 `openBrowser(verifyComplete)` 尝试自动打开授权页面（`commands.ts:641`），再把提示文本返回给调用方。提示文本包含用户码、授权页地址和完整链接（`commands.ts:643-648`）。在没有图形界面的环境里，浏览器可能打不开，此时提示文本里的地址作为兜底展示给用户。

需要强调：设备码流程要求用户亲自在浏览器里输入 `user_code` 并点击授权。插件无法代替用户完成这一步，也不会在这一步消耗额度。本次调研只申请了设备码，没有进行浏览器确认，也没有调用令牌端点。

### 2.3 轮询换取密钥

请求信息与源码位置如下。

- 方法：`POST`
- 完整地址：`https://enter.pollinations.ai/api/device/token`
- 请求体：`{"device_code":"<上一步返回的 device_code>"}`
- 轮询间隔：使用上一步的 `interval`，实测为 5 秒；源码在每次未拿到令牌时用 `setTimeout(poll, interval)` 安排下一次轮询（`commands.ts:632`、`635`、`638`）
- 截止时间：`Date.now() + Math.min(expires_in, 30 * 60 * 1000)`，超时后发送警告提示并返回 `expired` 状态（`commands.ts:585`、`592-597`）
- 超时：与申请设备码共用 `postJsonEnter()`，单次请求 15 秒（`commands.ts:502`）

Pollinations 官方 OpenAPI（`https://gen.pollinations.ai/openapi.json`，OpenAPI 3.1.0）在说明文字中记录了令牌端点的响应格式。成功响应为 `{"access_token":"sk_...","token_type":"bearer"}`，其中 `access_token` 就是可以直接用于 API 请求的 `sk_` 密钥。等待用户确认期间的响应为 `{"error":"authorization_pending"}`。官方文档还记录了标准 OAuth 令牌端点 `POST https://enter.pollinations.ai/api/oauth/token`，使用表单参数 `grant_type=urn:ietf:params:oauth:grant-type:device_code` 与 `device_code`。

源码的轮询行为有几个要点，实现时需要照搬或明确改进。

1. 源码只判断 `tok.access_token` 是否存在，存在就进入验证流程（`commands.ts:600`）。
2. 源码不区分令牌端点的错误码。`authorization_pending`、`slow_down`、`expired_token` 以及网络错误都会走同一个 `catch` 分支，然后按固定间隔继续轮询（`commands.ts:633-636`）。
3. 源码没有针对 `slow_down` 增大间隔，也没有在收到 `expired_token` 时提前失败。它一直等到本地截止时间才退出。
4. `postJsonEnter()` 不检查 HTTP 状态码，只解析 JSON（`commands.ts:493-500`）。因此非 2xx 的 JSON 响应会被当成正常结果，再由调用方判断字段是否存在。

Magpie 插件实现时建议保留固定间隔与 30 分钟截止时间，同时补充错误码判断：收到 `authorization_pending` 继续轮询，收到 `slow_down` 按官方要求增加间隔，收到 `expired_token` 或 `access_denied` 立即返回失败。这项改进属于实现建议，不是 opencode 插件的现有行为。

### 2.4 验证密钥与权限

拿到 `access_token` 后，源码按以下顺序处理（`commands.ts:601-628`）。

1. 调用 `checkEndpoint('/account/key', key)`，向 `https://gen.pollinations.ai/account/key` 发送带 `Authorization: Bearer ${key}` 的 `GET` 请求（`commands.ts:21-58`）。该请求超时为 10 秒（`commands.ts:55`）。只有 HTTP 200、响应是 JSON、并且响应里没有 `error`、`success:false`、`valid:false` 这些逻辑错误标记，才算验证通过。
2. 验证通过后调用 `ModelRegistry.refresh(key)` 刷新模型目录（`commands.ts:606`）。
3. 调用 `checkKeyPermissions(key)` 检查权限（`commands.ts:60-67`）。该函数依次请求 `/account/key/usage` 与 `/account/balance`，两个端点都通过才算权限完整。官方文档说明 `/account/key/usage` 不需要额外 scope，`/account/balance` 在密钥有预算时返回密钥预算，在具备 `account:usage` 权限时额外返回账号余额。
4. 权限不完整时，源码把 `keyHasAccessToProfile` 设为 `false`，并在配置里写入 `mode:'manual'`，同时保存密钥到配置和 `auth.json`，发送警告提示 `success_limited`（`commands.ts:615-623`）。权限完整时写入 `keyHasAccessToProfile:true` 并发送成功提示 `success_toast`。
5. 密钥验证出现异常时，源码发送错误提示 `validate_error`，并以 `error` 状态结束（`commands.ts:624-628`）。

需要说明一处与背景描述的差异：权限不足时，opencode 插件会保存密钥、把模式标记为 `manual`、并提示用户手动检查权限，并没有丢弃密钥。Magpie 插件可以沿用这种做法，也可以在权限不足时直接返回失败并引导用户重新授权，这属于实现决策，文档不规定具体做法。

### 2.5 等待模式的超时

`awaitDeviceLogin()` 提供单次调用的等待模式（`commands.ts:526-549`）。它在必要时自动启动登录，然后用 `WAIT_CAP_MS = 120000`，即 2 分钟，与登录结果 promise 做 `Promise.race`。2 分钟内没有结果时，返回之前保存的用户码与地址提示，并附上“仍在等待”的文案，让用户完成浏览器确认后再次调用。这个 2 分钟只影响单次调用等待时长，不影响 30 分钟的设备码有效期。

## 3. `sk_` 与 `pk_` 的区别

| 项目 | `sk_` 密钥 | `pk_` 应用密钥 |
| --- | --- | --- |
| 全称 | secret key | publishable app key |
| 用途 | 作为 API 请求凭据，放在 `Authorization: Bearer` 请求头里 | 作为 OAuth 流程的 `client_id`，用于标识发起授权的应用 |
| 能否单独请求 API | 能 | 不能 |
| 能否公开内嵌 | 不能 | 能，设计上就是可公开的值 |
| 获取位置 | 用户授权后由 `/api/device/token` 返回，或在 `https://enter.pollinations.ai/keys` 创建 | 在账号的应用页面创建，opencode 插件内嵌了 `pk_QPDopXO7XzKugYVr` |
| 归属与收益 | 代表用户账号的调用额度 | 用于 BYOP 归属，让授权页显示插件来源；官方文档说明 publishable app key 默认关闭开发者收益 |

本次实测确认了 `pk_` 不能用于 API 请求。用 `Authorization: Bearer pk_QPDopXO7XzKugYVr` 请求 `https://gen.pollinations.ai/account/key`，返回 HTTP 401，响应体为 `{"success":false,"error":{"message":"Publishable keys (pk_) only identify your app and can't authenticate requests. ... On a server, use a secret key (sk_) from https://enter.pollinations.ai/keys.","code":"UNAUTHORIZED",...},"status":401}`。这与背景中“2026-11-01 起单独用 `pk_` 请求 API 会返回 401”的说明一致。

因此 Magpie 插件的实现必须把两种密钥严格分开：`pk_QPDopXO7XzKugYVr` 只出现在设备码申请的请求体里，`sk_` 只出现在 API 请求的 `Authorization` 请求头里。项目规范也要求密钥不能拼进 URL 查询参数，不能写进日志或错误消息。

## 4. Magpie `authorize()` 契约与本插件的实现映射

`docs/003-architecture.md:161` 定义的契约如下。

- `authorize()` 返回 `{ url, instructions, method:"code"|"auto", opened?, callback }`
- `callback(code)` 返回 `{ type:"success", access, refresh, expires, accountId? }`，或者返回 `{ type:"failed", error }`

本插件应按下表映射设备码流程。

| 契约字段 | 本插件取值 | 理由 |
| --- | --- | --- |
| `method` | `"code"` | 设备码流程要求用户在浏览器输入 `user_code`，宿主需要展示地址并等待用户操作，不能用自动完成的 `"auto"` |
| `url` | 设备码响应的 `verification_uri`，实测为 `https://enter.pollinations.ai/device` | 契约中的 `url` 用来展示给用户打开 |
| `instructions` | 提示用户打开上面的地址，输入设备码响应的 `user_code`，在页面里点击授权 | 用户必须知道去哪里输入哪个码；`verification_uri_complete` 可以一并写进提示，方便用户直接打开预填链接 |
| `opened` | 当插件成功自动打开浏览器时为 `true`，否则省略或为 `false` | 对应源码 `openBrowser(verifyComplete)` 的返回值 |
| `callback(code)` | 忽略宿主传入的 `code` 参数，用申请设备码时保存的 `device_code` 轮询 `/api/device/token` | 设备码流程的确认动作发生在浏览器里，插件通过轮询拿密钥，不依赖用户把码贴回插件 |
| 成功返回 | `{ type:"success", access: access_token, refresh: "", expires: <密钥过期时间>, accountId?: <账号标识> }` | `access_token` 就是 `sk_` 密钥；Pollinations 设备流不发放 refresh token，所以 `refresh` 留空；`expires` 取 `/account/key` 返回的过期信息，没有时留空 |

`callback(code)` 内部应完成以下动作，顺序与第 2.4 节一致。

1. 按 `interval` 秒的间隔轮询 `/api/device/token`，截止时间取 `min(expires_in, 1800)` 秒。
2. 收到 `access_token` 后，用 `GET https://gen.pollinations.ai/account/key` 验证密钥。
3. 再检查 `/account/key/usage` 与 `/account/balance` 两个端点，判断权限是否完整。
4. 全部通过后返回 `type:"success"`，把 `sk_` 密钥放进 `access`；权限不完整时仍可返回成功，但要在提示里告知用户权限受限，或者按集成者的决策返回 `type:"failed"`。
5. 截止时间到达、收到 `expired_token` 或 `access_denied`、验证请求失败时，返回 `{ type:"failed", error }`，错误信息里不要包含密钥内容。

`method:"code"` 与 `url` 用 `verification_uri` 是本插件的确定选择。`callback` 里 `expires` 与 `accountId` 的具体取值还要看 Magpie 宿主如何消费这两个字段，这一点需要集成者在主插件里确认，本次调研不做假定。

## 5. 手动粘贴 `sk_` 的降级路径

`docs/003-architecture.md:143` 已经把手动密钥方法列入 `auth.methods`：`{ type:"api", label:"Secret key (sk_)", placeholder:"sk-...", prompts:[...] }`。触发降级的情况包括以下几项。

1. 用户直接选择手动密钥方法，不想走设备码流程。
2. 申请设备码失败，例如网络超时、返回 JSON 解析失败、响应缺少 `device_code` 或 `user_code`。源码对应 `t('commands.login.code_error', ...)` 与 `no code returned` 错误（`commands.ts:562-579`）。
3. 设备码在 30 分钟内没有得到用户确认，或者用户拒绝授权。
4. 拿到 `access_token` 后验证失败，例如 `/account/key` 返回非 200 或逻辑错误。源码对应 `validate_error`（`commands.ts:624-628`）。
5. 权限检查不完整，源码会写入 `mode:'manual'` 并提示用户检查权限（`commands.ts:615-623`）。

手动路径的操作步骤：用户打开 `https://enter.pollinations.ai/keys` 创建或复制 `sk_` 密钥，把它粘贴到 Magpie 的 Secret key 输入框；插件保存密钥后，按第 2.4 节的验证流程请求 `/account/key`、`/account/key/usage` 与 `/account/balance`，并把结果写入配置。密钥只放在 `Authorization` 请求头里，不写入 URL，不写入日志。

## 6. 官方 OpenAPI 的可用性与结论

本次对 `enter.pollinations.ai` 尝试了三个路径，`/openapi.json` 返回 HTML 404 页面，`/api/openapi.json` 返回 JSON 404（`code: "NOT_FOUND"`），`/docs` 返回 HTML 404 页面。因此 `enter.pollinations.ai` 没有可用的 OpenAPI 文档路径。

`https://gen.pollinations.ai/openapi.json` 可以访问，HTTP 200，OpenAPI 3.1.0，标题为 Pollinations API，版本 0.3.0，共有 88 个 `paths`。该文档没有把 `/api/device/code` 与 `/api/device/token` 列为正式的 `paths` 条目，但在说明文字里以 “CLIs & Headless Apps (Device Flow)” 和 Python 示例的形式记录了完整的设备码流程、请求体、响应字段、轮询间隔与错误响应。Account 分组里列出了 `/account/key`、`/account/key/usage`、`/account/balance` 等正式路径，可用于确认验证步骤。

综合结论：`enter.pollinations.ai` 的官方 OpenAPI 未提供，设备码端点没有正式的 OpenAPI `paths` 契约；设备码流程的依据是 opencode 插件实现，并以 Pollinations 官方 OpenAPI 说明文字与本次 `/api/device/code` 实测结果交叉核对。令牌端点的响应格式来自官方说明文字，未实测。

## 7. 未确认项清单

以下事项在本次调研中没有确认，实现时需要由集成者决定或补充测试。

1. `/api/device/token` 的真实响应没有实测，因为需要用户在浏览器确认设备码。成功与 pending 的字段来自官方 OpenAPI 说明文字。
2. `enter.pollinations.ai/api/oauth/token` 标准 OAuth 端点没有实测，只来自官方 OpenAPI 说明文字。
3. `verification_uri_complete` 里的 `user_code` 格式，官方示例写作带连字符的 `ABCD-1234`，本次实测返回不带连字符的 8 位 `PYUZUCY3`。实现时应直接使用响应字段，不要自行拼接或改写格式。
4. Magpie 宿主如何消费 `callback` 成功结果里的 `expires` 与 `accountId`，本次只按契约字段给出建议，没有做宿主侧验证。
5. 权限不完整时 Magpie 插件应当保存密钥并标记手动模式，还是直接返回失败，属于实现决策，需要集成者确认。
6. 本次探测申请到的设备码会在 1800 秒后失效，插件实现不应复用该值。

## 8. 依据与证据位置

- `commands.ts` 指 `.drafts/ref-pollinations/opencode-pollinations-plugin/src/server/commands.ts`，关键行段：`21-58`（`checkEndpoint`）、`60-67`（`checkKeyPermissions`）、`481-506`（`postJsonEnter`）、`510-513`（`APP_CLIENT_ID`）、`526-549`（等待模式）、`551-654`（`startDeviceLogin`）。
- `docs/003-architecture.md:135-164` 定义主插件结构与 `authorize()` 契约。
- 本次实测脚本写在 `R:\Temp\dsh-4GsfWO\.drafts\session-2f3c1615fb6d\`，包括 `probe.mjs`、`inspect-openapi.mjs`、`openapi-context.mjs`、`probe-pk401.mjs`。脚本通过环境变量代理 `http://127.0.0.1:7897` 发起 Node `fetch` 请求，没有使用 web_fetch。
- 实测时间：2026-11-17，请求时间戳来自服务端响应。
