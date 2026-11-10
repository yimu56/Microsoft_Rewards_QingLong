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
# 只做部署体检（网络探测 + 凭据检查 + Cookie 有效性），不跑任务
MSR_CHECK=1 node msrewards_ql.js

# 正常跑一轮
node msrewards_ql.js
```

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
| `MSR_REFRESH_TOKEN` | 是 | 微软 OAuth refresh_token（DAPI / App 通道） |
| `MSR_COOKIE` | 是 | `rewards.bing.com` 完整登录 Cookie（网页通道） |
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
build.js               生成器：源脚本 + 9 处补丁 + 兼容层 → 成品
ql-polyfill.js         兼容层（GM_* / 浏览器全局的 Node 实现）
get_token.js           获取 refresh_token 的工具（零插件）
merge_cookie.js        Cookie 组合与验证工具
diag_cookie.js         Cookie 登录态只读诊断工具
.env.local.example     环境变量模板
```

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

## 免责声明

本项目仅供学习与自动化技术交流。使用本脚本自动化完成 Microsoft Rewards 任务可能违反微软服务条款，可能导致积分清零或账号受限，请自行评估风险，作者不对任何后果负责。

## License

[MIT](./LICENSE) · Copyright (c) 2026 [yimu56](https://github.com/yimu56)
