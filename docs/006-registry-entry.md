# registry.json 条目草稿（Pollinations）

版本：0.1.0
日期：2026-11-17
状态：待发布。当前账号没有 magpie-community/plugins 的推送权限，此条目需要由有权限的维护者加入 registry.json。

## 条目

把下面的对象加入社区仓库 `registry.json` 的 `plugins` 数组（位置紧跟其他 Anthropic/OpenAI 兼容 provider 之后即可）：

```json
{
  "package": "@magpie-community/opencode-pollinations-auth",
  "name": "Pollinations",
  "icon": "https://pollinations.ai/favicon.ico",
  "providers": ["pollinations"],
  "community": true,
  "summary": {
    "en": "Pollinations with a secret key or device-code sign-in: live OpenAI-compatible models, Pollen wallet balance, Quest status, and usage. Rewards are claimed on the website.",
    "zh": "用密钥或设备码登录 Pollinations：动态发现 OpenAI 兼容模型，显示 Pollen 余额、任务状态与用量。任务奖励需在网页领取。"
  }
}
```

## 说明

- 字段含义：`package` 是 npm 包名，`name` 是市场显示名，`icon` 是图标地址，`providers` 是它服务的 provider id 列表，`community:true` 标记为社区插件，`summary.en`/`summary.zh` 是英文和中文简介。
- 已有的 provider 列表里没有 `pollinations`，不会与现有渠道冲突。
- 图标地址使用 Pollinations 官网的 favicon。如果维护者要求图标放进仓库，请改用 `icon.svg` 文件并在 `package.json` 的 `magpie.icon` 里同步。
- 这个包是一个新的 provider 渠道，PR 描述里要说明它与已有插件的差异：唯一一个接入 Pollinations 统一 API 的 provider，提供 Pollen 钱包余额窗口和任务状态读取。
