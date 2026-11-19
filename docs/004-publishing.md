# 社区插件发布流程与权限现状（magpie-pollination）

版本：0.1.0
日期：2026-11-17
状态：调研完成，发布材料已备好，等待有权限的维护者执行
适用包：`@magpie-community/opencode-pollinations-auth`，版本 `0.1.0`

## 1. 核对范围与结论

本次在本地仓库核对了社区仓库的下列位置。社区仓库克隆路径是 `.drafts\magpie-uvx-rootcause\magpie-community-plugins`，`git rev-parse HEAD` 返回 `8768126af3f62266939b1e100cadbbaa961835b4`，与已知提交 8768126 一致。

| 核对对象 | 本地路径 | 结论 |
| --- | --- | --- |
| 参考包 Agnes | `packages/agnes/package.json`、`opencode.mjs`、`opencode2.mjs` | 可作为干净的小参考，字段形状与任务描述一致 |
| 设备流参考包 Nous | `packages/nous/package.json` | 字段形状一致，无 `magpie.icon` |
| 签到参考包 Trae | `packages/trae/package.json` | 字段形状一致，provider 列表含 `trae-cn`、`trae-global` |
| 校验脚本 | `scripts/check.mjs`、`scripts/registry.mjs` | 已逐行读完，检查项见第 4 节 |
| 发布流程 | `.github/workflows/publish.yml` | 触发条件和三个 job 已确认，见第 3 节 |
| 发布辅助脚本 | `scripts/publish.sh`、`scripts/dist.mjs`、`scripts/owner.sh`、`scripts/try.sh` | 已逐行读完，命令见第 3、6、7 节 |
| 市场清单 | `registry.json` | 已用全文检索确认没有 `pollinations` 条目，新增条目不会重复 |
| 贡献说明 | `README.md` 第 402 行 `## Write your own`、第 467 行 `## Publishing`、第 449 行 `### One channel already listed` | 已确认沙箱测试命令、首次发布限制、同渠道差异说明要求 |
| 适配器 | `scripts/opencode2.mjs` 与本仓库 `packages/pollinations/opencode2.mjs` | 两者 SHA256 都是 `5C8E87FA36E36FFF1C27F84DCADCED491E193880C3FA49C2D3A0E3C6BF64CB77`，字节一致 |

本包 `packages/pollinations/package.json` 的字段与参考包一致：`name` 为 `@magpie-community/opencode-pollinations-auth`，`main` 为 `./opencode.mjs`，`exports` 为 `{".": "./opencode2.mjs"}`，`files` 列出 `index.mjs`、`api.mjs`、`models.mjs`、`usage.mjs`、`opencode.mjs`、`opencode2.mjs`、`README.md`、`LICENSE`，`keywords` 含 `opencode`、`opencode-plugin`、`magpie`，`license` 为 `MIT`，`repository` 指向 `magpie-community/plugins` 的 `packages/pollinations`，`scripts.test` 为 `bun test`，`magpie.icon` 为 `https://pollinations.ai/favicon.ico`。`opencode.mjs` 按 OpenCode 1.x 写法重导出，例如 `export { PollinationsPlugin } from "./index.mjs"`。

## 2. 发布流程说明

### 2.1 触发条件

`.github/workflows/publish.yml` 在两种情况下运行：

1. 向 `main` 分支推送，并且改动命中 `packages/*/package.json` 路径。仅改动 `registry.json` 或包内其他文件不会触发。
2. 在 Actions 页面手动触发 `workflow_dispatch`。

工作流顶层设置 `permissions: contents: read`，并设置 `concurrency: publish`，同一时间只运行一个发布流程。

### 2.2 test 任务

运行在 `ubuntu-latest`。步骤依次是 `actions/checkout@v4`、`oven-sh/setup-bun@v2`、`actions/setup-node@v4`（Node 24）。测试命令是 `HOME=$(mktemp -d) bun test`，给一个临时 HOME，避免读到真实登录态。校验命令是 `bun scripts/check.mjs`。test 任务通过后，`dist` 和 `npm` 两个任务才会启动。

### 2.3 dist 任务

