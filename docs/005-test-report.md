# Pollinations 插件包验收报告

版本：0.3.0
日期：2026-11-19

版本记录：
- 0.1.0（2026-11-17）：静态验收——`check.mjs`、`bun test`（47 项）、`opencode2.mjs` 哈希校验，不联网、不登录。对应下文第一至六节。
- 0.2.0（2026-11-18）：在本机已安装的 magpie（scoop `magpie-ai-latest`，网关 0.1.4299）上完成联网、已登录的真实端到端验收；并修复了上游模型目录里 `context_length` 取四分之一时产生小数（如 8194.5）导致 magpie `Model.limit` 反序列化告警的问题。对应下文第七、八节。
- 0.3.0（2026-11-19）：移除插件的 `auth.checkin` 钩子——核实确认 Pollinations 没有每日固定签到赠送、quest 领取只能在网页端（API 只读），插件的 checkin 恒返回 `done` 且不发放任何 Pollen；按“不发放额度就不显示签到”的要求，去掉 magpie 的自动签到/签到 UI。对应下文第九节。

## 一、验收范围与方式

- 被验收包：`packages/pollinations/`，2026-11-18 验收时包名 `@magpie-community/opencode-pollinations-auth`（版本 `0.1.0`）；2026-11-19 已以 `@sterra-mind/magpie-pollinations@0.3.0` 发布到 npm（改名不影响已验收结论，发布后本机用 npm 包重新加载验证通过）。
- 校验脚本：社区仓库克隆 `.drafts/magpie-uvx-rootcause/magpie-community-plugins/` 中的 `scripts/check.mjs` 与 `scripts/registry.mjs`。
- 本机运行时：bun 1.4.4。
- 操作方式：用 `Copy-Item -Recurse -Force` 把工作区 `packages/pollinations/` 整体复制到社区克隆的 `packages/pollinations/`，在社区克隆根目录运行校验脚本。校验结束后已恢复社区克隆的 `registry.json`，并移除临时复制的 `packages/pollinations/`，未改动社区仓库其他已有包，未执行任何 git commit、push 或发布脚本。

## 二、check.mjs 最终结果

结论：**通过**。

在社区克隆根目录执行 `bun scripts/check.mjs pollinations`，退出码为 0，完整输出：

```
✓ registry.json
✓ pollinations
```

另执行全量 `bun scripts/check.mjs`（不带参数），退出码为 0，没有任何以 `✗` 开头的失败行，`pollinations` 一项为 `✓`，`registry.json` 一项为 `✓`。说明本包没有影响其他包的校验结果。

补充验证：把 `docs/006-registry-entry.md` 里的条目临时加入社区克隆的 `registry.json` 后再跑 `bun scripts/check.mjs pollinations`，退出码仍为 0，输出同样是 `✓ registry.json` 与 `✓ pollinations`。该条目自身符合 `registry.mjs` 的字段约束。验证后已把 `registry.json` 恢复为原文件。

## 三、bun test 结果

在社区克隆的 `packages/pollinations/` 目录执行 `bun test`，退出码为 0，结果：

- 通过：47
- 失败：0
- `expect()` 调用：183
- 测试文件：4 个（`api.test.mjs`、`index.test.mjs`、`models.test.mjs`、`usage.test.mjs`）
- 耗时：106.00 ms

输出末尾为 `47 pass`、`0 fail`，与预期的 47 个通过一致。测试覆盖密钥与路径安全、错误码与 `signIn` 语义、插件导出形状、配置与模型目录映射、余额与任务窗口映射等。

## 四、过程中发现并修复的问题

本次验收中，**我们的包没有出现需要修复的问题**。首次运行 `check.mjs` 即通过，随后运行 `bun test` 也全部通过，因此没有修改 `packages/pollinations/` 下的任何源文件。

按要求逐项核对了校验脚本实际检查的内容，均满足：

- `main` 指向 `./opencode.mjs`，其默认导出为插件函数，OpenCode 1.x 能加载。
- `exports["."]` 指向 `./opencode2.mjs`，其默认导出含 `id` 与 `setup`，OpenCode 2.x 能加载。
- `config()` 给 `pollinations` 提供了 `npm` 与模型表。
- `auth.provider` 为 `pollinations`，`auth.methods` 含 `oauth`（带 `authorize`）与 `api` 两种，`auth.loader` 为函数。
- `provider.id` 与 `auth.provider` 一致，`provider.models` 为函数。
- `files` 列表包含 `index.mjs`、`opencode.mjs`、`opencode2.mjs` 等入口文件。
- `magpie.icon` 为 https 地址，符合 registry 约束。

