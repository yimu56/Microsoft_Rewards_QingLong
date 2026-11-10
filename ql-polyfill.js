/* =============================================================================
 * Microsoft Rewards · 青龙面板兼容层 (QingLong / Node.js)
 * -----------------------------------------------------------------------------
 * 作用：在 Node 里补齐 UserScript 依赖的 GM_* / 浏览器全局，
 *       让原始 7418 行 Userscript 逻辑几乎原样复用。
 * 本文件由 build.js 拼到成品 msrewards_ql.js 的开头，不要单独运行。
 *
 * 环境变量（青龙「环境变量」面板里配置）：
 *   MSR_REFRESH_TOKEN  必填(推荐) 微软 OAuth refresh_token，走 DAPI/App 通道
 *   MSR_COOKIE         必填(推荐) rewards.bing.com 的完整 Cookie，走网页通道
 *   MSR_WEWORK / MSR_DINGDING / MSR_FEISHU / MSR_PUSHME / MSR_BARK
 *                      可选，webhook 机器人 key
 *   MSR_QL_NOTIFY      可选，1/0 强制开关 sendNotify（默认：未配 webhook 时自动启用）
 *   MSR_REGION_CHECK   可选，1=启用出口检测（默认关闭，云服务器在机房会被判死）
 *   MSR_ROUND_MIN      可选，单轮预算分钟数（默认 20）
 *   MSR_SPAN           可选，动作最小间隔秒（默认 30，下限 30）
 *   MSR_HOT_API        可选，搜索词接口 offline / hot.nntool.cc / ...（默认 offline）
 *   MSR_STATE_FILE     可选，状态文件路径（默认脚本同目录 .ms_rewards_state.json）
 *   MSR_CHECK          可选，1=只做体检+网络探测，不跑任务，用于验证部署
 *   MSR_TASK_SIGN / MSR_TASK_READ / MSR_TASK_PROMOS / MSR_TASK_QUIZ
 *   MSR_TASK_SEARCH / MSR_TASK_EDGE / MSR_TASK_DESKTOPWEEKLY
 *   MSR_TASK_MONTHLY / MSR_TASK_CLAIMPOINTS   可选，1/0 单任务开关（默认全开）
 * ============================================================================= */

const QL_MODE = true;

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const nodeCrypto = require('crypto');
const NodeURL = require('url').URL;

/* 可选：从同目录 .env.local 载入变量（按行 KEY=VALUE 解析，不经过 shell，
   所以 Cookie 里的分号 / 空格 / 等号都不会被误解析）。命令行与青龙面板的变量优先。 */
try {
    const localEnv = path.join(__dirname, '.env.local');
    if (fs.existsSync(localEnv)) {
        let n = 0;
        for (const line of fs.readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
            const s = line.trim();
            if (!s || s.startsWith('#')) continue;
            const i = s.indexOf('=');
            if (i < 1) continue;
            const k = s.slice(0, i).trim();
            let v = s.slice(i + 1).trim();
            if (v.length > 1 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
                v = v.slice(1, -1);
            }
            if (v && !process.env[k]) { process.env[k] = v; n++; }
        }
        if (n) console.log('[env] 已从 .env.local 载入 ' + n + ' 个变量（内容不回显）');
    }
} catch (e) { console.log('[env] .env.local 读取失败: ' + e.message); }

const ENV = process.env;
const STATE_FILE = ENV.MSR_STATE_FILE || path.join(__dirname, '.ms_rewards_state.json');
const envBool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

/* ---------- GM_getValue / GM_setValue：JSON 文件持久化 ---------- */
let store = {};
try {
    store = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
} catch (_) { store = {}; }

function saveStore() {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(store), 'utf8'); }
    catch (e) { console.log('[state] 写入失败: ' + e.message); }
}

/* 环境变量映射成 GM 配置的「初始值」。
   优先级：脚本运行时写入的值 > 环境变量 > 代码自带默认值。
   这样脚本里 Auth.save / applyToken 等写操作仍然生效。 */
const COOKIE_RAW = String(ENV.MSR_COOKIE || '').trim();
const DEFAULTS = {};
const put = (k, v) => { if (v !== undefined && v !== null && v !== '') DEFAULTS[k] = v; };

