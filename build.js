/* =============================================================================
 * build.js — 从原始 UserScript 生成青龙面板可运行的单文件 msrewards_ql.js
 *
 * 用法：
 *   node build.js [原始脚本路径]
 *   默认源文件：同目录下的 source.user.js
 *
 * 思路：不重写 7418 行业务逻辑，只做「兼容层 + 6 处最小补丁」。
 *      上游脚本更新后，重新跑一次本脚本即可。
 * ============================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, 'source.user.js');
const POLYFILL = path.join(__dirname, 'ql-polyfill.js');
const OUT = path.join(__dirname, 'msrewards_ql.js');

if (!fs.existsSync(SRC)) throw new Error('找不到源脚本: ' + SRC
    + '\n请先放置原始 UserScript 为 source.user.js，或用 `node build.js <路径>` 指定。');
if (!fs.existsSync(POLYFILL)) throw new Error('找不到兼容层: ' + POLYFILL);

let src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const polyfill = fs.readFileSync(POLYFILL, 'utf8').replace(/\r\n/g, '\n');

function patch(from, to, label) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('补丁「' + label + '」匹配 ' + n + ' 次（应为 1 次），源脚本结构可能已变化');
    src = src.replace(from, to);
}

/* ① 出口检测：青龙跑在机房/云主机，默认必须关闭，否则 5 路探测会把它判成代理而全程停手。
      Config.lock 仍保持 true（保证 x-rewards-country=cn），两者解耦。 */
patch(
`        enabled() {
            return !!GM_getValue("Config.lock", true);
        },`,
`        enabled() {
            if (QL_MODE) return process.env.MSR_REGION_CHECK === "1";
            return !!GM_getValue("Config.lock", true);
        },`, 'RegionGuard.enabled');

/* ② 请求通道：青龙没有浏览器，page(CDP) / proxy(页面代发) 永远不可用，只留 xhr 直连 */
patch(
`        channelOrder() {
            return ["page", "proxy", "xhr"];
        },`,
`        channelOrder() {
            return QL_MODE ? ["xhr"] : ["page", "proxy", "xhr"];
        },`, 'BrowserEnv.channelOrder');

/* ③ 单轮预算可配（青龙 cron 自己控制频率，这里只限制单轮最长跑多久） */
patch(
`    const ROUND_BUDGET_MS = 20 * 60 * 1000;`,
`    const ROUND_BUDGET_MS = (QL_MODE ? (Number(process.env.MSR_ROUND_MIN) || 20) : 20) * 60 * 1000;`,
    'ROUND_BUDGET_MS');

/* ④ 启动方式：原脚本是「常驻 20 分钟调度」，青龙必须是「跑一轮就退出」 */
const QL_RUN = [
    '    bootstrap();',
    '    if (QL_MODE) {',
    '        /* 青龙每次都是全新进程，上一轮残留的调度标记不能拦住本轮 */',
    '        GM_setValue("Config.runState", null);',
    '        GM_setValue("Config.cronClaim", null);',
    '        GM_setValue("Config.runLock", null);',
    '        const t0 = Date.now();',
    '        const H = QL_HELPERS;',
    '        Utils.log("🚀", "青龙模式：单次执行（非常驻调度），Node " + process.version);',
    '        const hasToken = !!(process.env.MSR_REFRESH_TOKEN || GM_getValue("Config.token", false));',
    '        Utils.log("🔑", "凭据体检：refresh_token=" + (hasToken ? "有" : "无")',
    '            + " / cookie=" + (H.COOKIE_COUNT ? H.COOKIE_COUNT + " 项" : "无")',
    '            + " / sendNotify=" + (H.USE_QL_NOTIFY ? "启用" : "关闭"));',
    '        if (!hasToken && H.COOKIE_COUNT === 0) {',
    '            Utils.log("🔴", "未配置 MSR_REFRESH_TOKEN 或 MSR_COOKIE，本轮不会有任何积分入账");',
    '        } else if (!hasToken) {',
    '            Utils.log("🟡", "只有 Cookie：App / Edge DAPI 通道不可用，Cookie 过期需手动更新");',
    '        } else if (H.COOKIE_COUNT === 0) {',
    '            Utils.log("🟡", "只有 refresh_token：活动卡 / 搜索 / 领取积分等网页通道会失败");',
    '        }',
    '        if (process.env.MSR_CHECK === "1") {',
    '            Utils.log("🔍", "自检模式：做一次网络探测后退出，不跑任务");',
    '            H.qlProbe(() => {',
    '                Utils.log("✅", "部署自检完成");',
    '                setTimeout(() => process.exit(0), 100);',
    '            });',
    '        } else {',
    '            TaskManager.runAll()',
    '                .catch(e => Utils.log("🔴", "本轮异常：" + (e && e.message ? e.message : e)))',
    '                .finally(() => {',
    '                    /* 青龙的下一轮由外部 cron 决定，不写内部调度计划，避免误导日志 */',
    '                    Utils.log("🏁", "本轮结束，用时 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒");',
    '                    process.exitCode = 0;',
    '                    /* 兜底：万一还有定时器挂着，60 秒后强制退出，绝不拖住青龙任务 */',
    '                    const bail = setTimeout(() => process.exit(0), 60000);',
    '                    if (bail.unref) bail.unref();',
    '                });',
    '        }',
    '    } else {',
    '        Sched.start(init);',
    '    }'
].join('\n');