`needs: test`，权限为 `contents: write`。它把每个包的每个版本打包到 `dist` 分支：先设置 bot 的 git 用户名和邮箱，再 `git fetch --depth=1 origin dist` 并用 `git worktree add` 检出；若远端没有 `dist` 分支则用 `git worktree add --orphan -b dist` 新建。随后运行 `node scripts/dist.mjs "$RUNNER_TEMP/dist"`，脚本把 `tgz/<包名>-<版本>.tgz` 和 `index.json` 写入分支，索引记录每个版本的 tarball 文件和 sha512 校验值。`git diff --cached --quiet` 判断有无变化，有变化则提交并 `git push origin dist`。

magpie 0.1.1243 及更新版本在 npm 缺少某个版本时，从 `dist` 分支安装。magpie 只在 sha512 匹配时安装 tarball。这一步不依赖任何账号，新插件合并后评审通过即可到达用户。

### 2.4 npm 任务

`needs: test`，权限为 `id-token: write`（用于 npm 的 OIDC 交换）与 `contents: read`。步骤是 checkout、setup-bun、setup-node（Node 24，`registry-url: https://registry.npmjs.org`），再运行 `scripts/publish.sh`，并传入 `NPM_TOKEN: ${{ secrets.NPM_TOKEN }}`。

`scripts/publish.sh` 先运行 `bun scripts/check.mjs`，再遍历 `packages/*/`，跳过 npm 上已有的版本，然后优先用 OIDC trusted publishing 执行 `npm publish --access public`。OIDC 失败时回退到 `NPM_TOKEN`。如果包在 npm 上还不存在且仓库没有 `NPM_TOKEN` secret，工作流只输出通知并跳过该包，不把任务判为失败，magpie 同时从 `dist` 安装。已经存在的包若发布被 npm 拒绝，任务失败，需要修复 Trusted Publisher 的 `npm publish` 授权。

### 2.5 新包首次发布限制

npm 的 Trusted Publisher 只能设置在已经存在的包上，所以新包的第一个版本不能走 trusted publishing。仓库 README 第 491 行写明：在 magpie-community 组织的管理者手动发布首版并设置 Trusted Publisher 之前，magpie 一直从 `dist` 安装。管理者用一条命令完成这些操作：

```sh
sh scripts/owner.sh --dry-run   # 先查看将要执行的动作
sh scripts/owner.sh             # 真实终端中执行，浏览器里完成 2FA
```

`owner.sh` 的工作流程是：从 `origin/main` 建独立 worktree，逐个查询 npm，区分 `new`、`behind`、`ok` 三种状态；对 `new` 的包先执行 `npm11 publish --access public`，再建立带 `--allow-publish` 的 Trusted Publisher；对 `behind` 的包重建 Trusted Publisher，再运行 `gh workflow run publish.yml -R magpie-community/plugins`。npm 的信任关系只能撤销后重建，脚本先 `npm11 trust list` 收集 id 并逐个 revoke。`owner.sh` 需要从 `/dev/tty` 读终端输入，在没有真实终端的工具会话中会报 `EOTP` 并退出。

如果 npm 信任关系是 2026-09-03 之后建立的，默认只允许 `npm stage publish`。下面的命令可重新建立带发布权限的信任关系：

```sh
npx npm@latest trust github <package> --file publish.yml \
  --repo magpie-community/plugins --allow-publish \
  --registry=https://registry.npmjs.org/ -y
```

## 3. check.mjs 检查项清单

`scripts/check.mjs` 不登录任何账号，不发送任何网络请求。它先检查 `registry.json`，再逐个检查 `packages/` 下的包。传入包名参数时，只跳过其他包的钩子检查，`registry.json` 始终会被检查。

### 3.1 registry.json 层（check.mjs 第 17–24 行，调用 scripts/registry.mjs）

