# Microsoft Rewards · 青龙面板版

在青龙面板（QingLong）上自动完成 Microsoft Rewards 每日任务、自动领取积分奖励的 Node.js 脚本。零第三方依赖，仅用 Node 内置模块，`node` 直接运行。

> 这是 [微软积分自动化脚本](https://rewards.bing.com/)（原 Userscript 版）的青龙适配版。原脚本是浏览器油猴脚本，本项目通过「兼容层 + 最小补丁」让同一套业务逻辑在 Node / 青龙环境里跑起来，**不改动原脚本的核心逻辑**，上游更新后可重新生成。

---

## 功能

- ✅ 每日签到（App 通道静默签入）
- ✅ 新闻阅读（每日 30 分，逐篇回读确认记账）
- ✅ PC 搜索（每日 60 分，固定节拍 + 随机延迟，自动限流保护）
- ✅ 每日活动（Daily Set，DAPI 通道）
- ✅ Quiz 自动答题
- ✅ 连签任务检测（每日连续打卡）
- ✅ Edge 浏览连签（DAPI 分次上报，累计 30 分钟）
- ✅ 自动领取待领积分（受限于登录态，见「已知限制」）
- ✅ 活动卡片 / 月度计划 / 桌面周任务（网页通道）
- ✅ 多平台消息推送：企业微信 / 钉钉 / 飞书 / PushMe / Bark，及青龙 `sendNotify`

## 环境要求

- Node.js ≥ 16
- 青龙面板（或任意能跑定时 `node` 任务的环境）

## 快速开始

### 1. 准备凭据

脚本需要两条凭据，分别对应两套通道，**建议都配置**：

| 环境变量 | 用途 | 获取方式 |
| --- | --- | --- |
| `MSR_REFRESH_TOKEN` | 微软 OAuth refresh_token（DAPI / App 通道） | `node get_token.js` |
| `MSR_COOKIE` | `rewards.bing.com` 的登录 Cookie（网页通道） | F12 → Network → 主文档请求头 |

#### 获取 refresh_token（全程无需任何浏览器插件）

```bash
# ① 打印授权链接与详细步骤
node get_token.js

# ② 浏览器打开授权链接，登录后立刻复制跳转后的完整地址，交给工具兑换
node get_token.js "https://login.live.com/oauth20_desktop.srf?code=M.C561...&lc=2052"

# ③ 或直接用系统自带 curl / PowerShell 兑换（见 get_token.js 内置说明）
```

#### 获取 Cookie

打开 `https://rewards.bing.com/`（已登录，页面能显示头像与积分），F12 → Network → 刷新 → 点第一条 **document 类型**的主文档请求 → Headers → Request Headers → 复制 `Cookie:` 一整串。

> 若复制到的 Cookie 缺少账户票据（`getuserinfo` 返回 401），可尝试从 `https://login.live.com/` 已登录会话复制 Cookie，再用 `node merge_cookie.js` 自动组合并验证。

### 2. 配置

```bash
# 本地测试：复制模板并填入真实值
cp .env.local.example .env.local
# 编辑 .env.local，填入 MSR_REFRESH_TOKEN 与 MSR_COOKIE
```

或者在青龙「环境变量」面板里添加同名变量（`MSR_REFRESH_TOKEN`、`MSR_COOKIE` 等）。

### 3. 运行

```bash
# 只做部署体检（网络探测 + 凭据来源 + Cookie 登录态），不跑任务
MSR_CHECK=1 node msrewards_ql.js

# 正常跑一轮
node msrewards_ql.js
```

> ⚠️ **在 SSH 里手敲 `node` 读不到青龙面板的环境变量**——面板变量只在青龙调度器
> 执行任务时注入子进程，和你的登录 shell 是两个环境。所以 SSH 下手动跑必须显式传入：
>
> ```bash
> # 方式一：env 前缀（推荐，青龙面板「手动运行」也用它）
> env MSR_CHECK=1 MSR_REFRESH_TOKEN='...' MSR_COOKIE='...' node msrewards_ql.js
>
> # 方式二：先写 .env.local（脚本同目录，会被自动载入，已在 .gitignore 里）
> printf "MSR_REFRESH_TOKEN=...\nMSR_COOKIE=...\n" > .env.local
> MSR_CHECK=1 node msrewards_ql.js
> ```
>
> **不要**在青龙任务命令里写 `MSR_CHECK=1 node xxx.js`：青龙用
> `task-timeout.sh` 包一层 `exec "$@"`，`VAR=value cmd` 前缀赋值只在真 shell 里有效，
> 会被当成要执行的可执行文件名，报 `MSR_CHECK=1: command not found`（退出码 127）。
> 青龙里请写 `env MSR_CHECK=1 node xxx.js`。

### 4. 青龙定时任务

```
任务命令：node /ql/data/scripts/msrewards_ql.js
定时规则：0,30 * * * *
```

> 单轮预算默认 20 分钟，两轮间隔必须大于 20 分钟。

---

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MSR_REFRESH_TOKEN` | 是 | 微软 OAuth refresh_token（DAPI / App 通道）。**该值存在时，状态文件里的同名键一律被忽略，且不会回写** |
| `MSR_COOKIE` | 是 | `rewards.bing.com` 完整登录 Cookie（网页通道，格式 `a=1; b=2`） |
| `MSR_WEWORK` | 否 | 企业微信群机器人 key |
| `MSR_DINGDING` | 否 | 钉钉群机器人 access_token |
| `MSR_FEISHU` | 否 | 飞书群机器人 hook |
| `MSR_PUSHME` | 否 | PushMe push_key |
| `MSR_BARK` | 否 | Bark 推送 key |
| `MSR_QL_NOTIFY` | 否 | `1`/`0`，强制开关青龙 `sendNotify`（未配 webhook 时自动启用） |
| `MSR_REGION_CHECK` | 否 | `1` 启用出口地区检测（默认关；云服务器在机房会被判死） |
| `MSR_ROUND_MIN` | 否 | 单轮预算分钟数，默认 20 |
| `MSR_SPAN` | 否 | 动作最小间隔秒，默认 30（下限 30） |
| `MSR_HOT_API` | 否 | 搜索词接口：`offline` / `hot.nntool.cc` / `hot.baiwumm.com` / `hot.cnxiaobai.com` |
| `MSR_STATE_FILE` | 否 | 状态文件路径，默认脚本同目录 `.ms_rewards_state.json` |
| `MSR_CHECK` | 否 | `1` 只做体检不跑任务 |
| `MSR_TASK_SIGN` | 否 | `1`/`0`，签到开关（默认开） |
| `MSR_TASK_READ` | 否 | 阅读开关（默认开） |
| `MSR_TASK_PROMOS` | 否 | 活动卡片开关（默认开） |
| `MSR_TASK_QUIZ` | 否 | Quiz 开关（默认开） |
| `MSR_TASK_SEARCH` | 否 | PC 搜索开关（默认开） |
| `MSR_TASK_EDGE` | 否 | Edge 浏览连签开关（默认开） |
| `MSR_TASK_DESKTOPWEEKLY` | 否 | 桌面周任务开关（默认开） |
| `MSR_TASK_MONTHLY` | 否 | 月度计划开关（默认开） |
| `MSR_TASK_CLAIMPOINTS` | 否 | 自动领取待领积分开关（默认开） |

---

## 项目结构

```
msrewards_ql.js        成品单文件（青龙直接跑，由 build.js 生成）
source.user.js         原始 UserScript（构建源，需自行放置）
build.js               生成器：源脚本 + 11 处补丁 + 兼容层 → 成品
ql-polyfill.js         兼容层（GM_* / 浏览器全局的 Node 实现）
get_token.js           获取 refresh_token 的工具（零插件）
merge_cookie.js        Cookie 组合与验证工具
diag_cookie.js         Cookie 登录态只读诊断工具
.env.local.example     环境变量模板
```

> `build.js` 的每一处补丁都做「必须恰好匹配 1 次」校验，上游脚本结构一变就立刻报错退出，
> 不会静默生成一个半坏的成品。

重新生成成品：

```bash
node build.js            # 使用同目录 source.user.js
node build.js <路径>     # 指定源脚本
```

---

## 已知限制

- **依赖网页登录态的任务**（活动卡片发现、领取积分、月度计划、桌面周任务）需要有效的 `MSR_COOKIE`。新版 Rewards 网页采用 Entra ID SSO，某些场景下 Live 域票据无法直接复用，需从已登录的 `rewards.bing.com` 主文档请求复制 Cookie。
- **需要浏览器真实点击的卡片**（带锁的 App 搜索卡等）依赖浏览器 CDP，青龙环境无浏览器，无法完成，脚本会自动跳过并标注。
- PC 搜索等服务端结算存在几十秒到几分钟的延迟，脚本的回读可能暂时显示「未记账」，但 `NO_CREDIT_LIMIT` 兜底会继续执行，不影响最终得分。

---

## 故障排查

### `invalid_grant` / 「检测到尚未授权」

`refresh_token` 失效。重新授权：

```bash
node get_token.js                    # ① 打印授权链接
node get_token.js '跳转后的完整地址' --save   # ② 兑换并写入 .env.local
```

> **Linux bash 下的坑**：授权码里含 `!`，双引号内会被 bash 当作历史展开，报
> `!xxx: event not found`。请先 `set +H` 关闭历史展开，或改用**单引号**：
>
> ```bash
> set +H
> node get_token.js 'https://login.live.com/oauth20_desktop.srf?code=M.C508_...'
> ```

### Cookie 体检报「无登录态」，但浏览器页面明明显示已登录

这是新版 Rewards 最常见的误解。**页面显示头像和积分 ≠ Cookie 里有票据**：
服务端用 Entra ID 会话渲染好内容给你，票据存在 `login.windows.net` 域，
`rewards.bing.com` 域下可能一项认证 Cookie 都没有。

实测判据：拿 Cookie 直接请求 `rewards.bing.com/earn`，如果返回
`307 → login.windows.net/consumers/oauth2/v2.0/authorize`，说明服务端不认这份凭证。

**对照检查**：正常登录态至少应包含 `_U`（Bing 登录标识）。在浏览器 Console 里跑：

```js
document.cookie.split(';').map(s => s.trim().split('=')[0]).join(', ')
```

**没有 `_U` 就是没登录态**，别再反复复制了，按下面处理：

1. **改用 Edge**（SSO 集成更完整）：登录后重新从 `/earn` 主文档请求复制 Cookie
2. **Chrome 关第三方 Cookie 限制**：`chrome://flags/#third-party-cookie-phaseout` 设为 Disabled，重启后重登
3. 以上都拿不到 → 接受现实，只用 DAPI 通道，关掉网页通道任务：
   ```
   MSR_TASK_PROMOS=0
   MSR_TASK_CLAIMPOINTS=0
   MSR_TASK_MONTHLY=0
   MSR_TASK_DESKTOPWEEKLY=0
   ```
   签到 / 阅读 / 搜索 / 连签 / DAPI 每日活动仍可正常拿分（约 90~100 分/天）。

### 面板里换了新 token，脚本还是报旧 token 失效

旧版本在 `invalid_grant` 时会把 `Config.token` 写成 `false` 存进
`.ms_rewards_state.json`，而 `GM_getValue` 的优先级是「状态文件 > 环境变量」，
于是 `false` 永久压住了面板里的新值。

现版本已修：启动时自动清理被污染的 `Config.token` / `Config.tokenTime` /
`Config.accessToken` / `Config.accessTokenTime`，并且**环境变量存在时该键无条件以环境变量为准**，
失效时也不再回写。

升级到修复版后跑一次即可，日志会打印：

```
[state] 已清理被污染的字段: Config.token, Config.tokenTime（旧版 token 失效时写过 false，会永久压住环境变量）
🔑 凭据体检：refresh_token=有（环境变量） / cookie=9 项（环境变量）
```

### 青龙报 `MSR_CHECK=1: command not found`（退出码 127）

青龙用 `task-timeout.sh` 包一层 `exec "$@"`，`VAR=value cmd` 前缀赋值只在真 shell 里有效。
改写成 `env`：

```
env MSR_CHECK=1 node yimu56_Microsoft_Rewards_QingLong/msrewards_ql.js
```

### `DAPI 响应不是 JSON: null` 反复出现

几乎都是 `refresh_token` 失效的连带结果：DAPI 返回 401，响应体为空，
`JSON.parse` 得到 null。**先修 token**，这条会成批消失，不用逐项排查。

### 桌面任务 / 月度计划交卷返回 `HTTP 200` 但内容是 `$Sreact.fragment`

这是 Next.js Server Action 的错误帧，不是鉴权问题。上游脚本的 `next-action` id 与
微软前端部署版本不匹配时会出现（日志里会有「服务端标识表已更新（部署 xxx）」）。
属于上游脚本跟进微软前端变化的固有脆弱点，等上游更新或临时关掉对应任务开关。

---

## 免责声明

本项目仅供学习与自动化技术交流。使用本脚本自动化完成 Microsoft Rewards 任务可能违反微软服务条款，可能导致积分清零或账号受限，请自行评估风险，作者不对任何后果负责。

## License

[MIT](./LICENSE) · Copyright (c) 2026 [yimu56](https://github.com/yimu56)