put('Config.token', ENV.MSR_REFRESH_TOKEN);
/* 直接赋空值（put 会跳过空串）：青龙没有授权页，必须让 Auth.stored() 返回 null，
   access_token 为空才能触发 renewToken 用 refresh_token 换取。 */
DEFAULTS['Config.code'] = '';
DEFAULTS['Config.accessToken'] = '';
DEFAULTS['Config.accessTokenTime'] = 0;
put('Config.autoAuth', false);                 // 青龙下不尝试静默捕获授权码
put('Config.cookieProbed', true);              // 跳过「请求 Cookie 读取权限」的浏览器交互提示
put('Config.lock', true);                      // country 固定 cn（与 RegionGuard 解耦）
put('Config.api', ENV.MSR_HOT_API || 'offline');
put('Config.span', Number(ENV.MSR_SPAN) || 30);
put('Config.cookieRaw', COOKIE_RAW);
put('Config.cdpAllowNewTab', false);
put('Config.allowOpenTab', false);             // 禁止打开标签页：青龙没有浏览器
put('Config.usePageChannel', false);           // 禁止页面代发通道
put('Config.questViaCdp', false);
put('Config.pageServerOff', true);
put('Notice.wework', ENV.MSR_WEWORK);
put('Notice.dingding', ENV.MSR_DINGDING);
put('Notice.feishu', ENV.MSR_FEISHU);
put('Notice.pushme', ENV.MSR_PUSHME);
put('Notice.bark', ENV.MSR_BARK);
put('Notice.bro', true);
const taskKeys = {
    MSR_TASK_SIGN: 'Tasks.sign', MSR_TASK_READ: 'Tasks.read',
    MSR_TASK_PROMOS: 'Tasks.promos', MSR_TASK_QUIZ: 'Tasks.quiz',
    MSR_TASK_SEARCH: 'Tasks.search', MSR_TASK_EDGE: 'Tasks.edge',
    MSR_TASK_DESKTOPWEEKLY: 'Tasks.desktopWeekly',
    MSR_TASK_MONTHLY: 'Tasks.monthly', MSR_TASK_CLAIMPOINTS: 'Tasks.claimPoints'
};
for (const [ek, gk] of Object.entries(taskKeys)) put(gk, envBool(ENV[ek], true));

const hasWebhook = ['wework', 'dingding', 'feishu', 'pushme', 'bark']
    .some(k => !!DEFAULTS['Notice.' + k]);
const USE_QL_NOTIFY = envBool(ENV.MSR_QL_NOTIFY, !hasWebhook);

global.GM_getValue = function (key, def) {
    /* refresh_token 来自环境变量时，tokenTime 恒为「现在」：
       否则原脚本会因为「超过 7 天」主动丢弃 token 并掉进授权码流程。 */
    if (key === 'Config.tokenTime' && ENV.MSR_REFRESH_TOKEN) return Date.now();
    if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return DEFAULTS[key];
    return def;
};
global.GM_setValue = function (key, val) { store[key] = val; saveStore(); };

