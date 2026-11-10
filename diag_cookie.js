/* =============================================================================
 * diag_cookie.js — 诊断 .env.local 里的 MSR_COOKIE 到底有没有登录态
 *
 * 只读诊断：不发任何「上报/领取」请求，只 GET 页面与状态接口。
 * 不回显 Cookie 值，只列出 cookie 名字。
 *
 *   node diag_cookie.js
 * ============================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '.env.local');
let cookie = '';
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const s = line.trim();
        if (!s || s.startsWith('#')) continue;
        const i = s.indexOf('=');
        if (i < 1) continue;
        if (s.slice(0, i).trim() === 'MSR_COOKIE') cookie = s.slice(i + 1).trim();
    }
}
if (!cookie) { console.error('❌ .env.local 里没有 MSR_COOKIE'); process.exit(1); }

const names = cookie.split(/;\s*/).map(p => p.split('=')[0].trim()).filter(Boolean);
const SESSION_KEYS = ['MSPAuth', 'MSPProf', 'WLSSC', 'NAP', 'RPSAuth', 'ANON'];
const missing = SESSION_KEYS.filter(k => !names.includes(k));

console.log('===== Cookie 组成（只列名字，不显示值）=====');
console.log('共 ' + names.length + ' 项：' + names.join(', '));
console.log('\n账户会话票据检查：' + (missing.length === SESSION_KEYS.length
    ? '❌ 一项都没有' : (missing.length ? '⚠️ 缺少 ' + missing.join(', ') : '✅ 齐全')));
if (missing.length) {
    console.log('说明：MSPAuth / WLSSC / NAP 这类票据在 .live.com 域，');
    console.log('      通常在 login.live.com 页面才看得到；rewards.bing.com 请求未必会带上。');
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';

const targets = [
    { name: 'dashboard 主页面', url: 'https://rewards.bing.com/dashboard' },
    { name: 'earn 任务页面', url: 'https://rewards.bing.com/earn' },
    { name: 'getuserinfo 接口', url: 'https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=' + Date.now() }
];

function probe(t) {
    return new Promise(resolve => {
        let settled = false;
        const done = r => { if (!settled) { settled = true; resolve(r); } };
        const u = new URL(t.url);
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
            headers: {
                'user-agent': UA,
                'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
                'accept-language': 'zh-CN,zh;q=0.9',
                'referer': 'https://rewards.bing.com/',
                'x-requested-with': 'XMLHttpRequest',
                'cookie': cookie
            }
        }, res => {
            let body = '';
            res.on('data', c => { if (body.length < 400000) body += c; });
            res.on('end', () => {
                const marks = [];
                if (/login\.live\.com|signin|Sign in|请登录/i.test(body)) marks.push('出现登录页特征');
                if (/"(?:balance|availablePoints)"/i.test(body)) marks.push('含余额字段');
                if (/"pointClaim"/i.test(body)) marks.push('含待领池');
                if (/"(?:userInfo|User|displayName)"/i.test(body)) marks.push('含用户信息');
                done({
                    name: t.name, status: res.statusCode,
                    location: res.headers.location || '',
                    length: body.length, marks: marks.length ? marks.join(' / ') : '无明显特征'
                });
            });
        });
        req.setTimeout(15000, () => { done({ name: t.name, status: 0, location: '', length: 0, marks: '超时' }); try { req.destroy(); } catch (_) {} });
        req.on('error', e => done({ name: t.name, status: 0, location: '', length: 0, marks: '网络错误 ' + e.message }));
        req.end();
    });
}

(async () => {
    console.log('\n===== 只读端点探测 =====');
    for (const t of targets) {
        const r = await probe(t);
        console.log(`  ${r.name}: HTTP ${r.status} · ${r.length} 字节 · ${r.marks}`
            + (r.location ? ' · 跳转 ' + r.location.slice(0, 90) : ''));
    }
    console.log('\n===== 判定 =====');
    console.log('若 dashboard / earn 返回 200 且含余额字段 → Cookie 其实有效，');
    console.log('  只是 getuserinfo 这个老接口单独 401，自检的判定过于武断，需要放宽。');
    console.log('若页面 302 跳 login.live.com 或返回登录页 → Cookie 确实没有登录态，');
    console.log('  请在【已登录】的 rewards.bing.com 页面 F12 → Network → 复制主文档请求的 Cookie，');
    console.log('  或到 login.live.com 页面把 MSPAuth / WLSSC / NAP 一并补进 MSR_COOKIE。');
})();