- 文件必须存在，否则报 `registry.json is missing`。
- 文件大小不超过 `1 << 20` 字节，也就是 1048576 字节。
- 必须是合法 JSON，且顶层是对象，不能是数组。
- `version` 必须等于 `1`。
- `plugins` 必须是非空数组。
- 每个条目只允许这些字段：`package`、`name`、`icon`、`providers`、`community`、`replaces`、`kind`、`summary`。出现其他字段会报 unknown field。
- `package` 必须是合法 npm 名，匹配正则 `^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$`，长度不超过 214，且不能重复。
- `name` 必须是非空字符串。
- 出现 `kind` 时，值只能是 `middleware`、`hooks`、`agent`、`tools`、`page` 之一。provider 插件不带 `kind`。
- 出现 `community` 时，值必须是布尔值。
- 出现 `replaces` 时，值必须是非空字符串。
- 出现 `providers` 时，值必须是非空字符串数组。
- 出现 `icon` 时，值必须是非空字符串；如果含 `:` 或 `/`，必须以 `https://` 或 `data:image/` 开头。
- `summary` 必须是对象，`summary.en` 和 `summary.zh` 都必须是非空字符串；出现其他语言的键时，值也必须是字符串。
- `agentKindProblems` 额外检查：包在 `package.json` 里声明了 `magpie.agent` 时，它在 `registry.json` 里的 `kind` 必须是 `agent`。

### 3.2 每个包的插件钩子层（check.mjs 第 25–104 行）

- 跳过声明了 `magpie.middleware`、`magpie.gateway`、`magpie.agent`、`magpie.hooks` 的包，以及没有 `main` 和 `exports` 的 page 包。这些包由自己的测试检查。
- 按 `pkg.main ?? "index.mjs"` 动态导入模块。
- 模块必须导出至少一个函数，或默认导出带 `server` 函数的对象，否则报 `exports no plugin function`。
- OpenCode 1.x 兼容性：默认导出不是 `{id|server|tui}` 对象时，`main` 的任何非函数导出都会被报成 OpenCode 1.x 拒绝的插件。
- 对每个插件函数调用钩子，传入桩 `client`。有 `tool` 钩子时，检查工具列表非空、工具名匹配 `/^[A-Za-z0-9_-]{1,48}$/`、每个工具有 `execute` 函数、有非空 `description`、有 `args` 对象。
- 有 `auth` 钩子时，检查 `auth.provider` 是非空字符串，`auth.methods` 是非空数组，每个方法的 `type` 是 `oauth` 或 `api`，`oauth` 方法有 `authorize` 函数。
- 有 `config` 钩子时，调用 `config({provider:{}})`。若该 provider 对外提供模型，则必须有 `npm` 或非空的 `models`。当 `hooks.provider.id === auth.provider` 且提供 `hooks.provider.models` 函数时，允许模型目录为空，因为账号目录在登录前可以为空，脚本不会调用这个钩子。
- 需要加载器时，`auth.loader` 必须是函数。没有 `config` 但有 `auth.loader` 函数时，也视为提供模型。
- 任一问题都会让该包打印 `✗ <name>` 并列出原因。

### 3.3 OpenCode 2.x 适配层（check.mjs 第 98、107–129 行，仅对提供模型的包执行）

- `exports["."]`（字符串 `exports` 或 `main` 也接受）必须指向一个文件，否则报 `exports["."] is not a file`。
- 导入该文件后，默认导出必须是对象，带非空字符串 `id`，且 `setup` 或 `effect` 是函数，否则报 `has no default {id, setup} (plugins#657)`。
- 若包目录内有 `opencode2.mjs`，其内容必须与 `scripts/opencode2.mjs` 逐字节相同，否则报 `opencode2.mjs differs from scripts/opencode2.mjs: copy it again`。本仓库现有文件的 SHA256 已核对一致。
- 入口文件、`opencode2.mjs`、`main` 都必须出现在 `package.json` 的 `files` 数组里，否则报 `<name> is not in files`。

### 3.4 本地验收命令

在社区仓库根目录执行：

```sh
bun test
bun scripts/check.mjs
bun scripts/check.mjs pollinations
```

在沙箱 HOME 中测试插件（README 第 415–430 行）：

```sh
magpie plugin add ./packages/pollinations
magpie plugin
MAGPIE=/path/to/magpie scripts/try.sh pollinations
```

`scripts/try.sh` 在 `.sandbox/<name>` 里设置 `HOME`、`USERPROFILE`、`XDG_CONFIG_HOME` 和 `XDG_CACHE_HOME`，不会动真实的 magpie 数据和登录态。

## 4. 权限现状结论

