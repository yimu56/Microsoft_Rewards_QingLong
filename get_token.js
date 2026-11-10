/* =============================================================================
 * get_token.js — 获取青龙所需的 MSR_REFRESH_TOKEN（全程零插件、零第三方依赖）
 *
 * 三种方式，都不需要 Tampermonkey / ScriptCat / 任何浏览器扩展：
 *
 *  ① 最省事（浏览器 + 本工具，浏览器一个插件都不用装）
 *     node get_token.js                                   → 打印授权链接和步骤
 *     node get_token.js "授权跳转后的完整URL或code"        → 直接输出 refresh_token
 *
 *  ② 连本工具都不装（Windows 自带 curl / PowerShell，见下方 usage）
 *
 *  ③ 纯 HTTP，连浏览器都不用开（用 login.live.com 的登录 Cookie 静默走完 OAuth）
 *     node get_token.js --cookie "login.live.com 的完整 Cookie"
 *     MSR_LIVE_COOKIE="..." node get_token.js --cookie   → 等价，避免命令行引号问题
 *
 * 本工具只访问 login.live.com 官方接口，凭据不落盘、不外发。
 * ============================================================================= */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = '0000000040170455';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'service::prod.rewardsplatform.microsoft.com::MBI_SSL';
const AUTH_URL = 'https://login.live.com/oauth20_authorize.srf?client_id=' + CLIENT_ID
    + '&response_type=code&scope=' + encodeURIComponent(SCOPE)
    + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0';

const argv = process.argv.slice(2);
const SAVE_MODE = argv.includes('--save');           /* 直接写进 .env.local，不回显凭据 */
const args = argv.filter(a => a !== '--save');
const COOKIE_MODE = args[0] === '--cookie' || args[0] === '--from-cookie';
const LIVE_COOKIE = String(process.env.MSR_LIVE_COOKIE || (COOKIE_MODE ? args[1] : '') || '').trim();
const input = String((!COOKIE_MODE ? args[0] : '') || process.env.MSR_AUTH_CODE || '').trim();