## 五、opencode2.mjs 哈希校验

- 我们工作区 `packages/pollinations/opencode2.mjs`：SHA256 `5C8E87FA36E36FFF1C27F84DCADCED491E193880C3FA49C2D3A0E3C6BF64CB77`
- 社区仓库 `scripts/opencode2.mjs`：SHA256 `5C8E87FA36E36FFF1C27F84DCADCED491E193880C3FA49C2D3A0E3C6BF64CB77`

两者字节一致，与任务给出的基准哈希一致。`check.mjs` 内部的逐字节比较也没有报 `opencode2.mjs differs from scripts/opencode2.mjs`。本次验收未改动该文件。

## 六、遗留事项与需要维护者处理的事项

1. **registry.json 尚无 pollinations 条目。** 社区克隆的 `registry.json` 当前没有 `@magpie-community/opencode-pollinations-auth` 条目；`check.mjs` 不要求每个包都必须登记，所以校验仍然通过，但 magpie 的插件页面不会展示这个插件。发布时需要由有推送权限的维护者按 `docs/006-registry-entry.md` 把条目加入 `registry.json`。本次验收只在社区克隆里临时加入该条目做验证，验证后已恢复原文件，没有改动工作区文档。
2. **没有执行发布。** 本项目当前没有社区仓库推送权限与 npm 登录，按约定未运行任何发布脚本，也未做 git commit 或 push。
3. **没有做联网请求。** `check.mjs` 与包内测试都不联网，设备码登录、余额、模型列表等真实接口未在本报告中验证；这些需要维护者在有网络与凭据的环境另行做生产环境验收。
4. **社区克隆已恢复原状。** 临时复制的包与临时加入的 registry 条目都已清除，社区仓库克隆没有留下本次验收产生的改动。

## 七、本地联网端到端验收（0.2.0）

验收环境：本机 scoop 安装 `magpie-ai-latest`，网关版本 `0.1.4299`，监听 `127.0.0.1:3425`。插件用官方方式装入本机 GUI 使用的数据目录：

```
C:\Users\jaggar\AppData\Local\scoop\apps\magpie-ai-latest\current\magpie.exe plugin add C:\Users\jaggar\Projects\magpie\magpie-pollination\packages\pollinations
```

登录：在本地 magpie GUI 中用设备码方式登录，登录态为 `signed in as Device JJ4S7R7P`（`current\magpie.exe plugin list` 可见）。

端到端结果：

1. **真实补全**：`POST http://127.0.0.1:3425/v1/chat/completions`，`model=pollinations/openai/gpt-5.4-nano`，不带网关密钥，返回 `200`，正文 `OK`，`usage` 15 tokens。证明网关已把 `pollinations/*` 路由到本插件、且上游可用。
2. **三个 Pollen 余额窗口**：`current\magpie.exe quota pollinations --json` 返回且仅返回三个窗口，单位 `Pollen`：
   - `Pollen · total`：余额 `0.3999946`（显示 `0.4 Pollen left`）
   - `Pollen · Quest`：`0.3999946`（aside 窗口）
   - `Pollen · paid`：`0`（aside 窗口）

   与 `usage.mjs` 中 `usageFrom()` 生成的窗口结构一致，说明余额面板走的是插件上报的 `usageWindow`。
3. **check-in 结果**：本机数据目录 `plugin-checkin.json` 中 `pollinations|pollinations` 一条为 `{day:2026-11-18, outcome:"done"}`，说明文案为“奖励领取需到网站端、接口只读、插件无法代领”（见第八节结论）。`outcome` 为 `done` 而非 `claimed`，与上游“领取只能在仪表盘”的事实一致。（注：该 checkin 钩子已于 0.3.0 移除，见第九节；本条是 0.2.0 验收时的历史记录。）

## 八、8194.5 修复与上游计价/任务领取调研（0.2.0）

### 8.1 `8194.5` 反序列化告警的修复

上游 `/models` 里部分模型 `context_length` 除以 4 后不是整数（例如 `32778/4 = 8194.5`），而 magpie 的 Go 侧 `Model.limit` 字段是整型，加载时报：

```
magpie: json: cannot unmarshal number 8194.5 into Go struct field Model.models.output of type int
```

修复：`packages/pollinations/models.mjs` 的 `toLimit()` 对 `context` 与 `output` 一律 `Math.round` 取整。修复后 `current\magpie.exe plugin list` 不再出现该告警，`bun test` 47 项仍全部通过（相关测试的期望值 `400000/32000`、`8000/2000` 本就是整数，取整对它们无影响）。