本机 `gh auth status` 显示 active 账号是 `sterraMind`，另一个已登录账号是 `Lehmaning`。`gh api repos/magpie-community/plugins --jq '.permissions'` 返回：

```json
{"admin":false,"maintain":false,"pull":true,"push":false,"triage":false}
```

`push:false` 表示当前账号不能向 `magpie-community/plugins` 推送分支或标签，也不能在那里建分支。`gh auth switch` 失败，错误是打开 `C:\Users\jaggar\AppData\Roaming\GitHub CLI\hosts.yml` 时 `Access is denied`。另一个账号 `Lehmaning` 尚未确认具有推送权限。

`npm whoami` 返回 `ENEEDAUTH`，即当前没有登录 npm。本机 npm 配置的 registry 是 `https://registry.npmjs.org/`。

结论：本会话不具备向社区仓库推送的权限，也不具备 npm 发布身份。本次只准备材料和文档，不执行任何推送、开 PR 或发布动作。具体发布动作交给有权限的维护者按第 6 节执行；当前账号按第 7 节准备 PR 材料。

## 5. 操作手册 A：有权限的维护者一步发布

适用前提：维护者拥有 `magpie-community/plugins` 的推送权限，并且是 magpie-community npm 组织的管理者，或者仓库已经配置有效的 `NPM_TOKEN`。

1. 进入社区仓库，更新主线。

   ```sh
   cd <社区仓库路径>
   git fetch origin main
   git checkout main
   git pull --ff-only origin main
   ```

2. 把本项目的 `packages/pollinations` 整个目录放到社区仓库的 `packages/pollinations`。如果 PR 已经合并，这一步可以跳过。确认 `opencode2.mjs` 与 `scripts/opencode2.mjs` 字节一致。

   ```sh
   Get-FileHash -Algorithm SHA256 packages/pollinations/opencode2.mjs
   Get-FileHash -Algorithm SHA256 scripts/opencode2.mjs
   ```

   两个哈希都应为 `5C8E87FA36E36FFF1C27F84DCADCED491E193880C3FA49C2D3A0E3C6BF64CB77`。

3. 把第 8 节的条目加入 `registry.json` 的 `plugins` 数组。

4. 本地验收。

   ```sh
   bun test
   bun scripts/check.mjs pollinations
   bun scripts/check.mjs
   ```

5. 提交并推送到 `main`。推送 `packages/pollinations/package.json` 会触发 `publish.yml`。

   ```sh
   git add packages/pollinations registry.json
   git commit -m "feat: add Pollinations provider plugin"
   git push origin main
   ```

6. 推送后查看 Actions 的 `publish` 工作流。`test` 通过后，`dist` 任务会把 `0.1.0` 打包到 `dist` 分支，`npm` 任务会尝试发布。新包首次发布需要管理者在真实终端执行下面两条命令，浏览器里完成 2FA。

   ```sh
   sh scripts/owner.sh --dry-run
   sh scripts/owner.sh
   ```

   这一步不能在无终端的工具会话中执行，因为脚本要从 `/dev/tty` 读取 npm 的一次性密码。若只需要让已有包的新版本重新走一遍 npm 发布，可以单独触发工作流：

   ```sh
   gh workflow run publish.yml -R magpie-community/plugins
   ```

7. 验证发布结果。

   ```sh
   npm view @magpie-community/opencode-pollinations-auth version
   magpie plugin add @magpie-community/opencode-pollinations-auth
   ```

   npm 尚未返回版本时，magpie 仍可从 `dist` 分支安装该版本。这种行为符合 README 的说明，不需要把工作流判为失败。

## 6. 操作手册 B：当前无权限时准备 PR 材料

适用前提：当前账号只有 `pull:true` 和 `push:false`，且 npm 未登录。目标是产出一份可以直接评审的 PR，不触碰上游仓库的写操作。

1. 在自己的账号下 fork `magpie-community/plugins`。fork 完成后克隆自己的副本，并建立独立分支。

   ```sh
   git clone https://github.com/<你的账号>/plugins.git
   cd plugins
   git checkout -b add-pollinations-provider
   ```