function parseCode(raw) {
    if (!raw) return null;
    let s = raw.replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
    s = s.replace(/[\u00a0\u3000]/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();

    let m = s.match(/[?&#;\s]code=([^&\s"'<>\\]+)/i) || s.match(/^code=([^&\s"'<>\\]+)/i);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    m = s.match(/M\.[A-Za-z0-9._*!$%~-]{20,}/);
    if (m) return m[0];
    s = s.replace(/^[\s"'`<\[(]+/, '').replace(/[\s"'`>\])]+$/, '');
    if (/^[A-Za-z0-9._*!$%~-]{40,}$/.test(s)) return s;
    return null;
}

function usage() {
    console.log('\n============================================================');
    console.log(' 获取 MSR_REFRESH_TOKEN —— 全程不需要任何浏览器插件');
    console.log('============================================================\n');
    console.log('【方式① 浏览器 + 本工具】（推荐，成功率最高）');
    console.log('1. 在已登录微软账号的浏览器里打开：\n');
    console.log('   ' + AUTH_URL + '\n');
    console.log('2. 页面跳到 oauth20_desktop.srf?code=M.C561... 时立刻复制完整地址；');
    console.log('   变成 ?removed=true 也没关系：F12 → Network → 点该请求');
    console.log('   → Headers → Request Headers → Referer，复制右侧完整链接。');
    console.log('   （F12 是浏览器自带功能，不是插件）');
    console.log('3. 执行：node get_token.js "粘贴的完整地址"\n');
    console.log('【方式② 连本工具都不用，Windows 自带命令】');
    console.log('   curl 版（把 <CODE> 换成地址里 code= 后面那一串）：\n');
    console.log('   curl -s -X POST https://login.live.com/oauth20_token.srf -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=0000000040170455&code=<CODE>&grant_type=authorization_code&redirect_uri=https://login.live.com/oauth20_desktop.srf"\n');
    console.log('   （上面是一整行，CMD / PowerShell / Git Bash 都可直接粘贴）\n');
    console.log('   PowerShell 版：\n');
    console.log('   $b = "client_id=0000000040170455&code=<CODE>&grant_type=authorization_code&redirect_uri=https://login.live.com/oauth20_desktop.srf"');
    console.log('   (Invoke-RestMethod -Uri "https://login.live.com/oauth20_token.srf" -Method Post -Body $b -ContentType "application/x-www-form-urlencoded").refresh_token\n');
    console.log('【方式③ 纯 HTTP，连浏览器都不开】');
    console.log('   先去 https://login.live.com/ （已登录）F12 → Network → 复制请求头里的 Cookie 一整串，然后：\n');
    console.log('   node get_token.js --cookie "那串 Cookie"');
    console.log('   或 MSR_LIVE_COOKIE="那串 Cookie" node get_token.js --cookie\n');
    console.log('   注意：必须是 login.live.com / .live.com 域的会话 Cookie（MSPAuth、WLSSC 等），');
    console.log('   rewards.bing.com 页面上复制的 Cookie 通常不够；账号开了二次验证或首次需');
    console.log('   同意授权时会失败，此时退回方式①。\n');
    console.log('授权码一次性、约 5~10 分钟过期；refresh_token 是长期凭据，只存青龙环境变量，别外发。\n');
}

/* ---- 用 login.live.com 会话 Cookie 静默拿授权码：不跟随重定向，直接读 Location ---- */
function authorizeViaCookie(cookie, done) {
    const q = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        scope: SCOPE,
        redirect_uri: REDIRECT_URI
    });
    console.log('🌐 纯 HTTP 模式：带 Cookie 请求授权端点（不打开浏览器）...');
    const req = https.request({
        hostname: 'login.live.com',
        path: '/oauth20_authorize.srf?' + q.toString(),
        method: 'GET',
        headers: {
            'user-agent': UA,
            'accept': 'text/html,application/xhtml+xml',
            'accept-language': 'zh-CN,zh;q=0.9',
            'cookie': cookie
        },
        timeout: 20000
    }, res => {
        let body = '';
        res.on('data', c => { if (body.length < 300000) body += c; });
        res.on('end', () => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                const loc = res.headers.location;
                const code = parseCode(loc);
                if (code) return done(null, code);
                return done(new Error('授权端点已重定向，但 Location 里没有 code：'
                    + String(loc).slice(0, 220)));
            }
            let hint = '';
            if (/PPFT|Sign in|登录|oauth20_authorize|kmsi/i.test(body)) {
                hint = '（服务端返回了登录/同意授权页面：Cookie 不足以静默通过，'
                    + '或账号开启了二次验证 / 首次需要点「接受」）';
            }
            done(new Error('授权端点未返回 code（HTTP ' + res.statusCode + '）' + hint
                + '\n   请改用方式①：浏览器打开授权链接，复制跳转地址。'));
        });
    });
    req.on('timeout', () => { req.destroy(); done(new Error('授权端点请求超时')); });
    req.on('error', e => done(new Error('授权端点网络错误: ' + e.message)));
    req.end();
}

/* ---- 授权码换 refresh_token ---- */
function exchange(code, fromCookie) {
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
    }).toString();
    console.log('🔑 已解析授权码：' + code.slice(0, 12) + '…' + code.slice(-6)
        + '（' + code.length + ' 字符' + (fromCookie ? '，Cookie 静默获取' : '') + '），正在换取 Token...');

    const req = https.request({
        hostname: 'login.live.com',
        path: '/oauth20_token.srf',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'user-agent': UA
        },
        timeout: 20000
    }, res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
            let j = null;
            try { j = JSON.parse(text); } catch (_) {}
            if (j && j.refresh_token) {
                if (SAVE_MODE) {
                    const envPath = path.join(__dirname, '.env.local');
                    let txt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
                    const line = 'MSR_REFRESH_TOKEN=' + j.refresh_token;
                    if (/^MSR_REFRESH_TOKEN=.*$/m.test(txt)) txt = txt.replace(/^MSR_REFRESH_TOKEN=.*$/m, line);
                    else txt += '\n' + line + '\n';
                    fs.writeFileSync(envPath, txt, 'utf8');
                    console.log('\n✅ 授权成功：refresh_token 已写入 .env.local（'
                        + j.refresh_token.length + ' 字符，内容不回显）');
                } else {
                    console.log('\n✅ 授权成功！把下面这一整行填进青龙「环境变量」：\n');
                    console.log('MSR_REFRESH_TOKEN=' + j.refresh_token);
                    console.log('\n（等号后面那一串就是值，不要带引号、不要换行）');
                }
                if (j.expires_in) console.log('access_token 有效期：' + j.expires_in
                    + ' 秒（脚本会自动用 refresh_token 续期，不用管）');
                process.exit(0);
            }
            const err = (j && j.error) || ('HTTP ' + res.statusCode);
            const desc = (j && (j.error_description || j.error_codes)) || text.slice(0, 300);
            console.error('\n❌ 换取 Token 失败：' + err + ' - ' + desc);
            console.error('\n常见原因：');
            console.error('  · 授权码已过期 / 已被用过（一次性）→ 重新授权，立刻复制');
            console.error('  · 复制的地址不完整 → 要含完整的 code=M. ...');
            console.error('  · 登录的账号不对 → 确认是你要刷分的那个账号');
            process.exit(1);
        });
    });
    req.on('timeout', () => { req.destroy(); console.error('❌ 请求超时'); process.exit(1); });
    req.on('error', e => { console.error('❌ 网络错误: ' + e.message); process.exit(1); });
    req.write(body);
    req.end();
}

/* ---- 主流程 ---- */
if (COOKIE_MODE) {
    if (!LIVE_COOKIE) {
        console.error('❌ --cookie 模式需要 login.live.com 的完整 Cookie。');
        usage();
        process.exit(1);
    }
    authorizeViaCookie(LIVE_COOKIE, (err, code) => {
        if (err) {
            console.error('\n❌ ' + err.message);
            process.exit(1);
        }
        exchange(code, true);
    });
} else if (!input) {
    usage();
    process.exit(0);
} else {
    const code = parseCode(input);
    if (!code) {
        console.error('❌ 没能从输入里解析出 code=。请确认粘贴的是「授权页跳转后的完整地址」。');
        usage();
        process.exit(1);
    }
    exchange(code, false);
}