/* ---------- GM_xmlhttpRequest：Node 原生 http/https ---------- */
/* 不自动跟随重定向，保持原脚本 Utils.xhr 对 301/302 读 Location 的行为。 */
global.GM_xmlhttpRequest = function (opts) {
    opts = opts || {};
    const fail = (fn, arg) => { try { if (typeof fn === 'function') fn(arg); } catch (_) {} };
    let u;
    try { u = new NodeURL(String(opts.url || '')); }
    catch (_) { setImmediate(() => fail(opts.onerror, { error: 'invalid url' })); return { abort() {} }; }

    const mod = u.protocol === 'http:' ? http : https;
    const headers = Object.assign({}, opts.headers || {});
    const body = (opts.data == null) ? null : Buffer.from(String(opts.data), 'utf8');
    if (body && !Object.keys(headers).some(h => h.toLowerCase() === 'content-length')) {
        headers['Content-Length'] = body.length;
    }
    const timeout = Number(opts.timeout) || 15000;
    let settled = false;
    let guard = null;

    const req = mod.request({
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: (opts.method || 'GET').toUpperCase(),
        headers: headers
    }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
            if (settled) return;
            settled = true;
            if (guard) clearTimeout(guard);
            const text = Buffer.concat(chunks).toString('utf8');
            const rh = res.rawHeaders || [];
            const lines = [];
            for (let i = 0; i + 1 < rh.length; i += 2) lines.push(rh[i] + ': ' + rh[i + 1]);
            const responseHeaders = lines.join('\r\n') + '\r\n';
            const redirected = [301, 302, 307, 308].includes(res.statusCode);
            fail(opts.onload, {
                status: res.statusCode,
                statusText: res.statusMessage || '',
                responseText: text,
                response: text,
                responseHeaders: responseHeaders,
                finalUrl: (redirected && res.headers.location) ? res.headers.location : opts.url,
                responseURL: opts.url,
                readyState: 4
            });
        });
    });

    guard = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { req.destroy(); } catch (_) {}
        fail(opts.ontimeout);
    }, timeout);

    req.on('error', e => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        fail(opts.onerror, { error: e && e.message ? e.message : String(e) });
    });

    try {
        if (body) req.write(body);
        req.end();
    } catch (e) {
        if (!settled) {
            settled = true;
            if (guard) clearTimeout(guard);
            fail(opts.onerror, { error: e.message });
        }
    }
    return { abort() { try { req.destroy(); } catch (_) {} } };
};

/* ---------- GM_cookie：把 MSR_COOKIE 拆成 GM_cookie.list 的结构 ---------- */
const COOKIE_LIST = COOKIE_RAW.split(/;\s*/).map(part => {
    const i = part.indexOf('=');
    if (i < 1) return null;
    return {
        name: part.slice(0, i).trim(),
        value: part.slice(i + 1).trim(),
        domain: '.bing.com', path: '/', hostOnly: false,
        secure: true, httpOnly: true, sameSite: 'Lax'
    };
}).filter(Boolean);

global.GM_cookie = {
    list(filter, cb) {
        try { cb(COOKIE_LIST.slice()); }
        catch (_) { try { cb([]); } catch (_2) {} }
    }
};

/* ---------- 通知：青龙 sendNotify + 日志 ---------- */
let qlNotify = null;
if (USE_QL_NOTIFY) {
    for (const p of [
        path.join(__dirname, 'sendNotify'),
        path.join(process.cwd(), 'sendNotify'),
        '/ql/scripts/sendNotify',
        '/ql/data/scripts/sendNotify'
    ]) {
        try {
            const m = require(p);
            if (m && typeof m.sendNotify === 'function') { qlNotify = m.sendNotify; break; }
        } catch (_) {}
    }
}

global.GM_notification = function (o) {
    /* 内容已由 GM_log 完整输出；没有青龙 sendNotify 通道时不再重复打印一遍 */
    if (!qlNotify) return;
    const title = (o && o.title) || 'Microsoft Rewards';
    const text = String((o && o.text) || '');
    try { Promise.resolve(qlNotify(title, text)).catch(() => {}); } catch (_) {}
};

/* ---------- 其它 GM_* 桩 ---------- */
global.GM_log = function (...args) { console.log(...args); };
global.GM_info = {
    script: { name: '微软积分(青龙版)', version: '1.3.0-ql', namespace: 'qinglong' },
    scriptHandler: 'QingLong/Node ' + process.version
};
global.GM_openInTab = function () { return false; };
global.GM_closeTab = function () {};
global.GM_registerMenuCommand = function () {};
global.GM_addValueChangeListener = function () { return 0; };
global.GM_removeValueChangeListener = function () {};

/* ---------- 浏览器全局桩 ---------- */
global.location = {
    href: 'http://localhost/', hostname: 'localhost', pathname: '/',
    search: '', hash: '', protocol: 'http:', host: 'localhost'
};
global.window = {
    name: '', location: global.location, history: {},
    addEventListener() {}, removeEventListener() {}, close() {}
};
global.unsafeWindow = global.window;
global.navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
        + 'Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
    language: 'zh-CN'
};
/* 关掉 WebSocket => CDP.available() 直接短路，所有浏览器真实点击通道自动跳过 */
try { globalThis.WebSocket = undefined; } catch (_) {}
/* crypto.randomUUID：Node 16/18/20/22 通吃 */
if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
    try { globalThis.crypto = nodeCrypto.webcrypto; } catch (_) {}
    if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
        globalThis.crypto = { randomUUID: () => nodeCrypto.randomUUID() };
    }
}