### 8.2 计价单位核实

抓取 `https://gen.pollinations.ai/models`（JSON 数组，共 462 个模型）后本地统计：

- **462 个模型全部 `pricing.currency == "pollen"`**；其中 `paid_only=false` 199 个、`paid_only=true` 263 个。
- 单价字段（`promptTextTokens` 等）是**每 token 的 pollen 数**（字符串，如 `0.00000015`）。
- 本插件 `models.mjs` 用 `TOKEN_SCALE = 1e6` 把“每 token”换算成“每百万 token”，与参考实现 `opencode-pollinations-plugin` 的 `perM()`（`v * 1_000_000` 显示为 “/M”）一致，也与 magpie `SetModelPrice` 的“每百万 token”语义对齐。
- 结论：**是，目录里所有模型都以 pollen 计价**；`×1e6` 换算方向正确，无需改动。

### 8.3 Quest（任务）领取机制核实

- OpenAPI（88 条 path）里 quest 相关路径**全部是只读 GET**：`GET /account/quests`、`GET /account/quests/rewards`、`GET /quests/catalog`，**没有领取用的 POST/claim 端点**。
- 官方文档 `gen.pollinations.ai/src/docs/account.md` 将 `GET /account/quests` 标注为 “Read-only quest status”。
- 参考插件文案明确写“领取只能在仪表盘进行 / claiming is dashboard-only”，并说明“光用插件就能让若干 quest 自动达成（retroactively）”。

因此：quest 的**达成**是服务端按用量自动判定的，插件无需也无法“代完成”；而**领取奖励（pollen）是仪表盘专属**，API 不提供领取端点。基于此，2026-11-19 进一步移除了插件的 `auth.checkin` 钩子（见第九节）：既然 checkin 不发放任何 Pollen、不更新额度，就不该在 magpie 里显示“自动签到/签到”。

## 九、移除签到钩子（0.3.0）

### 9.1 背景与决策

2026-11-19 联网搜索 + 上游源码核实，确认：

- Pollinations **没有每日固定签到赠送额度**。Pollen 是预付（prepaid）信用，官方 `POLLEN_FAQ.md` 写“$1 ≈ 1 Pollen”，获取方式是购买或完成 Quest（网页端领取），没有每日签到固定发放。参考：https://github.com/pollinations/pollinations/blob/be33dc3a/enter.pollinations.ai/POLLEN_FAQ.md 、https://enter.pollinations.ai/quests
- Quest 的**达成**由服务端按用量自动判定，**领取**只能在仪表盘进行；API 侧 quest 是只读（`gen.pollinations.ai/docs`：“`account:usage` is the read-only account-state scope for balances, usage, quests”），没有领取的 POST 端点。
- 因此插件原先的 `checkin` 钩子恒返回 `outcome:"done"`、不发放任何 Pollen，即**不更新额度**。

按“checkin 不发放额度就不要显示自动签到和签到”的要求，移除插件的 `auth.checkin` 钩子。

### 9.2 改动内容

- `packages/pollinations/index.mjs`：删除 `auth.checkin` 函数与 `checkinFrom` 导入；`usage` 钩子不再请求 `/account/quests`（该数据只服务于 checkin，`usageFrom` 本就不使用）。
- `packages/pollinations/usage.mjs`：删除 `checkinFrom()` 与 `questSummary()`（仅服务于 checkin 的死代码）；`usageFrom()` 签名去掉不再使用的 `quests` 参数。
- 对应测试：`index.test.mjs` 删除 checkin 用例；`usage.test.mjs` 删除 `questSummary`/`checkinFrom` 用例。`bun test` 由 47 项降为 43 项，全部通过。

### 9.3 生效方式与验证

magpie 的签到 UI（“每日自动签到”开关、“签到”按钮、签到状态行）只对暴露 `auth.checkin` 的插件渲染：`internal/provider/plugin_checkin.go` 中 `pp.Checkin` 为真才进入 `pluginCheckinProviders()`，GUI `renderPluginCheckins` 据此画行。移除钩子后 `pp.Checkin` 为假，pollinations 不再进入该列表，magpie 不再为它渲染任何签到界面。

验证：`bun test` 43 项全通过；源码中除 `opencode2.mjs`（OpenCode 2.x 通用适配器的说明性注释，按社区规范必须与 `scripts/opencode2.mjs` 字节一致、不可改动）外无 `checkin` 残留。重新 `plugin add` 让网关重载后，GUI 不再显示该插件的签到项。