2. 把本项目的 `packages/pollinations` 复制到 fork 的 `packages/pollinations`。确认 `opencode.mjs` 只重导出插件函数，确认 `opencode2.mjs` 与 `scripts/opencode2.mjs` 字节一致。

3. 把第 8 节的条目加入 fork 里的 `registry.json`。不要改动其他条目。

4. 在 fork 里做本地验收。命令全部通过后再提交。

   ```sh
   bun test
   bun scripts/check.mjs pollinations
   bun scripts/check.mjs
   magpie plugin add ./packages/pollinations
   magpie plugin
   MAGPIE=/path/to/magpie scripts/try.sh pollinations
   ```

5. 只提交包目录和清单文件，然后推送到 fork。

   ```sh
   git add packages/pollinations registry.json
   git commit -m "feat: add Pollinations provider plugin"
   git push -u origin add-pollinations-provider
   ```

6. 从 fork 向 `magpie-community/plugins` 的 `main` 开 PR。PR 描述写下面这些要点：

   - 新增 provider 插件 `@magpie-community/opencode-pollinations-auth@0.1.0`，provider id 为 `pollinations`，market 名称是 `Pollinations`。
   - 登录方式有两种：手动粘贴 `sk_` 密钥，以及 `pk_` 发起设备码登录并换取 `sk_`。
   - 能力范围是动态发现 OpenAI 兼容的 text 模型、显示 Pollen 钱包余额（总额、Quest、已购）、读取账号用量和密钥用量。不实现签到：上游没有每日签到赠送、quest 领取只能在网页端，插件的 checkin 不发放额度，已按要求移除（见 005 测试报告第九节）。
   - 安全边界是只访问 `gen.pollinations.ai` 与 `enter.pollinations.ai`，密钥只放在 `Authorization` 请求头里，不进入 URL 查询参数和日志。
   - 差异说明：这是一个新渠道。`registry.json` 目前没有 `pollinations` 条目，不与现有渠道重复。README 第 449 行的 `One channel already listed` 规定，如果维护者认定它与已有条目属于同一个渠道，必须在 PR、包的 README 和 registry 的英文与中文 summary 三处说明登录方式、调用端点、支持能力和独有功能，否则不予合并。
   - 验收结果：列出 `bun test`、`bun scripts/check.mjs pollinations`、`bun scripts/check.mjs` 的通过情况，并说明 `opencode2.mjs` 的 SHA256 已核对一致。
   - 发布说明：合并后 `dist` 分支先提供安装；npm 首版发布和 Trusted Publisher 设置需要组织管理者执行 `sh scripts/owner.sh`。

7. 如果当前账号连 fork 也无法建立，或者 PR 无法提交，就把完整的 `packages/pollinations` 目录、第 8 节的 JSON 条目和上面的 PR 描述要点交给有权限的维护者，由对方按第 5 节执行。

8. 本手册不要求也不允许当前账号执行 `git push` 到 `magpie-community/plugins`，不执行 `npm publish`，不执行 `gh workflow run`。这些动作都需要第 5 节的前置权限。

## 7. registry 条目的英文和中文 summary 建议文案

下面这条目与 `docs/006-registry-entry.md` 保持一致，可整体加入 `registry.json` 的 `plugins` 数组。字段含义是：`package` 为 npm 包名，`name` 为市场显示名，`icon` 为图标地址，`providers` 为服务的 provider id 列表，`community` 标记为社区插件，`summary.en` 与 `summary.zh` 分别是英文和中文简介。

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

英文 summary 的建议文案单独列出，便于写 PR 描述：

> Pollinations with a secret key or device-code sign-in: live OpenAI-compatible models, Pollen wallet balance, Quest status, and usage. Rewards are claimed on the website.

中文 summary 的建议文案单独列出：

> 用密钥或设备码登录 Pollinations：动态发现 OpenAI 兼容模型，显示 Pollen 余额、任务状态与用量。任务奖励需在网页领取。

两点说明。第一，`icon` 使用 Pollinations 官网的 favicon；如果维护者要求图标随包发布，应改用包内 `icon.svg`，并同步修改 `package.json` 的 `magpie.icon`。第二，这条目不带 `kind` 字段，因为它是 provider 插件；`check.mjs` 会把带未知 `kind` 的 provider 条目判为错误。
