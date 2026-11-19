# magpie-pollination 项目记忆

版本：0.1.0
日期：2026-11-17

## 用户目标

开发一个 Magpie provider 插件，把 Pollinations 接入 Magpie，然后发布上线。用户明确要求安排子智能体团队，一个智能体解决一个小问题、完成一次小调研、完成一个原子化开发、完成一次小测试和小验收。

## 关键事实

- 工作区：`C:\Users\jaggar\Projects\magpie\magpie-pollination`
- 参考项目（已克隆）：
  - `.drafts/magpie-uvx-rootcause/magpie-community-plugins`（社区插件仓库，HEAD 8768126）
  - `.drafts/ref-pollinations/opencode-pollinations-plugin`（上游 OpenCode 插件）
- 本地完整 Magpie 源码快照：`C:\Users\jaggar\Projects\magpie\.drafts\magpie-uvx-rootcause\v3557\`
- 网络：web_fetch 被 SSRF 拦截，但 Node 的 `fetch` 通过环境变量里的代理（127.0.0.1:7897）可以访问外网。`Invoke-WebRequest` 和 `curl.exe` 直接访问会 SSL 失败，只有 Node fetch 可用。

## Pollinations API 要点

- 公开 OpenAPI：`https://gen.pollinations.ai/openapi.json`
- `GET /models`：公开，返回 444 个模型的数组；text 类 265 个。字段见 `docs/001-api-contract.md`。
- `GET /account/balance`：需要 sk_ 且有 `account:usage` 权限；返回 `{balance, accountBalance?:{total,tier,paid}}`。
- `GET /account/quests`：任务只读，领取奖励只能在网页端完成，API 没有 claim 端点。
- 设备码登录在 `enter.pollinations.ai`，用 publishable key `pk_QPDopXO7XzKugYVr` 作为 client_id。

## 发布权限现状

- GitHub：`gh api repos/magpie-community/plugins` 返回 `push:false`，当前账号没有推送权限；`gh auth switch` 因 hosts.yml 权限失败。
- npm：未登录（`npm whoami` 返回 ENEEDAUTH）。
- 结论：本会话只能准备发布材料，不能真正推送或发布。需要用户或维护者完成最后一步。

## 决策记录

- 模型 ID 保留 `publisher/model` 完整形式，不做截断，避免不同发布者的同名模型冲突。
- 不实现自动签到（0.3.0 移除 `auth.checkin`）：上游无每日签到赠送、quest 领取只能在网页端（API 只读、无领取端点），checkin 不发放任何 Pollen、不更新额度，按要求去掉 magpie 的签到 UI。
- 运行时代码不依赖第三方库，只用 `node:` 内置模块和 `fetch`，方便在 Bun 宿主和 Node 测试里共用。