/* ---------- 自检用的轻量出口探测（MSR_CHECK=1 时调用） ---------- */
function qlProbeNetwork(done) {
    let finished = false;
    const once = () => { if (finished) return; finished = true; done(); };
    const req = https.get('https://www.cloudflare.com/cdn-cgi/trace', res => {
        let s = '';
        res.on('data', c => { s += c; });
        res.on('end', () => {
            const loc = (s.match(/^loc=(.+)$/m) || [])[1] || '?';
            const ip = (s.match(/^ip=(.+)$/m) || [])[1] || '?';
            console.log('[体检] 网络出站正常：loc=' + loc + ' ip=' + ip);
            once();
        });
    });
    req.setTimeout(8000, () => {
        console.log('[体检] 网络探测超时（不影响部署）');
        once();
        try { req.destroy(); } catch (_) {}
    });
    req.on('error', e => {
        console.log('[体检] 网络探测失败: ' + e.message + '（不影响部署）');
        once();
    });
}

/* Cookie 有效性：只读 getuserinfo，不做任何上报动作。
   HttpOnly cookie 用 document.cookie 读不到，只能从 F12 复制，这里正好能验出复制全没全。 */
function qlProbeCookie(done) {
    if (!COOKIE_RAW) {
        console.log('[体检] Cookie 未配置 → 活动卡 / 搜索 / 领取积分等网页通道将不可用');
        return done();
    }
    let finished = false;
    const once = () => { if (finished) return; finished = true; done(); };
    const u = new NodeURL('https://rewards.bing.com/api/getuserinfo?type=1'
        + '&X-Requested-With=XMLHttpRequest&_=' + Date.now());
    const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        headers: {
            'user-agent': global.navigator.userAgent,
            'referer': 'https://rewards.bing.com/',
            'x-requested-with': 'XMLHttpRequest',
            'cookie': COOKIE_RAW
        }
    }, res => {
        let s = '';
        res.on('data', c => { s += c; });
        res.on('end', () => {
            let isJson = false;
            try { const j = JSON.parse(s); isJson = !!(j && typeof j === 'object'); } catch (_) {}
            if (res.statusCode === 200 && isJson) {
                const bal = (s.match(/"(?:balance|availablePoints)"\s*:\s*"?(\d+)"?/i) || [])[1];
                console.log('[体检] Cookie 有效 ✓（getuserinfo 返回 JSON'
                    + (bal ? '，余额 ' + bal : '') + '）');
            } else if (res.statusCode === 401 || res.statusCode === 403) {
                console.log('[体检] Cookie 无效或已过期 ✗（HTTP ' + res.statusCode
                    + '）→ 请重新从 F12 复制完整 Cookie');
            } else {
                console.log('[体检] Cookie 状态不确定（HTTP ' + res.statusCode
                    + '，响应片段 ' + s.slice(0, 80).replace(/\s+/g, ' ') + '）');
            }
            once();
        });
    });
    req.setTimeout(12000, () => {
        console.log('[体检] Cookie 探测超时（不影响部署）');
        once();
        try { req.destroy(); } catch (_) {}
    });
    req.on('error', e => {
        console.log('[体检] Cookie 探测失败: ' + e.message + '（不影响部署）');
        once();
    });
    req.end();
}

function qlProbe(done) { qlProbeNetwork(() => qlProbeCookie(done)); }

/* 青龙的 Cookie 来自环境变量，不依赖原脚本 getCookieHeader() 的惰性初始化。
   原脚本只在 4 个特定任务里调它，关掉那些任务后 Utils._ckReady 从未被设置，
   导致所有 Utils.xhr 请求都不带登录态 —— 这里直接提供给补丁 9 使用。 */
global.QL_COOKIE_HEADER = COOKIE_RAW;

global.QL_HELPERS = { qlProbe, envBool, hasWebhook, USE_QL_NOTIFY, COOKIE_COUNT: COOKIE_LIST.length, STATE_FILE };
