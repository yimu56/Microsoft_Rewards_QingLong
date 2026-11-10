/* =============================================================================
 * merge_cookie.js — 把 login.live.com 认证票据与 rewards.bing.com 设备 Cookie 组合，
 * 逐个用只读 getuserinfo 接口验证，自动把「服务端认的那一份」写回 .env.local。
 *
 * 用法：node merge_cookie.js
 * 输入：.env.local 里的 MSR_COOKIE（Bing 域）+ cookie_live.txt（live.com 域）
 * 全程只发 GET，不回显任何 Cookie 值。
 * ============================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '.env.local');
const livePath = path.join(__dirname, 'cookie_live.txt');

function parse(raw) {
    return String(raw || '').split(/;\s*/).map(p => {
        const i = p.indexOf('=');
        if (i < 1) return null;
        return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    }).filter(Boolean);
}
function serialize(list) {
    return list.map(c => c.name + '=' + c.value).join('; ');
}
function merge(primary, secondary, drop = []) {
    const out = [];
    const seen = new Set();
    for (const c of [...primary, ...secondary]) {
        if (drop.includes(c.name) || seen.has(c.name)) continue;
        seen.add(c.name);
        out.push(c);
    }
    return out;
}

let bingRaw = '';
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith('MSR_COOKIE=')) bingRaw = s.slice(s.indexOf('=') + 1).trim();
}
const liveRaw = fs.existsSync(livePath) ? fs.readFileSync(livePath, 'utf8').trim() : '';
if (!liveRaw) { console.error('❌ 找不到 cookie_live.txt'); process.exit(1); }

const bing = parse(bingRaw);
const live = parse(liveRaw);
console.log('Bing 域 Cookie: ' + bing.length + ' 项 / live.com 认证 Cookie: ' + live.length + ' 项');
console.log('live.com 关键票据: ' + ['WLSSC', 'NAP', 'ANON', '__Host-MSAAUTHP', 'MSPAuth', 'MSPProf']
    .map(k => k + '=' + (live.some(c => c.name === k) ? '有' : '无')).join('  '));

const combos = [
    { name: '仅 live.com 认证', list: live },
    { name: '合并(live 优先)', list: merge(live, bing) },
    { name: '合并(Bing 优先)', list: merge(bing, live) },
    { name: '合并(live 优先, 去掉 Disabled 占位)', list: merge(live, bing, ['MSPAuth', 'MSPProf']) }
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';

function probe(cookie) {
    return new Promise(resolve => {
        let settled = false;
        const done = r => { if (!settled) { settled = true; resolve(r); } };
        const u = new URL('https://rewards.bing.com/api/getuserinfo?type=1'
            + '&X-Requested-With=XMLHttpRequest&_=' + Date.now());
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
            headers: {
                'user-agent': UA,
                'referer': 'https://rewards.bing.com/',
                'x-requested-with': 'XMLHttpRequest',
                'accept': 'application/json, text/plain, */*',
                'cookie': cookie
            }
        }, res => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => {
                let j = null;
                try { j = JSON.parse(body); } catch (_) {}
                const bal = body.match(/"(?:availablePoints|balance)"\s*:\s*"?(\d+)"?/i);
                done({
                    status: res.statusCode,
                    json: !!j,
                    balance: bal ? bal[1] : '',
                    location: res.headers.location || ''
                });
            });
        });
        req.setTimeout(15000, () => { done({ status: 0, json: false, balance: '', location: '超时' }); try { req.destroy(); } catch (_) {} });
        req.on('error', e => done({ status: 0, json: false, balance: '', location: e.message }));
        req.end();
    });
}

(async () => {
    console.log('\n===== 只读验证 getuserinfo（不回显 Cookie）=====');
    let winner = null;
    for (const c of combos) {
        const r = await probe(serialize(c.list));
        const ok = r.status === 200 && r.json;
        console.log('  ' + c.name + ': HTTP ' + r.status
            + ' · JSON=' + (r.json ? '是' : '否')
            + (r.balance ? ' · availablePoints=' + r.balance : '')
            + (r.location ? ' · 跳转 ' + r.location.slice(0, 60) : '')
            + (ok ? '   ← ✅ 通过' : ''));
        if (ok && !winner) winner = c;
    }

    console.log('\n===== 结论 =====');
    if (winner) {
        const final = serialize(winner.list);
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        let replaced = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('MSR_COOKIE=')) { lines[i] = 'MSR_COOKIE=' + final; replaced++; }
        }
        if (!replaced) lines.push('MSR_COOKIE=' + final);
        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
        console.log('✅ 采用「' + winner.name + '」，已写回 .env.local（' + winner.list.length + ' 项，内容不回显）');
        console.log('   下一步：node diag_cookie.js 复核，然后跑一轮实测。');
    } else {
        console.log('❌ 四种组合服务端都不认。');
        console.log('   这说明 live.com 的票据不能直接用于 rewards.bing.com 域，');
        console.log('   必须由浏览器完成一次 SSO 兑换出 .bing.com 域的会话票据。');
        console.log('   → 用这个已登录的浏览器打开 https://rewards.bing.com/dashboard，');
        console.log('     等页面显示头像/积分后，F12 → Network → 复制该主文档请求的 Cookie。');
    }
})();