patch(
`    bootstrap();
    Sched.start(init);`,
    QL_RUN, '单次执行入口');

/* ④-0 原脚本为移动端搜索上报手工塞了 "cookie": "_Rwho=..."，Utils.xhr 见 headers 里
      已有 cookie 就不再注入 GM_cookie 的完整登录态 → 青龙下这些请求全部 401。
      浏览器版不能改（_Rwho 是刻意伪装设备），只在青龙下把两者合并。 */
patch(
`                const hasCookie = Object.keys(hdr).some(k => k.toLowerCase() === "cookie");
                if (needCookie && !hasCookie && this._ckReady) {
                    const ck = this._ckReady();
                    if (ck) hdr["cookie"] = ck;
                }`,
`                const cookieKey = Object.keys(hdr).find(k => k.toLowerCase() === "cookie");
                if (needCookie) {
                    const ck = (QL_MODE && globalThis.QL_COOKIE_HEADER)
                        || (this._ckReady ? this._ckReady() : "");
                    if (ck) {
                        if (QL_MODE && cookieKey) hdr[cookieKey] = hdr[cookieKey] + "; " + ck;
                        else if (!cookieKey) hdr["cookie"] = ck;
                    }
                }`,
    '手工 cookie 与登录态合并');

/* ④a 原脚本在「签到+阅读都关闭」时提前 return true，但不会加载 access_token。
      青龙下没有网页 Cookie 兜底，这会让余额 / 连签 / Edge / 月度计划全部失效。 */
patch(
`        async renewToken() {
            if (!GM_getValue("Tasks.sign", true) && !GM_getValue("Tasks.read", true)) return true;`,
`        async renewToken() {
            /* 青龙下即使关掉签到/阅读也要加载 Token：DAPI 余额/连签/Edge 都依赖它 */
            if (!QL_MODE && !GM_getValue("Tasks.sign", true) && !GM_getValue("Tasks.read", true)) return true;`,
    'renewToken 提前返回');

/* ④b 修「今日获取」恒为 +0：getBalance 依赖 access_token，必须放在 renewToken 之后。
      原脚本先读余额再刷 Token，token 未就绪时 DAPI 通道 withTokenRetry 直接返回 null，
      于是 startBalance=0，earned 的 (startBalance>0 && endBalance>0) 判定永远不成立。 */
const BALANCE_FROM = [
    '                const startBalance = await API.getBalance();',
    '                Utils.log("📊", `初始积分: ${startBalance}`);',
    '                let isTokenOK = await API.renewToken();',
    '                if (!isTokenOK) {',
    '                    /* Token 失效会每轮都命中，6 小时内只提醒一次 */',
    '                    Utils.logOnce("🟡", "Token失败，跳过签入/阅读", "tokenFail", 6 * 60 * 60 * 1000);',
    '                } else {',
    '                    Utils.resetOnce("tokenFail");',
    '                }'
].join('\n');
const BALANCE_TO = [
    '                let isTokenOK = await API.renewToken();',
    '                if (!isTokenOK) {',
    '                    /* Token 失效会每轮都命中，6 小时内只提醒一次 */',
    '                    Utils.logOnce("🟡", "Token失败，跳过签入/阅读", "tokenFail", 6 * 60 * 60 * 1000);',
    '                } else {',
    '                    Utils.resetOnce("tokenFail");',
    '                }',
    '                /* 先拿 Token 再读余额，否则 DAPI 无票据 → 初始积分恒为 0 */',
    '                const startBalance = await API.getBalance();',
    '                Utils.log("📊", "初始积分: " + startBalance);'
].join('\n');
patch(BALANCE_FROM, BALANCE_TO, '余额读取顺序');

/* ⑤ 去掉后台上下文的「永不 resolve 保活」，否则青龙任务永远不结束 */
patch(
`    if (!Utils.hasDOM()) {
        return new Promise(() => {});
    }`,
`    if (!Utils.hasDOM() && !QL_MODE) {
        return new Promise(() => {});
    }`, '去掉后台保活');

/* ⑥ 顶层 return 只在浏览器脚本里用于交回保活 Promise */
patch(
`if (__scBgKeepAlive && typeof __scBgKeepAlive.then === "function") {`,
`if (!QL_MODE && __scBgKeepAlive && typeof __scBgKeepAlive.then === "function") {`,
    '顶层 return 保护');

const banner = [
    '/* =============================================================================',
    ' * msrewards_ql.js — Microsoft Rewards 青龙面板版（自动生成，请勿直接编辑）',
    ' * 生成源：' + path.basename(SRC),
    ' * 生成时间：' + new Date().toISOString(),
    ' * 运行：node msrewards_ql.js     自检：MSR_CHECK=1 node msrewards_ql.js',
    ' * 依赖：无（仅 Node 内置模块，要求 Node >= 16）',
    ' * 部署：青龙 → 脚本管理 上传本文件 → 定时任务  `node /ql/data/scripts/msrewards_ql.js`',
    ' *       建议 cron：0,30 * * * *  （单轮预算 20 分钟，间隔需 > 20 分钟）',
    ' * 重新生成：node build.js [新版本脚本路径]',
    ' * ============================================================================= */',
    ''
].join('\n');

fs.writeFileSync(OUT, banner + polyfill + '\n' + src, 'utf8');
console.log('[build] 已生成: ' + OUT);
console.log('[build] 成品行数: ' + (banner + polyfill + '\n' + src).split('\n').length);
console.log('[build] 补丁: 9/9 全部命中');
