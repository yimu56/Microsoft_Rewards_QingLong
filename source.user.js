// ==UserScript==
// @name         微软积分（优化版）
// @namespace    https://rewards.bing.com/
// @version      1.3.0
// @description  每天在后台自动完成 Microsoft Rewards 任务获取积分奖励，✅签入(PC+App静默)、✅阅读、✅活动、✅搜索、✅Quiz、✅拼图、✅热搜API、✅二次扫描、✅积分通知、✅自动领取待领积分、✅连签任务检测、✅每日活动自动上报、✅桌面应用每周专属任务、✅月度计划、✅Edge 浏览连签、✅出口检测（非大陆 IP 直接停手）
// @icon         https://bing.com/th?id=OMR.icon-96.png&pid=Rewards
// @license      MIT
// @background
// @connect      bing.com
// @connect      login.live.com
// @connect      rewards.bing.com
// @connect      prod.rewardsplatform.microsoft.com
// @connect      hotapi.nntool.cc
// @connect      hot.baiwumm.com
// @connect      cnxiaobai.com
// @connect      disp-qryapi.3g.qq.com
// @connect      www.cloudflare.com
// @connect      ipinfo.io
// @connect      api.ip.sb
// @connect      qyapi.weixin.qq.com
// @connect      oapi.dingtalk.com
// @connect      open.feishu.cn
// @connect      push.i-i.me
// @connect      api.day.app
// @connect      127.0.0.1
// @connect      localhost
// @match        https://login.live.com/oauth20_desktop.srf*
// @match        https://rewards.bing.com/*
// @match        https://www.bing.com/*
// @match        https://cn.bing.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_cookie
// @grant        GM_closeTab
// @grant        GM_info
// @grant        GM_log
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @storageName  BingRewardsAuto_Shared
// @tips         此脚本为开源免费使用，请勿购买
// ==/UserScript==

/* global GM_cookie, GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_log, GM_info, GM_notification, GM_openInTab, GM_addValueChangeListener, GM_removeValueChangeListener */

/* ==UserConfig==
Config:
    keep:
        title: 持续检测（全部完成后是否继续）
        type: checkbox
        default: true
    lock:
        title: 锁定国区（非大陆IP自动停止）
        type: checkbox
        default: true
    span:
        title: 动作最小间隔（秒，搜索/阅读/卡片共用，脚本只会更慢不会更快）
        type: number
        default: 30
        min: 30
        max: 180
        unit: 秒
    api:
        title: 搜索词接口（offline为随机搜索词）
        type: select
        default: offline
        values: [offline, hot.nntool.cc, hot.baiwumm.com, hot.cnxiaobai.com]
    code:
        title: 授权码链接
        type: textarea
        description: 粘贴 login.live.com 跳转后的完整URL
    autoAuth:
        title: 自动检测授权码(手动运行一次，token状态无则手动授权)
        type: checkbox
        default: true
Tasks:
    sign:
        title: 每日签入
        type: checkbox
        default: true
    read:
        title: 新闻阅读
        type: checkbox
        default: true
    promos:
        title: 活动卡片（含打卡）
        type: checkbox
        default: true
    quiz:
        title: Quiz 自动答题
        type: checkbox
        default: true
    search:
        title: PC搜索
        type: checkbox
        default: true
    edge:
        title: Edge 浏览连签（后台分次上报，累计 30 分钟）
        type: checkbox
        default: true
    desktopWeekly:
        title: 桌面应用每周专属任务（每轮检测，按星期逐日解锁）
        type: checkbox
        default: true
    monthly:
        title: 月度计划（月度 punchcard，子项解锁后自动完成）
        type: checkbox
        default: true
    claimPoints:
        title: 自动领取待领积分（搜索打卡/每日活动的奖励需点一次才入账）
        type: checkbox
        default: true
Notice:
    bro:
        title: 浏览器通知（当前脚本）
        type: checkbox
        default: true
    wework:
        title: 企业微信消息推送（群机器人）
        type: text
        password: true
        description: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    dingding:
        title: 钉钉群机器人（不加签，关键词：#）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    feishu:
        title: 飞书群机器人（不加签，关键词：#）
        type: text
        password: true
        description: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    pushme:
        title: PushMe（push.i-i.me）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxx
    bark:
        title: Bark（bark.day.app）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxx
==/UserConfig== */

const __scBgKeepAlive = (function() {
    'use strict';

    const IS_OAUTH_CALLBACK = location.hostname === "login.live.com"
        && location.pathname === "/oauth20_desktop.srf";

    const OAUTH_WITNESS = (() => {
        const snapshot = { at: Date.now(), href: "", referrer: "", name: "", urls: [] };
        const seen = new Set();
        const maybeRecord = url => {
            if (!url) return;
            const s = String(url);
            if (!/code=/i.test(s) || seen.has(s)) return;
            seen.add(s);
            snapshot.urls.push(s);
            if (snapshot.urls.length > 12) snapshot.urls.shift();
        };
        try {
            snapshot.href = String(location.href || "");
            maybeRecord(snapshot.href);
        } catch (_) {}
        try {
            snapshot.referrer = String((typeof document !== "undefined" && document && document.referrer) || "");
            maybeRecord(snapshot.referrer);
        } catch (_) {}
        try {
            snapshot.name = String((typeof window !== "undefined" && window && window.name) || "");
            maybeRecord(snapshot.name);
        } catch (_) {}
        try {
            const host = (typeof unsafeWindow !== "undefined" && unsafeWindow)
                ? unsafeWindow
                : (typeof window !== "undefined" ? window : null);
            if (host && host.location && host.location.hostname === "login.live.com" && host.history) {
                ["pushState", "replaceState"].forEach(fnName => {
                    const orig = host.history[fnName];
                    if (typeof orig !== "function" || orig.__mpWitness) return;
                    const wrapped = function (state, title, url) {
                        try {
                            maybeRecord(url ? new URL(String(url), host.location.href).href : host.location.href);
                        } catch (_) {
                            maybeRecord(url);
                        }
                        return orig.apply(this, arguments);
                    };
                    wrapped.__mpWitness = true;
                    try { host.history[fnName] = wrapped; } catch (_) {}
                });
            }
        } catch (_) {}
        return snapshot;
    })();

    const RewardsAuto = {
        get ua() { return UA.all(); },

        get desktopAppHeaders() {
            return {
                "user-agent": UA.all().rewardsApp,
                "x-rewards-source": "msrewards-desktop"
            };
        },
        appConfig: {
            rewardsAppId: "SAAndroid/32.6.2110003560",
            channel: "SAAndroid",
            dapiMeUrl: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
            offerIds: {
                dailyCheckIn: "Gamification_Sapphire_DailyCheckIn",
                readArticle: "ENUS_readarticle3_30points",
                dailySetPrefix: "Gamification_DailySet_",
                streakCounter: "Gamification_Streak_Counter_Promotion",
            }
        },

        region(fallback = "us") {
            if (GM_getValue("Config.lock", true)) return "cn";
            const r = String(this.state.region || "").toLowerCase().trim();
            return r || fallback;
        },

        searchPool: [
            "what is the weather forecast tomorrow",
            "how do I make sourdough bread at home",
            "where can I find cheap flights to tokyo",
            "why is the sky blue scientific explanation",
            "how to learn rust programming in 2026",
            "what time does the world cup final start",
            "how to fix a leaky kitchen faucet step by step",
            "what are the best vr games of 2026",
            "how to start a vegetable garden in spring",
            "where to watch new movies this week",
            "how to take care of a bonsai tree",
            "what is the difference between python async and threading",
            "how to meditate properly for beginners",
            "what is the origin of halloween traditions",
            "how do solar panels actually work",
            "what is the best mechanical keyboard for typing",
            "how to tie a windsor knot tie",
            "what causes northern lights aurora borealis",
            "how to brew the perfect espresso at home",
            "what are the symptoms of vitamin d deficiency",
            "how to sleep better naturally tonight",
            "why do cats purr when they are happy",
            "best coffee shops in san francisco downtown",
            "italian restaurants near times square",
            "tokyo cherry blossom season 2026 forecast",
            "rtx 5070 ti benchmark vs rtx 4080 super",
            "iphone 17 release date and features",
            "tesla stock price today nasdaq",
            "best noise cancelling headphones under 300",
            "fastest electric cars 0 to 60 mph",
            "vintage camera brands collectors guide",
            "budget gaming laptop with rtx 4070 2026",
            "easy chocolate chip cookies recipe from scratch",
            "30 minute home workout routine no equipment",
            "stretching exercises for lower back pain relief",
            "easy origami crane folding instructions",
            "git rebase vs merge which one to use",
            "markdown cheat sheet with examples",
            "japanese hiragana chart pronunciation",
            "ancient rome history quick overview",
            "pomodoro technique for focus and productivity",
            "healthy breakfast ideas under 10 minutes",
            "天气预报", "今日新闻热点", "美食食谱家常菜", "旅游攻略", "健康养生知识",
            "科技资讯", "电影推荐", "股票行情", "体育赛事", "历史上的今天"
        ],
        apiConfig: {
            mode: GM_getValue("Config.api", "offline"),
            arr: [
                ["hot.baiwumm.com", {
                    url: "https://hot.baiwumm.com/api/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq", "netease", "zhihu"],
                }],
                ["hot.cnxiaobai.com", {
                    url: "https://cnxiaobai.com/DailyHotApi/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
                ["hot.nntool.cc", {
                    url: "https://hotapi.nntool.cc/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
            ],
            url: "",
            hot: [],
            wordList: [],
            wordIndex: 0,
        },
        skipPatterns: [
            "referral", "refer and earn", "sweepstake", "entries",
            "install the", "set bing as your default", "bing wallpaper",
            "punch card", "ancient coin", "sea of thieves", "rewards extension",
            "redemption goal", "order history", "claim your gift", "shop to earn",
            "set goal",
        ],
        skipHrefs: [
            "sweepstakes/", "referandearn", "aka.ms/win", "workinprogress",
            "punchcard", "microsoft-store", "goal/all", "orderhistory",
            "/redeem", "/redeemgoal", "xbox.com/rewards"
        ],
        state: {
            token: false,
            region: "CN",
            host: "www.bing.com",
            dateNowNum: 0,
            dateNowStr: "",
            pcProgress: 0,
            pcMax: 90,
            readProgress: 0,
            readMax: 30,
            sendMSG: "",
            lastSearchProgress: -1,
            restrictedTimes: 0,
            ip: "",
            ipInfo: "",
            startTime: 0,
            lockedCount: 0,
            lockedPoints: 0,
            lockedTitles: [],
            desktopPendingTitles: [],
            weeklyQuestDone: 0,
            weeklyQuestPending: 0,
            weeklyQuestFailed: 0,
            monthlyFound: 0,
            monthlyDone: 0,
            monthlyTotal: 0,
            monthlyPending: 0,
            monthlyComplete: false,
            monthlyUnlocked: 0,
            webNoAuth: false,
            webFailStreak: 0,
        }
    };

    const CLAIM_ONCE_TIMEOUT = 150 * 1000;
    const NEXT_ACTION_SCAN_MAX = 8;
    const NEXT_ACTION_SCAN_BUDGET = 45 * 1000;
    const WEB_FAIL_LIMIT = 3;
    const ACTION_SCAN_MAX = 24;
    const ACTION_SCAN_BUDGET = 60 * 1000;

    const CardLock = {
        fields(item) {
            if (!item || typeof item !== "object") return {};
            const pick = (...keys) => {
                for (const k of keys) {
                    if (item[k] !== undefined && item[k] !== null) return item[k];
                }
                return undefined;
            };
            const rawUnlock = pick("unlockCriteria", "unlockcriteria");
            return {
                isLocked: pick("isLocked", "islocked"),
                isUnlocked: pick("isUnlocked", "isunlocked"),
                isDisabled: pick("isDisabled", "isdisabled"),
                isHidden: pick("isHidden", "ishidden", "hidden"),
                unlockCriteria: rawUnlock === "$undefined" ? undefined : rawUnlock,
                state: String(pick("state", "State") || ""),
                offerId: String(pick("offerId", "offerid", "name") || ""),
                title: String(pick("title", "name", "description") || "")
            };
        },

        hasExplicitState(item) {
            const f = this.fields(item);
            return f.isLocked !== undefined || f.isUnlocked !== undefined
                || f.isDisabled !== undefined || f.unlockCriteria !== undefined;
        },

        textLocked(text) {
            const s = String(text || "");
            return /offer is locked|available tomorrow|earn -1 points|明天再来|明天可用|已锁定|在必应应用|必应\s*app|仅限.*应用|需在应用/i.test(s);
        },

        probe(item) {
            const f = this.fields(item);
            const appExclusive = /Moreactivities_RewardsApp/i.test(f.offerId)
                || String(f.unlockCriteria || "").toLowerCase() === "rewardsapp";

            const levelGated = /locked_level2|newLevel2/i.test(f.offerId)
                || String(f.unlockCriteria || "").toLowerCase() === "newlevel2";
            const keep = (reason) => ({ locked: false, appExclusive, appOnly: appExclusive, levelGated, reason });
            const skip = (reason) => ({ locked: true, appExclusive, appOnly: false, levelGated, reason });
            const appTry = (reason) => ({ locked: false, appExclusive, appOnly: true, levelGated, reason });

            if (!this.hasExplicitState(item)) {
                const text = `${f.title} ${f.offerId} ${f.state}`;
                if (!this.textLocked(text)) {
                    return keep(levelGated ? "等级门槛卡(无锁态字段,按可尝试处理)" : "");
                }
                if (/在必应应用|必应\s*app|仅限.*应用|需在应用|bing\s*app|mobile\s*app/i.test(text)) {
                    return appTry("文案指向 App 通道");
                }
                return skip("仅有锁态文案");
            }
            if (f.isDisabled === true) return skip("isDisabled=true");
            if (f.isLocked === false) return keep(appExclusive ? "rewardsApp(已解锁)" : "");
            if (f.isUnlocked === true) return keep(appExclusive ? "rewardsApp(已解锁)" : "");
            if (appExclusive) return appTry(f.isLocked === true ? "isLocked=true(App 专属→App UA)" : "rewardsApp");
            if (f.isLocked === true) return skip("isLocked=true");
            if (f.isUnlocked === false) return skip("isUnlocked=false");
            if (f.unlockCriteria !== undefined && f.unlockCriteria !== "") {
                return skip(`unlockCriteria=${f.unlockCriteria}`);
            }
            if (f.state && this.textLocked(f.state)) return skip(`state=${f.state}`);
            return keep("");
        },

        claimable(item) {
            const lock = this.probe(item);
            if (lock.locked) return false;
            const f = this.fields(item);
            if (f.isHidden === true) return false;
            return true;
        }
    };

    const UA = {

        FALLBACK_CHROME: "156.0.0.0",
        FALLBACK_EDGE: "156.0.4314.50",

        REWARDS_APP_VER: "1.13.0",
        DESKTOP: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        ANDROID: "Mozilla/5.0 (Linux; Android 16; Redmi K20 Pro Build/BP4A.251205.006; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Mobile Safari/537.36",
        _cache: null,
        _cacheAt: 0,

        navigatorUA() {
            try {
                return (typeof navigator !== "undefined" && navigator && navigator.userAgent)
                    ? String(navigator.userAgent) : "";
            } catch (_) {
                return "";
            }
        },

        remember(ua) {
            if (!/Edg\/\d/.test(ua)) return;
            try {
                if (GM_getValue("Config.uaEdge", "") !== ua) GM_setValue("Config.uaEdge", ua);
            } catch (_) { }
        },

        all() {
            const now = Date.now();
            if (this._cache && now - this._cacheAt < 60000) return this._cache;
            const real = this.navigatorUA();
            this.remember(real);
            const saved = String(GM_getValue("Config.uaEdge", "") || "");
            const edgeUA = [real, saved].find(s => /Edg\/\d/.test(s))
                || (() => {
                    const ver = [real, saved]
                        .map(s => (String(s).match(/Chrome\/([\d.]+)/) || [])[1])
                        .find(Boolean);
                    if (ver) return `${this.DESKTOP} Chrome/${ver} Safari/537.36 Edg/${ver}`;
                    return `${this.DESKTOP} Chrome/${this.FALLBACK_CHROME} Safari/537.36 Edg/${this.FALLBACK_EDGE}`;
                })();
            this._cache = {
                pc: /Edg\//.test(real) ? real : edgeUA,
                edge: edgeUA,
                mobile: `${this.ANDROID} EdgA/144.0.0.0`,
                app: `${this.ANDROID} BingSapphire/32.6.2110003560`,
                rewardsApp: (() => {
                    const ver = [real, saved]
                        .map(s => (String(s).match(/Chrome\/([\d.]+)/) || [])[1])
                        .find(Boolean) || this.FALLBACK_CHROME;
                    return `${this.DESKTOP} Chrome/${ver} Safari/537.36 Edg/${ver} MSRewards/Desktop/${this.REWARDS_APP_VER}`;
                })(),
            };
            this._cacheAt = now;
            return this._cache;
        }
    };

    const EDGE = {
        PROMO_NAME: "edge_browsing_streak_flight",
        PROMO_PREFIX: /^edge_browsing_streak/i,
        ACTIVATION_OFFER: "edge_flight_1_ww_treatment_eligible",
        TARGET_MINUTES: 30,
        MAX_EXTRA_ROUNDS: 3,
    };

    /* 月度计划（月度 punchcard）：
       父任务形如 ENWW_pcparent_FY27_BingMonthlyPC_Nov_punchcard，页面上是「N/5 个任务」，
       子项间隔解锁（子项 4/5 在子项 3 完成并且到点后才 isLocked=false），全部完成给一次 +50。
       子项的进度只能靠回读详情页的「M/N 个任务」确认——交卷被受理不代表服务端记账。
       cron 每 20 分钟一轮，这里按月维度节流：本月已判「不再推进」就不再去拉详情页。 */
    const MONTHLY = {
        RECHECK_MS: 90 * 60 * 1000,
        DONE_RECHECK_MS: 22 * 60 * 60 * 1000,
        MAX_ATTEMPTS_PER_DAY: 2,
        PAGE_URL: "https://rewards.bing.com/earn/quest/",
    };

    const WEBHOOK_PLATFORMS = [
        { name: "企业微信", url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=", config: "Notice.wework",
            body: (time, text) => ({ "msgtype": "text", "text": { "content": `> ${time}\n\n ## ${GM_info.script.name}\n ${text}` } }) },
        { name: "钉钉", url: "https://oapi.dingtalk.com/robot/send?access_token=", config: "Notice.dingding",
            body: (time, text) => ({ "msgtype": "markdown", "markdown": { "title": GM_info.script.name, "text": `> ${time}\n ### ${GM_info.script.name}\n ${text}` } }) },
        { name: "飞书", url: "https://open.feishu.cn/open-apis/bot/v2/hook/", config: "Notice.feishu",
            body: (time, text) => ({
                "msg_type": "interactive",
                "card": {
                    "schema": "2.0",
                    "header": { "title": { "tag": "plain_text", "content": GM_info.script.name }, "template": "orange" },
                    "body": { "elements": [{ "tag": "markdown", "text_align": "center", "content": `#### ${time}\n ${text}` }] }
                }
            }) },
        { name: "PushMe", url: "https://push.i-i.me/?push_key=", config: "Notice.pushme",
            body: (time, text) => ({ "type": "markdown", "title": `${GM_info.script.name}[#rewards!https://rewards.bing.com/rewards.png]`, "content": `\n ${text}` }) },
        { name: "Bark", url: "https://api.day.app/", config: "Notice.bark",
            body: (time, text) => ({ "group": "rewards", "icon": "https://rewards.bing.com/rewards.png", "title": GM_info.script.name, "markdown": `\n ${text}` }) },
    ];

    const Webhooks = WEBHOOK_PLATFORMS.map(p => ({
        name: p.name,
        url: p.url,
        key: GM_getValue(p.config, false),
        get msg() { return p.body(new Date().toLocaleString(), RewardsAuto.state.sendMSG); }
    }));

    const Utils = {
        log(icon, msg, push = false) {
            GM_log(`${icon} ${msg}`);
            if (push && GM_getValue("Notice.bro", true)) {
                try {
                    GM_notification({
                        title: GM_info.script.name + ` ${icon}`,
                        text: msg,
                        onclick: () => GM_openInTab("https://rewards.bing.com/dashboard", { active: true })
                    });
                } catch(_) {}
            }
            if (push) {
                RewardsAuto.state.sendMSG = `${icon} ${msg}`;
                this.sendWebhook();
            }
        },

        /*
         * 同类通知节流：同一 key + 同一文案在 ttl 内只推送一次。
         * 用于「每轮都会复现」的失败提示（例如领取积分通道被拒），
         * 避免同一件事每隔几十分钟就弹一次通知 / 推一条 webhook。
         */
        _noticeHash(str) {
            const s = String(str || "");
            let h = 5381;
            for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
            return h;
        },

        /* hashText 可选：只用于判断「是不是同一件事」，让带数字变化的同类提示也能合并 */
        logOnce(icon, msg, key, ttlMs = 12 * 60 * 60 * 1000, hashText) {
            GM_log(`${icon} ${msg}`);
            const storeKey = `Notice.once.${key}`;
            const now = Date.now();
            const hash = this._noticeHash(hashText == null ? msg : hashText);
            let rec = null;
            try { rec = GM_getValue(storeKey, null); } catch (_) {}
            const lastAt = rec ? (Number(rec.at) || 0) : 0;
            if (rec && rec.hash === hash && now - lastAt < ttlMs) {
                const leftMin = Math.max(1, Math.ceil((ttlMs - (now - lastAt)) / 60000));
                GM_log(`🔁 同类通知 ${leftMin} 分钟内已推送过，本次静默（只写日志）`);
                return false;
            }
            try { GM_setValue(storeKey, { at: now, hash, msg: String(msg).slice(0, 200) }); } catch (_) {}
            if (GM_getValue("Notice.bro", true)) {
                try {
                    GM_notification({
                        title: GM_info.script.name + ` ${icon}`,
                        text: msg,
                        onclick: () => GM_openInTab("https://rewards.bing.com/dashboard", { active: true })
                    });
                } catch (_) {}
            }
            RewardsAuto.state.sendMSG = `${icon} ${msg}`;
            this.sendWebhook();
            return true;
        },

        /* 状态恢复正常时重置节流记录，保证下次真出问题时还能提醒一次 */
        resetOnce(key) {
            try { GM_setValue(`Notice.once.${key}`, null); } catch (_) {}
        },

        async sendWebhook() {
            await Promise.all(Webhooks.map(async (i) => {
                if (!i.key) return;
                const safeKey = String(i.key).trim();
                const targetUrl = safeKey.startsWith("http") ? safeKey : i.url + safeKey;
                try {
                    const result = await this.xhr({
                        method: "POST",
                        url: targetUrl,
                        headers: { "content-type": "application/json; charset=UTF-8" },
                        data: JSON.stringify(i.msg),
                    });
                    if (result) GM_log(`🔵 「${i.name}」消息推送完成`);
                } catch (e) {
                    GM_log(`🔴 「${i.name}」消息推送出错: ${e.message}`);
                }
            }));
        },

        hasDOM() {
            return typeof document !== "undefined" && !!document && !!document.documentElement;
        },

        waitForBody(timeoutMs = 8000) {
            return new Promise(resolve => {
                const t0 = Date.now();
                const tick = () => {
                    if (document.body) return resolve(true);
                    if (Date.now() - t0 > timeoutMs) return resolve(false);
                    setTimeout(tick, 100);
                };
                tick();
            });
        },

        uiAlert(msg) {
            const text = String(msg);
            if (this.hasDOM() && typeof alert === "function") {
                try { alert(text); return; } catch (_) {}
            }
            GM_log(text);
            try { GM_notification({ title: GM_info.script.name, text: text.slice(0, 300), timeout: 10000 }); } catch (_) {}
        },

        uiConfirm(msg) {
            if (this.hasDOM() && typeof confirm === "function") {
                try { return confirm(msg); } catch (_) {}
            }
            this.uiAlert(`${msg}\n\n（当前是后台上下文，无法弹出确认框，已按「取消」处理）`);
            return false;
        },

        async uiPrompt(message, defaultValue = "") {
            if (this.hasDOM() && typeof prompt === "function") {
                try { return prompt(message, defaultValue); } catch (_) {}
            }
            if (this.hasDOM()) return this.domPrompt(message, defaultValue);
            GM_setValue("Config.pendingPaste", true);
            Utils.log("🟡", "当前为后台上下文（无输入框），已打开 rewards.bing.com 以便粘贴授权码");
            try {
                GM_notification({ title: "📋 请粘贴授权码", text: "已为你打开 rewards.bing.com，页面加载后会自动弹出输入框", timeout: 8000 });
            } catch (_) {}
            try { GM_openInTab("https://rewards.bing.com/", { active: true }); } catch (_) {}
            return null;
        },

        async domPrompt(message, defaultValue = "") {
            await this.waitForBody();
            return new Promise(resolve => {
                const wrap = document.createElement("div");
                wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;";
                const box = document.createElement("div");
                box.style.cssText = "background:#fff;color:#222;padding:18px;border-radius:10px;width:min(680px,92vw);font:14px/1.6 system-ui,-apple-system,'Microsoft YaHei',sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.4);";
                const label = document.createElement("div");
                label.textContent = message;
                label.style.cssText = "margin-bottom:10px;white-space:pre-wrap;";
                const ta = document.createElement("textarea");
                ta.value = defaultValue;
                ta.spellcheck = false;
                ta.style.cssText = "width:100%;height:130px;box-sizing:border-box;padding:8px;border:1px solid #c8c8c8;border-radius:6px;font:12px/1.5 Consolas,monospace;resize:vertical;";
                const row = document.createElement("div");
                row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:12px;";
                const mkBtn = (text, primary) => {
                    const b = document.createElement("button");
                    b.textContent = text;
                    b.style.cssText = `padding:7px 18px;border-radius:6px;cursor:pointer;font:14px system-ui;border:1px solid ${primary ? "#0b6cff" : "#c8c8c8"};background:${primary ? "#0b6cff" : "#fff"};color:${primary ? "#fff" : "#222"};`;
                    return b;
                };
                const okBtn = mkBtn("确定", true);
                const cancelBtn = mkBtn("取消", false);
                const done = v => { try { wrap.remove(); } catch (_) {} resolve(v); };
                okBtn.onclick = () => done(ta.value);
                cancelBtn.onclick = () => done(null);
                ta.addEventListener("keydown", e => {
                    if (e.key === "Escape") done(null);
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) done(ta.value);
                });
                row.appendChild(cancelBtn);
                row.appendChild(okBtn);
                box.appendChild(label);
                box.appendChild(ta);
                box.appendChild(row);
                wrap.appendChild(box);
                (document.body || document.documentElement).appendChild(wrap);
                setTimeout(() => { try { ta.focus(); ta.select(); } catch (_) {} }, 50);
            });
        },

        xhrFull(options) {
            return new Promise((resolve, reject) => {
                const start = Date.now();
                /* 同 xhr()：后台被冻结时回调不会来，用计时器保证一定会 settle */
                const softMs = (Number(options && options.timeout) || 15000) + 10000;
                let settled = false;
                let guard = null;
                const finish = (fn, arg) => {
                    if (settled) return;
                    settled = true;
                    if (guard) clearTimeout(guard);
                    fn(arg);
                };
                guard = setTimeout(() => {
                    finish(reject, new Error(`请求无响应（${Math.round(softMs / 1000)} 秒未回调），已放弃`));
                }, softMs);
                GM_xmlhttpRequest({
                    ...options,
                    timeout: Number(options && options.timeout) || 15000,
                    onload: (res) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        if (res.status >= 200 && res.status < 300) {
                            finish(resolve, { text: res.responseText, finalUrl: res.finalUrl || "", status: res.status });
                        } else {
                            finish(reject, new Error(`HTTP ${res.status}，用时 ${cost} 秒`));
                        }
                    },
                    onerror: (err) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`${err?.error || "网络错误"}，用时 ${cost} 秒`));
                    },
                    ontimeout: () => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`请求超时，用时 ${cost} 秒`));
                    }
                });
            });
        },

        xhr(options) {
            return new Promise((resolve, reject) => {
                const start = Date.now();

                const url = String((options && options.url) || "");
                const hdr = Object.assign({}, (options && options.headers) || {});
                const needCookie = /(^|\.)(bing\.com|live\.com|microsoft\.com|microsoftonline\.com)\//i.test(url);
                const hasCookie = Object.keys(hdr).some(k => k.toLowerCase() === "cookie");
                if (needCookie && !hasCookie && this._ckReady) {
                    const ck = this._ckReady();
                    if (ck) hdr["cookie"] = ck;
                }
                /* GM_xmlhttpRequest 的 timeout 只管网络层。
                   MV3 后台被冻结/回收时，请求就悬在半空，onload/onerror/ontimeout
                   一个都不会来，await 永远不返回 —— 这正是「一直卡着」的根源之一。
                   这里补一个纯计时器的兜底：到点一定 settle，绝不让调用方挂死。 */
                const softMs = (Number(options && options.timeout) || 15000) + 10000;
                let settled = false;
                let guard = null;
                const finish = (fn, arg) => {
                    if (settled) return;
                    settled = true;
                    if (guard) clearTimeout(guard);
                    fn(arg);
                };
                guard = setTimeout(() => {
                    finish(reject, new Error(`请求无响应（${Math.round(softMs / 1000)} 秒未回调），已放弃`));
                }, softMs);
                GM_xmlhttpRequest({
                    ...options,
                    headers: hdr,
                    timeout: Number(options && options.timeout) || 15000,
                    onload: (res) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        if (res.status >= 200 && res.status < 300) {
                            finish(resolve, res.responseText);
                        } else if ([301, 302, 307, 308].includes(res.status)) {
                            const match = res.responseHeaders?.match(/Location:\s*(.*?)\s*\r?\n/i);
                            finish(resolve, match ? match[1] : false);
                        } else {
                            finish(reject, new Error(`HTTP ${res.status}，用时 ${cost} 秒`));
                        }
                    },
                    onerror: (err) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`${err?.error || "网络错误"}，用时 ${cost} 秒`));
                    },
                    ontimeout: () => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`请求超时，用时 ${cost} 秒`));
                    }
                });
            });
        },

        randomRange(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        },
        getTimestamp() { return Date.now(); },
        getTodayNum() {
            const d = new Date();
            return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`);
        },
        getTodayStr() {
            const d = new Date();
            return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
        },

        routerStateTree(segment = "earn") {
            const refreshFlag = 4096;
            const tree = ["", {
                children: ["(nav)", {
                    children: [segment, { children: ["PAGE", {}, null, null, refreshFlag] }, null, null, refreshFlag]
                }, null, null, refreshFlag]
            }, null, null, refreshFlag + 16];
            return encodeURIComponent(JSON.stringify(tree));
        },
        getRandomUUID() { return crypto.randomUUID().replace(/-/g, "").toUpperCase(); },

        questRouterStateTree(parentOfferId) {
            const tree = ["", {
                children: ["(nav)", {
                    children: ["earn", {
                        children: ["quest", {
                            children: [
                                ["questId", String(parentOfferId), "d", null],
                                { children: ["__PAGE__", {}, null, null, 0] },
                                null, null, 0
                            ]
                        }, null, null, 0]
                    }, null, null, 0]
                }, null, null, 0]
            }, null, "refetch", 16];
            return encodeURIComponent(JSON.stringify(tree));
        },

        async probeCookiePermission() {
            const probed = GM_getValue("Config.cookieProbed", false);
            if (probed) return;

            if (typeof GM_cookie === "undefined" || !GM_cookie || typeof GM_cookie.list !== "function") {
                GM_setValue("Config.cookieProbed", true);
                Utils.log("🔑", "当前脚本管理器不支持 GM_cookie（读不到登录态，但不影响任务执行）");
                return;
            }

            Utils.log("🔑", "首次运行：请求 Cookie 读取权限，若弹出授权框请点「允许」", true);
            const r = await this.loginCookies();
            GM_setValue("Config.cookieProbed", true);

            if (r === null) {
                Utils.log("🟡", "Cookie 读取被拒绝或超时：脚本仍可正常运行，只是读不到登录态诊断。"
                    + "如需放权，去脚本管理器的「脚本详情 → 权限」里允许 Cookie 访问，然后重新运行。", true);
            } else if (r.hasSession) {
                Utils.log("🔑", "Cookie 权限正常，已登录：" + (r.names || []).slice(0, 6).join(","), false);
            } else {
                Utils.log("🔑", "Cookie 权限正常，但读出的是未登录状态（请确认已在该浏览器登录 rewards）");
            }
        },

        async loginCookies() {

            if (GM_getValue("Config.cookieDenied", false)) return null;
            if (typeof GM_cookie === "undefined" || !GM_cookie || typeof GM_cookie.list !== "function") return null;
            const read = (filter) => new Promise(resolve => {
                let settled = false;
                const done = v => { if (!settled) { settled = true; resolve(v); } };
                setTimeout(() => done(null), 2500);
                try {
                    GM_cookie.list(filter, cookies => done(Array.isArray(cookies) ? cookies : []));
                } catch (_) {
                    done(null);
                }
            });
            const [byDomain, byUrl] = await Promise.all([
                read({ domain: "bing.com" }),
                read({ url: "https://rewards.bing.com/" })
            ]);
            if (byDomain === null && byUrl === null) { GM_setValue("Config.cookieDenied", true); return null; }
            const all = [...(byDomain || []), ...(byUrl || [])];
            const found = new Set(all.map(c => String((c && c.name) || "")));
            const hasMuid = found.has("MUID") || found.has("MUIDB");
            const bingMarks = ["_EDGE_S", "_EDGE_V", "SRCHHPGUSR", "MSCC", "BID", "USRLOC"];
            const bingReady = bingMarks.some(n => found.has(n));
            const hasSession = hasMuid || bingReady;
            return { hasMuid, hasSession, names: [...found].slice(0, 20) };
        },

        async getCookieHeader(force = false) {
            const now = Date.now();
            if (!force && this._ckCache && now - this._ckAt < 5 * 60 * 1000) return this._ckCache;
            if (typeof GM_cookie === "undefined" || !GM_cookie) return "";
            const read = (filter) => new Promise(resolve => {
                let settled = false;
                const done = v => { if (!settled) { settled = true; resolve(v); } };
                setTimeout(() => done(null), 3000);
                try {
                    if (typeof GM_cookie.list === "function") {
                        GM_cookie.list(filter, cookies => done(Array.isArray(cookies) ? cookies : []));
                    } else done(null);
                } catch (_) { done(null); }
            });

            const groups = await Promise.all([
                read({}),
                read({ domain: "bing.com" }),
                read({ url: "https://rewards.bing.com/" })
            ]);
            const seen = new Map();
            for (const g of groups) {
                for (const c of (g || [])) {
                    const n = String((c && c.name) || "");
                    const dom = String((c && c.domain) || "");
                    if (!n || seen.has(n)) continue;
                    if (!c.value) continue;
                    if (!/bing\.com|live\.com|microsoft\.com/i.test(dom)) continue;
                    seen.set(n, String(c.value));
                }
            }
            const header = [...seen.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
            this._ckCache = header;
            this._ckAt = now;
            Utils._ckReady = () => header;

            const hasSession = ["MSPAuth", "MSPProf", "WLSSC", "NAP"].some(n => seen.has(n));
            if (header) {
                Utils.log(hasSession ? "🔑" : "🟡",
                    `已读取 ${seen.size} 个 cookie${hasSession ? "（含登录会话）" : "（缺少会话 cookie，可能未登录）"}`
                    + `，将用于给后台请求补登录态`);
            } else {
                Utils.log("🟡", "读不到任何 cookie：后台请求将没有登录态（GM_cookie 是否已授权？）");
            }
            return header;
        },

        isJSON(s) {
            try {
                const j = JSON.parse(s);
                return Array.isArray(j) || (typeof j === "object" && j !== null);
            } catch (_) { return false; }
        },

        parseJSON(s) {
            if (typeof s !== "string" || !s) return null;
            try {
                const j = JSON.parse(s);
                return (typeof j === "object" && j !== null) ? j : null;
            } catch { return null; }
        },

        appHeaders(token, { kind = "app", country, extra } = {}) {
            const cc = country || RewardsAuto.region();
            const base = kind === "edge" ? {
                "accept": "*/*",
                "content-type": "application/json; charset=UTF-8",
                "user-agent": RewardsAuto.ua.edge,
                "authorization": `Bearer ${token}`,
                "x-rewards-appid": "EdgeDesktop",
                "x-rewards-partnerid": "EdgeHub",
                "x-rewards-country": cc,
                "x-rewards-language": cc === "cn" ? "zh-CN" : "en-US",
            } : {
                "content-type": "application/json; charset=UTF-8",
                "user-agent": RewardsAuto.ua.app,
                "authorization": `Bearer ${token}`,
                "x-rewards-appid": RewardsAuto.appConfig.rewardsAppId,
                "x-rewards-ismobile": "true",
                "x-rewards-country": cc,
                "x-rewards-language": "zh",
            };
            return extra ? Object.assign(base, extra) : base;
        },
        delay(ms) { return new Promise(r => setTimeout(r, ms)); },
        randomDelay(min = 3000, max = 8000) { return this.delay(this.randomRange(min, max)); },
        waitForElement(selector, timeout = 30000) {
            return new Promise((resolve, reject) => {
                const element = document.querySelector(selector);
                if (element) return resolve(element);
                const observer = new MutationObserver((_, obs) => {
                    const el = document.querySelector(selector);
                    if (el) { obs.disconnect(); resolve(el); }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    const el = document.querySelector(selector);
                    el ? resolve(el) : reject(new Error(`等待元素超时: ${selector}`));
                }, timeout);
            });
        },
        waitForElementsByText(containerSelector, textPatterns, timeout = 30000) {
            return new Promise((resolve, reject) => {
                const findElements = () => {
                    const containers = document.querySelectorAll(containerSelector);
                    const results = [];
                    for (const container of containers) {
                        const text = container.textContent || "";
                        for (const pattern of textPatterns) {
                            if (text.includes(pattern)) {
                                results.push({ element: container, pattern });
                                break;
                            }
                        }
                    }
                    return results;
                };
                const found = findElements();
                if (found.length > 0) return resolve(found);
                const observer = new MutationObserver((_, obs) => {
                    const found = findElements();
                    if (found.length > 0) { obs.disconnect(); resolve(found); }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    const found = findElements();
                    found.length > 0 ? resolve(found) : reject(new Error("等待文本元素超时"));
                }, timeout);
            });
        },

        lockId() {
            if (!RewardsAuto.state.lockId) RewardsAuto.state.lockId = Utils.getRandomUUID();
            return RewardsAuto.state.lockId;
        },

        acquireLock(key, ttlMs = 20 * 60 * 1000) {
            const now = Date.now();
            const holder = GM_getValue(key, null);
            const mine = Utils.lockId();
            if (holder && typeof holder === "object" && holder.id && holder.id !== mine && now - (holder.ts || 0) < ttlMs) {
                return false;
            }
            GM_setValue(key, { id: mine, ts: now });
            return true;
        },

        refreshLock(key, ttlMs = 20 * 60 * 1000) {
            const now = Date.now();
            const holder = GM_getValue(key, null);
            const mine = Utils.lockId();
            /* 只在「锁是自己的」或「锁已过期」时续期：
               否则一个被冻结的上下文醒来后会把别人正在跑的那一轮锁抢成自己的。 */
            if (holder && typeof holder === "object" && holder.id && holder.id !== mine
                && now - (holder.ts || 0) < ttlMs) {
                return false;
            }
            GM_setValue(key, { id: mine, ts: now });
            return true;
        },

        lockInfo(key) {
            const h = GM_getValue(key, null);
            if (!h || typeof h !== "object" || !h.id) return null;
            return { id: h.id, ts: Number(h.ts) || 0, mine: h.id === Utils.lockId() };
        },

        releaseLock(key) {
            const holder = GM_getValue(key, null);
            if (!holder || holder.id === Utils.lockId()) GM_setValue(key, null);
        }
    };

    class RegionBlockedError extends Error {
        constructor(message) {
            super(message);
            this.name = "RegionBlockedError";
            this.regionBlocked = true;
        }
    }

    const RegionGuard = {
        _cache: null,
        _inflight: null,
        _lastState: "",
        _lastNotifyAt: 0,
        TTL_OK: 120 * 1000,
        TTL_BLOCK: 45 * 1000,
        PROBE_TIMEOUT: 8000,
        NOTIFY_GAP: 10 * 60 * 1000,

        enabled() {
            return !!GM_getValue("Config.lock", true);
        },

        HOSTING_RE: /cloudflare|digitalocean|vultr|linode|akamai|fastly|amazon|aws|google\s*cloud|azure|alibaba|aliyun|alicloud|tencent\s*cloud|qcloud|huawei\s*cloud|hetzner|ovh|leaseweb|contabo|hostwinds|hostinger|racknerd|colocrossing|sharktech|psychz|choopa|m247|datacamp|zenlayer|layerstack|gcore|oracle\s*cloud|\bvpn\b|\bproxy\b|tor\s*exit|ipvanish|nordvpn|expressvpn|surfshark|mullvad/i,

        CN_PAGE_RE: /cn\.bing\.com|京ICP备|beian\.miit\.gov\.cn|国内版<\/a>|国内版/,

        PROBES: [
            {
                src: "bing",
                url: () => `https://www.bing.com/?_=${Date.now()}`,
                headers: { "accept-language": "zh-CN,zh;q=0.9", "cache-control": "no-cache" },
                parse: (txt, g) => {
                    const text = String(txt || "");
                    const flat = text.replace(/\s/g, "");
                    const ipcc = flat.match(/RevIpCC:"([A-Za-z]{2})"/);
                    const region = flat.match(/Region:"([A-Za-z]{2})"/);
                    let cc = ipcc ? ipcc[1] : (region ? region[1] : "");
                    if (!cc && g.CN_PAGE_RE.test(text)) cc = "CN";
                    if (!cc) throw new Error("首页未返回地区标记");
                    return { cc: cc.toUpperCase(), ip: "", org: "" };
                }
            },
            {
                src: "cloudflare",
                url: () => `https://www.cloudflare.com/cdn-cgi/trace?_=${Date.now()}`,
                parse: txt => {
                    const kv = {};
                    String(txt || "").split("\n").forEach(line => {
                        const i = line.indexOf("=");
                        if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
                    });
                    if (!kv.loc) throw new Error("trace 格式异常");
                    return { cc: String(kv.loc).toUpperCase(), ip: kv.ip || "", org: "", warp: kv.warp === "on" };
                }
            },
            {
                src: "ipinfo",
                url: () => `https://ipinfo.io/json?_=${Date.now()}`,
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || !d.country) throw new Error(String((d && (d.error || d.message)) || "无 country 字段"));
                    return { cc: String(d.country).toUpperCase(), ip: d.ip || "", org: d.org || "" };
                }
            },
            {
                src: "ip.sb",
                url: () => `https://api.ip.sb/geoip?_=${Date.now()}`,
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || !d.country_code) throw new Error("无 country_code 字段");
                    return {
                        cc: String(d.country_code).toUpperCase(),
                        ip: d.ip || "",
                        org: [d.isp, d.organization, d.asn_organization].filter(Boolean).join(" ")
                    };
                }
            },
            {
                src: "tencent",
                url: () => "https://disp-qryapi.3g.qq.com/v1/dispatch",
                headers: { referer: "https://3g.qq.com/" },
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || d.code != 0) throw new Error("dispatch 返回异常");
                    return {
                        cc: "",
                        ip: (d.extra && d.extra.ip) || "",
                        org: "",
                        cnText: String(d.ipInfo || "").replace(/[#*]+/g, " ").trim()
                    };
                }
            },
        ],

        async _probeAll() {
            return await Promise.all(this.PROBES.map(async p => {
                try {
                    const txt = await Utils.xhr({
                        url: p.url(),
                        headers: p.headers,
                        anonymous: p.anonymous !== false,
                        timeout: this.PROBE_TIMEOUT
                    });
                    return Object.assign({ src: p.src, cc: "", ip: "", org: "" }, p.parse(txt, this));
                } catch (e) {
                    return { src: p.src, error: e instanceof Error ? e : new Error(String(e)), cc: "", ip: "", org: "" };
                }
            }));
        },

        _merge(list) {
            const map = new Map();
            for (const r of list) {
                if (!r) continue;
                const score = (r.error ? 0 : 2) + (r.cc ? 1 : 0);
                const cur = map.get(r.src);
                const curScore = cur ? (cur.error ? 0 : 2) + (cur.cc ? 1 : 0) : -1;
                if (score > curScore) map.set(r.src, r);
            }
            return [...map.values()];
        },

        _judge(raw) {
            const probes = this._merge(raw);
            const ok = probes.filter(p => !p.error);
            const coded = ok.filter(p => p.cc);
            const foreign = coded.filter(p => p.cc !== "CN");
            const tencent = ok.find(p => p.src === "tencent");
            const cnText = (tencent && tencent.cnText) || "";
            const tencentCN = /中国/.test(cnText);
            const tencentOverseas = !!(cnText && !tencentCN && !/局域网|内网|本地|保留|未知/.test(cnText));
            const warp = ok.find(p => p.warp);
            const hosting = ok.find(p => p.org && this.HOSTING_RE.test(p.org));

            const reasons = [];
            if (foreign.length > 0) {
                reasons.push(`出口非大陆：${foreign.map(p => `${p.src}=${p.cc}${p.ip ? `(${p.ip})` : ""}`).join("、")}`);
            }
            if (tencentOverseas) {
                reasons.push(`国内服务看到的出口在境外：${cnText}`);
            }
            if (warp) reasons.push("Cloudflare WARP 正在接管流量（代理特征）");
            if (hosting) reasons.push(`出口是机房/代理 IP：${hosting.org}`);

            const signals = probes.map(p => {
                if (p.error) return `${p.src}=✗`;
                if (p.src === "tencent") {
                    return `tencent=${tencentCN ? "CN" : tencentOverseas ? "海外" : "?"}${p.ip ? `(${p.ip})` : ""}`;
                }
                return `${p.src}=${p.cc}${p.ip ? `(${p.ip})` : ""}`;
            });

            const ipHolder = (tencent && tencent.ip) ? tencent : ok.find(p => p.ip);
            return {
                ok: reasons.length === 0,
                reasons,
                signals,
                ip: (ipHolder && ipHolder.ip) || "",
                ipInfo: cnText ? `🌏所在地区：${cnText}` : "",
                coded: coded.length,
                known: coded.length + (cnText ? 1 : 0),
                probes: probes.length,
                failed: probes.filter(p => p.error).map(p => `${p.src}: ${p.error.message}`)
            };
        },

        async check({ fresh = false, quiet = false } = {}) {
            if (!this.enabled()) {
                return { ok: true, skipped: true, reasons: [], signals: [], ip: "", ipInfo: "", coded: 0, known: 0, probes: 0, failed: [] };
            }
            const now = Date.now();
            if (!fresh && this._cache && (now - this._cache.at) < (this._cache.ok ? this.TTL_OK : this.TTL_BLOCK)) {
                return this._cache;
            }
            if (this._inflight) return this._inflight;

            this._inflight = (async () => {
                let raw = await this._probeAll();
                let verdict = this._judge(raw);
                for (const wait of [2000, 5000]) {
                    if (verdict.known > 0) break;
                    if (!quiet) Utils.log("🟡", `出口检测没拿到任何结果，${wait / 1000} 秒后再试一次`);
                    await Utils.delay(wait);
                    raw = raw.concat(await this._probeAll());
                    verdict = this._judge(raw);
                }
                if (verdict.known === 0) {
                    verdict.ok = false;
                    verdict.reasons.unshift("无法确认出口地区（所有探测都失败）");
                }
                verdict.at = Date.now();
                this._cache = verdict;

                if (verdict.ok) {
                    RewardsAuto.state.region = "CN";
                    if (verdict.ip) RewardsAuto.state.ip = verdict.ip;
                    if (this._lastState !== "ok" || fresh) {
                        Utils.log("🟢", `出口检测通过（CN）｜${verdict.signals.join("  ")}`);
                    }
                    this._lastState = "ok";
                } else {
                    if (verdict.ip) RewardsAuto.state.ip = verdict.ip;
                    if (verdict.ipInfo) RewardsAuto.state.ipInfo = verdict.ipInfo;
                    const stateChanged = this._lastState !== "block";
                    const push = stateChanged || (Date.now() - this._lastNotifyAt > this.NOTIFY_GAP);
                    if (stateChanged || fresh) {
                        Utils.log(push ? "🔴" : "🟡",
                            `检测到代理/VPN 或非大陆出口，已暂停上报\n${verdict.reasons.join("\n")}\n出口 IP：${verdict.ip || "未知"}\n${verdict.ipInfo || ""}`,
                            push);
                    }
                    if (push) this._lastNotifyAt = Date.now();
                    this._lastState = "block";
                }
                return verdict;
            })();

            try {
                return await this._inflight;
            } finally {
                this._inflight = null;
            }
        },

        async guard(where = "任务") {
            const v = await this.check();
            if (!v.ok) throw new RegionBlockedError(`出口异常（${where}）：${v.reasons[0] || "未知原因"}`);
            return v;
        },

        async allow() {
            const v = await this.check();
            return v.ok;
        }
    };

    const CLIENT_ID = "0000000040170455";
    const REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf";
    const TOKEN_SCOPE = "service::prod.rewardsplatform.microsoft.com::MBI_SSL";

    const Auth = {
        authUrl: `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&response_type=code&scope=${TOKEN_SCOPE}&redirect_uri=${REDIRECT_URI}`,

        decode(s) {
            return String(s).replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        },

        normalize(code) {
            if (!code) return null;
            const c = String(code)
                .trim()
                .replace(/^[^A-Za-z0-9]+/, "")
                .replace(/[^A-Za-z0-9._*!$%~-]+$/, "");
            return c.length >= 20 ? c : null;
        },

        parseCode(input) {
            if (input == null) return null;
            let s = String(input)
                .replace(/[\u00a0\u3000]/g, " ")
                .replace(/\\u0026/gi, "&")
                .replace(/\\\//g, "/")
                .replace(/&amp;/gi, "&")
                .replace(/[\r\n\t]+/g, " ")
                .trim();
            if (!s) return null;

            const m = s.match(/[?&#;\s]code=([^&\s"'<>\\]+)/i) || s.match(/^code=([^&\s"'<>\\]+)/i);
            if (m) {
                const c = this.normalize(this.decode(m[1]));
                if (c) return c;
            }
            const bare = s.match(/M\.[A-Za-z0-9._*!$%~-]{20,}/);
            if (bare) return this.normalize(this.decode(bare[0]));
            const t = s.replace(/^[\s"'`<\[(]+/, "").replace(/[\s"'`>\])]+$/, "");
            if (/^[A-Za-z0-9._*!$%~-]{40,}$/.test(t)) return this.normalize(this.decode(t));
            return null;
        },

        preview(code) {
            if (!code) return "(空)";
            return `${code.slice(0, 12)}…${code.slice(-6)}（${code.length} 字符）`;
        },

        pick(list) {
            for (const item of list) {
                if (!item || !item.value) continue;
                const code = this.parseCode(item.value);
                if (code) return { code, source: item.source, raw: String(item.value) };
            }
            return null;
        },

        candidates(deep) {
            const list = [];
            const add = (source, value) => { if (value) list.push({ source, value: String(value) }); };
            try { add("地址栏", location.href); } catch (_) {}
            try { add("地址栏参数", `${location.search || ""}${location.hash || ""}`); } catch (_) {}

            try { add("document.referrer", typeof document !== "undefined" && document ? document.referrer : ""); } catch (_) {}
            try {
                const nav = (typeof performance !== "undefined" && performance.getEntriesByType)
                    ? performance.getEntriesByType("navigation") : null;
                if (nav && nav[0] && nav[0].name) add("navigation", nav[0].name);
            } catch (_) {}
            try { add("window.name", typeof window !== "undefined" ? window.name : ""); } catch (_) {}
            if (OAUTH_WITNESS) {
                add("启动快照(地址栏)", OAUTH_WITNESS.href);
                add("启动快照(referrer)", OAUTH_WITNESS.referrer);
                add("启动快照(window.name)", OAUTH_WITNESS.name);
                (OAUTH_WITNESS.urls || []).forEach((u, i) => add(`历史 URL#${i + 1}`, u));
            }
            if (!deep) return list;
            try {
                const html = (typeof document !== "undefined" && document && document.documentElement)
                    ? String(document.documentElement.outerHTML || "") : "";
                const m = html.match(/[^\s"'<>\\]{0,160}code=[A-Za-z0-9._~%*!$-]{20,120}[^\s"'<>\\]{0,32}/i);
                if (m) add("页面内容", m[0]);
            } catch (_) {}
            for (const storeName of ["sessionStorage", "localStorage"]) {
                try {
                    const store = (typeof window !== "undefined" && window) ? window[storeName] : null;
                    if (!store) continue;
                    for (let i = 0; i < store.length && i < 40; i++) {
                        const key = store.key(i);
                        if (key == null) continue;
                        const val = store.getItem(key);
                        if (val && val.length < 4000 && /code=/i.test(val)) add(`${storeName}.${key}`, val);
                    }
                } catch (_) {}
            }
            return list;
        },

        collectCode(deep = false) {
            return this.pick(this.candidates(deep));
        },

        async waitForAnyCode(timeoutMs = 12000, stepMs = 500) {
            const t0 = Date.now();
            for (let tick = 0; Date.now() - t0 < timeoutMs; tick++) {
                const hit = this.collectCode(tick === 0 || tick % 4 === 0);
                if (hit) return hit;
                await Utils.delay(stepMs);
            }
            return this.collectCode(true);
        },

        used(code) {
            if (!GM_getValue("Config.codeUsed", false)) return false;
            const fp = String(GM_getValue("Config.codeFingerprint", ""));
            return !fp || fp === String(code || "").slice(-32);
        },

        stored() {
            const raw = GM_getValue("Config.code", "");
            if (!raw) return null;
            const code = this.parseCode(raw);
            if (!code) {
                if (!this._warned) {
                    this._warned = true;
                    Utils.log("🟡", `已保存的授权码无法解析（长度 ${String(raw).length}），请重新「📋 粘贴授权码」`);
                }
                return null;
            }
            if (this.used(code)) return null;
            return code;
        },

        save(raw) {
            const code = this.parseCode(raw);
            GM_setValue("Config.code", String(raw).trim());
            GM_setValue("Config.codeTime", Utils.getTimestamp());
            GM_setValue("Config.codeUsed", false);
            GM_setValue("Config.codeFingerprint", code ? code.slice(-32) : "");
            GM_setValue("Config.accessToken", "");
            GM_setValue("Config.accessTokenTime", 0);
            RewardsAuto.state.token = null;
            return code;
        },

        clear(reason) {
            GM_setValue("Config.code", "");
            GM_setValue("Config.codeTime", 0);
            GM_setValue("Config.codeUsed", false);
            GM_setValue("Config.codeFingerprint", "");
            if (reason) Utils.log("🟡", `已清除授权码：${reason}`);
        },

        async exchange(code, keep = true) {
            Utils.log("🟡", `正在用授权码换取 Token（${this.preview(code)}）...`);
            const r = await API.tokenRequest({
                client_id: CLIENT_ID,
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            });
            if (r.ok) {
                API.applyToken(r.json);
                if (keep) {
                    GM_setValue("Config.codeUsed", true);
                    GM_setValue("Config.codeFingerprint", String(code).slice(-32));
                    Utils.log("🟢", "授权码换取 Token 成功（授权码已保留）", true);
                } else {
                    Utils.log("🟢", "授权码换取 Token 成功，已保存", true);
                    this.clear();
                }
                return true;
            }
            const fatal = ["invalid_grant", "invalid_request", "unauthorized_client", "invalid_client"].includes(r.error);
            Utils.log("🔴", `授权码换取 Token 失败：${r.error}${r.description ? " - " + r.description : ""}`);
            if (fatal) this.clear("授权码已过期或已被使用过");
            return false;
        },

        async fetchViaXhr() {
            let res;
            try {
                res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: this.authUrl,
                        headers: typeof navigator !== "undefined" ? { "User-Agent": navigator.userAgent } : {},
                        timeout: 20000,
                        onload: r => resolve(r),
                        onerror: e => reject(new Error((e && e.error) || "网络错误")),
                        ontimeout: () => reject(new Error("请求超时")),
                    });
                });
            } catch (e) {
                Utils.log("🟡", `静默获取授权码失败：${e.message}`);
                return null;
            }
            const candidates = [];
            if (res.finalUrl) candidates.push(res.finalUrl);
            if (res.responseURL) candidates.push(res.responseURL);
            if (res.status >= 300 && res.status < 400) {
                const loc = (res.responseHeaders || "").match(/location:\s*(\S+)/i);
                if (loc) candidates.push(loc[1]);
            }
            if (res.responseText) {
                const m = res.responseText.match(/oauth20_desktop\.srf\?[^"'\s<>]*code=[^"'\s<>]+/i)
                    || res.responseText.match(/[?&]code=M\.[^"'\s<>&]+/i);
                if (m) candidates.push(m[0]);
            }
            for (const c of candidates) {
                const code = this.parseCode(c);
                if (code) return code;
            }
            const finalUrl = res.finalUrl || res.responseURL || "";
            if (/removed=true/i.test(finalUrl)) {
                Utils.log("🟡", `静默通道被微软跳到了 ?removed=true（code 已被抹掉），改走页面 Referer 通道`);
                return null;
            }
            Utils.log("🟡", `静默通道没拿到授权码（HTTP ${res.status}，最终地址 ${finalUrl || "未知"}）`);
            return null;
        },

        async waitForCode(since, timeoutMs = 180000) {
            const step = 3000;
            for (let waited = 0; waited < timeoutMs; waited += step) {
                await Utils.delay(step);
                const raw = GM_getValue("Config.code", "");
                const t = Number(GM_getValue("Config.codeTime", 0)) || 0;
                const code = raw ? this.parseCode(raw) : null;
                const freshToken = () => GM_getValue("Config.token", false)
                    && (Number(GM_getValue("Config.tokenTime", 0)) || 0) >= since;
                if (code && t >= since) {
                    await Utils.delay(2500);
                    if (freshToken()) return { tokenReady: true };
                    return { code };
                }
                if (freshToken()) return { tokenReady: true };
            }
            return {};
        },

        async autoFetch(reason) {
            if (!GM_getValue("Config.autoAuth", true)) {
                Utils.log("🔴", `${reason}，且配置里已关闭「自动检测授权码」：请点菜单「🔑 手动授权」，登录后把跳转地址粘贴到「📋 粘贴授权码」。`);
                return {};
            }
            Utils.log("🟡", `${reason}，后台静默尝试捕获授权码（不打开标签页）...`);
            const viaXhr = await this.fetchViaXhr();
            if (viaXhr) {
                Utils.log("🟢", "自动获取授权码成功（静默通道）");
                return { code: viaXhr };
            }
            Utils.log("🔴", "静默捕获授权码失败，不自动打开授权页。请点菜单「🔑 手动授权」登录：页面跳到 oauth20_desktop.srf 时脚本会自动从 Referer 捕获授权码并换 Token；也可以 F12 → 网络 → oauth20_desktop.srf?removed=true → 标头 → 请求标头 → 复制 Referer，再用「📋 粘贴授权码」粘贴。");
            return {};
        },

        async handleCallback() {
            const params = new URLSearchParams(location.search);
            const err = params.get("error");
            if (err) {
                const desc = params.get("error_description") || "";
                Utils.log("🔴", `授权页返回错误：${err} - ${desc}`, true);
                try { GM_notification({ title: "🔴 授权失败", text: `${err}：${desc}`, timeout: 0 }); } catch (_) {}
                return;
            }
            if (!params.get("code")) {
                Utils.log("🟡", `回调地址里没有 code（${location.search || "无参数"}），改从 Referer / 启动快照里找...`);
            }
            const hit = this.collectCode(false) || await this.waitForAnyCode(12000);
            if (!hit) {
                Utils.log("🔴", "自动捕获授权码失败：地址栏、document.referrer、启动快照里都没有 code", true);
                try {
                    GM_notification({
                        title: "🔴 自动捕获授权码失败",
                        text: "F12 → 网络 → 点 oauth20_desktop.srf?removed=true → 标头 → 请求标头 → 复制 Referer 右侧完整链接，再用「📋 粘贴授权码」",
                        timeout: 0
                    });
                } catch (_) {}
                return;
            }
            const code = hit.code;
            Utils.log("🟢", `已捕获授权码（来源：${hit.source}，${this.preview(code)}），正在换取 Token...`);
            this.save(hit.raw || code);
            const ok = await this.exchange(code);
            if (ok) {
                try { GM_notification({ title: "🟢 授权成功", text: "Token 已保存，可以关闭此页了", timeout: 6000 }); } catch (_) {}
                setTimeout(() => { try { window.close(); } catch (_) {} }, 2000);
            } else {
                try { GM_notification({ title: "🔴 授权失败", text: "授权码换取 Token 失败，请查看脚本日志后重新授权", timeout: 0 }); } catch (_) {}
            }
        },

        async recoverFromPage() {
            const hit = this.collectCode(true) || await this.waitForAnyCode(6000);
            if (!hit) {
                Utils.uiAlert(
                    "🕵️ 没有在 Referer / 地址栏 / 页面内容里找到授权码。\n\n" +
                    "请确认当前页就是授权跳转后的那一个（地址形如 /oauth20_desktop.srf?removed=true）。\n" +
                    "若仍失败，按 F12 → 网络 → 点 oauth20_desktop.srf?removed=true → 标头 → 请求标头 →\n" +
                    "复制 Referer 右侧的完整链接，再用「📋 粘贴授权码」粘贴。"
                );
                return false;
            }
            Utils.log("🟢", `从页面捕获授权码（来源：${hit.source}，${this.preview(hit.code)}），正在换取 Token...`);
            this.save(hit.raw || hit.code);
            const ok = await this.exchange(hit.code);
            Utils.uiAlert(ok
                ? "✅ 已用捕获到的授权码换取 Token 并保存。"
                : "⚠️ 捕获到授权码，但换取 Token 失败（多半已过期或已被用过）。请重新「🔑 手动授权」。");
            return ok;
        },

        async pasteFlow(input) {
            let raw = input;
            if (raw == null) {
                raw = await Utils.uiPrompt(
                    "粘贴授权页跳转后的完整地址：\n" +
                    "形如 https://login.live.com/oauth20_desktop.srf?code=M.C561_BAY...&lc=2052\n\n" +
                    "如果手速不够快，地址栏发生了变化(没有code=M...=2052):\n" +
                    "方案1：再次点击手动授权(看准时机复制地址栏内容)\n"+
                    "方案2：手动授权 → F12 → 网络(Network) → oauth20_desktop.srf?removed=true → 标头(Headers) → 请求标头(Request headers) → Referer → 复制右侧完整链接\n"

                );
                if (raw == null) return false;
            }
            const code = this.save(raw);
            if (!code) {
                Utils.uiAlert("❌ 没能从粘贴内容里解析出授权码。\n\n请确认复制的是授权页跳转后的完整地址（里面要带 code=），然后重新粘贴。形如:\nhttps://login.live.com/oauth20_desktop.srf?code=M.C561_BAY...&lc=2052");
                Utils.log("🔴", `粘贴的授权码无法解析（长度 ${String(raw).trim().length}）`);
                return false;
            }
            Utils.log("🟢", `授权码已保存（${this.preview(code)}），立即换取 Token...`);
            const ok = await this.exchange(code);
            Utils.uiAlert(ok
                ? "✅ 授权成功，Token 已保存。\n\n授权码也已保留（可在「📊 Token状态」里查看）。授权码本身只能用一次，\n后续使用的是token，无需你再操作。"
                : "⚠️ 授权码已保存，但换取 Token 失败。\n\n最常见原因：授权码已过期或已被使用过。\n请重新点「🔑 手动授权」，登录后立刻复制跳转地址再粘贴。");
            return ok;
        },
    };

    const CDP = {
        _ws: null,
        _id: 0,
        _pending: null,
        _warnedAt: 0,
        WARN_GAP: 30 * 60 * 1000,

        base() {
            const p = Number(GM_getValue("Config.cdpPort", 9224)) || 9224;
            return "http://127.0.0.1:" + p;
        },

        launchCommand() {
            const port = Number(GM_getValue("Config.cdpPort", 9224)) || 9224;
            const profile = String(GM_getValue("Config.cdpProfileDir", "") || "%LOCALAPPDATA%\\Microsoft\\Edge\\CDPUserData");
            const profDir = String(GM_getValue("Config.cdpProfileName", "") || "Profile 2");
            return "& \"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\""
                + " --remote-debugging-port=" + port
                + " --remote-allow-origins=* --user-data-dir=\""
                + profile
                + "\" --profile-directory=\""
                + profDir
                + "\"";
        },

        warn(reason) {
            /* 只写后台日志，不推送（通知/webhook）：CDP 没连上是常态，不该占用推送通道。
               仍然保留 30 分钟节流，避免每一轮都往控制台刷一屏启用方法。 */
            const now = Date.now();
            const first = !this._warnedAt || now - this._warnedAt > this.WARN_GAP;
            if (!first) {
                Utils.log("🟡", "CDP 仍未连接：" + reason + "（30 分钟内不再重复提示）");
                return;
            }
            this._warnedAt = now;
            const msg = [
                "CDP 未连接：" + reason,
                "应用内搜索型卡片（带锁标识）需要浏览器级真实点击才能记账。",
                "页面内 JS 模拟点击无效 —— isTrusted=false 时浏览器直接拒绝导航，这是安全边界。",
                "",
                "【启用方法】用桌面上的「Rewards Edge」快捷方式启动（或粘下面这条命令）：",
                this.launchCommand(),
                "",
                "它会在一个独立小窗口打开（不影响你平时的 Edge）。首次需要在该窗口登录 rewards.bing.com。"
            ].join(String.fromCharCode(10));
            Utils.log("🔴", msg);
        },

        async available() {
            if (typeof WebSocket === "undefined") return false;
            try {
                const r = await Utils.xhr({ url: this.base() + "/json/version", timeout: 3000 });
                return !!(r && String(r).indexOf("Browser") >= 0);
            } catch (_) {
                return false;
            }
        },

        async targets() {
            try {
                const txt = await Utils.xhr({ url: this.base() + "/json/list", timeout: 4000 });
                return JSON.parse(txt);
            } catch (_) {
                return null;
            }
        },

        async earnPage() {
            const list = await this.targets();
            if (!list) return null;
            const hit = list.find(t => t.type === "page" && t.url && t.url.indexOf("https://rewards.bing.com/earn") === 0);
            if (hit) return hit;
            if (!GM_getValue("Config.cdpAllowNewTab", false)) return null;
            try {
                const res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "PUT",
                        url: this.base() + "/json/new?" + encodeURIComponent("https://rewards.bing.com/earn"),
                        onload: r => resolve(r.responseText),
                        onerror: e => reject(new Error((e && e.error) || "new tab failed")),
                        ontimeout: () => reject(new Error("timeout")),
                        timeout: 8000
                    });
                });
                const j = JSON.parse(res);
                await Utils.delay(3000);
                return j;
            } catch (_) {
                return null;
            }
        },

        async connect(wsUrl) {
            if (this._ws) {
                try { this._ws.close(); } catch (_) {}
                this._ws = null;
            }
            this._pending = new Map();
            this._id = 0;
            const ws = new WebSocket(wsUrl);
            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error("ws timeout")), 6000);
                ws.onopen = () => { clearTimeout(t); resolve(); };
                ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
            });
            ws.onmessage = ev => {
                let m;
                try { m = JSON.parse(ev.data); } catch (_) { return; }
                const p = this._pending && this._pending.get(m.id);
                if (!p) return;
                this._pending.delete(m.id);
                if (m.error) p.reject(new Error(JSON.stringify(m.error)));
                else p.resolve(m.result);
            };
            this._ws = ws;
            return ws;
        },

        send(method, params) {
            if (!this._ws) return Promise.reject(new Error("ws not connected"));
            const mid = ++this._id;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    if (this._pending) this._pending.delete(mid);
                    reject(new Error("cdp timeout: " + method));
                }, 10000);
                this._pending.set(mid, {
                    resolve: v => { clearTimeout(timer); resolve(v); },
                    reject: e => { clearTimeout(timer); reject(e); }
                });
                try { this._ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); }
                catch (e) { clearTimeout(timer); reject(e); }
            });
        },

        close() {
            try { if (this._ws) this._ws.close(); } catch (_) {}
            this._ws = null;
            this._pending = null;
        },

        async evaluate(expression) {
            const r = await this.send("Runtime.evaluate", { expression: expression, returnByValue: true, userGesture: true });
            return r && r.result ? r.result.value : undefined;
        },

        async fetchPageText(url) {
            const expr = `(async function(){
                try {
                    var r = await fetch(${JSON.stringify(url)}, { credentials: "include", redirect: "follow" });
                    var t = await r.text();
                    return JSON.stringify({ ok: r.ok, status: r.status, text: t.slice(0, 900000) });
                } catch (e) {
                    return JSON.stringify({ ok: false, status: 0, text: String(e && e.message || e) });
                }
            })()`;
            let raw;
            try {
                const r = await this.send("Runtime.evaluate", {
                    expression: expr, awaitPromise: true, returnByValue: true, userGesture: true
                });
                raw = r && r.result ? r.result.value : "";
            } catch (e) {
                return null;
            }
            try {
                const j = JSON.parse(raw || "{}");
                if (!j.ok || !j.text) return null;
                return String(j.text);
            } catch (_) { return null; }
        },

        async claimInPage(pageUrl, headers, body) {
            const expr = `(async function(){
                try {
                    var r = await fetch(${JSON.stringify(pageUrl)}, {
                        method: "POST",
                        credentials: "include",
                        headers: ${JSON.stringify(headers)},
                        body: ${JSON.stringify(body)}
                    });
                    var t = await r.text();
                    return JSON.stringify({ ok: true, status: r.status, text: t.slice(0, 2000) });
                } catch (e) {
                    return JSON.stringify({ ok: false, status: 0, text: String(e && e.message || e) });
                }
            })()`;

            let raw;
            try {
                const r = await this.send("Runtime.evaluate", {
                    expression: expr,
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                });
                raw = r && r.result ? r.result.value : "";
            } catch (e) {
                return { accepted: false, status: 0, text: `CDP 求值失败：${e.message}` };
            }
            try {
                const j = JSON.parse(raw || "{}");
                return { accepted: j.ok && j.status >= 200 && j.status < 300, status: j.status || 0, text: String(j.text || "") };
            } catch (_) {
                return { accepted: false, status: 0, text: String(raw || "页面无返回") };
            }
        },

        async pendingCards() {
            const expr = [
                "(function(){",
                "  var out = [];",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  for (var i = 0; i < nodes.length; i++) {",
                "    var a = nodes[i];",
                "    var txt = (a.innerText || '').replace(/\\s+/g, ' ').trim();",
                "    if (/已完成/.test(txt)) continue;",
                "    if (!/bing\\.com\\/search/i.test(a.href)) continue;",
                "    out.push({ title: (txt.split(' ')[0] || txt).slice(0, 20), href: a.href });",
                "  }",
                "  return JSON.stringify(out);",
                "})()"
            ].join("\n");
            const raw = await this.evaluate(expr);
            try { return JSON.parse(raw || "[]"); } catch (_) { return []; }
        },

        async clickCard(href) {
            const h = JSON.stringify(href);
            const posExpr = [
                "(function(){",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  var target = null;",
                "  for (var i = 0; i < nodes.length; i++) { if (nodes[i].href === " + h + ") { target = nodes[i]; break; } }",
                "  if (!target) return 'nf';",
                "  target.scrollIntoView({ block: 'center' });",
                "  var r = target.getBoundingClientRect();",
                "  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });",
                "})()"
            ].join("\n");
            let pos = await this.evaluate(posExpr);
            if (pos === "nf") return false;
            await Utils.delay(900);
            pos = await this.evaluate(posExpr);
            if (pos === "nf") return false;
            let pt = null;
            try { pt = JSON.parse(pos); } catch (_) { return false; }
            await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y, button: "none" });
            await Utils.delay(250);
            await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", buttons: 1, clickCount: 1 });
            await Utils.delay(250);
            await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", buttons: 0, clickCount: 1 });
            return true;
        },

        async progress() {
            const expr = [
                "(function(){",
                "  var done = 0, total = 0;",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  for (var i = 0; i < nodes.length; i++) {",
                "    total++;",
                "    if (/已完成/.test(nodes[i].innerText || '')) done++;",
                "  }",
                "  return JSON.stringify({ done: done, total: total });",
                "})()"
            ].join("\n");
            const raw = await this.evaluate(expr);
            try { return JSON.parse(raw || "{}"); } catch (_) { return { done: 0, total: 0 }; }
        },

        async claimAll(maxCards) {
            const cap = Number(maxCards) || 6;
            if (!(await this.available())) {
                const reason = "端口 " + (Number(GM_getValue("Config.cdpPort", 9224)) || 9224) + " 上没有调试服务";
                this.warn(reason);
                return { ok: false, reason: reason };
            }
            let page = await this.earnPage();
            if (!page) {
                this.warn("能连上端口，但打不开 earn 页");
                return { ok: false, reason: "打不开 earn 页" };
            }
            const result = { ok: true, handled: 0, done: 0, total: 0 };
            try {
                await this.connect(page.webSocketDebuggerUrl);
                const before = await this.progress();
                result.done = before.done || 0;
                result.total = before.total || 0;

                const logged = await this.evaluate("document.cookie.indexOf('MUID') >= 0");
                if (!logged) {
                    this.warn("窗口里没有登录 rewards（该配置目录需要单独登录一次）");
                    return { ok: false, reason: "CDP 窗口未登录" };
                }

                Utils.log("🖱️", "CDP 已连接：当前已完成 " + before.done + "/" + before.total);
                const cards = await this.pendingCards();
                if (cards.length === 0) {
                    Utils.log("✅", "CDP：没有待处理的应用搜索卡");
                    return result;
                }
                Utils.log("🖱️", "CDP：发现 " + cards.length + " 张待处理卡（用真实点击完成）");

                for (const card of cards.slice(0, cap)) {
                    page = await this.earnPage();
                    if (!page) break;
                    if (!this._ws || this._ws.readyState !== 1) {
                        await this.connect(page.webSocketDebuggerUrl);
                    }
                    const ok = await this.clickCard(card.href);
                    if (ok) {
                        result.handled++;
                        Utils.log("🖱️", "  已点击：" + card.title);
                    }
                    await Utils.delay(8000);
                }

                for (let i = 0; i < 12; i++) {
                    await Utils.delay(10000);
                    const pg = await this.earnPage();
                    if (!pg) break;
                    if (!this._ws || this._ws.readyState !== 1) await this.connect(pg.webSocketDebuggerUrl);
                    const now = await this.progress();
                    result.done = now.done || 0;
                    result.total = now.total || 0;
                    if (result.handled > 0 && result.done >= result.total) break;
                }
                return result;
            } catch (e) {
                return { ok: false, reason: e.message };
            } finally {
                this.close();
            }
        }
    };

    const BrowserEnv = {
        _cache: null,
        info() {
            if (this._cache) return this._cache;
            let ua = "";
            try {
                ua = (typeof navigator !== "undefined" && navigator && navigator.userAgent) ? String(navigator.userAgent) : "";
            } catch (_) { ua = ""; }
            if (!ua) {
                try {
                    const saved = String(GM_getValue("Config.uaEdge", "") || "");
                    if (saved) ua = saved;
                } catch (_) {}
            }
            let name = "未知";
            if (/Edg\//.test(ua)) name = "Edge";
            else if (/EdgA\//.test(ua)) name = "Edge(App)";
            else if (/OPR\//.test(ua)) name = "Opera";
            else if (/Firefox\/|FxiOS\//.test(ua)) name = "Firefox";
            else if (/Chrome\//.test(ua)) name = "Chrome";
            else if (/Safari\//.test(ua)) name = "Safari";
            const vm = ua.match(/(?:Edg|EdgA|Chrome|Firefox)\/(\d+)/);
            const major = vm ? Number(vm[1]) : 0;
            const extOriginRisky = name === "Edge" && major >= 152;
            this._cache = { ua, name, major, extOriginRisky };
            return this._cache;
        },

        channelOrder() {
            return ["page", "proxy", "xhr"];
        },
        summary() {
            const i = this.info();
            return `${i.name}${i.major ? " " + i.major : ""}`;
        }
    };

    const ActionMap = {
        KEY_MAP: "Config.actionMap",
        KEY_BUILD: "Config.actionBuild",
        KEY_DPL: "Config.actionDpl",
        FALLBACK: {
            reportActivity: "707e6eb15bdfdd5fba193f0a77e934f7018faf87ce",
            reportClaimAllPoints: "00491296f1d668ad46b65342c95cb9d72a62c1fa9d"
        },
        REQUIRED: ["reportActivity"],

        _cachedDpl() { return String(GM_getValue("Config.dpl", "") || ""); },

        _readMap() {
            const raw = GM_getValue(this.KEY_MAP, "");
            if (!raw) return {};
            try {
                const j = JSON.parse(raw);
                return (j && typeof j === "object") ? j : {};
            } catch (_) { return {}; }
        },

        clear() {
            GM_setValue(this.KEY_MAP, "");
            GM_setValue(this.KEY_BUILD, "");
            GM_setValue(this.KEY_DPL, "");
        },

        get(name) {
            const map = this._readMap();
            const cached = map[name];
            return cached || this.FALLBACK[name] || "";
        },

        async ensure(pages, opts = {}) {
            const dplNow = this._cachedDpl();
            const cachedMap = this._readMap();
            const cachedDpl = GM_getValue(this.KEY_DPL, "");
            if (this.REQUIRED.every(k => cachedMap[k]) && cachedDpl && (!dplNow || cachedDpl === dplNow)) {
                return { ids: cachedMap, dpl: cachedDpl, fresh: false };
            }
            const budgetMs = Number(opts.budgetMs) || ACTION_SCAN_BUDGET;
            const maxFetch = Number(opts.maxFetch) || ACTION_SCAN_MAX;
            const deadline = Date.now() + budgetMs;

            let combined = (pages || []).filter(Boolean).join("\n");
            if (!combined) {
                try {
                    combined = [(await Utils.xhr({ url: "https://rewards.bing.com/dashboard" })),
                        (await Utils.xhr({ url: "https://rewards.bing.com/earn" }))]
                        .filter(Boolean).join("\n");
                } catch (_) { combined = ""; }
            }
            if (!combined) {
                const ids = Object.assign({}, this.FALLBACK, cachedMap);
                return { ids, dpl: cachedDpl, fresh: false };
            }
            const dpl = dplNow || (combined.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i) || [])[1] || "";

            const queue = [];
            const seen = new Set();
            const push = p => { if (p && !seen.has(p)) { seen.add(p); queue.push(p); } };
            const rel = new Set();
            for (const m of combined.matchAll(/(?:\/_next\/)?(static\/(?:chunks|immutable|media)\/[^\s"'\\]+?\.js)/g)) {
                rel.add("/_next/" + m[1]);
            }
            [...rel].sort((a, b) => ((/(dashboard|earn|page|layout)/i.test(a) ? 0 : 1) - (/(dashboard|earn|page|layout)/i.test(b) ? 0 : 1)))
                .forEach(push);
            const addDynamic = text => {
                for (const m of String(text || "").matchAll(/\b(\d{2,6}):"([a-z0-9_-]{8,})"/g)) {
                    push(`/_next/static/chunks/${m[1]}-${m[2]}.js`);
                    push(`/_next/static/chunks/${m[1]}.${m[2]}.js`);
                }
            };
            addDynamic(combined);

            const hex = "[a-f0-9]{40,64}";

            const q = '\\\\?"';
            const reCreate = new RegExp(`createServerReference\\s*\\)?\\s*\\(\\s*${q}(${hex})${q}([\\s\\S]{0,800}?)\\)`, "g");
            const reRegister = new RegExp(`registerServerReference\\s*\\)?\\s*\\([^,]+,\\s*${q}(${hex})${q}([\\s\\S]{0,800}?)\\)`, "g");
            const SKIP = ["callServer", "findSourceMapURL", "encodeFormAction", "default"];
            const reName = new RegExp(`${q}([A-Za-z_$][\\w$]*)${q}`, "g");
            const scan = (js, map) => {
                for (const re of [reCreate, reRegister]) {
                    re.lastIndex = 0;
                    let m;
                    while ((m = re.exec(js)) !== null) {
                        const names = [...(m[2] || "").matchAll(reName)];
                        const list = names.map(x => x[1]).filter(n => n.length > 3 && !SKIP.includes(n));
                        const name = list[list.length - 1];
                        if (name && !map[name]) map[name] = m[1];
                    }
                }
            };

            const map = Object.assign({}, cachedMap);
            let fetched = 0;
            while (queue.length && fetched < maxFetch && Date.now() < deadline) {
                const path = queue.shift();
                fetched++;
                try {
                    const js = await Utils.xhr({ url: "https://rewards.bing.com" + path, timeout: 8000 });
                    if (!js) continue;
                    scan(js, map);
                    if (!this.REQUIRED.every(k => map[k])) addDynamic(js);
                    if (this.REQUIRED.every(k => map[k]) && map.reportClaimAllPoints) break;
                } catch (_) {}
            }

            const merged = Object.assign({}, this.FALLBACK, map);
            const ok = Object.keys(map).length > 0;
            if (ok) {
                GM_setValue(this.KEY_MAP, JSON.stringify(map));
                GM_setValue(this.KEY_DPL, dpl || dplNow || "");
                GM_setValue(this.KEY_BUILD, dpl || "");
                Utils.log("🧩", `服务端标识表已更新（部署 ${dpl || "未知"}，动作 ${Object.keys(map).length} 个`
                    + `${map.reportClaimAllPoints ? "，含领取" : "，缺领取用兜底"}）`);
                return { ids: merged, dpl: dpl || dplNow, fresh: true };
            }
            Utils.log("🟡", `未能从页面分包中提取服务端标识（扫了 ${fetched} 个），使用缓存/兜底标识`);
            return { ids: merged, dpl: dpl || dplNow, fresh: false };
        }
    };

    const ClaimPoints = {
        KEY_VARIANT: "Config.claimVariant",
        KEY_EMPTY_AT: "Config.claimEmptyAt",
        EMPTY_TTL: 15 * 60 * 1000,

        parse(html) {
            const raw = String(html || "");
            if (!raw) return { known: false, has: false, amount: 0 };
            const clean = raw.replace(/\\"/g, '"');
            const m = clean.match(/"pointClaim"\s*:\s*(null|\{|\[)/i);
            if (m) {
                if (m[1] === "null") return { known: true, has: false, amount: 0, source: "pointClaim" };
                const amount = this._amount(clean);
                if (amount > 0) return { known: true, has: true, amount, source: "pointClaim" };
                const badge = this._badge(clean);
                if (badge > 0) return { known: true, has: true, amount: badge, source: "badge" };
                /* 标记在、两处金额都读成 0：这是「读不到」，不是「确实为 0」。
                   uncertain 必须让调用方继续尝试领取，否则页面结构一变就永远领不出来。 */
                return {
                    known: true, has: false, amount: 0, source: "pointClaim-empty", uncertain: true,
                    snippet: this._snippet(clean)
                };
            }
            const badge = this._badge(clean);
            if (badge >= 0) return { known: true, has: badge > 0, amount: badge, source: "badge" };
            return { known: false, has: false, amount: 0 };
        },

        /* 页面徽标上的「可领取 N」数字，仅用于 pointClaim 金额读到 0 时的兜底确认。
           先按元素紧邻匹配，再退化为纯文本匹配，避免把标签属性里的数字当成积分。
           返回 -1 表示页面上根本找不到徽标。 */
        _badge(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            /* alt 和数字之间普遍隔着一两个标签（<span>/<div>），原来只允许空白，
               真实页面必然漏判 —— 这里放开到 200 字符内任意内容。 */
            const near = clean.match(/alt="(?:可领取|待领取)"[^>]*>[\s\S]{0,200}?(\d[\d,]*)/i);
            if (near) return parseInt(String(near[1]).replace(/,/g, ""), 10) || 0;
            const text = clean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
            /* 页面文案是「可领取」，原来只认「待领取」 */
            const m1 = text.match(/(?:可领取|待领取|to claim)\s*[:：]?\s*([\d,]+)/i);
            if (m1) return parseInt(String(m1[1]).replace(/,/g, ""), 10) || 0;
            const m2 = text.match(/([\d,]+)\s*(?:可领取|待领取)/i);
            if (m2) return parseInt(String(m2[1]).replace(/,/g, ""), 10) || 0;
            return -1;
        },

        _balance(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            /* dashboard 有的版本没有 "balance"，只有 availablePoints；读不到余额
               会让「领取后余额差值」恒为 0，误判成没领到。 */
            const m = clean.match(/"(?:balance|availablePoints)"\s*:\s*"?(\d+)"?/i);
            return m ? (parseInt(m[1], 10) || 0) : 0;
        },

        /* 从 pointClaim 起点按花括号配平截出这一个对象。
           原来固定截 1200 字符：结构一变（字段增多/嵌套变深）金额就被切在窗口外，
           于是「明明有积分却读成 0」。 */
        _braceWindow(text, from) {
            const open = text.indexOf("{", from);
            const arr = text.indexOf("[", from);
            const start = (open < 0) ? arr : ((arr >= 0 && arr < open) ? arr : open);
            if (start < 0) return text.slice(from, from + 1200);
            const [o, c] = text[start] === "{" ? ["{", "}"] : ["[", "]"];
            let depth = 0;
            for (let i = start; i < text.length && i < start + 6000; i++) {
                if (text[i] === o) depth++;
                else if (text[i] === c) {
                    depth--;
                    if (depth === 0) return text.slice(start, i + 1);
                }
            }
            return text.slice(from, from + 1200);
        },

        _amount(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            const at = clean.search(/"pointClaim"\s*:/i);
            if (at < 0) return 0;
            const win = this._braceWindow(clean, at);
            /* 取该对象内所有「积分语义」字段的最大值：
               字段名在不同部署里变过（points / claimablePoints / availablePoints …），
               而且值可能被序列化成字符串（"35"），原来的 \d+ 无引号写法会直接漏掉。 */
            const re = /"(?:points|claimablePoints|claimable|availablePoints|pendingPoints|amount|totalPoints|value)"\s*:\s*"?(-?\d+)"?/gi;
            let best = 0;
            let m;
            while ((m = re.exec(win)) !== null) {
                const v = parseInt(m[1], 10);
                if (Number.isFinite(v) && v > best) best = v;
            }
            return best;
        },

        /* pointClaim 原文（压成一行），解析失败时写进日志：
           下次再报「金额 0」就能直接看出是字段名变了，还是整页压根没登录。 */
        _snippet(html) {
            const clean = String(html || "").replace(/\\"/g, '"').replace(/\s+/g, " ");
            const at = clean.search(/"pointClaim"\s*:/i);
            return at < 0 ? "" : clean.slice(at, at + 260);
        },

        _request(actionMap) {
            const id = (actionMap && actionMap.reportClaimAllPoints) || ActionMap.FALLBACK.reportClaimAllPoints;
            const dpl = (actionMap && actionMap.dpl) || RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            return {
                url: "https://rewards.bing.com/earn",
                headers: {
                    "content-type": "text/plain;charset=UTF-8",
                    "next-action": id,
                    "next-router-state-tree": Utils.routerStateTree("earn"),
                    "referer": "https://rewards.bing.com/earn",
                    "accept": "text/x-component",
                    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "origin": "https://rewards.bing.com",
                    ...(dpl ? { "x-deployment-id": dpl } : {}),
                    "user-agent": RewardsAuto.ua.pc
                },
                body: "[]"
            };
        },

        async _sendOnce(req) {
            return await API.postAction(
                { url: req.url, headers: req.headers, data: req.body },
                { savedKey: this.KEY_VARIANT }
            );
        },

        async _cdpPage() {
            return await API._anyRewardsPage();
        },

        async run({ name = "领取积分" } = {}) {
            const out = { claimed: 0, before: 0, after: 0, empty: false, variant: "", reason: "", uncertain: false, settled: false };
            let dashHtml = "";
            try {
                if (await CDP.available()) {
                    const page = await this._cdpPage();
                    if (page) {
                        if (!CDP._ws || CDP._ws.readyState !== 1) await CDP.connect(page.webSocketDebuggerUrl);
                        dashHtml = await CDP.fetchPageText("https://rewards.bing.com/dashboard") || "";
                    }
                }
            } catch (_) { dashHtml = ""; }
            if (!dashHtml) {
                try { dashHtml = await Utils.xhr({ url: "https://rewards.bing.com/dashboard" }); } catch (_) { dashHtml = ""; }
            }

            const pool = this.parse(dashHtml);
            out.before = this._balance(dashHtml);
            out.uncertain = !!pool.uncertain;
            if (!pool.known) {
                out.reason = "读不到待领池标记（页面可能是登录页或结构已变）";
                return out;
            }
            /* 关键判定：pool.has 只代表「解析器看见了金额」。uncertain（标记在、金额读 0）
               说明的是「读不到」，不是「没有」。原来这里直接 return，于是页面一改版
               就永远读 0、永远不领 —— 注释里自称「按无可领处理」正是那句话的来源。
               领取接口本身幂等，空池调用没有副作用，所以读不准时先打一发再回读判定。 */
            if (!pool.has && !pool.uncertain) {
                const kind = "待领池为空";
                const last = Number(GM_getValue(this.KEY_EMPTY_AT, 0)) || 0;
                if (Date.now() - last < this.EMPTY_TTL) {
                    out.empty = true;
                    out.reason = `${kind}（15 分钟内已确认过）`;
                    return out;
                }
                GM_setValue(this.KEY_EMPTY_AT, Date.now());
                out.empty = true;
                out.reason = kind;
                return out;
            }
            if (pool.uncertain) {
                Utils.log("🔍", "待领池标记存在但解析不出金额，改为直接发领取请求再回读判定"
                    + `（pointClaim 片段：${pool.snippet || "无"}）`);
            }
            GM_setValue(this.KEY_EMPTY_AT, 0);

            const actionMap = await ActionMap.ensure([dashHtml]);
            const req = this._request(actionMap);
            const accepted = await this._sendOnce(req);
            out.variant = accepted.ok ? accepted.variant : "";
            out.reason = accepted.ok
                ? ""
                : `三种通道都没受理（${(accepted.tried || []).join(" ")}）`;
            if (!accepted.ok) return out;

            await Utils.delay(1200);
            let afterHtml = "";
            try {
                if (accepted.variant === "page") {
                    const page = await this._cdpPage();
                    if (page) afterHtml = await CDP.fetchPageText("https://rewards.bing.com/earn") || "";
                }
                if (!afterHtml) afterHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
            } catch (_) { afterHtml = ""; }
            out.after = this._balance(afterHtml);
            out.claimed = (out.before > 0 && out.after > out.before) ? (out.after - out.before) : 0;

            /* 到账证据三选一（按可信度排序）：余额确实上涨 → 池子被清空 → 池子金额变小。
               原来只看余额差，读不到余额就一律判失败，领取明明生效了也报「未成功」。 */
            if (out.claimed <= 0) {
                await Utils.delay(2500);
                try {
                    let again = "";
                    if (accepted.variant === "page") {
                        const page = await this._cdpPage();
                        if (page) again = await CDP.fetchPageText("https://rewards.bing.com/dashboard") || "";
                    }
                    if (!again) again = await Utils.xhr({ url: "https://rewards.bing.com/dashboard" });
                    const later = this._balance(again);
                    if (out.before > 0 && later > out.before) {
                        out.after = later;
                        out.claimed = later - out.before;
                        out.reason = "";
                    }
                    const poolAgain = this.parse(again);
                    if (out.claimed <= 0 && poolAgain.known && !poolAgain.has) {
                        /* 池子清空是最硬的证据：待领标记没了，说明服务端收下了这次领取。
                           金额读不到（uncertain）时用 before 快照的金额，读不到就记 0 但判成功。 */
                        out.claimed = Math.max(pool.amount || 0, 0);
                        out.empty = true;
                        out.settled = true;
                        out.reason = out.claimed > 0
                            ? "已受理，待领池已清空（余额差读不到，按页面金额计）"
                            : "已受理，待领池已清空（金额与余额都读不到，按已领取处理）";
                    } else if (out.claimed <= 0 && poolAgain.known && poolAgain.has
                        && pool.amount > 0 && poolAgain.amount > 0 && poolAgain.amount < pool.amount) {
                        out.claimed = pool.amount - poolAgain.amount;
                        out.reason = "已受理，待领金额下降（余额差读不到）";
                    }
                } catch (_) {}
            }
            if (out.claimed <= 0 && !out.settled) {
                out.reason = pool.amount > 0
                    ? `已受理但余额未变（页面可领取 ${pool.amount}）`
                    : "已受理，但金额与余额都读不到，无法确认到账；下一轮再复核";
            }
            return out;
        }
    };

    const API = {

        async tokenRequest(params) {
            const body = Object.entries(params)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join("&");
            let res;
            try {
                res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: "https://login.live.com/oauth20_token.srf",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        data: body,
                        timeout: 20000,
                        onload: r => resolve(r),
                        onerror: e => reject(new Error((e && e.error) || "网络错误")),
                        ontimeout: () => reject(new Error("请求超时")),
                    });
                });
            } catch (e) {
                return { ok: false, status: 0, error: "network", description: e.message };
            }
            let json = null;
            try { json = JSON.parse(res.responseText || ""); } catch (_) {}
            if (json && json.access_token && json.refresh_token) {
                return { ok: true, status: res.status, json };
            }
            const error = (json && json.error) || `HTTP ${res.status}`;
            const description = (json && (json.error_description || json.error_codes))
                || String(res.responseText || "").slice(0, 200);
            return { ok: false, status: res.status, error: String(error), description: String(description) };
        },

        applyToken(data) {
            GM_setValue("Config.token", data.refresh_token);
            GM_setValue("Config.tokenTime", Utils.getTimestamp());
            GM_setValue("Config.accessToken", data.access_token);
            GM_setValue("Config.accessTokenTime", Date.now());
            RewardsAuto.state.token = data.access_token;
        },

        async refreshWithToken(refreshToken) {
            return await this.tokenRequest({
                client_id: CLIENT_ID,
                refresh_token: refreshToken,
                scope: TOKEN_SCOPE,
                grant_type: "REFRESH_TOKEN",
            });
        },

        async withTokenRetry(requestFn) {
            let token = RewardsAuto.state.token;
            if (!token) return null;
            try {
                return await requestFn(token);
            } catch (e) {
                if (e.message && e.message.includes("401")) {
                    Utils.log("🟡", "access_token 过期，使用 refresh_token 续期...");
                    RewardsAuto.state.token = null;
                    GM_setValue("Config.accessToken", "");
                    GM_setValue("Config.accessTokenTime", 0);
                    const refreshed = await this.renewToken();
                    if (!refreshed) return null;
                    return await requestFn(RewardsAuto.state.token);
                }
                throw e;
            }
        },

        async renewToken() {
            if (!GM_getValue("Tasks.sign", true) && !GM_getValue("Tasks.read", true)) return true;
            const cachedAt = GM_getValue("Config.accessTokenTime", 0);
            const cachedAT = GM_getValue("Config.accessToken", "");
            if (cachedAT && cachedAt && Date.now() - cachedAt < 45 * 60 * 1000) {
                RewardsAuto.state.token = cachedAT;
                return true;
            }
            if (!Utils.acquireLock("Config.tokenLock", 90 * 1000)) {
                Utils.log("⏳", "其它上下文正在刷新 Token，等待复用...");
                for (let i = 0; i < 10; i++) {
                    await Utils.delay(2000);
                    const at = GM_getValue("Config.accessToken", "");
                    const ts = GM_getValue("Config.accessTokenTime", 0);
                    if (at && ts > cachedAt) {
                        RewardsAuto.state.token = at;
                        Utils.log("🟢", "已复用其它上下文刷新的 Token");
                        return true;
                    }
                }
                Utils.log("🟡", "等待 Token 超时，本上下文自行刷新");
            }
            try {
                return await this.renewTokenInner();
            } finally {
                Utils.releaseLock("Config.tokenLock");
            }
        },

        async renewTokenInner() {
            let refreshToken = GM_getValue("Config.token", false);
            const tokenTime = Number(GM_getValue("Config.tokenTime", 0)) || 0;
            if (refreshToken && tokenTime > 0) {
                const days = (Utils.getTimestamp() - tokenTime) / (1000 * 60 * 60 * 24);
                if (days > 7) {
                    Utils.log("🟡", `Token 已 ${Math.floor(days)} 天，提前续期`);
                    refreshToken = false;
                }
            }
            if (refreshToken) {
                const r = await this.refreshWithToken(refreshToken);
                if (r.ok) { this.applyToken(r.json); return true; }
                Utils.log("🔴", `刷新 Token 失败：${r.error}${r.description ? " - " + r.description : ""}`);
                const latest = GM_getValue("Config.token", false);
                if (latest && latest !== refreshToken) {
                    Utils.log("🟡", "检测到其它上下文已更新 refresh_token，改用新值重试");
                    const r2 = await this.refreshWithToken(latest);
                    if (r2.ok) { this.applyToken(r2.json); return true; }
                }
                if (r.error !== "invalid_grant") {
                    return false;
                }
                Utils.log("🟡", "refresh_token 已失效，需要重新授权");
                GM_setValue("Config.token", false);
                GM_setValue("Config.tokenTime", 0);
            }

            const storedCode = Auth.stored();
            if (storedCode) {
                Utils.log("🟡", "发现已保存的授权码，尝试用它换取 Token...");
                if (await Auth.exchange(storedCode)) return true;
            }

            const got = await Auth.autoFetch(refreshToken ? "Token 刷新失败" : "检测到尚未授权");
            if (got.tokenReady) return true;
            if (got.code) {
                if (await Auth.exchange(got.code)) return true;
                Utils.log("🔴", "授权码换取 Token 失败，请重新「🔑 手动授权」", true);
            }
            return false;
        },

        async getRewardsInfo(maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                    const clean = html.replace(/\\"/g, '"');
                    let balance = 0;
                    let pcMax = 60, pcCur = 0, mobMax = 0, mobCur = 0;
                    let dailyOffer = 0;
                    let searchQuotaFound = false;
                    const pcIdx = clean.indexOf('"pointsCounters":{');
                    if (pcIdx !== -1) {
                        let start = pcIdx + 17, depth = 0, end = start;
                        for (let i = start; i < clean.length && i < start + 500; i++) {
                            if (clean[i] === '{') depth++;
                            if (clean[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
                        }
                        try {
                            const pts = JSON.parse(clean.substring(start, end));
                            pcMax = pts.pc?.max ?? 60;
                            pcCur = pts.pc?.progress ?? 0;
                            mobMax = pts.mobile?.max ?? 0;
                            mobCur = pts.mobile?.progress ?? 0;
                            dailyOffer = pts.dailyOffer ?? 0;
                            if (pts.totalPoints != null) balance = Number(pts.totalPoints);
                        } catch {}
                    }
                    if (balance === 0) {
                        const balMatch = clean.match(/"balance":(\d+)/) || clean.match(/"availablePoints":(\d+)/);
                        if (balMatch) balance = parseInt(balMatch[1]);
                    }
                    const todayDetails = [];
                    const acIdx = clean.indexOf('"activityCards":[');
                    if (acIdx !== -1) {
                        let acStart = acIdx + 16, acDepth = 0, acEnd = acStart;
                        for (let i = acStart; i < clean.length && i < acStart + 5000; i++) {
                            if (clean[i] === '[') acDepth++;
                            if (clean[i] === ']') { acDepth--; if (acDepth === 0) { acEnd = i + 1; break; } }
                        }
                        try {
                            const cardsStr = clean.substring(acStart, acEnd);
                            const cardRegex = /"title":"([^"]+)".*?"points":(\d+).*?"isCompleted":(true|false)/g;
                            let cardMatch;
                            while ((cardMatch = cardRegex.exec(cardsStr)) !== null) {
                                const title = cardMatch[1];
                                const points = parseInt(cardMatch[2]);
                                const isCompleted = cardMatch[3] === "true";
                                if (points > 0 && isCompleted) todayDetails.push({ title, points });
                            }
                        } catch {}
                    }
                    const toNum = value => parseInt(String(value).replace(/,/g, ''), 10) || 0;
                    const searchRowMatch = clean.match(/<p>\s*必应搜索\s*<\/p>\s*<\/div>\s*<div(?=[^>]*justify-self-end)[^>]*>([\s\S]{0,500}?)<\/div>/i);
                    const searchHtmlMatch = searchRowMatch
                        ? (searchRowMatch[1].match(/<span[^>]*>([\d,]+)<\/span>\s*<span[^>]*>\s*\/\s*([\d,]+)\s*<\/span>/i)
                            || searchRowMatch[1].match(/([\d,]+)\s*\/\s*([\d,]+)/))
                        : null;
                    if (searchHtmlMatch) {
                        pcCur = toNum(searchHtmlMatch[1]);
                        pcMax = toNum(searchHtmlMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                        Utils.log("🔍", `页面表格配额: PC ${pcCur}/${pcMax}`);
                    }
                    const searchRscMatch = clean.match(/"combinedSearch":\{[^}]*"progress":(\d+)[^}]*"max":(\d+)/);
                    if (searchRscMatch && !todayDetails.some(d => d.title === '必应搜索')) {
                        pcCur = toNum(searchRscMatch[1]);
                        pcMax = toNum(searchRscMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                    }
                    if (dailyOffer > 0) todayDetails.push({ title: '优惠', points: dailyOffer });
                    const otherActivityRegex = /<p>([^<]+)<\/p><\/div><div[^>]*>(\d+)<\/div>/g;
                    let otherMatch;
                    while ((otherMatch = otherActivityRegex.exec(clean)) !== null) {
                        const title = otherMatch[1];
                        const points = parseInt(otherMatch[2]);
                        if (points > 0 && !todayDetails.some(d => d.title === title)) {
                            todayDetails.push({ title, points });
                        }
                    }
                    const history = { month: 0, year: 0, lifetime: 0 };
                    const historyRscMatch = clean.match(/"pointsHistory":\{[^}]*"thisMonth":\{"earn":(\d+)[^}]*"thisYear":\{"earn":(\d+)[^}]*"lifetime":\{"earn":(\d+)/);
                    if (historyRscMatch) {
                        history.month = parseInt(historyRscMatch[1]);
                        history.year = parseInt(historyRscMatch[2]);
                        history.lifetime = parseInt(historyRscMatch[3]);
                    } else {
                        const monthHtmlMatch = clean.match(/本月.*?(\d[\d,]*)<\/div>/);
                        const yearHtmlMatch = clean.match(/今年.*?(\d[\d,]*)<\/div>/);
                        const lifetimeHtmlMatch = clean.match(/生存期.*?(\d[\d,]*)<\/div>/);
                        const monthJsonMatch = clean.match(/"monthlyPoints":(\d+)/);
                        const yearJsonMatch = clean.match(/"yearlyPoints":(\d+)/);
                        const lifetimeJsonMatch = clean.match(/"lifetimePoints":(\d+)/);
                        if (monthHtmlMatch) history.month = parseInt(monthHtmlMatch[1].replace(/,/g, ''));
                        else if (monthJsonMatch) history.month = parseInt(monthJsonMatch[1]);
                        if (yearHtmlMatch) history.year = parseInt(yearHtmlMatch[1].replace(/,/g, ''));
                        else if (yearJsonMatch) history.year = parseInt(yearJsonMatch[1]);
                        if (lifetimeHtmlMatch) history.lifetime = parseInt(lifetimeHtmlMatch[1].replace(/,/g, ''));
                        else if (lifetimeJsonMatch) history.lifetime = parseInt(lifetimeJsonMatch[1]);
                    }
                    if (!searchQuotaFound) {
                        const userInfoResult = await this.getSearchQuotaFromUserInfo();
                        if (userInfoResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 getuserinfo 兜底");
                            return userInfoResult;
                        }
                    }
                    if (!searchQuotaFound && RewardsAuto.state.token) {
                        const apiResult = await this.getSearchQuotaFromAPI();
                        if (apiResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 DAPI 兜底");
                            return apiResult;
                        }
                    }
                    let readProgress = RewardsAuto.state.readProgress ?? 0;
                    let readMax = RewardsAuto.state.readMax ?? 30;
                    const readInfo = await this.getReadProgress();
                    if (readInfo) {
                        readProgress = readInfo.progress;
                        readMax = readInfo.max;
                        RewardsAuto.state.readProgress = readProgress;
                        RewardsAuto.state.readMax = readMax;
                    } else {
                        Utils.log("🟡", "阅读进度查询失败，汇总里的阅读进度可能不准");
                    }
                    return { balance, pc: { progress: pcCur, max: pcMax }, mobile: { progress: mobCur, max: mobMax }, readProgress, readMax, dailyOffer, todayDetails, history };
                } catch (e) {
                    if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                    Utils.log("🔴", `仪表盘获取失败: ${e.message}`);
                    return false;
                }
            }
            return false;
        },

        async signApp() {
            const region = RewardsAuto.region();
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, {
                        country: region,
                        extra: { "x-rewards-partnerid": "startapp", "x-rewards-flights": "rwgobig" }
                    }),
                    data: JSON.stringify({
                        amount: 1, id: Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24),
                        type: 103, country: region, channel: RewardsAuto.appConfig.channel
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const response = data.response || {};
                    if (response.activity) return Number(response.activity.p || response.activity.points || 0);
                    if (response.isDuplicate || response.activity === null) return 0;
                    Utils.log("🟡", `App签入响应未确认: ${String(res).slice(0, 120)}`);
                }
            } catch (e) {
                Utils.log("🔴", `App签入失败: ${e.message}`);
            }
            return -1;
        },

        async getRequestVerificationToken(pageUrl = "https://rewards.bing.com/") {
            try {
                const html = await Utils.xhr({
                    url: pageUrl,
                    headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/" },
                });
                const tokenMatch = html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)
                    || html.match(/RequestVerificationToken.*?value=["']([^"']+)["']/i)
                    || html.match(/"verificationToken"\s*:\s*"([^"]+)"/i)
                    || html.match(/"__RequestVerificationToken"\s*:\s*"([^"]+)"/i);
                return tokenMatch ? tokenMatch[1].replace(/&amp;/g, "&") : "";
            } catch (e) {
                Utils.log("🟡", `活动Token获取失败: ${e.message}`);
                return "";
            }
        },

        async reportActivity(offerId, hash, referer = "https://rewards.bing.com/") {
            const token = await this.getRequestVerificationToken(referer);
            const params = new URLSearchParams({ id: offerId, hash: hash || "1", activityAmount: "1" });
            if (token) params.set("__RequestVerificationToken", token);
            const headers = {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "user-agent": RewardsAuto.ua.pc,
                "referer": referer,
                "origin": "https://rewards.bing.com",
                "x-requested-with": "XMLHttpRequest"
            };
            if (token) headers["RequestVerificationToken"] = token;
            return await Utils.xhr({
                method: "POST",
                url: "https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest",
                headers, data: params.toString()
            });
        },

        async reportDailyActivity(searchUrl) {
            const rawUrl = String(searchUrl || "").trim();
            if (!rawUrl) return false;

            if (!(await CDP.available())) {
                CDP.warn("端口 " + (Number(GM_getValue("Config.cdpPort", 9224)) || 9224) + " 上没有调试服务");
                return false;
            }
            return true;
        },

        _xhrFull(options) { return Utils.xhrFull(options); },

        async signPC() {
            try {
                const res = await this.reportActivity("Gamification_DailyCheckIn", "1", "https://rewards.bing.com/");
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return Number(data.points || data.response?.activity?.p || 0);
                }
            } catch (e) {
                if (e.message?.includes("401")) RewardsAuto.state.pc401 = true;
                Utils.log("🟡", `PC签入失败: ${e.message}`);
            }
            return -1;
        },

        async appActivity(type, offerid) {
            const region = RewardsAuto.region();
            const body = {
                amount: 1, country: region,
                id: Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24),
                type: type, channel: RewardsAuto.appConfig.channel
            };
            if (offerid) body.attributes = { offerid: offerid };
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, { country: region }),
                    data: JSON.stringify(body)
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return {
                        points: data.response?.activity?.p || 0,
                        isDuplicate: data.response?.isDuplicate || false,
                        balance: data.response?.balance || 0
                    };
                }
            } catch (e) {
                Utils.log("🔴", `App活动失败(${offerid}): ${e.message}`);
            }
            return null;
        },

        async getReadProgress() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const promos = JSON.parse(res).response?.promotions || [];
                    const readOfferId = RewardsAuto.appConfig.offerIds.readArticle;
                    const task = promos.find(x => x.attributes?.offerid === readOfferId);
                    if (task && task.attributes) {
                        const progress = parseInt(task.attributes.progress) || 0;
                        const max = parseInt(task.attributes.max) || 30;
                        Utils.log("📊", `阅读进度查询: ${progress}/${max} (offerid: ${readOfferId})`);
                        return { progress, max };
                    } else {
                        Utils.log("🟡", `阅读任务未找到 (offerid: ${readOfferId})`);
                    }
                } else {
                    Utils.log("🟡", `DAPI 响应不是 JSON: ${String(res).substring(0, 100)}`);
                }
            } catch (e) {
                Utils.log("🔴", `阅读进度获取失败: ${e.message}`);
            }
            return false;
        },

        edgeRegion() {
            return RewardsAuto.region("us");
        },

        _edgeHeaders(region, token) {
            return Utils.appHeaders(token, { kind: "edge", country: region || this.edgeRegion() });
        },

        async getEdgeProfile(region) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=edge&options=Profile,Promotions",
                    headers: this._edgeHeaders(region, token)
                }));
                if (!res || !Utils.isJSON(res)) {
                    Utils.log("🟡", `Edge 通道返回非 JSON：${String(res).substring(0, 80)}`);
                    return null;
                }
                const data = JSON.parse(res);
                if (data.code !== 0 || !data.response) {
                    Utils.log("🟡", `Edge 通道查询失败：code=${data.code}`);
                    return null;
                }
                return data.response;
            } catch (e) {
                Utils.log("🟡", `Edge 通道查询异常: ${e.message}`);
                return null;
            }
        },

        async reportEdgeActivity({ offerid, type, region }) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: this._edgeHeaders(region, token),
                    data: JSON.stringify({
                        amount: 1,
                        attributes: { offerid },
                        request_user_info: true,
                        type
                    })
                }));
                return (res && Utils.isJSON(res)) ? JSON.parse(res) : { code: -1, response: null };
            } catch (e) {
                Utils.log("🟡", `Edge 连签上报异常: ${e.message}`);
                return { code: -1, response: null };
            }
        },

        async activateEdgeBrowsing() {
            const earnUrl = "https://rewards.bing.com/earn";
            try {
                let html = "";
                try {
                    html = await Utils.xhr({
                        url: `${earnUrl}?section=streaks`,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": earnUrl }
                    });
                } catch (_) { }
                if (!html || !String(html).includes("edge_flight")) {
                    try {
                        html = await Utils.xhr({
                            url: earnUrl,
                            headers: { "user-agent": RewardsAuto.ua.pc, "referer": earnUrl }
                        });
                    } catch (_) { }
                }
                if (!html) return "failed";
                const clean = String(html).replace(/\\"/g, '"');
                const ids = [...clean.matchAll(/"activationOfferId":"(edge_flight[^"]*)"/g)].map(m => m[1]);
                if (ids.length === 0) {
                    return /"partner":"edge"/.test(clean) ? "failed" : "absent";
                }
                const offerId = ids.includes(EDGE.ACTIVATION_OFFER) ? EDGE.ACTIVATION_OFFER : ids[0];
                const idx = clean.indexOf(`"activationOfferId":"${offerId}"`);
                const win = clean.substring(Math.max(0, idx - 600), idx + 500);
                if (/"isEnabled":true/.test(win)) return "already";
                const hashMatch = win.match(/"activationHash":"([^"]+)"/);
                const typeMatch = win.match(/"activationActivityType":(\d+)/);
                const hash = hashMatch ? hashMatch[1] : "";
                const actType = typeMatch ? Number(typeMatch[1]) : 714;
                if (!hash || hash === "$undefined") return "failed";
                const nextAction = await this.getNextActionHash(html);
                await Utils.xhr({
                    method: "POST",
                    url: earnUrl,
                    headers: {
                        "content-type": "text/plain;charset=UTF-8",
                        "next-action": nextAction,
                        "referer": earnUrl,
                        "user-agent": RewardsAuto.ua.pc,
                    },
                    data: JSON.stringify([hash, actType, { offerid: offerId, isPromotional: "$undefined", timezoneOffset: "-480" }])
                });
                return "activated";
            } catch (e) {
                Utils.log("🟡", `Edge 连签激活失败: ${e.message}`);
                return "failed";
            }
        },

        _promoCache: null,

        async getAppPromotions(force = false) {
            const now = Date.now();
            if (!force && this._promoCache && now - this._promoCache.ts < 15000) return this._promoCache.list;
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: RewardsAuto.appConfig.dapiMeUrl,
                    headers: Utils.appHeaders(token, { country: GM_getValue("Config.lock", true) ? "cn" : "us" })
                }));
                if (Utils.isJSON(res)) {
                    const list = JSON.parse(res).response?.promotions || [];
                    this._promoCache = { list, ts: Date.now() };
                    return list;
                }
                Utils.log("🟡", `DAPI 任务列表非 JSON: ${String(res).slice(0, 100)}`);
            } catch (e) {
                Utils.log("🟡", `DAPI 任务列表获取失败: ${e.message}`);
            }
            return null;
        },

        async getPromotionMap(force = false) {
            const list = await this.getAppPromotions(force);
            if (!list) return null;
            const map = new Map();
            for (const p of list) {
                const a = p.attributes || {};
                const offerId = a.offerid || a.offerId || p.name;
                if (!offerId) continue;
                const max = parseInt(a.max ?? a.activitymax ?? 0, 10) || 0;
                const progress = parseInt(a.progress ?? a.activity_progress ?? a.activityprogress ?? 0, 10) || 0;
                map.set(offerId, {
                    offerId,
                    name: p.name || "",
                    max,
                    progress,
                    complete: String(a.complete).toLowerCase() === "true" || (max > 0 && progress >= max),
                    title: a.title || p.name || "",
                    destination: a.destination || "",
                    type: a.type || "",
                    state: a.State || "",
                    dailySetDate: a.daily_set_date || "",
                    isLocked: a.isLocked ?? a.islocked,
                    isUnlocked: a.isUnlocked ?? a.isunlocked,
                    unlockCriteria: a.unlockCriteria ?? a.unlockcriteria,
                    hidden: String(a.hidden).toLowerCase() === "true"
                });
            }
            return map;
        },

        async isOfferComplete(offerId, force = false) {
            if (!offerId) return null;
            const map = await this.getPromotionMap(force);
            if (!map) return null;
            const item = map.get(offerId);
            if (!item) return null;
            return item.complete;
        },

        _webCompleteCache: null,

        async isOfferCompleteWeb(offerId, force = false) {
            if (!offerId) return null;
            const now = Date.now();
            if (!force && this._webCompleteCache && now - this._webCompleteCache.ts < 20000) {
                const cached = this._webCompleteCache.map;
                if (cached.has(offerId)) return cached.get(offerId);
            }
            try {
                const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!html) return null;
                const map = new Map();
                for (const item of this._flightItems(this._flightText(html))) {
                    const id = item.offerId || item.offerid;
                    if (!id) continue;
                    const cur = Number(item.pointProgress || 0);
                    const max = Number(item.pointProgressMax || 0);
                    const done = item.isCompleted === true || item.complete === true || (max > 0 && cur >= max);
                    if (done || !map.has(id)) map.set(id, !!done);
                }
                this._webCompleteCache = { ts: now, map };
                return map.has(offerId) ? map.get(offerId) : null;
            } catch (_) {
                return null;
            }
        },

        async isOfferCompleteAny(offerId, force = false) {
            const viaApp = await this.isOfferComplete(offerId, force);
            if (viaApp !== null) return viaApp;
            return await this.isOfferCompleteWeb(offerId, false);
        },

        _unofferableKey(offerId) {
            return `Config.unofferable.${Utils.getTodayNum()}.${offerId}`;
        },

        _markUnoffered(offerId) {
            if (!offerId) return;
            try { GM_setValue(this._unofferableKey(offerId), true); } catch (_) {}
        },

        isUnoffered(offerId) {
            if (!offerId) return false;
            try { return GM_getValue(this._unofferableKey(offerId), false) === true; } catch (_) { return false; }
        },

        _manualKey(offerId) {
            return `Config.manualCard.${Utils.getTodayNum()}.${offerId}`;
        },

        _markManualCard(offerId, name) {
            if (!offerId) return;
            try {
                GM_setValue(this._manualKey(offerId), true);
                RewardsAuto.state.manualCards = RewardsAuto.state.manualCards || [];
                if (!RewardsAuto.state.manualCards.some(x => x.offerId === offerId)) {
                    RewardsAuto.state.manualCards.push({ offerId, name: name || offerId });
                }
            } catch (_) {}
        },

        isManualCard(offerId) {
            if (!offerId) return false;
            try { return GM_getValue(this._manualKey(offerId), false) === true; } catch (_) { return false; }
        },

        async discoverDailySetCards(preMap = null) {
            const todayStr = Utils.getTodayStr();
            const todayNum = String(Utils.getTodayNum());
            const map = preMap || await this.getPromotionMap(true);
            if (!map) return [];
            const cards = [];
            let lockedCount = 0, lockedPoints = 0;
            for (const item of map.values()) {
                const isDailySet = item.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix)
                    || (item.type === "urlreward" && item.dailySetDate === todayStr);
                if (!isDailySet) continue;
                const scheduledToday = item.dailySetDate === todayStr || item.offerId.includes(todayNum);
                if (!scheduledToday) continue;
                if (item.complete) continue;
                if (item.hidden) continue;
                const lock = CardLock.probe(item);
                if (lock.locked) {
                    lockedCount++;
                    lockedPoints += item.max || 0;
                    try {
                        const t = item.title || item.offerId;
                        if (!RewardsAuto.state.lockedTitles.includes(t)) RewardsAuto.state.lockedTitles.push(t);
                    } catch (_) {}
                    Utils.log("🔒", `锁卡跳过（需在必应 App 完成）：${item.title || item.offerId} +${item.max || 0}p [${lock.reason}]`);
                    continue;
                }
                cards.push({
                    title: item.title || item.offerId,
                    points: item.max || 10,
                    offerId: item.offerId,
                    hash: "",
                    kind: "daily",
                    url: "https://rewards.bing.com/earn",
                    destination: item.destination || "",
                    source: "dapi",
                    ...(lock.appOnly ? { appOnly: true } : {}),
                    ...(lock.levelGated ? { levelGated: true } : {})
                });
            }
            if (lockedCount > 0) {
                RewardsAuto.state.lockedCount = Math.max(RewardsAuto.state.lockedCount, lockedCount);
                RewardsAuto.state.lockedPoints = Math.max(RewardsAuto.state.lockedPoints, lockedPoints);
            }
            return cards;
        },

        async getRewardsToken() {
            try {
                const html = await Utils.xhr({
                    url: "https://rewards.bing.com/",
                    headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/" }
                });
                if (html) {
                    const match = html.replace(/\s/g, "").match(/RequestVerificationToken(.*?)value="(.*?)"/);
                    if (match) return match[2];
                }
            } catch (e) {
                Utils.log("🟡", `RequestVerificationToken 获取失败: ${e.message}`);
            }
            return false;
        },

        async getSearchQuotaFromUserInfo(light = false) {
            try {
                const res = await Utils.xhr({
                    url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                    headers: {
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": "https://rewards.bing.com/",
                        "x-requested-with": "XMLHttpRequest"
                    },
                });
                if (!Utils.isJSON(res)) return false;
                const data = JSON.parse(res);
                const dashboard = data.dashboard || data;
                const userStatus = dashboard.userStatus || {};
                const counters = userStatus.counters || {};
                const sumCounter = items => {
                    if (!Array.isArray(items)) return { progress: 0, max: 0 };
                    return items.reduce((acc, item) => {
                        acc.progress += Number(item.pointProgress || 0);
                        acc.max += Number(item.pointProgressMax || item.pointMax || 0);
                        return acc;
                    }, { progress: 0, max: 0 });
                };
                const pc = sumCounter(counters.pcSearch);
                if (pc.max === 0) return false;
                const balance = Number(userStatus.availablePoints || dashboard.availablePoints || 0);
                let readProgress = RewardsAuto.state.readProgress ?? 0;
                let readMax = RewardsAuto.state.readMax ?? 30;

                if (!light) {
                    try {
                        const readInfo = await API.getReadProgress();
                        if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                    } catch (e) {}
                    Utils.log("📊", `getuserinfo查询: PC ${pc.progress}/${pc.max}, 阅读 ${readProgress}/${readMax}, 积分 ${balance}`);
                }
                return {
                    balance, pc, readProgress, readMax, dailyOffer: 0,
                    todayDetails: pc.max > 0 ? [{ title: "必应搜索", points: pc.progress, max: pc.max }] : [],
                    history: null
                };
            } catch (e) {
                if (GM_getValue("Config.debugDAPI", false)) {
                    Utils.log("🟡", `getuserinfo 查询失败: ${e.message}`);
                }
                return false;
            }
        },

        async getSearchQuotaFromAPI(light = false) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const response = data.response || {};
                    const promos = response.promotions || [];
                    const counters = response.counters || response.userStatus?.counters;
                    if (!counters) return false;
                    let pcCur = 0, pcMax = 0;
                    if (counters?.pcSearch && counters.pcSearch.length > 0) {
                        pcCur = counters.pcSearch[0].pointProgress || 0;
                        pcMax = counters.pcSearch[0].pointProgressMax || 0;
                    }
                    if (pcMax === 0) return false;
                    const balance = response.balance || response.userStatus?.availablePoints || 0;
                    let readProgress = RewardsAuto.state.readProgress ?? 0;
                    let readMax = RewardsAuto.state.readMax ?? 30;
                    if (!light) {
                        try {
                            const readInfo = await API.getReadProgress();
                            if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                        } catch (e) {}
                        Utils.log("📊", `DAPI查询: PC ${pcCur}/${pcMax}, 阅读 ${readProgress}/${readMax}, 积分 ${balance}`);
                    }
                    return { balance, pc: { progress: pcCur, max: pcMax }, readProgress, readMax, dailyOffer: 0, todayDetails: [], history: null };
                }
            } catch (e) {
                if (!light) Utils.log("🟡", `DAPI查询失败: ${e.message}`);
            }
            return false;
        },

        async getPcQuota() {
            try {
                const ui = await this.getSearchQuotaFromUserInfo(true);
                if (ui && ui.pc && ui.pc.max > 0) return { progress: ui.pc.progress, max: ui.pc.max };
            } catch (_) {}
            try {
                if (RewardsAuto.state.token) {
                    const dapi = await this.getSearchQuotaFromAPI(true);
                    if (dapi && dapi.pc && dapi.pc.max > 0) return { progress: dapi.pc.progress, max: dapi.pc.max };
                }
            } catch (_) {}
            return null;
        },

        async getBalance() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=105",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return data.response?.balance || 0;
                }
            } catch (e) {}
            try {
                const res2 = await Utils.xhr({
                    url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                    headers: {
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": "https://rewards.bing.com/",
                        "x-requested-with": "XMLHttpRequest"
                    },
                });
                if (Utils.isJSON(res2)) {
                    const data2 = JSON.parse(res2);
                    return data2.dashboard?.availablePoints || data2.balance || 0;
                }
            } catch (e) {}
            return 0;
        },

        async doRead() {
            const region = RewardsAuto.region();
            try {
                const id = Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24);
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, { country: region }),
                    data: JSON.stringify({
                        amount: 1, country: region, id: id, type: 101,
                        attributes: { offerid: RewardsAuto.appConfig.offerIds.readArticle }
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return { points: data.response?.activity?.p || 0, isDuplicate: data.response?.isDuplicate || false };
                }
                return null;
            } catch (e) {
                Utils.log("🔴", `阅读请求失败: ${e.message}`);
                return false;
            }
        },

        _flightText(html) {
            const chunks = [];
            const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
            let m;
            while ((m = pushRegex.exec(html)) !== null) {
                try { chunks.push(JSON.parse(`"${m[1]}"`)); } catch (_) {}
            }
            return chunks.length > 0 ? chunks.join("") : String(html).replace(/\\"/g, '"');
        },

        _flightItems(text, idPattern = "[^\"]+") {
            const items = [];
            const re = new RegExp('\\{[^{}]*?"offerId"\\s*:\\s*"' + idPattern + '"[^{}]*?\\}', "g");
            let m;
            while ((m = re.exec(text)) !== null) {
                try {
                    items.push(JSON.parse(m[0].replace(/:\$undefined/g, ":null").replace(/:\$D[^\",}]+/g, ":null")));
                } catch (_) {}
            }
            return items;
        },

        async discoverCards() {
            const cards = [];
            const seenCardKeys = new Set();
            let earnHtml = "";
            const lockStat = { count: 0, points: 0, app: 0 };

            const classify = (item, points = 0) => {
                const lock = CardLock.probe(item);
                if (lock.locked) {
                    lockStat.count++;
                    lockStat.points += Number(points) || 0;
                    Utils.log("🔒", `跳过锁卡：${item.title || item.name || item.offerId || "活动卡片"} +${points}p [${lock.reason}]`);
                    return { skip: true, appOnly: false, levelGated: false };
                }
                if (lock.appOnly) {
                    lockStat.app++;
                    Utils.log("🔓", `带锁徽标的 App 卡，改用 Rewards 应用通道：${item.title || item.name || item.offerId} +${points}p [${lock.reason}]`);
                    return { skip: false, appOnly: true, levelGated: !!lock.levelGated };
                }
                if (lock.levelGated) {
                    Utils.log("🔓", `等级门槛卡（已解锁），领取时先走应用内搜索上报：${item.title || item.name || item.offerId} +${points}p [${lock.reason || "已解锁"}]`);
                    return { skip: false, appOnly: false, levelGated: true };
                }
                return { skip: false, appOnly: false, levelGated: false };
            };
            try {
                const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!html) { Utils.log("🔴", "earn 页面返回空"); return cards; }
                earnHtml = html;
                const clean = html.replace(/\\"/g, '"');

                const dplMatch = clean.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i);
                if (dplMatch) {
                    RewardsAuto._dpl = dplMatch[1];
                    GM_setValue("Config.dpl", dplMatch[1]);
                }

                const pushCard = (card) => {
                    if (!card || !card.offerId || !card.hash || card.points <= 0) return;
                    const key = `${card.offerId}:${card.hash}`;
                    if (seenCardKeys.has(key)) return;
                    seenCardKeys.add(key);
                    cards.push(card);
                };

                const pushWithLock = (item, card, points) => {
                    if (!card) return false;
                    const verdict = classify(item, points);
                    if (verdict.skip) return false;
                    const marked = {
                        ...card,
                        ...(verdict.appOnly ? { appOnly: true } : {}),
                        ...(verdict.levelGated ? { levelGated: true } : {})
                    };
                    pushCard(marked);
                    return true;
                };

                const inferKind = (offerId, title = "") => {
                    const text = `${offerId} ${title}`.toLowerCase();
                    if (/quiz|trivia|question|测验|答案/.test(text)) return "quiz";
                    if (/puzzle|拼图/.test(text)) return "puzzle";
                    if (/image|图片|设计/.test(text)) return "image_creator";
                    if (/explore|search|浏览|探索/.test(text)) return "explore_search";
                    if (/dailyset|daily|每日/.test(text)) return "daily";
                    if (/streak|打卡|连续/.test(text)) return "streak";
                    return "open_only";
                };

                try {
                    const userInfo = await Utils.xhr({
                        url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/", "x-requested-with": "XMLHttpRequest" },
                    });
                    if (Utils.isJSON(userInfo)) {
                        const data = JSON.parse(userInfo);
                        const dashboard = data.dashboard || data;
                        const now = new Date();
                        const todayKeys = new Set([
                            `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`,
                            `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`
                        ]);
                        const normalizeDashboardCard = (item, kind) => {
                            if (!item) return null;
                            const offerId = item.offerId || item.offerid || item.id || item.name;
                            const hash = item.hash || item.activityId;
                            const title = item.title || item.name || item.description || "";
                            const points = Number(item.points ?? item.pointProgressMax ?? item.max ?? 0);
                            const doneMax = Number(item.pointProgressMax || 0);
                            const doneCur = Number(item.pointProgress || 0);
                            const isCompleted = item.isCompleted || item.complete || (doneMax > 0 && doneCur >= doneMax);
                            if (!offerId || !hash || points <= 0 || isCompleted) return null;
                            const skip = RewardsAuto.skipPatterns.some(p => title.toLowerCase().includes(p.toLowerCase()) || offerId.toLowerCase().includes(p.toLowerCase()));
                            if (skip) return null;
                            return { title, points, offerId, hash, kind: kind || inferKind(offerId, title), source: "getuserinfo", url: "https://rewards.bing.com/dashboard", destination: item.destinationUrl || "" };
                        };

                        const dailySetPromotions = dashboard.dailySetPromotions || {};
                        for (const dateKey of todayKeys) {
                            const dailyItems = dailySetPromotions[dateKey];
                            if (Array.isArray(dailyItems)) {
                                for (const item of dailyItems) {
                                    const card = normalizeDashboardCard(item, "daily");
                                    if (card) pushWithLock(item, card, card.points);
                                }
                            }
                        }
                        const morePromotions = dashboard.morePromotions || dashboard.promotions || [];
                        if (Array.isArray(morePromotions)) {
                            for (const item of morePromotions) {
                                const card = normalizeDashboardCard(item);
                                if (card) pushWithLock(item, card, card.points);
                            }
                        }
                    }
                } catch (e) {

                    const noCookie = /\b(401|403)\b/.test(String(e.message));
                    Utils.log("🟡", `${noCookie ? "getuserinfo 无会话（不影响 Server Action 交卷）" : "getuserinfo 活动解析跳过"}: ${e.message}`);
                }

                try {
                    for (const item of this._flightItems(this._flightText(html))) {
                        if (!item.offerId || !item.hash) continue;
                        if (item.isCompleted === true || item.hidden === true) continue;
                        const points = Number(item.points || 0);
                        if (points <= 0 && !item.offerId.includes("DailySet")) continue;
                        pushWithLock(item, {
                            title: item.title || item.name || item.offerId,
                            points: points || 10,
                            offerId: item.offerId,
                            hash: item.hash,
                            kind: inferKind(item.offerId, item.title || ""),
                            destination: item.destination || item.destinationUrl || "",
                            url: "https://rewards.bing.com/earn"
                        }, points);
                    }
                } catch (e) {
                    Utils.log("🟡", `Flight 数据解析异常: ${e.message}`);
                }

                if (cards.length === 0) {
                    const dataRegex = /data-offer-id="([^"]+)"[^>]*data-hash="([^"]+)"/gi;
                    let m;
                    while ((m = dataRegex.exec(html)) !== null) {
                        const offerId = m[1];
                        const hash = m[2];
                        const skip = RewardsAuto.skipPatterns.some(p => offerId.toLowerCase().includes(p.toLowerCase()));
                        if (skip) continue;
                        pushCard({ title: "日常任务", points: 10, offerId, hash, kind: "daily" });
                    }
                }

                if (cards.length > 0) {
                    Utils.log("🧩", `成功获取 ${cards.length} 个可执行卡片`);
                } else {
                    Utils.log("🟡", "未发现可执行的活动卡片（可能均已手动完成或被过滤）");
                }
            } catch (e) {
                Utils.log("🔴", `卡片解析失败: ${e.message}`);
            }

            if (lockStat.count > 0 || lockStat.app > 0) {
                RewardsAuto.state.lockedCount = Math.max(RewardsAuto.state.lockedCount, lockStat.count);
                RewardsAuto.state.lockedPoints = Math.max(RewardsAuto.state.lockedPoints, lockStat.points);
                if (lockStat.count > 0) {
                    Utils.log("🔒", `锁卡汇总：${lockStat.count} 张（${lockStat.points} 分）今天做不了，已跳过`);
                }
                if (lockStat.app > 0) {
                    Utils.log("🔓", `App 卡汇总：${lockStat.app} 张带锁徽标，已改走 Rewards 应用通道交卷`);
                }
            }

            return cards;
        },

        async getNextActionHash(html) {
            let cached = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            try {
                const fromTable = ActionMap.get("reportActivity");
                if (fromTable && fromTable !== cached) {
                    cached = fromTable;
                    RewardsAuto._nextAction = cached;
                    GM_setValue("Config.nextAction", cached);
                }
            } catch (_) {}
            const lastScan = Number(GM_getValue("Config.nextActionScanAt", 0)) || 0;
            const cooled = Date.now() - lastScan < 10 * 60 * 1000;
            if (html && html.includes("_next/static/chunks/") && !cooled) {
                const scriptSrcs = [...new Set(html.match(/\/_next\/static\/chunks\/[a-z0-9_\-]+\.js\?dpl=[^"]+/g) || [])]
                    .slice(0, NEXT_ACTION_SCAN_MAX);
                const deadline = Date.now() + NEXT_ACTION_SCAN_BUDGET;
                let scanned = 0;
                for (const src of scriptSrcs) {
                    if (Date.now() > deadline) break;
                    scanned++;
                    try {
                        const chunkText = await Utils.xhr({ url: "https://rewards.bing.com" + src, timeout: 8000 });
                        const match = chunkText.match(/createServerReference\)\("([a-f0-9]{40,44})"[^)]*"reportActivity"\)/);
                        if (match && match[1]) {
                            cached = match[1];
                            RewardsAuto._nextAction = cached;
                            GM_setValue("Config.nextAction", cached);
                            return cached;
                        }
                    } catch (_) {}
                }
                GM_setValue("Config.nextActionScanAt", Date.now());
                Utils.log("🟡", `Server Action ID 探测未命中（扫了 ${scanned} 个 chunk），10 分钟内不再探测，先用现有 ID 继续`);
            }
            return cached;
        },

        _isAppSearchCard(card) {
            const dest = String((card && card.destination) || "");
            if (!dest) return false;
            const q = dest.includes("?") ? dest.slice(dest.indexOf("?") + 1) : "";
            if (!q) return false;
            const isBingSearch = /bing\.com\/search/i.test(dest);
            const hasSign = /(^|&)(form=ML2W4J|form=ML2Y2H|PUBL=RewardsDO)/i.test(q);
            return isBingSearch && hasSign;
        },

        async reportAppSearchForCard(href) {
            const raw = String(href || "").trim();
            if (!/bing\.com\/search/i.test(raw)) return false;
            const { origin, pathname, search } = (() => {
                try { const u = new URL(raw); return { origin: u.origin, pathname: u.pathname, search: u.search }; }
                catch (_) { return {}; }
            })();
            if (!origin) return false;
            const query = origin + pathname + search;
            const params = search.replace(/^\?/, "");
            const today = new Date();
            const p2 = n => String(n).padStart(2, "0");
            const baseHeaders = {
                "user-agent": RewardsAuto.desktopAppHeaders["user-agent"],
                "cookie": `_Rwho=u=d&ts=${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`,
            };

            let ig = "";
            try {
                const serp = await Utils.xhr({ url: query, headers: baseHeaders });
                const flat = String(serp || "").replace(/\s/g, "");
                const m = flat.match(/,IG:"([^"]+)"/);
                if (m) ig = m[1];
            } catch (_) {}
            if (!ig) ig = Utils.getRandomUUID();
            const reportHeaders = { ...baseHeaders, "referer": query };

            try {
                await Utils.xhr({
                    method: "POST",
                    url: `${origin}/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=${ig}&ajaxreq=1`,
                    headers: { ...reportHeaders, "content-type": "application/x-www-form-urlencoded" },
                    data: "wb=1%3bi%3d1%3bv%3d1"
                });
            } catch (_) {}

            try {
                await Utils.xhr({
                    method: "POST",
                    url: `${origin}/rewardsapp/reportActivity?IG=${ig}&IID=SERP.5047&${params}&ajaxreq=1`,
                    headers: { ...reportHeaders, "content-type": "application/x-www-form-urlencoded" },
                    data: `url=${encodeURIComponent(query)}&V=web`
                });
            } catch (_) {}
            return true;
        },

        async _claimLevelGatedViaAppSearch(card, { diag = [], name = "" } = {}) {
            const label = name || card.title || card.offerId;
            const offerId = card.offerId;
            const href = String(card.destination || "");
            if (!href || !/bing\.com\/search/i.test(href)) {
                diag.push("lev2search(无搜索href)");
                return false;
            }
            let searched = false;
            try {
                searched = await this.reportAppSearchForCard(href);
                diag.push(searched ? "lev2search(已上报)" : "lev2search(上报失败)");
            } catch (e) {
                diag.push(`lev2search(${e.message})`);
            }
            if (!searched) return false;
            Utils.log("🔎", `等级门槛卡已按应用内搜索签名上报：${label}`);

            await Utils.randomDelay(2000, 4000);
            if (card.hash) {
                try {
                    const accepted = await this.claimCardWeb(card);
                    diag.push(accepted ? "lev2search(已交卷)" : "lev2search(交卷未受理)");
                } catch (e) {
                    diag.push(`lev2search(交卷 ${e.message})`);
                }
            } else {
                diag.push("lev2search(无hash跳过交卷)");
            }

            const deadline = Date.now() + 25 * 1000;
            while (Date.now() < deadline) {
                const st = await this.isOfferCompleteAny(offerId, true);
                if (st === true) {
                    Utils.log("🟢", `等级门槛卡完成（应用内搜索通道）：${label}`);
                    return true;
                }
                await Utils.delay(5000);
            }
            diag.push("lev2search(未标记完成)");
            Utils.log("🟡", `等级门槛卡：应用内搜索通道未记账，改走 CDP 通道：${label}`);
            return false;
        },

        async claimCard(card, opts = {}) {
            const offerId = card.offerId;
            const name = card.title || offerId;
            const attempts = opts.attempts || 3;
            const backoffs = opts.backoffs || [[8000, 12000], [20000, 30000], [45000, 60000]];
            const diag = [];

            if (this.isManualCard(offerId)) {
                Utils.log("🖐️", `已自动上报搜索，完成状态需手动点击确认：${name}`);
                return false;
            }

            if (this.isUnoffered(offerId)) {
                Utils.log("🔒", `今日已确认做不了，跳过：${name}`);
                return false;
            }

            if (await this.isOfferCompleteAny(offerId, true) === true) {
                Utils.log("✅", `服务端已确认完成：${name}`);
                return true;
            }

            for (let i = 0; i < attempts; i++) {
                if (i > 0) {
                    const [lo, hi] = backoffs[Math.min(i - 1, backoffs.length - 1)];
                    Utils.log("⏳", `等待 ${Math.round(lo / 1000)}~${Math.round(hi / 1000)} 秒后重试（第 ${i + 1}/${attempts} 次）：${name}`);
                    await Utils.randomDelay(lo, hi);
                }
                const ok = await this._claimCardOnceWithTimeout(card, { diag, name, attempt: i + 1 });
                if (ok) return true;
            }

            Utils.log("🟡", `卡片领取未确认（已重试 ${attempts} 次）：${name} [${diag.join(" ")}]`);
            return false;
        },

        async _claimCardOnceWithTimeout(card, { diag = [], name = "", attempt = 1 } = {}) {
            const label = name || card.title || card.offerId;
            let timer = null;
            const timeout = new Promise(resolve => {
                timer = setTimeout(() => {
                    diag.push(`timeout(${CLAIM_ONCE_TIMEOUT / 1000}s)`);
                    Utils.log("🔴", `单卡处理超时（第 ${attempt} 次尝试，${CLAIM_ONCE_TIMEOUT / 1000} 秒）：${label}，放弃这次尝试`);
                    resolve(false);
                }, CLAIM_ONCE_TIMEOUT);
            });
            try {
                return await Promise.race([this._claimCardOnce(card, { diag }), timeout]);
            } finally {
                if (timer) clearTimeout(timer);
            }
        },

        async _claimCardOnce(card, { skipWeb = false, diag = [] } = {}) {
            const offerId = card.offerId;
            const name = card.title || offerId;

            if (await this.isOfferCompleteAny(offerId, false) === true) {
                Utils.log("✅", `服务端已确认完成：${name}`);
                return true;
            }

            if (card.destination && /^https?:/i.test(card.destination)) {
                try {
                    await Utils.xhr({
                        url: card.destination,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/earn" }
                    });
                    diag.push("visit(ok)");
                } catch (e) {
                    diag.push(`visit(${e.message})`);
                }
                await Utils.randomDelay(1500, 3000);
            }

            if (!skipWeb && card.levelGated && !card.appOnly) {
                const viaSearch = await this._claimLevelGatedViaAppSearch(card, { diag, name });
                if (viaSearch) return true;
            }

            if (!skipWeb && this._isAppSearchCard(card)) {

                const searchOk = await this.reportDailyActivity(card.destination);
                diag.push(searchOk ? "search(CDP已点击)" : "search(未处理)");
                if (searchOk) {
                    const deadline = Date.now() + 25 * 1000;
                    while (Date.now() < deadline) {
                        if (await this.isOfferCompleteAny(offerId, true) === true) {
                            Utils.log("🟢", "应用搜索领取成功：" + name);
                            return true;
                        }
                        await Utils.delay(5000);
                    }
                    diag.push("search(已点击未标记完成)");
                }
                this._markManualCard(offerId, name);
            } else if (!skipWeb && !card.hash) {
                diag.push("web(无hash)");
            } else if (!skipWeb && card.appOnly) {
                await this._claimViaAppChannel(card, { diag, name });
                if (await this.isOfferCompleteAny(offerId, true) === true) return true;
            } else if (!skipWeb && RewardsAuto.state.webNoAuth) {
                diag.push("web(未登录跳过)");
            } else if (!skipWeb && RewardsAuto.state.webFailStreak >= WEB_FAIL_LIMIT) {
                diag.push("web(本轮已熔断)");
            } else if (!skipWeb) {
                let webAccepted = false;
                let webErr = null;
                try {
                    webAccepted = await this.claimCardWeb(card);
                } catch (e) {
                    webErr = e;
                    diag.push(`web(${e.message})`);
                    if (/\b(401|403)\b/.test(String(e.message)) && !RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（${e.message}），后续卡片改用 DAPI 通道`);
                    }
                }
                if (webAccepted) {
                    RewardsAuto.state.webFailStreak = 0;
                    await Utils.randomDelay(2000, 4000);
                    if (await this.isOfferCompleteAny(offerId, true) === true) {
                        Utils.log("🟢", `网页通道领取成功：${name}`);
                        return true;
                    }
                    diag.push("web(已发出但服务端未生效)");
                } else {
                    diag.push("web(请求未被接受)");
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webFailStreak += 1;
                        Utils.log("🟠", `网页通道未成功（${name}）：${webErr ? webErr.message : "请求未被接受"}`
                            + `（连续 ${RewardsAuto.state.webFailStreak}/${WEB_FAIL_LIMIT} 次，超限后本轮改用 DAPI）`);
                    }
                }
            }

            const appRes = await this.appActivity(101, offerId);
            if (appRes) {
                diag.push(`dapi(p=${appRes.points}${appRes.isDuplicate ? ",dup" : ""})`);
                if (appRes.points > 0) {
                    Utils.log("🟢", `DAPI 领取成功 +${appRes.points} 分：${name}`);
                    return true;
                }
            } else {
                diag.push("dapi(请求失败)");
            }
            await Utils.randomDelay(1500, 3000);
            if (await this.isOfferCompleteAny(offerId, true) === true) {
                Utils.log("🟢", `DAPI 上报已生效：${name}`);
                return true;
            }
            return false;
        },

        PAGE_BOX: {
            req: "Config.pageReq",
            res: "Config.pageRes",
            alive: "Config.pageAlive"
        },

        async pageServeOnce() {
            const req = GM_getValue(this.PAGE_BOX.req, null);
            if (!req || !req.id || req.done) return false;
            GM_setValue(this.PAGE_BOX.req, { id: req.id, url: req.url, headers: req.headers, body: req.body, at: req.at, done: true });
            const out = { id: req.id, at: Date.now(), status: 0, text: "", error: "" };
            try {
                const r = await fetch(req.url, {
                    method: "POST",
                    headers: req.headers || {},
                    body: req.body,
                    credentials: "include",
                    redirect: "follow"
                });
                out.status = r.status;
                out.text = String(await r.text()).slice(0, 4000);
            } catch (e) {
                out.error = String((e && e.message) || e);
            }
            GM_setValue(this.PAGE_BOX.res, out);
            return true;
        },

        startPageServer() {
            if (typeof GM_getValue !== "function") return;
            if (this._pageServerStarted) return;
            if (GM_getValue("Config.pageServerOff", false)) return;
            this._pageServerStarted = true;
            const tick = async () => {
                try {
                    if (GM_getValue("Config.pageServerOff", false)) { this._pageServerStarted = false; return; }
                    GM_setValue(this.PAGE_BOX.alive, Date.now());
                    await this.pageServeOnce();
                } catch (_) {}
                this._pageServerTimer = setTimeout(tick, 1500);
                if (this._pageServerTimer && typeof this._pageServerTimer.unref === "function") {
                    this._pageServerTimer.unref();
                }
            };
            this._pageServerTimer = setTimeout(tick, 600);
            if (this._pageServerTimer && typeof this._pageServerTimer.unref === "function") {
                this._pageServerTimer.unref();
            }
        },

        _pageChannelAlive() {
            const at = Number(GM_getValue(this.PAGE_BOX.alive, 0)) || 0;
            return at > 0 && (Date.now() - at) < 40 * 1000;
        },

        async _ensurePageChannel() {

            if (!GM_getValue("Config.allowOpenTab", false)) return null;

            const openedAt = Number(GM_getValue("Config.pageOpenedAt", 0)) || 0;
            const reallyAlive = this._pageChannelAlive();
            if (!reallyAlive && openedAt && (Date.now() - openedAt) < 10 * 60 * 1000) {
                for (let i = 0; i < 12; i++) {
                    await Utils.delay(500);
                    if (this._pageChannelAlive()) return null;
                }
                return null;
            }
            if (this._openingPage) {
                for (let i = 0; i < 40; i++) {
                    await Utils.delay(500);
                    if (this._pageChannelAlive()) return null;
                }
                return null;
            }
            this._openingPage = true;
            GM_setValue("Config.pageOpenedAt", Date.now());
            try {
                Utils.log("🖥️", "需要借 rewards 页面代发请求，正在打开一个临时页面…");

                let opened = false;
                const url = "https://rewards.bing.com/earn?mpq=" + Date.now();
                for (const opts of [
                    { active: false, insert: true, setParent: true },
                    { active: false },
                    undefined
                ]) {
                    try {
                        if (opts) GM_openInTab(url, opts);
                        else GM_openInTab(url);
                        opened = true;
                        break;
                    } catch (e) {
                    }
                }
                if (!opened) {
                    Utils.log("🔴", "打开代发页面失败（浏览器拒绝编辑标签页），只能退回后台直发");
                    return null;
                }
                for (let i = 0; i < 90; i++) {
                    await Utils.delay(500);
                    if (this._pageChannelAlive()) {
                        Utils.log("✅", "代发页面已就绪");
                        return null;
                    }
                    if (i === 19) Utils.log("🖥️", "代发页面还在加载（已等 10 秒）…");
                    if (i === 49) Utils.log("🖥️", "代发页面还在加载（已等 25 秒）…");
                }
                Utils.log("🟡", "代发页面 45 秒内没有就绪。可能原因："
                    + "① 脚本未注入该页（@background 会让页面永不注入，需用 @crontab）；"
                    + "② 打开的标签页被浏览器冻结/未获得执行机会。本轮改用后台直发。");
                return null;
            } finally {
                this._openingPage = false;
            }
        },

        async viaPageChannel(url, headers, body, timeoutMs = 15000) {
            const id = Date.now() + "-" + Math.floor(Math.random() * 1e6);
            GM_setValue(this.PAGE_BOX.res, null);
            GM_setValue(this.PAGE_BOX.req, { id, url, headers, body, at: Date.now() });

            const pack = (res) => ({
                ok: res.status >= 200 && res.status < 300,
                status: res.status,
                text: res.text || "",
                error: res.error || ""
            });

            let listenerId = null;
            let settled = false;
            let result = null;

            if (typeof GM_addValueChangeListener !== "undefined") {
                try {
                    listenerId = GM_addValueChangeListener(this.PAGE_BOX.res, (name, oldV, newV) => {
                        if (settled || !newV || typeof newV !== "object") return;
                        if (newV.id !== id) return;
                        settled = true;
                        result = pack(newV);
                    });
                } catch (_) { listenerId = null; }
            }

            const deadline = Date.now() + timeoutMs;
            try {
                while (!settled && Date.now() < deadline) {
                    await Utils.delay(600);
                    const res = GM_getValue(this.PAGE_BOX.res, null);
                    if (res && res.id === id) {
                        settled = true;
                        result = pack(res);
                        break;
                    }
                }
            } finally {
                if (listenerId != null && typeof GM_removeValueChangeListener === "function") {
                    try { GM_removeValueChangeListener(listenerId); } catch (_) {}
                }
            }

            GM_setValue(this.PAGE_BOX.req, null);
            return settled ? result : null;
        },

        _actionLooksAccepted(res) {
            const text = String(res || "");
            if (!text) return false;
            if (/(?:^|\n)[0-9a-f]+:E\{/i.test(text) || /"digest"\s*:/.test(text)) return false;
            if (/^\s*<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text)) return false;

            const verdicts = [...text.matchAll(/\d+:(true|false)(?![\w{])/g)];
            if (verdicts.length > 0) {
                return verdicts[verdicts.length - 1][1] === "true";
            }
            return text.includes('"ok":true');
        },

        QUESTS: {
            weeklyPrefix: /WW_pcparent_RewardsApp_weekly_Exclusive/i
        },

        _questLinksFromEarn(earnHtml) {

            const raw = String(earnHtml || "");
            const cleanEarn = raw.replace(/\\"/g, '"');
            const found = new Map();
            const add = (id) => {
                let q = String(id || "").split("?")[0].split("#")[0];
                try { q = decodeURIComponent(q); } catch (_) {}
                if (q && /punchcard/i.test(q) && !found.has(q)) found.set(q, q);
            };

            const text = this._flightText(raw);
            const reFlight = /\/earn\/quest\/([A-Za-z0-9_%.\-]+punchcard[A-Za-z0-9_%.\-]*)/g;
            let m;
            while ((m = reFlight.exec(text)) !== null) add(m[1]);

            const reOffer = /"offerId"\s*:\s*"([^"]*punchcard[^"]*)"/g;
            while ((m = reOffer.exec(cleanEarn)) !== null) add(m[1]);

            const reHref = /"href"\s*:\s*"(\/earn\/quest\/[^"]+)"/g;
            while ((m = reHref.exec(cleanEarn)) !== null) add(m[1].split("/").pop());

            const reHrefHtml = /href="(\/earn\/quest\/[^"]+)"/g;
            while ((m = reHrefHtml.exec(cleanEarn)) !== null) add(m[1].split("/").pop());

            const reEscaped = /\\"href\\":\\"(\/earn\/quest\/[^\\"]+)/g;
            while ((m = reEscaped.exec(raw)) !== null) add(m[1].split("/").pop());

            return [...found.keys()];
        },

        async fetchQuestCards(parentId) {
            const url = "https://rewards.bing.com/earn/quest/" + encodeURIComponent(parentId);
            const html = await Utils.xhr({
                url,
                headers: RewardsAuto.desktopAppHeaders
            });
            if (!html) return { parentId, url, html: "", cards: [] };
            const text = this._flightText(html);
            const cards = [];
            for (const item of this._flightItems(text, "[A-Za-z0-9]*_pcchild[^\"]+")) {
                if (!item.offerId || !item.hash) continue;
                cards.push({
                    offerId: item.offerId,
                    hash: item.hash,
                    title: String(item.ariaLabel || item.linkText || item.offerId).replace(/^\s*\d+\s*[分点]?\s*,?\s*/, "").trim() || item.offerId,
                    isCompleted: item.isCompleted === true,
                    isLocked: item.isLocked === true,
                    href: item.href || item.destination || ""
                });
            }
            return { parentId, url, html, text, cards };
        },

        /* ===== 月度计划（月度 punchcard）=====
           与桌面专属任务同一个 quest 详情页结构，差别有三点：
             1) 父任务 id 不含 RewardsApp，普通 PC UA 就能渲染出子项（不用应用 UA 也能拿到 hash/href）；
             2) 子项个数更多（本月 5 个），按天解锁，一次只能推进一个；
             3) 全部完成后父任务发一次 +50，进度只能回读「M/N 个任务」确认。
           子项 href 指向 bing.com/search?form=ML2YBx&PUBL=RewardsDO 的，
           必须先在奖励搜索页上报（reportAppSearchForCard）再交卷，否则服务端看不到那次搜索。 */

        MONTH_KEY() {
            const d = new Date();
            return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
        },

        monthlyState() {
            const raw = GM_getValue("Config.monthlyState", null);
            const st = (raw && typeof raw === "object") ? raw : {};
            const month = this.MONTH_KEY();
            if (String(st.month || "") !== month) {
                return { month, paused: false, logDate: 0, quests: {} };
            }
            return {
                month,
                paused: !!st.paused,
                pausedAt: Number(st.pausedAt) || 0,
                logDate: Number(st.logDate) || 0,
                quests: (st.quests && typeof st.quests === "object") ? st.quests : {},
            };
        },

        saveMonthlyState(st) {
            GM_setValue("Config.monthlyState", st);
        },

        /* 同一件事每天只写一条日志/推一条通知：cron 每 20 分钟一轮，不加节流会刷屏 */
        monthlyLog(st, icon, msg, push = false) {
            const today = Utils.getTodayNum();
            if (Number(st.logDate) === today) {
                Utils.log(icon, msg);
                return false;
            }
            st.logDate = today;
            this.saveMonthlyState(st);
            Utils.log(icon, msg, push);
            return true;
        },

        /* 月度子项的完成动作由 href 决定，和桌面任务那套一致：
             · /redeem/ 开头 = 领取型，点开链接即完成（奖励多半走邮件）
             · bing.com/search?form=ML2xx|PUBL=RewardsDO = 应用内搜索型，先上报搜索再交卷
             · 其它 = 纯交卷型
           返回 "redeem" | "search" | "plain" */
        monthlyChildKind(href) {
            const h = String(href || "");
            if (/\/redeem/i.test(h)) return "redeem";
            const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
            if (/bing\.com\/search/i.test(h) && /(^|&)(form=ML2Y2H|form=ML2YB\d|PUBL=RewardsDO)/i.test(q)) return "search";
            return "plain";
        },

        /* 拉详情页并解析：进度 + 子项。进度只认「M/N 个任务」，
           没有这个文案时退化为数子项的 isCompleted，避免把「已解锁但没进度文案」当成 0 进度。 */
        /* 拉详情页并解析：进度 + 子项。
           身份：统一用 Rewards 应用 UA —— 参考实现的实测结论是「同一个 quest 在应用 UA 下才渲染
           真实进度与真实解锁态，普通 UA 会渲染成 0/N 且子项全 isLocked=true」，
           因此不能拿普通 UA 的结果当依据。只有应用 UA 连子项都解析不出来时，
           才退到普通 PC UA 兜底（页面结构变更时至少还能认出子项）。
           进度只认「M/N 个任务」文案，没有时退化为数子项 isCompleted。
           返回的 identity 字段用于日志定位「到底哪份渲染被采纳了」。 */
        async fetchMonthlyQuest(parentId) {
            const url = MONTHLY.PAGE_URL + encodeURIComponent(parentId);
            const identities = [
                { name: "应用 UA", headers: RewardsAuto.desktopAppHeaders },
                { name: "普通 UA", headers: { "user-agent": RewardsAuto.ua.pc, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } },
            ];
            let lastReason = "";
            for (const idn of identities) {
                let html = "";
                try {
                    html = await Utils.xhr({ url, headers: idn.headers });
                } catch (e) {
                    lastReason = `详情页请求失败：${e.message}`;
                    continue;
                }
                if (!html) { lastReason = "详情页返回空"; continue; }

                const text = this._flightText(html);
                const cards = [];
                const seen = new Set();
                for (const item of this._flightItems(text, "[A-Za-z0-9]*_pcchild[^\"]+")) {
                    if (!item.offerId || !item.hash || seen.has(item.offerId)) continue;
                    seen.add(item.offerId);
                    cards.push({
                        offerId: String(item.offerId),
                        hash: String(item.hash),
                        title: String(item.ariaLabel || item.linkText || item.offerId)
                            .replace(/^\s*\d+\s*[分点]?\s*,?\s*/, "").trim() || item.offerId,
                        isCompleted: item.isCompleted === true,
                        isLocked: item.isLocked === true,
                        isDisabled: item.isDisabled === true,
                        href: String(item.href || item.destination || ""),
                    });
                }
                const m = text.match(/(\d+)\s*\/\s*(\d+)\s*个任务/);
                const doneByText = m ? parseInt(m[1], 10) : 0;
                const totalByText = m ? parseInt(m[2], 10) : 0;
                const completedCards = cards.filter(c => c.isCompleted).length;
                /* 子项和进度文案至少拿到一样才算「解析成功」，否则换下一个身份兜底 */
                if (cards.length === 0 && totalByText === 0) {
                    lastReason = "未解析到子项（页面结构可能已变更）";
                    continue;
                }
                if (idn.name !== identities[0].name) {
                    Utils.log("📆", `月度计划：${parentId} 应用 UA 没解析出内容，已用${idn.name}兜底`);
                }
                return {
                    parentId, url, ok: true, identity: idn.name,
                    html, text, cards,
                    done: totalByText > 0 ? doneByText : completedCards,
                    total: totalByText > 0 ? totalByText : cards.length,
                    hasProgressText: !!m,
                    unlockedOpen: cards.filter(c => !c.isCompleted && !c.isLocked && !c.isDisabled).length,
                };
            }
            return { parentId, url, ok: false, reason: lastReason || "解析失败", cards: [] };
        },

        /* 交卷：走和桌面专属任务相同的三种形态探测（earn 页 / quest 页 / 普通 UA），
           成功形态会被记住（Config.questVariant），下次直接用命中的那一种。 */
        async submitMonthlyCard(parentId, card) {
            try {
                const r = await this.submitQuestCard(parentId, card);
                return r || { accepted: false, status: 0, raw: "", variant: "" };
            } catch (e) {
                return { accepted: false, status: 0, raw: e.message, variant: "", diag: e.message };
            }
        },

        /* 完成一个子项：按类型执行动作 + 交卷，然后回读进度确认到底有没有记账。
           返回 { credited, done, total, note } —— credited=false 表示「受理了但服务端没动」，
           调用方据此决定是「今天再试一次」还是「等解锁/等复查」。 */
        async completeMonthlyChild(parentId, card, pageUrl, before) {
            const kind = this.monthlyChildKind(card.href);
            const note = [];
            let accepted = false;

            if (kind === "search") {
                /* 应用内搜索型：先用奖励搜索签名把这次搜索上报掉。
                   reportAppSearchForCard 内部已封装 ncheader + reportActivity 两步。 */
                try {
                    const reported = await this.reportAppSearchForCard(card.href);
                    note.push(reported ? "已上报应用内搜索" : "应用内搜索上报失败");
                } catch (e) {
                    note.push(`应用内搜索上报异常：${e.message}`);
                }
                await Utils.randomDelay(2500, 4500);
            }

            if (kind === "redeem") {
                /* 领取型：带上会话 cookie GET 一次兑换链接就等效于在页面上点「领取」。 */
                try {
                    await Utils.xhr({
                        url: card.href,
                        headers: {
                            "user-agent": RewardsAuto.desktopAppHeaders["user-agent"],
                            "referer": pageUrl,
                        },
                    });
                    note.push("已访问兑换链接");
                } catch (e) {
                    note.push(`兑换链接访问失败：${e.message}`);
                }
                await Utils.delay(5000);
            }

            const sub = await this.submitMonthlyCard(parentId, card);
            accepted = !!sub.accepted;
            note.push(accepted
                ? `交卷已受理${sub.variant ? `（${sub.variant}）` : ""}`
                : `交卷未受理${sub.diag ? `：${sub.diag}` : (sub.status ? `（HTTP ${sub.status}）` : "")}`);

            /* 回读确认：交卷被受理不等于记账，尤其应用搜索型和领取型。
               桌面任务那套是 2~4 秒后回读，这里给 4~7 秒（月度子项服务端处理更慢）。 */
            await Utils.randomDelay(4000, 7000);
            let after = null;
            try {
                after = await this.fetchMonthlyQuest(parentId);
            } catch (_) { after = null; }
            const newDone = after && after.ok ? after.done : -1;
            const credited = newDone > before.done;
            if (credited) note.push(`进度 ${before.done}/${before.total} → ${newDone}/${after.total}`);
            else if (newDone >= 0) note.push(`进度未推进（仍 ${newDone}/${after.total}）`);
            else note.push("进度回读失败");

            return {
                credited,
                accepted,
                kind,
                done: credited ? newDone : before.done,
                total: (after && after.ok && after.total) ? after.total : before.total,
                note: note.join("，"),
            };
        },

        async runMonthlyPlan() {
            const st = this.monthlyState();
            const now = Date.now();
            const today = Utils.getTodayNum();

            /* 本月已全部完成：不是永久封存，而是「约一天内不再请求」。
               月度 quest 偶尔会在月中换一批或补发新的子项，永久封存会整月漏掉；
               每天复查一次只花 1 个 earn 页请求，代价可以接受。 */
            if (st.paused && now - (Number(st.pausedAt) || 0) < MONTHLY.DONE_RECHECK_MS) {
                Utils.log("📆", "月度计划：本月已全部完成，本轮不再执行");
                const sumP = k => Object.keys(st.quests)
                    .reduce((s, id) => s + (Number((st.quests[id] || {})[k]) || 0), 0);
                return {
                    found: Object.keys(st.quests).length, done: sumP("done"), total: sumP("total"),
                    pending: 0, complete: true, skipped: true,
                };
            }

            /* 零请求快速跳过：本轮既没有「今天还能再试」的子项，又还没到下一次复查时间。
               没有这一步的话，cron 每 20 分钟就会拉一次 earn 页 + quest 详情页，
               一个月下来上百次请求，既浪费也更容易被判异常。 */
            const ids = Object.keys(st.quests);
            const unfinished = ids.filter(id => !(st.quests[id] || {}).complete);
            if (unfinished.length > 0) {
                const attemptsTodayOf = id => {
                    const q = st.quests[id] || {};
                    return Number(q.attemptDate) === today ? Number(q.attempts) || 0 : 0;
                };
                const retryable = unfinished.filter(id => {
                    const tried = attemptsTodayOf(id);
                    return tried > 0 && tried < MONTHLY.MAX_ATTEMPTS_PER_DAY;
                });
                const allCooling = unfinished.every(id =>
                    now - (Number((st.quests[id] || {}).lastCheckAt) || 0) < MONTHLY.RECHECK_MS);
                if (retryable.length === 0 && allCooling) {
                    const hours = Math.max(1, Math.ceil(MONTHLY.RECHECK_MS / 3600000));
                    this.monthlyLog(st, "📆",
                        `月度计划已检查过，约 ${hours} 小时后复查（${unfinished.map(id => {
                            const q = st.quests[id] || {};
                            return `${q.done || 0}/${q.total || 0}`;
                        }).join("，")}）`);
                    const sum = k => ids.reduce((s, id) => s + (Number((st.quests[id] || {})[k]) || 0), 0);
                    return {
                        found: ids.length, done: sum("done"), total: sum("total"),
                        pending: unfinished.length, complete: false, skipped: true,
                    };
                }
            }

            try { await this.getCookieHeader(); } catch (_) {}

            /* 1) 从 earn 页找出所有月度 punchcard 父任务。
               排除桌面奖励应用每周专属任务（RewardsApp 前缀）——那个由 runDesktopWeeklyQuests 负责，
               两边都跑会对同一批子项重复交卷。 */
            let earnHtml = "";
            try {
                earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn", headers: RewardsAuto.desktopAppHeaders });
            } catch (e) {
                Utils.log("🔴", `月度计划：拉取 earn 页失败（${e.message}），本轮跳过`);
                return { found: 0, done: 0, total: 0, pending: 0, complete: false, failed: 1 };
            }
            if (!earnHtml) {
                Utils.log("🔴", "月度计划：earn 页返回空，本轮跳过");
                return { found: 0, done: 0, total: 0, pending: 0, complete: false, failed: 1 };
            }
            const parentIds = this._questLinksFromEarn(earnHtml)
                .filter(id => !this.QUESTS.weeklyPrefix.test(id));
            if (parentIds.length === 0) {
                this.monthlyLog(st, "📆", "月度计划：当前没有进行中的月度 punchcard（可能本月未发布或已完成）");
                return { found: 0, done: 0, total: 0, pending: 0, complete: false };
            }
            /* 又发现入口了：解除「已完成」的封存，正常走一遍（可能是月中换批/补发） */
            if (st.paused) {
                st.paused = false;
                st.pausedAt = 0;
                st.logDate = 0;
                Utils.log("📆", "月度计划：重新发现月度任务入口，解除封存");
            }
            this.saveMonthlyState(st);

            let totalDone = 0, totalTotal = 0, pendingCount = 0, anyProgress = false;
            const reports = [];

            for (const parentId of parentIds) {
                const cached = st.quests[parentId] || {};
                if (cached.complete) {
                    totalDone += Number(cached.done) || 0;
                    totalTotal += Number(cached.total) || 0;
                    reports.push(`${cached.done}/${cached.total}`);
                    continue;
                }

                let snap;
                try {
                    snap = await this.fetchMonthlyQuest(parentId);
                } catch (e) {
                    Utils.log("🔴", `月度计划：读取 ${parentId} 失败（${e.message}），本轮跳过这一个`);
                    pendingCount++;
                    continue;
                }
                if (!snap.ok || snap.cards.length === 0) {
                    if (!snap.ok) Utils.log("🟡", `月度计划：${parentId} ${snap.reason}`);
                    else Utils.log("🟡", `月度计划：${parentId} 未解析到子项（页面结构可能已变更）`);
                    /* 解析不到不等于完成了，但只要没有待办就不该反复拉页面 */
                    const q = {
                        ...cached, done: cached.done || 0, total: cached.total || 0,
                        complete: false, lastCheckAt: now,
                        attemptDate: cached.attemptDate || 0, attempts: cached.attempts || 0,
                    };
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    pendingCount++;
                    reports.push(`${q.done}/${q.total}`);
                    continue;
                }

                totalDone += snap.done;
                totalTotal += snap.total;
                Utils.log("📆", `月度计划：${parentId} 进度 ${snap.done}/${snap.total}`
                    + `（子项 ${snap.cards.filter(c => c.isCompleted).length} 已完成 / `
                    + `${snap.cards.filter(c => !c.isCompleted && c.isLocked).length} 未解锁）`);

                const q = {
                    done: snap.done,
                    total: snap.total,
                    complete: snap.total > 0 && snap.done >= snap.total,
                    lastCheckAt: now,
                    lastDoneAt: Number(cached.lastDoneAt) || 0,
                    attemptDate: Number(cached.attemptDate) || 0,
                    attempts: Number(cached.attempts) || 0,
                };

                if (q.complete) {
                    q.attemptDate = 0;
                    q.attempts = 0;
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("✅", `月度计划：${parentId} 本月已全部完成`);
                    continue;
                }

                /* 2) 挑一个能做的子项：未完成、已解锁、未禁用。
                   服务端一次只解锁一个，所以取第一个即可，一轮只推进一个子项。 */
                const open = snap.cards.filter(c => !c.isCompleted && !c.isLocked && !c.isDisabled);
                if (open.length === 0) {
                    const locked = snap.cards.filter(c => !c.isCompleted);
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("📆", `月度计划：${locked.length} 个子项都还没解锁，`
                        + `约 ${Math.round(MONTHLY.RECHECK_MS / 60000)} 分钟后复查（进度 ${q.done}/${q.total}）`);
                    pendingCount++;
                    continue;
                }

                const card = open[0];
                const attemptsToday = Number(q.attemptDate) === today ? Number(q.attempts) || 0 : 0;
                if (attemptsToday >= MONTHLY.MAX_ATTEMPTS_PER_DAY) {
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("📆", `月度计划：子项「${card.title}」今天已尝试 ${attemptsToday} 次仍没推进，`
                        + `约 ${Math.round(MONTHLY.RECHECK_MS / 60000)} 分钟后复查服务端进度`);
                    pendingCount++;
                    continue;
                }

                /* 有轮次在跑就确认它还活着：本轮超时/锁被别的上下文接管时必须立刻停手，
                   不能继续往微软发请求。异常要往上抛（runAll 的 withRetry 对 roundAborted 直接透传），
                   所以这里不能 try/catch 吞掉。手动诊断（没有轮次在跑）时跳过这个检查。 */
                if (TaskManager.running) TaskManager.tick();

                Utils.log("📆", `月度计划：正在完成子项「${card.title}」`
                    + `（${this.monthlyChildKind(card.href) === "search" ? "应用内搜索型"
                        : this.monthlyChildKind(card.href) === "redeem" ? "领取型" : "交卷型"}）`);

                const res = await this.completeMonthlyChild(parentId, card, snap.url, {
                    done: snap.done, total: snap.total,
                });
                Utils.log(res.credited ? "🟢" : "🟡", `月度计划：${res.note}`);

                if (res.credited) {
                    anyProgress = true;
                    q.done = res.done;
                    q.total = res.total || q.total;
                    q.complete = q.total > 0 && q.done >= q.total;
                    q.lastDoneAt = Date.now();
                    q.attemptDate = 0;
                    q.attempts = 0;
                    /* totalDone 在循环开头已经按 snap.done 累加过，这里只补差额 */
                    totalDone += Math.max(0, res.done - snap.done);
                } else {
                    q.done = snap.done;
                    if (Number(q.attemptDate) === today) q.attempts = (Number(q.attempts) || 0) + 1;
                    else { q.attemptDate = today; q.attempts = 1; }
                }
                q.lastCheckAt = Date.now();
                st.quests[parentId] = q;
                this.saveMonthlyState(st);
                reports.push(`${q.done}/${q.total}`);
                if (!q.complete) pendingCount++;
            }

            /* 全部父任务都完成 → 一天内不再请求（次日复查一次，防止月中换批/补发） */
            const allComplete = parentIds.length > 0
                && parentIds.every(id => (st.quests[id] || {}).complete);
            if (allComplete) {
                st.paused = true;
                st.pausedAt = Date.now();
                this.saveMonthlyState(st);
                this.monthlyLog(st, "🔵",
                    `月度计划本月全部完成（${reports.join("，")}），${Math.round(MONTHLY.DONE_RECHECK_MS / 3600000)} 小时后再复查一次`, true);
            } else if (anyProgress) {
                this.monthlyLog(st, "📆",
                    `月度计划已推进：本次完成 1 个子项（${reports.join("，")}）`, true);
            } else {
                this.monthlyLog(st, "📆", `月度计划进度：${reports.join("，") || "无"}`);
            }

            return {
                found: parentIds.length,
                done: totalDone,
                total: totalTotal,
                pending: allComplete ? 0 : Math.max(pendingCount, 1),
                complete: allComplete,
                unlocked: 0,
            };
        },

        async _rawXhr(options) {
            const start = Date.now();
            return await new Promise((resolve) => {
                try {
                    GM_xmlhttpRequest({

                        ...options,
                        timeout: Number(options && options.timeout) || 15000,
                        onload: (res) => resolve({
                            status: res.status,
                            text: String(res.responseText || ""),
                            headers: res.responseHeaders || "",
                            cost: (Date.now() - start) / 1000
                        }),
                        onerror: (err) => resolve({
                            status: 0,
                            text: String((err && err.error) || "网络错误"),
                            headers: "",
                            cost: (Date.now() - start) / 1000
                        }),
                        ontimeout: () => resolve({
                            status: -1,
                            text: "请求超时",
                            headers: "",
                            cost: (Date.now() - start) / 1000
                        })
                    });
                } catch (e) {
                    resolve({ status: 0, text: String(e.message), headers: "", cost: 0 });
                }
            });
        },

        _questSubmitVariants() {
            const SRC = "https://rewards.bing.com";
            return [
                { name: "earn页+origin", toEarn: true, headers: { origin: SRC } },
                { name: "quest页+origin", toEarn: false, headers: { origin: SRC } },
                { name: "earn页+普通UA", toEarn: true, headers: { origin: SRC }, plainIdentity: true }
            ];
        },

        async _probeQuestVariant(pageUrl, parentId, card) {
            const saved = GM_getValue("Config.questVariant", "");
            const all = this._questSubmitVariants();
            const ordered = saved
                ? [...all.filter(v => v.name === saved), ...all.filter(v => v.name !== saved)]
                : all;
            const tried = [];
            let last = null;
            for (const v of ordered) {
                const r = await this._submitQuestOnce(pageUrl, parentId, card, v);
                last = r;
                tried.push(`${v.name}=${r.status}`);
                if (r.accepted) {
                    if (saved !== v.name) {
                        GM_setValue("Config.questVariant", v.name);
                        if (saved) Utils.log("🖥️", `桌面任务交卷形态已切换：${saved} → ${v.name}`);
                    }
                    return { variant: v, result: r, tried };
                }
                if (r.status === 401 || r.status === 403) break;
            }
            return { variant: null, result: last, tried };
        },

        async _submitQuestOnce(pageUrl, parentId, card, variant) {
            const nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const payload = JSON.stringify([card.hash, 11, {
                offerid: card.offerId,
                isPromotional: "$undefined",
                timezoneOffset: "-480"
            }]);
            const target = variant.toEarn ? "https://rewards.bing.com/earn" : pageUrl;
            const headers = {
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "next-router-state-tree": variant.toEarn
                    ? Utils.routerStateTree("earn")
                    : Utils.questRouterStateTree(parentId),
                "referer": target,
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {})
            };
            if (!variant.plainIdentity) Object.assign(headers, RewardsAuto.desktopAppHeaders);
            else headers["user-agent"] = RewardsAuto.ua.pc;
            Object.assign(headers, variant.headers);

            const res = await this._rawXhr({ method: "POST", url: target, headers, data: payload });
            return {
                status: res.status,
                accepted: res.status >= 200 && res.status < 300 && this._actionLooksAccepted(res.text),
                text: res.text,
                cost: res.cost,
                variant: variant.name
            };
        },

        _questDiag(res) {
            const t = String((res && res.text) || "");
            const st = res ? res.status : 0;
            if (st === 0) {
                return `请求未发出（${t.slice(0, 80) || "无响应"}）—— 多半是 XHR 层拒绝了禁改头或缺 @connect 权限`;
            }
            if (st === -1) return "请求超时";
            let kind = "未知";
            if (/login\.live\.com|oauth20_authorize|<title>登录<\/title>|Sign in to/i.test(t)) kind = "登录页";
            else if (/<title>Bing<\/title>|sc_error|class="panda"/i.test(t)) kind = "必应风控页";
            else if (/[0-9a-f]+:E\{|"digest"\s*:/.test(t)) kind = "Next.js错误帧";
            else if (/<html/i.test(t)) kind = "HTML页面";
            const body = t.replace(/\s+/g, " ").slice(0, 160);
            return `HTTP ${st}（${kind}，${res ? res.cost.toFixed(2) : "?"}秒）${body ? " body=" + body : ""}`;
        },

        async submitQuestCard(parentId, card) {
            const pageUrl = "https://rewards.bing.com/earn/quest/" + encodeURIComponent(parentId);
            const nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const payload = JSON.stringify([card.hash, 11, {
                offerid: card.offerId,
                isPromotional: "$undefined",
                timezoneOffset: "-480"
            }]);
            const baseHeaders = {
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "next-router-state-tree": Utils.questRouterStateTree(parentId),
                "referer": pageUrl,
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {}),
                ...RewardsAuto.desktopAppHeaders
            };

            if (GM_getValue("Config.questViaCdp", true) && typeof WebSocket !== "undefined") {
                try {
                    if (await CDP.available()) {
                        const page = await CDP.earnPage();
                        if (page && page.webSocketDebuggerUrl) {
                            if (!CDP._ws || CDP._ws.readyState !== 1) {
                                await CDP.connect(page.webSocketDebuggerUrl);
                            }
                            const r = await CDP.claimInPage(pageUrl, baseHeaders, payload);
                            if (r.accepted && this._actionLooksAccepted(r.text)) {
                                Utils.log("🖥️", "  经由 CDP 页面通道交卷成功");
                                return { accepted: true, raw: r.text, status: r.status, variant: "CDP页面通道" };
                            }
                            Utils.log("🟡", `CDP 页面通道未受理（HTTP ${r.status}）：${String(r.text).replace(/\s+/g, " ").slice(0, 90)}`);
                        }
                    }
                } catch (eCdp) {
                    Utils.log("🟡", `CDP 页面通道异常：${eCdp.message}`);
                } finally {
                    try { CDP.close(); } catch (_) {}
                }
            }

            if (GM_getValue("Config.usePageChannel", false)) {
                let tabId = null;
                if (!this._pageChannelAlive()) {
                    tabId = await this._ensurePageChannel();
                }
                if (this._pageChannelAlive()) {
                    const viaPage = await this.viaPageChannel(pageUrl, baseHeaders, payload);
                    if (viaPage && !viaPage.error) {
                        const accepted = viaPage.ok && this._actionLooksAccepted(viaPage.text);
                        if (accepted) {
                            this._claimPageTab = true;
                            return { accepted: true, raw: viaPage.text, status: viaPage.status, variant: "页面通道" };
                        }
                        Utils.log("🖥️", `页面通道未受理（HTTP ${viaPage.status}），改试后台直发`);
                    } else {
                        Utils.log("🟡", "页面通道没有返回结果（页面可能未加载完），改试后台直发");
                    }
                }
            }

            const probed = await this._probeQuestVariant(pageUrl, parentId, card);
            if (probed.variant) {
                return {
                    accepted: true,
                    raw: probed.result.text,
                    status: probed.result.status,
                    variant: probed.variant.name
                };
            }
            const last = probed.result;
            return {
                accepted: false,
                raw: last ? last.text : "",
                status: last ? last.status : 0,
                variant: last ? last.variant : "",
                tried: probed.tried,
                diag: last ? this._questDiag(last) : "无响应"
            };
        },

        async runDesktopWeeklyQuests() {
            Utils.log("🖥️", "扫描桌面奖励应用专属任务…");

            try { await this.getCookieHeader(); } catch (_) {}
            let encEarn;
            try {

                encEarn = await Utils.xhr({
                    url: "https://rewards.bing.com/earn",

                    headers: {
                        ...RewardsAuto.desktopAppHeaders
                    }
                });
            } catch (eEarn) {
                Utils.log("🔴", `桌面专属任务：拉取 earn 页失败（${eEarn.message}），本轮跳过`);
                return { found: 0, done: 0, pending: 0 };
            }
            if (!encEarn) {
                Utils.log("🔴", "桌面专属任务：earn 页返回空，本轮跳过");
                return { found: 0, done: 0, pending: 0 };
            }

            const earnLen = String(encEarn).length;
            const looksLogin = /<title>登录<\/title>|Sign in to your account|oauth20_authorize/i.test(String(encEarn));
            if (looksLogin || earnLen < 60000) {
                Utils.log("🟡", `桌面专属任务：earn 页疑似未登录（长度 ${earnLen}，`
                    + `${looksLogin ? "是登录页" : "比正常页小很多"}）——`
                    + `请检查 GM_cookie 是否授权、账号是否已登录`);
            }

            const questIds = this._questLinksFromEarn(encEarn)
                .filter(id => this.QUESTS.weeklyPrefix.test(id));
            if (questIds.length === 0) {
                const allQuests = this._questLinksFromEarn(encEarn);
                Utils.log("🖥️", "本轮没有桌面奖励应用每周专属任务"
                    + `（earn 页 ${earnLen} 字节，识别到 ${allQuests.length} 个 quest 入口`
                    + (allQuests.length ? `：${allQuests.join("、")}` : "")
                    + "）");
                return { found: 0, done: 0, pending: 0 };
            }
            Utils.log("🖥️", `发现 ${questIds.length} 个桌面专属任务入口：`
                + questIds.map(id => id.replace(/^WW_pcparent_RewardsApp_weekly_Exclusive_?/i, "")).join("、"));

            let totalDone = 0, totalFound = 0, totalPending = 0, totalFailed = 0;
            for (const parentId of questIds) {
                let snap;
                try {
                    snap = await this.fetchQuestCards(parentId);
                } catch (eSnap) {
                    Utils.log("🔴", `桌面专属任务：读取 ${parentId} 失败（${eSnap.message}），跳过这一个`);
                    totalFailed++;
                    continue;
                }
                if (snap.cards.length === 0) {
                    Utils.log("✅", `桌面专属任务本周已全部完成：${parentId}`);
                    continue;
                }
                totalFound += snap.cards.length;
                const open = snap.cards.filter(c => !c.isCompleted);
                if (open.length === 0) {
                    Utils.log("✅", `桌面专属任务本周已全部完成：${parentId}`);
                    continue;
                }

                const unlocked = open.filter(c => !c.isLocked);
                if (unlocked.length === 0) {
                    Utils.log("🖥️", `桌面专属任务：${open.length} 张待办全部未解锁（未到对应星期），本轮不处理`);
                } else {
                    Utils.log("🖥️", `桌面奖励应用专属任务：${unlocked.length} 张已解锁待办`
                        + `（另有 ${open.length - unlocked.length} 张未解锁，不处理）（${parentId}）`);
                    for (const c of unlocked) Utils.log("🖥️", `  · [已解锁] ${c.title}`);
                }

                let doneHere = 0, failedHere = 0;
                for (const card of unlocked) {

                    if (card.href && /^https?:/i.test(card.href)) {
                        try {
                            const reported = await this.reportAppSearchForCard(card.href);
                            if (reported) Utils.log("🖥️", `  已上报应用搜索：${card.title}`);
                        } catch (_) {}
                        await Utils.randomDelay(1500, 2500);
                    }

                    const maxAttempts = 2;
                    let r = null;
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            r = await this.submitQuestCard(parentId, card);
                        } catch (eSubmit) {
                            r = { accepted: false, raw: String(eSubmit.message), status: 0 };
                        }
                        if (r.accepted) break;
                        if (attempt < maxAttempts) {
                            Utils.log("🟡", `桌面任务交卷未受理（第 ${attempt} 次）：${card.title}`
                                + ` [已试形态 ${(r.tried || []).join(",") || r.variant || "-"}]，稍后重试`);
                            await Utils.randomDelay(5000, 9000);
                        }
                    }
                    if (!r || !r.accepted) {
                        failedHere++;
                        totalPending++;   /* 交卷没被受理 = 这张卡没记账，算进「未完成」里 */
                        try {
                            if (card.title && !RewardsAuto.state.desktopPendingTitles.includes(card.title)) {
                                RewardsAuto.state.desktopPendingTitles.push(card.title);
                            }
                        } catch (_) {}
                        Utils.log("🟠", `桌面任务交卷失败：${card.title}`
                            + ` → ${r && r.diag ? r.diag : this._questReason(r && r.raw)}`);
                        if (r && r.tried) {
                            Utils.log("🖥️", `  形态尝试结果：${r.tried.join(" / ")}`);
                        }
                        continue;
                    }
                    if (r.variant && r.variant !== "无origin") {
                        Utils.log("🖥️", `  本次用「${r.variant}」形态交卷成功`);
                    }
                    await Utils.randomDelay(2000, 4000);
                    let after;
                    try {
                        after = await this.fetchQuestCards(parentId);
                    } catch (eAfter) {
                        Utils.log("🟡", `桌面任务已受理但复核失败（${eAfter.message}）：${card.title}，按待定处理`);
                        totalPending++;
                        continue;
                    }
                    const stillThere = after.cards.some(c => c.offerId === card.offerId && !c.isCompleted);
                    if (stillThere) {
                        totalPending++;
                        Utils.log("🟡", `桌面任务已受理但未记账（服务端没加分）：${card.title}`);
                    } else {
                        doneHere++;
                        Utils.log("🟢", `桌面专属任务完成：${card.title}`);
                    }
                }
                totalDone += doneHere;
                let verify = null;
                try {
                    verify = await this.fetchQuestCards(parentId);
                } catch (_) {}
                if (verify && verify.cards.every(c => c.isCompleted)) {
                    Utils.log("🔵", `桌面应用每周专属任务全部完成（本次完成 ${doneHere} 张）`);
                } else {

                    const leftUnlocked = verify ? verify.cards.filter(c => !c.isCompleted && !c.isLocked) : [];
                    const leftLocked = verify ? verify.cards.filter(c => !c.isCompleted && c.isLocked).length : 0;
                    if (leftUnlocked.length > 0) {
                        /* 记下待记账的标题，供收尾通知点名 */
                        try {
                            for (const c of leftUnlocked) {
                                if (c.title && !RewardsAuto.state.desktopPendingTitles.includes(c.title)) {
                                    RewardsAuto.state.desktopPendingTitles.push(c.title);
                                }
                            }
                        } catch (_) {}
                    }
                    Utils.log("🟡", `桌面应用每周专属任务：本次完成 ${doneHere} 张、失败 ${failedHere} 张`
                        + (leftUnlocked.length > 0
                            ? `，仍剩 ${leftUnlocked.length} 张已解锁未完成（${leftUnlocked.map(c => c.title).join("、")}）`
                            : (leftLocked > 0 ? "，今日已解锁的都处理完了" : ""))
                        + (leftLocked > 0 ? `（另有 ${leftLocked} 张未解锁，到对应那天自动处理）` : ""));
                }
            }
            if (totalFailed > 0) {
                /* 只写日志：这类失败下一轮会重试，收尾通知里也会点名 */
                Utils.log("🟠", `桌面专属任务本轮有 ${totalFailed} 个入口读取失败，下一轮会再试`);
            }
            return { found: totalFound, done: totalDone, pending: totalPending, failed: totalFailed };
        },

        _questReason(raw) {
            const t = String(raw || "");
            if (!t) return "无响应";
            if (/HTTP 500/.test(t)) return "HTTP 500（必应风控拦截，多半是 Origin/UA 特征）";
            if (/\b(401|403)\b/.test(t)) return "未登录或无权限，请检查 Cookie / 登录态";
            if (/HTTP (404|405)/.test(t)) return "接口/路由不存在（action ID 或 quest 页面可能已变更）";
            if (/请求超时|timeout/i.test(t)) return "请求超时";
            return t.replace(/\s+/g, " ").slice(0, 110);
        },

        async postAction(req, { savedKey = "Config.actionVariant" } = {}) {
            const saved = String(GM_getValue(savedKey, "") || "");
            const order = (saved && BrowserEnv.channelOrder().includes(saved))
                ? [saved, ...BrowserEnv.channelOrder().filter(v => v !== saved)]
                : BrowserEnv.channelOrder();
            const tried = [];
            let accepted = null;
            let last = null;
            for (const v of order) {
                let r;
                try {
                    r = await this._postVia(v, req);
                } catch (e) {
                    r = { ok: false, status: 0, text: String((e && e.message) || e), variant: v };
                }
                tried.push(`${v}=${r.status}${r.ok ? "✓" : "✗"}`);
                if (r.status > 0) last = r;
                if (r.ok) { accepted = r; break; }
                if (r.status === 401 || r.status === 403) break;
            }
            if (accepted && accepted.variant !== saved) {
                GM_setValue(savedKey, accepted.variant);
                if (saved) Utils.log("🎁", `动作请求通道已切换：${saved} → ${accepted.variant}`);
            }
            return accepted || {
                ok: false,
                status: last ? last.status : 0,
                text: last ? last.text : "",
                variant: last ? last.variant : "",
                tried
            };
        },

        async _postVia(variant, req) {
            if (variant === "page") {
                if (!(await CDP.available())) return { ok: false, status: 0, text: "CDP 不可用", variant };
                const page = await this._anyRewardsPage();
                if (!page) return { ok: false, status: 0, text: "没有可用的 rewards 页面", variant };
                if (!CDP._ws || CDP._ws.readyState !== 1) await CDP.connect(page.webSocketDebuggerUrl);
                const r = await CDP.claimInPage(req.url, req.headers, req.data);
                return {
                    ok: r.status >= 200 && r.status < 300 && this._actionLooksAccepted(r.text),
                    status: r.status, text: r.text, variant
                };
            }
            if (variant === "proxy") {
                if (!this._pageChannelAlive()) return { ok: false, status: 0, text: "页面代发服务不在线", variant };
                const r = await this.viaPageChannel(req.url, req.headers, req.data, 20000);
                if (!r) return { ok: false, status: 0, text: "页面代发超时", variant };
                return {
                    ok: r.status >= 200 && r.status < 300 && this._actionLooksAccepted(r.text),
                    status: r.status, text: r.text || r.error || "", variant
                };
            }
            const r = await this._rawXhr({ method: "POST", url: req.url, headers: req.headers, data: req.data });
            return {
                ok: r.status >= 200 && r.status < 300 && this._actionLooksAccepted(r.text),
                status: r.status, text: r.text, variant
            };
        },

        async _anyRewardsPage() {
            const list = await CDP.targets();
            if (!list) return null;
            const pages = list.filter(t => t.type === "page" && t.url && /^https:\/\/rewards\.bing\.com\//i.test(t.url));
            if (!pages.length) return null;
            return pages.find(t => /\/earn/i.test(t.url)) || pages[0];
        },

        async claimCardWeb(card, { appChannel = false } = {}) {
            const useAppUA = appChannel || card.appOnly === true || card.kind === "desktop_app";
            const isDash = card.kind === "daily" || card.kind === "streak" || card.source === "getuserinfo";
            const pageUrl = card.kind === "desktop_app"
                ? (card.url || "https://rewards.bing.com/earn")
                : (isDash ? "https://rewards.bing.com/dashboard" : "https://rewards.bing.com/earn");
            const referer = card.url || pageUrl;
            const segment = isDash ? "dashboard" : "earn";
            let nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);

            const extraAppHeaders = card.kind === "desktop_app" ? RewardsAuto.desktopAppHeaders : {};
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const buildHeaders = () => ({
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "referer": referer,

                "next-router-state-tree": Utils.routerStateTree(segment),
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {}),
                ...extraAppHeaders,
                "user-agent": useAppUA ? RewardsAuto.ua.rewardsApp : RewardsAuto.ua.pc
            });
            const payload = JSON.stringify([card.hash, 11, { offerid: card.offerId, isPromotional: "$undefined", timezoneOffset: "-480" }]);

            try {

                const hit = await this.postAction(
                    { url: pageUrl, headers: buildHeaders(), data: payload },
                    { savedKey: "Config.claimActionVariant" }
                );
                const accepted = !!hit.ok;

                if (!accepted || GM_getValue("Config.debugDAPI", false)) {
                    Utils.log("🔬", `交卷响应(${String(card.offerId).slice(0, 36)})：`
                        + `受理=${accepted} 通道=${hit.variant || "无"}${hit.tried ? `(${hit.tried})` : ""} `
                        + `ua=${useAppUA ? "app" : "pc"} dpl=${dpl || "无"} `
                        + `hash=${String(card.hash || "").slice(0, 20)} appOnly=${!!card.appOnly} `
                        + `src=${card.source || "-"} kind=${card.kind || "-"} `
                        + `body=${JSON.stringify(String(hit.text || "").replace(/\s+/g, " ").slice(0, 240))}`);
                }
                if (accepted) {
                    this._webCompleteCache = null;
                    return true;
                }
                if (hit.status === 401 || hit.status === 403) {
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（HTTP ${hit.status}），后续卡片改用 DAPI 通道`);
                    }
                    return false;
                }
                if (hit.status === 503) return false;
                if (String(hit.text || "").includes("404") || hit.status === 404) {
                    Utils.log("🟡", "Server Action ID 可能已更新，尝试动态探测...");
                    try {
                        ActionMap.clear();
                        const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                        nextAction = await this.getNextActionHash(earnHtml);
                        const retry = await this.postAction(
                            { url: pageUrl, headers: buildHeaders(), data: payload },
                            { savedKey: "Config.claimActionVariant" }
                        );
                        if (retry.ok) {
                            this._webCompleteCache = null;
                            return true;
                        }
                    } catch (_) {}
                }
            } catch (e2) {

                Utils.log("🔬", `交卷异常(${String(card.offerId).slice(0, 36)})：`
                    + `ua=${useAppUA ? "app" : "pc"} dpl=${dpl || "无"} kind=${card.kind || "-"} `
                    + `err=${e2.message}`);

                if (/HTTP 503/.test(String(e2.message))) {
                    return false;
                }
                if (/\b(401|403)\b/.test(String(e2.message))) {
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（${e2.message}），后续卡片改用 DAPI 通道`);
                    }
                    return false;
                }
                if (e2.message.includes("404")) {
                    Utils.log("🟡", "Server Action ID 可能已更新，尝试动态探测...");
                    try {
                        ActionMap.clear();
                        const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                        nextAction = await this.getNextActionHash(earnHtml);
                        const retryRes = await Utils.xhr({ method: "POST", url: pageUrl, headers: buildHeaders(), data: payload });
                        if (retryRes) return true;
                    } catch (_) {}
                }
            }

            if (card.destination && card.destination.startsWith("http")) {
                try {
                    await this.reportDailyActivity(card.destination);
                    return true;
                } catch (_) {}
            }

            try {
                const token = await this.getRewardsToken();
                if (token) {
                    await Utils.xhr({
                        method: "POST",
                        url: "https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest",
                        headers: {
                            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "user-agent": RewardsAuto.ua.pc,
                            "referer": referer,
                            "origin": "https://rewards.bing.com",
                            "x-requested-with": "XMLHttpRequest"
                        },
                        data: new URLSearchParams({
                            id: card.offerId, hash: card.hash, timeZone: 480,
                            activityAmount: 1, dbs: 0, form: "", type: "",
                            __RequestVerificationToken: token
                        }).toString()
                    });
                    return true;
                }
            } catch (_) {}

            Utils.log("🟡", `卡片领取未确认(${card.offerId})`);
            return false;
        },

        async _claimViaAppChannel(card, { diag = [], name = "" } = {}) {
            const label = name || card.title || card.offerId;
            if (!card.hash) {
                diag.push("app(无hash)");
                return false;
            }
            try {
                const accepted = await this.claimCardWeb(card, { appChannel: true });
                if (!accepted) {
                    diag.push("app(请求未被接受)");
                    return false;
                }
                diag.push("app(已交卷)");
                await Utils.randomDelay(2000, 4000);
                if (await this.isOfferCompleteAny(card.offerId, true) === true) {
                    Utils.log("🟢", `应用通道领取成功：${label}`);
                    return true;
                }
                Utils.log("🟡", `应用通道已交卷，等待服务端记账：${label}`);
                return false;
            } catch (e) {
                diag.push(`app(${e.message})`);
                Utils.log("🟡", `应用通道交卷失败（${label}）：${e.message}`);
                return false;
            }
        },

        extractIG(html) {
            if (!html) return "";
            const patterns = [
                /IG:"([0-9A-F]{16,40})"/i,
                /"IG"\s*:\s*"([0-9A-F]{16,40})"/i,
                /[?&]IG=([0-9A-F]{16,40})/i,
            ];
            for (const re of patterns) {
                const m = html.match(re);
                if (m && m[1]) return m[1].toUpperCase();
            }
            return "";
        },

        async getSearchPage(query, isMobile = false) {
            const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
            const deviceType = isMobile ? "m" : "d";
            return Utils.xhr({
                url: `https://${RewardsAuto.state.host}/search?q=${encodeURIComponent(query)}&form=QBLH${mkt}`,
                headers: {
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    "cookie": `_Rwho=u=${deviceType}&ts=${RewardsAuto.state.dateNowStr}`,
                    "referer": `https://${RewardsAuto.state.host}/?form=QBLH`,
                    "cache-control": "no-cache",
                    "pragma": "no-cache"
                }
            });
        },

        async reportSearch(html, query, isMobile = false) {
            try {
                const ig = this.extractIG(html) || Utils.getRandomUUID();
                const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
                const params = `q=${encodeURIComponent(query)}&form=QBLH${mkt}`;
                const deviceType = isMobile ? "m" : "d";
                const headers = {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    "referer": `https://${RewardsAuto.state.host}/?form=QBLH`,
                    "cookie": `_Rwho=u=${deviceType}&ts=${RewardsAuto.state.dateNowStr}`
                };
                await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=${ig}&ajaxreq=1`,
                    headers, data: "wb=1%3bi%3d1%3bv%3d1"
                });
                await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/reportActivity?IG=${ig}&IID=SERP.5047&${params}&ajaxreq=1`,
                    headers,
                    data: `url=${encodeURIComponent(`https://${RewardsAuto.state.host}/search?${params}`)}&V=web`
                });
                return true;
            } catch (e) {
                Utils.log("🟡", `搜索上报失败: ${e.message}`);
                return false;
            }
        },

        async checkRegion() {
            if (!RegionGuard.enabled()) return true;
            const v = await RegionGuard.check({ fresh: true });
            if (v.ok) return true;
            if (!v.ipInfo) await this.getIPInfo();
            return false;
        },

        async getIPInfo() {
            try {
                const qryResult = await Utils.xhr({
                    url: "https://disp-qryapi.3g.qq.com/v1/dispatch",
                    headers: { "referer": "https://3g.qq.com/" }
                });
                if (qryResult && Utils.isJSON(qryResult)) {
                    const resJSON = JSON.parse(qryResult);
                    RewardsAuto.state.ip = (resJSON.code == 0 && resJSON.extra && resJSON.extra.ip) ? resJSON.extra.ip : "";
                    let rawInfo = (resJSON.code == 0 && resJSON.ipInfo) ? String(resJSON.ipInfo) : "";
                    rawInfo = rawInfo.replace(/[#*]+/g, " ").trim();
                    RewardsAuto.state.ipInfo = rawInfo ? `🌏所在地区：${rawInfo}` : "";
                }
            } catch {
                console.debug("获取附加 IP 信息失败");
            }
        },

        async getHotSearchWord() {
            const keywords = ["天气预报", "今日新闻", "体育赛事", "股票行情", "电影推荐", "科技资讯", "美食食谱", "旅游攻略", "历史上的今天", "健康常识"];
            const baseWord = keywords[Utils.randomRange(0, keywords.length - 1)];
            const randomSuffix = Math.random().toString(36).slice(2, 6);
            let sentence = `${baseWord} ${randomSuffix}`;
            if (RewardsAuto.apiConfig.mode !== "offline") {
                if (RewardsAuto.apiConfig.wordIndex < 1 || RewardsAuto.apiConfig.wordList.length < 1) {
                    const apiArr = RewardsAuto.apiConfig.arr;
                    const lastApiIndex = parseInt(GM_getValue("Config.apiIndex", -1));
                    const filteredArr = apiArr.filter((_, index) => index !== lastApiIndex);
                    const randomIndex = Utils.randomRange(0, filteredArr.length - 1);
                    GM_setValue("Config.apiIndex", randomIndex);
                    const [apiName, apiConfig] = filteredArr[randomIndex];
                    RewardsAuto.apiConfig.url = apiConfig.url;
                    RewardsAuto.apiConfig.hot = apiConfig.hot;
                    try {
                        const hotSource = RewardsAuto.apiConfig.hot[Utils.randomRange(0, RewardsAuto.apiConfig.hot.length - 1)];
                        const result = await Utils.xhr({ url: RewardsAuto.apiConfig.url + hotSource });
                        if (result && Utils.isJSON(result)) {
                            const res = JSON.parse(result);
                            if (res.code == 200) {
                                RewardsAuto.apiConfig.wordIndex = 1;
                                RewardsAuto.apiConfig.wordList = [];
                                for (let i = 0; i < res.data.length; i++) {
                                    RewardsAuto.apiConfig.wordList.push(res.data[i].title);
                                }
                                RewardsAuto.apiConfig.wordList.sort(() => Math.random() - 0.5);
                                sentence = RewardsAuto.apiConfig.wordList[RewardsAuto.apiConfig.wordIndex];
                                sentence = sentence.substring(0, Utils.randomRange(20, 32));
                                return sentence;
                            }
                        }
                    } catch (e) {
                        Utils.log("🟡", `热搜词获取失败: ${e.message}`);
                    }
                } else {
                    RewardsAuto.apiConfig.wordIndex++;
                    if (RewardsAuto.apiConfig.wordIndex > RewardsAuto.apiConfig.wordList.length - 1) {
                        RewardsAuto.apiConfig.wordIndex = 0;
                    }
                    sentence = RewardsAuto.apiConfig.wordList[RewardsAuto.apiConfig.wordIndex];
                    sentence = sentence.substring(0, Utils.randomRange(20, 32));
                    return sentence;
                }
                Utils.log("🟡", "热搜词接口异常，已使用随机搜索词");
            }
            return sentence;
        },

        async checkSearchRestricted() {
            const info = await this.getRewardsInfo();
            const currentTotal = info ? info.pc.progress : RewardsAuto.state.pcProgress;
            const lastTotal = RewardsAuto.state.lastSearchProgress;
            if (lastTotal !== -1) {
                if (currentTotal === lastTotal && currentTotal < RewardsAuto.state.pcMax) {
                    RewardsAuto.state.restrictedTimes++;
                } else {
                    RewardsAuto.state.restrictedTimes = 0;
                }
            }
            RewardsAuto.state.lastSearchProgress = currentTotal;
            GM_setValue("Config.lastSearchProgress", currentTotal);
            GM_setValue("Config.restrictedTimes", RewardsAuto.state.restrictedTimes);
            if (RewardsAuto.state.restrictedTimes >= 3) {
                Utils.logOnce("🔴", "搜索受限或账号异常，已中断今日搜索！", "searchRestricted", 6 * 60 * 60 * 1000);
                return true;
            }
            return false;
        }
    };

    const EdgeStreak = {
        _running: false,

        state() {
            const raw = GM_getValue("Config.edge", null);
            const st = (raw && typeof raw === "object") ? raw : {};
            const today = Utils.getTodayNum();
            const base = {
                date: today, count: 0, last: 0, complete: false, activated: false,
                notified: false, extra: 0, total: 0, intervalMin: 5, offerid: "", type: "714", sync: 0,
                giveUp: false
            };
            if (st.date !== today) return base;
            return {
                ...base,
                count: Number(st.count) || 0,
                last: Number(st.last) || 0,
                complete: !!st.complete,
                activated: !!st.activated,
                notified: !!st.notified,
                extra: Number(st.extra) || 0,
                total: Number(st.total) || 0,
                intervalMin: Number(st.intervalMin) || 5,
                offerid: String(st.offerid || ""),
                type: String(st.type || "714"),
                sync: Number(st.sync) || 0,
                giveUp: !!st.giveUp,
            };
        },

        save(st) {
            GM_setValue("Config.edge", st);
        },

        intervalOf(attr) {
            const n = Number(attr && attr.report_per_minutes);
            return (Number.isFinite(n) && n >= 1 && n <= 30) ? n : 5;
        },

        typeOf(attr) {
            const t = String((attr && attr.report_offer_type) || "").trim();
            return /^\d+$/.test(t) ? t : "714";
        },

        findPromotion(profile) {
            const list = (profile && Array.isArray(profile.promotions)) ? profile.promotions : [];
            if (list.length === 0) return null;
            const exact = list.find(p => p && p.name === EDGE.PROMO_NAME);
            if (exact) return exact;
            const variant = list.find(p => p && EDGE.PROMO_PREFIX.test(String(p.name || "")));
            if (variant) return variant;
            return list.find(p => p && p.attributes
                && /edge/i.test(String(p.name || ""))
                && !!(p.attributes.offerid && p.attributes.report_offer_type)) || null;
        },

        notifyDone(st) {
            if (st.notified) return;
            st.notified = true;
            this.save(st);
            Utils.log("🌐", `Edge 浏览连签任务已完成！（今日 ${EDGE.TARGET_MINUTES} 分钟浏览已记账）`);
        },

        async step() {
            const st = this.state();
            const totalOf = () => st.total || Math.ceil(EDGE.TARGET_MINUTES / Math.max(1, st.intervalMin));

            if (st.giveUp) {
                return { done: false, skipped: true, count: st.count, total: totalOf(), waitMs: 6 * 60 * 60 * 1000 };
            }
            if (st.complete && Date.now() - st.sync < 2 * 60 * 60 * 1000) {
                return { done: true, count: st.count || totalOf(), total: totalOf(), waitMs: 30 * 60 * 1000 };
            }
            if (!st.complete && st.count > 0 && st.last && Date.now() - st.last < st.intervalMin * 60 * 1000) {
                return {
                    done: false, count: st.count, total: totalOf(),
                    waitMs: st.last + st.intervalMin * 60 * 1000 - Date.now()
                };
            }
            if (!RewardsAuto.state.token) {
                const ok = await API.renewToken();
                if (!ok || !RewardsAuto.state.token) {
                    Utils.log("🟡", "Edge 浏览连签：暂无可用 Token，跳过（先完成授权）");
                    return { done: false, count: st.count, total: totalOf(), waitMs: 5 * 60 * 1000 };
                }
            }
            const region = API.edgeRegion();
            let profile = await API.getEdgeProfile(region);
            if (!profile) return { done: false, count: st.count, total: totalOf(), waitMs: 5 * 60 * 1000 };
            let promo = this.findPromotion(profile);

            if (!promo && !st.activated) {
                st.activated = true;
                this.save(st);
                const res = await API.activateEdgeBrowsing();
                if (res === "absent") {
                    st.giveUp = true;
                    this.save(st);
                    Utils.log("🟡", "Edge 浏览连签：当前账号没有这个活动（地区/账号不支持），今日跳过");
                    return { done: false, skipped: true, count: st.count, total: totalOf(), waitMs: 6 * 60 * 60 * 1000 };
                }
                Utils.log(res === "already" ? "🟢" : "🟡",
                    `Edge 浏览连签：活动${res === "activated" ? "已激活" : res === "already" ? "此前已激活" : "激活失败"}（${res}）`);
                await Utils.delay(Utils.randomRange(3000, 6000));
                profile = await API.getEdgeProfile(region);
                promo = profile ? this.findPromotion(profile) : null;
            }
            if (!promo) {
                Utils.log("🟡", "Edge 浏览连签：暂未找到活动项，可先在 Edge 里打开 rewards.bing.com/earn?section=streaks 手动开启");
                return { done: false, count: st.count, total: totalOf(), waitMs: 60 * 60 * 1000 };
            }

            const attr = promo.attributes || {};
            st.intervalMin = this.intervalOf(attr);
            st.total = Math.ceil(EDGE.TARGET_MINUTES / st.intervalMin);
            st.offerid = String(attr.offerid || "").trim();
            st.type = this.typeOf(attr);
            const total = st.total;

            if (String(attr.complete).toLowerCase() === "true") {
                st.complete = true;
                st.sync = Date.now();
                st.count = total;
                this.save(st);
                this.notifyDone(st);
                return { done: true, count: total, total, waitMs: 30 * 60 * 1000 };
            }
            if (st.complete) {
                Utils.log("🟡", "Edge 浏览连签：本地标记已完成但服务端未确认，重新累计");
                st.complete = false; st.count = 0; st.last = 0; st.extra = 0; st.notified = false;
                this.save(st);
            }
            if (!st.offerid) {
                st.giveUp = true;
                this.save(st);
                Utils.log("🟡", "Edge 浏览连签：活动项缺少 offerid，无法上报，今日跳过");
                return { done: false, skipped: true, count: st.count, total, waitMs: 6 * 60 * 60 * 1000 };
            }
            if (st.count >= total) {
                if (Date.now() - st.last < 10 * 60 * 1000) {
                    return { done: false, count: st.count, total, waitMs: 10 * 60 * 1000 };
                }
                if (st.extra >= EDGE.MAX_EXTRA_ROUNDS) {
                    st.giveUp = true;
                    this.save(st);
                    Utils.log("🟡", `Edge 浏览连签：已上报 ${st.count}/${total} 次仍未确认完成，今日暂停（明日自动重试）`);
                    return { done: false, skipped: true, count: st.count, total, waitMs: 6 * 60 * 60 * 1000 };
                }
                st.extra++;
                st.count = 0;
                st.last = 0;
                this.save(st);
                Utils.log("🟡", `Edge 浏览连签：服务端未确认完成，第 ${st.extra}/${EDGE.MAX_EXTRA_ROUNDS} 轮重新累计`);
                return { done: false, count: 0, total, waitMs: 0 };
            }

            const res = await API.reportEdgeActivity({ offerid: st.offerid, type: st.type, region });
            const code = (res && typeof res.code === "number") ? res.code : -1;
            if (code !== 0) {
                Utils.log("🟡", `Edge 浏览连签：第 ${Math.min(st.count + 1, total)}/${total} 次上报失败（code=${code}），稍后重试`);
                return { done: false, count: st.count, total, waitMs: 5 * 60 * 1000 };
            }
            const dup = !!(res.response && res.response.isDuplicate === true);
            st.last = Date.now();
            st.sync = Date.now();
            if (!dup) st.count = Math.min(st.count + 1, total);
            this.save(st);
            Utils.log(dup ? "🟡" : "🟢",
                `Edge 浏览连签：第 ${st.count}/${total} 次上报${dup ? "（被判重，未记账）" : "已记账"}`);

            await Utils.delay(Utils.randomRange(2000, 4000));
            const after = await API.getEdgeProfile(region);
            const afterPromo = after ? this.findPromotion(after) : null;
            if (afterPromo && String((afterPromo.attributes || {}).complete).toLowerCase() === "true") {
                st.complete = true;
                st.sync = Date.now();
                st.count = total;
                this.save(st);
                this.notifyDone(st);
                return { done: true, count: total, total, waitMs: 30 * 60 * 1000 };
            }
            return {
                done: false, count: st.count, total,
                waitMs: dup ? Math.max(60 * 1000, st.intervalMin * 60 * 1000) : st.intervalMin * 60 * 1000
            };
        },

        async run() {
            if (!GM_getValue("Tasks.edge", true)) return null;
            if (!GM_getValue("Config.token", false)) return null;
            if (this._running) return null;
            if (!Utils.acquireLock("Config.edgeLock", 3 * 60 * 1000)) return null;
            this._running = true;
            try {
                return await this.step();
            } catch (e) {
                Utils.log("🟡", `Edge 浏览连签异常: ${e.message}`);
                return null;
            } finally {
                this._running = false;
                Utils.releaseLock("Config.edgeLock");
            }
        },

        summary() {
            if (!GM_getValue("Tasks.edge", true)) return null;
            const st = this.state();
            const total = st.total || Math.ceil(EDGE.TARGET_MINUTES / Math.max(1, st.intervalMin));
            const count = Math.min(st.count, total);
            return { done: st.complete, skipped: st.giveUp && !st.complete, count, total, text: `${count}/${total}` };
        }
    };

    const EDGE_PACE_TICK = 30 * 1000;

    const EdgePacer = {
        busy: false,
        nextAt: 0,

        async maybeReport() {
            if (this.busy) return null;
            if (Date.now() < this.nextAt) return null;
            if (!(await RegionGuard.allow())) {
                this.nextAt = Date.now() + 5 * 60 * 1000;
                return null;
            }
            this.busy = true;
            try {
                const r = await EdgeStreak.run();
                if (!r) {
                    this.nextAt = Date.now() + 5 * 60 * 1000;
                } else {
                    const wait = r.done ? 30 * 60 * 1000 : (r.waitMs || 0);
                    this.nextAt = Date.now() + Math.max(EDGE_PACE_TICK, wait);
                }
                return r;
            } catch (_) {
                this.nextAt = Date.now() + 5 * 60 * 1000;
                return null;
            } finally {
                this.busy = false;
            }
        }
    };

    const ROUND_BUDGET_MS = 20 * 60 * 1000;

    const SEARCH_PACER = {
        /* 节拍口径：以 Config.span（默认 30 秒）为基准，每次在 ±JITTER_MS 范围内
           随机取一个值，做完一次搜索后按「本次已用掉多少」补齐差额，
           使「搜索→搜索」的间隔稳定落在 span±10 秒。

           早期版本是「没记账就退让」：×1.5 一路涨到 180 秒，再叠 35% 抖动和
           每 5 次 20~60 秒惩罚，单次最坏 303 秒；后来压到 ×1.2 / 100 秒封顶，
           但行为没变 —— 一次比一次大。这跟「我配了 30 秒就该是 30 秒」的预期
           相悖，所以退让机制整个去掉：间隔恒等于配置值，只保留随机抖动。
           限流保护不再靠拖慢，而是靠下面两条刹车：
             NO_CREDIT_LIMIT（连续 10 分钟没记账就本轮收手）
             MAX_ATTEMPTS（单轮最多尝试次数） */
        MIN_MS: 30 * 1000,
        JITTER_MS: 10 * 1000,
        OBSERVE_MIN: 5 * 1000,
        OBSERVE_MAX: 10 * 1000,
        VERIFY_MIN: 5 * 1000,
        VERIFY_MAX: 9 * 1000,
        MAX_ATTEMPTS: 60,
        NO_CREDIT_LIMIT: 10 * 60 * 1000,
        MIN_ATTEMPTS_BEFORE_GIVEUP: 8,
        RETRY_GAP: 5 * 60 * 1000,

        /* 用户配置的间隔基准。上限留 180 秒（与 Config.span 的 max 一致），
           下限 MIN_MS（30 秒）—— 再快会明显增加被限流的概率。 */
        spanMs() {
            const span = Number(GM_getValue("Config.span", 30)) || 30;
            return Math.min(180 * 1000, Math.max(this.MIN_MS, Math.max(30, span) * 1000));
        },

        minMs() { return this.spanMs(); },

        startGap() { return this.minMs(); },

        /* 兼容旧调用点：现在没有退让，上限就等于基准值。 */
        maxMs() { return this.spanMs(); },

        /* 对称抖动：span ± JITTER_MS，两侧都不是单向放大。 */
        jitter(ms) {
            const base = Number(ms) || this.minMs();
            const delta = (Math.random() * 2 - 1) * this.JITTER_MS;
            return Math.max(5 * 1000, Math.round((base + delta) / 1000) * 1000);
        },

        /* 不再退让：无论上一轮是否记账，下一次都用同一个基准间隔。
           保留 (gap, progressed) 形参是为了不改所有调用点。 */
        nextGap(gap, progressed) {
            return this.startGap();
        },

        async beat(gap) {
            await Utils.delay(this.jitter(gap));
        },

        fits(deadline, gap) {
            const d = Number(deadline) || 0;
            if (d <= 0) return true;
            /* 预留「最大抖动 + 5 秒余量」：抖动改成正负绝对值后，
               不能再按百分比（gap × 1.35）估，否则小间隔时预留不足。 */
            return Date.now() + Math.round((Number(gap) || 0) + this.JITTER_MS + 5000) <= d;
        },
        saveGap(ms) {
            GM_setValue("Config.searchGap", { date: Utils.getTodayNum(), ms: Math.round(ms) });
        },
        loadGapPeak() {
            const saved = GM_getValue("Config.searchGap", null);
            if (!saved || typeof saved !== "object" || saved.date !== Utils.getTodayNum()) return 0;
            const ms = Number(saved.ms) || 0;
            return (ms <= 0 || ms > this.maxMs()) ? 0 : ms;
        },
        setLast(stat) {
            GM_setValue("Config.searchLast", stat ? { date: Utils.getTodayNum(), ...stat } : null);
        },
        getLast() {
            const l = GM_getValue("Config.searchLast", null);
            if (!l || typeof l !== "object" || l.date !== Utils.getTodayNum()) return null;
            return { attempts: Number(l.attempts) || 0, credits: Number(l.credits) || 0, peak: Number(l.peak) || 0, at: Number(l.at) || 0 };
        },
        setPending(v) {
            GM_setValue("Config.searchPending", v ? { date: Utils.getTodayNum() } : null);
        },
        isPending() {
            const p = GM_getValue("Config.searchPending", null);
            return !!(p && typeof p === "object" && p.date === Utils.getTodayNum());
        },
        summary() {
            const min = Math.round(this.minMs() / 1000);
            return {
                gap: min, min,
                peak: Math.round(this.loadGapPeak() / 1000),
                pending: this.isPending(),
                last: this.getLast()
            };
        }
    };

    try {
        if (Utils.hasDOM() && typeof location !== "undefined"
            && /(^|\.)rewards\.bing\.com$/i.test(String(location.hostname || ""))) {
            API.startPageServer();
            Utils.log("🖥️", `代发服务已启动（页面上下文：${location.hostname}）`);
        }
    } catch (_) {}

    const TaskManager = {
        signDate: 0, readDate: 0, promosDate: 0, searchDate: 0, streakDays: 0,
        signPoint: -1, signTimes: 0, readTimes: 0, promosTimes: 0,
        claimSummary: "",
        claimReason: "",
        running: false, runningSince: 0,
        abortRound: false, hbTimer: null, roundSeq: 0, roundId: 0, lastRunStarted: false,

        /* 心跳：证明「这个上下文还活着」，同时给运行锁续期。
           注意只写 aliveAt（存活时间），不写 at（最后进展时间）——
           at 由真正的任务推进刷新，两个时间分开才能区分
           「活着但卡在某个请求上」和「已经彻底断开」。 */
        heartbeat() {
            if (!this.running) return false;
            /* 只允许「当前这一轮」动状态：被强制收尾后，旧轮的 promise 链
               还可能继续往下走，它的心跳不能把新一轮的标记覆盖掉。 */
            if (this.roundId !== this.roundSeq) return false;
            const now = Date.now();
            if (now - (this.runningSince || now) > ROUND_HARD_LIMIT) {
                const msg = this.abortRound
                    ? ""
                    : `本轮已超过硬上限 ${Math.round(ROUND_HARD_LIMIT / 60000)} 分钟没有收尾，强制释放运行标记（下一轮重新开始）`;
                this.forceCleanupOwnRound(msg);
                return false;
            }
            /* 上下文还活着但任务长时间没有推进：同样要收尾。
               MV3 后台被冻结时 setInterval 会跟着停，这种情况心跳本身就是死的；
               而「心跳活着、at 不动」是卡在永不 settle 的 await 上，必须主动打断。 */
            const st = Sched.getState() || {};
            const lastProgress = Math.max(Number(st.at) || 0, Number(st.since) || 0, this.runningSince || 0);
            if (now - lastProgress > ROUND_STALL) {
                if (!this.abortRound) {
                    Utils.log("🔴", `本轮已经 ${Math.round((now - lastProgress) / 60000)} 分钟没有任何进展（多半卡在一个不会返回的请求上），强制收尾并交给下一轮`);
                }
                this.forceCleanupOwnRound("");
                return false;
            }
            GM_setValue("Config.runState", Object.assign({}, st, {
                phase: "running",
                aliveAt: now,
                ctx: Sched.ctxName(),
                since: this.runningSince
            }));
            Utils.refreshLock("Config.runLock", RUN_LOCK_TTL);
            return true;
        },

        startHeartbeat() {
            this.stopHeartbeat();
            this.heartbeat();
            this.hbTimer = setInterval(() => {
                try { this.heartbeat(); } catch (_) {}
            }, RUN_HEARTBEAT_GAP);
        },

        stopHeartbeat() {
            if (this.hbTimer) {
                clearInterval(this.hbTimer);
                this.hbTimer = null;
            }
        },

        /* 强制收尾：只放掉「确实是自己」的锁。
           如果锁已经被别的上下文接手，那这里清掉会把别人正在跑的一轮搞坏。 */
        forceCleanupOwnRound(reason) {
            this.abortRound = true;
            this.stopHeartbeat();
            this.running = false;
            this.runningSince = 0;
            /* 换一代，旧轮后续的心跳/收尾都不再被认为属于当前这一轮 */
            this.roundSeq++;
            this.roundId = this.roundSeq;
            const lock = Utils.lockInfo("Config.runLock");
            if (!lock || lock.mine) GM_setValue("Config.runLock", null);
            try { Sched.state("done"); } catch (_) {}
            try { Sched.clearClaim(); } catch (_) {}
            if (reason) Utils.log("🔴", reason);
        },

        /* 到点或被强制收尾后，长循环要尽快退出，别再往微软发请求 */
        aborted() { return !!this.abortRound; },
        ensureAlive() {
            const err = msg => {
                const e = new Error(msg);
                e.roundAborted = true;
                return e;
            };
            if (this.abortRound) throw err("本轮已超时收尾");
            /* 已经换代 = 这一轮被强制收尾过，旧链不该再往下跑 */
            if (this.roundId !== this.roundSeq) throw err("本轮已被新的轮次取代");
            /* 锁被别人拿走了（另一个上下文接手）也要停手，避免并发重复上报 */
            const info = Utils.lockInfo("Config.runLock");
            if (info && !info.mine) throw err("运行锁已被其它上下文接管");
            Utils.refreshLock("Config.runLock", RUN_LOCK_TTL);
        },

        /* 长循环里的进度打点：既证明「还活着」，也证明「还在动」。
           每处理完一张卡/一篇文章调一次，卡死检测就不会误伤正常的长任务。 */
        tick() {
            this.ensureAlive();
            try { Sched.progress(); } catch (_) {}
        },

        init() {
            RewardsAuto.state.dateNowNum = Utils.getTodayNum();
            RewardsAuto.state.dateNowStr = Utils.getTodayStr();
            const tasks = GM_getValue("Config.tasks", {});
            this.signDate = tasks.sign || 0;
            this.readDate = tasks.read || 0;
            this.promosDate = tasks.promos || 0;
            this.searchDate = tasks.search || 0;
            this.streakDays = tasks.streakDays || 0;
            this.signPoint = GM_getValue("Config.signPoint", -1);
            this.claimSummary = "";
            this.claimReason = "";
        },

        save() {
            GM_setValue("Config.tasks", {
                sign: this.signDate, read: this.readDate,
                promos: this.promosDate, search: this.searchDate,
                streakDays: this.streakDays
            });
        },

        async doSign() {
            if (!GM_getValue("Tasks.sign", true) || this.signTimes > 2) return;
            if (this.signPoint >= 0 && this.signDate === RewardsAuto.state.dateNowNum) {
                Utils.log("✅", `签入已完成(${this.signPoint}积分)`);
                return;
            }
            await RegionGuard.guard("签入");
            await Utils.randomDelay();
            let totalPoint = 0;
            let signOk = false;
            const appPoint = await API.signApp();
            if (appPoint >= 0) {
                signOk = true;
                if (appPoint > 0) {
                    GM_log(`📱 App签入静默成功 +${appPoint}积分`);
                    totalPoint += appPoint;
                } else {
                    GM_log("📱 App签入已确认，无新增积分");
                }
            }
            await Utils.randomDelay(3000, 8000);
            const pcPoint = await API.signPC();
            if (pcPoint >= 0) {
                signOk = true;
                Utils.log("💻", `PC签入成功！+${pcPoint}积分`);
                totalPoint += pcPoint;
            }
            if (signOk) {
                this.signPoint = totalPoint;
                this.signDate = RewardsAuto.state.dateNowNum;
                GM_setValue("Config.signPoint", totalPoint);
                this.save();
                Utils.log("🔵", `签入任务完成！总积分 +${totalPoint}`);
            } else {
                this.signTimes++;
                Utils.log("🟡", `签入失败，稍后重试`);
            }
        },

        async doRead(roundDeadline) {
            if (!GM_getValue("Tasks.read", true) || this.readTimes > 2) return;
            if (this.readDate === RewardsAuto.state.dateNowNum) {
                const verifyProgress = await API.getReadProgress();
                if (verifyProgress && verifyProgress.progress >= verifyProgress.max) {
                    Utils.log("✅", `阅读任务已完成（已验证 ${verifyProgress.progress}/${verifyProgress.max}）`);
                    return;
                } else if (verifyProgress) {
                    Utils.log("🟡", `阅读标记有误（${verifyProgress.progress}/${verifyProgress.max}），重置并继续`);
                    this.readDate = 0;
                    this.save();
                } else {
                    Utils.log("🟡", "无法验证阅读进度，跳过");
                    return;
                }
            }
            const progress = await this.readProgressWithRetry();
            if (!progress) {
                this.readTimes++;
                Utils.log("🟡", "无法获取阅读进度，稍后重试");
                return;
            }
            let cur = progress.progress;
            let max = progress.max;
            Utils.log("📖", `阅读进度: ${cur}/${max}`);
            if (cur >= max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                this.save();
                Utils.log("✅", "阅读任务已完成");
                return;
            }
            const pointsPerArticle = 3;
            const maxPerDay = 10;
            const target = Math.min(Math.max(Math.ceil((max - cur) / pointsPerArticle), 1), maxPerDay);
            Utils.log("📖", `今日还可阅读 ${target} 篇（上限 ${maxPerDay} 篇/天，每篇约 ${pointsPerArticle} 分）`);
            let gap = SEARCH_PACER.startGap();
            const readCap = Date.now() + 8 * 60 * 1000;
            const readDeadline = (Number(roundDeadline) || 0) > 0 ? Math.min(Number(roundDeadline), readCap) : readCap;
            let successCount = 0;
            let stagnant = 0;
            for (let i = 0; i < target; i++) {
                this.tick();
                if (!SEARCH_PACER.fits(readDeadline, gap)) {
                    Utils.log("🟡", `阅读到点交班，还剩 ${target - i} 篇交给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    break;
                }
                await SEARCH_PACER.beat(gap);
                await RegionGuard.guard("阅读");
                const result = await API.doRead();
                await Utils.randomDelay(3000, 8000);
                const after = await API.getReadProgress();
                let advanced = false;
                if (after) {
                    const gained = after.progress - cur;
                    max = after.max;
                    if (gained > 0) {
                        advanced = true;
                        successCount++;
                        stagnant = 0;
                        cur = after.progress;
                        Utils.log("📖", `阅读文章 ${i + 1}/${target} +${gained}积分（${cur}/${max}）`);
                    } else {
                        stagnant++;
                        Utils.log("🟡", `阅读文章 ${i + 1}/${target} 未计入进度（${after.progress}/${after.max}）`);
                    }
                } else if (result && result.points > 0) {
                    advanced = true;
                    successCount++;
                    stagnant = 0;
                    cur += result.points;
                    Utils.log("📖", `阅读文章 ${i + 1}/${target} +${result.points}积分（进度查询失败，按返回值统计）`);
                } else {
                    stagnant++;
                    if (!result) {
                        Utils.log("🟡", `阅读第 ${i + 1} 篇请求失败`);
                    } else {
                        Utils.log("🟡", `阅读第 ${i + 1} 篇无新增积分（返回 p:${result.points}，isDuplicate:${result.isDuplicate}）`);
                    }
                }
                gap = SEARCH_PACER.nextGap(gap, advanced);
                if (cur >= max) {
                    Utils.log("📖", `阅读进度已满（${cur}/${max}），提前结束`);
                    break;
                }
                if (stagnant >= 3) {
                    Utils.log("🟡", "连续 3 篇未计入进度，停止本轮阅读上报");
                    break;
                }
            }
            if (successCount === 0) {
                this.readTimes++;
                Utils.log("🟡", "本轮阅读未产生积分，稍后重试");
                return;
            }
            const verify = await API.getReadProgress();
            if (verify && verify.progress >= verify.max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                this.save();
                Utils.log("🔵", `阅读任务完成！共 ${successCount} 篇`);
            } else {
                this.readTimes++;
                Utils.log("🟡", `阅读已执行但未完成（${verify ? `${verify.progress}/${verify.max}` : "进度未知"}），下次继续`);
            }
        },

        async readProgressWithRetry(attempts = 3) {
            for (let i = 1; i <= attempts; i++) {
                const p = await API.getReadProgress();
                if (p) return p;
                if (i < attempts) {
                    Utils.log("🟡", `阅读进度读取失败，${i}/${attempts} 次重试`);
                    await Utils.delay(3210);
                }
            }
            return false;
        },

        async doDesktopWeekly() {
            if (!GM_getValue("Tasks.desktopWeekly", true)) return true;
            try {
                const weekly = await API.runDesktopWeeklyQuests();
                RewardsAuto.state.weeklyQuestDone = weekly.done || 0;
                RewardsAuto.state.weeklyQuestPending = weekly.pending || 0;
                RewardsAuto.state.weeklyQuestFailed = weekly.failed || 0;
                return true;
            } catch (e) {
                Utils.log("🟡", `桌面专属任务异常：${e && e.message ? e.message : e}`);
                return true;
            }
        },

        async doMonthlyPlan() {
            if (!GM_getValue("Tasks.monthly", true)) {
                RewardsAuto.state.monthlyComplete = false;
                RewardsAuto.state.monthlyFound = 0;
                RewardsAuto.state.monthlyPending = 0;
                return true;
            }
            try {
                const res = await API.runMonthlyPlan();
                RewardsAuto.state.monthlyFound = res.found || 0;
                RewardsAuto.state.monthlyDone = res.done || 0;
                RewardsAuto.state.monthlyTotal = res.total || 0;
                RewardsAuto.state.monthlyPending = res.pending || 0;
                RewardsAuto.state.monthlyComplete = !!res.complete;
                return true;
            } catch (e) {
                Utils.log("🟡", `月度计划异常：${e && e.message ? e.message : e}`);
                return true;
            }
        },

        async doPromos(roundDeadline) {
            if (!GM_getValue("Tasks.promos", true) || this.promosTimes > 2) return true;
            if (this.promosDate === RewardsAuto.state.dateNowNum) {
                Utils.log("✅", "活动卡片已完成");
                return true;
            }
            Utils.log("🧩", "扫描活动卡片...");
            try { await API.getCookieHeader(); } catch (_) {}
            const cards = await API.discoverCards();

            try {
                const ck = await Utils.loginCookies();
                if (ck === null) {
                } else if (!ck.hasSession) {
                    Utils.log("🟡", "Cookie 里没有 Bing 登录标识（MUID=" + ck.hasMuid + "）："
                        + (ck.names.slice(0, 6).join(",") || "空") + "；网页通道可能不记账");
                }
            } catch (_) {}
            if (cards.length === 0) {
                Utils.log("✅", "未发现待处理活动卡片");
                this.promosDate = RewardsAuto.state.dateNowNum;
                this.save();
                return true;
            }
            Utils.log("🧩", `发现 ${cards.length} 个卡片`);

            try {
                const cdp = await CDP.claimAll(6);
                if (cdp.ok && cdp.handled > 0) {
                    Utils.log("🖱️", "CDP 真实点击完成 " + cdp.handled + " 张（当前 " + cdp.done + "/" + cdp.total + " 已完成）");
                } else if (cdp.ok) {
                    Utils.log("🖱️", "CDP 已连接，但没有待处理的应用搜索卡（" + cdp.done + "/" + cdp.total + "）");
                } else {
                    Utils.log("🔴", "CDP 不可用（" + cdp.reason + "）：应用内搜索型卡本轮跳过，详见上方提示");
                }
            } catch (e) {
                Utils.log("🔴", "CDP 异常：" + e.message);
            }

            const shouldSkip = (card) => card.kind === "quiz" && !GM_getValue("Tasks.quiz", true);
            let ok = 0, fail = 0;
            let gap = SEARCH_PACER.startGap();
            let outOfTime = false;
            for (const card of cards) {
                await RegionGuard.guard("活动卡片");
                this.tick();
                Utils.log("  ", `[${card.kind}] ${card.title} +${card.points}p`);
                if (shouldSkip(card)) continue;
                if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                    Utils.log("🟡", `卡片到点交班，剩下的 ${cards.length} 张里有未处理的留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    outOfTime = true;
                    break;
                }
                await SEARCH_PACER.beat(gap);
                const result = await API.claimCard(card, { attempts: 2 });
                result ? ok++ : fail++;
                gap = SEARCH_PACER.nextGap(gap, !!result);
            }
            let pending = 0;
            let lockedNow = 0;
            try {
                const map = await API.getPromotionMap(true);
                if (map) {
                    for (const c of cards) {
                        if (shouldSkip(c) || !map.has(c.offerId)) continue;
                        const item = map.get(c.offerId);
                        if (item.complete) continue;
                        if (CardLock.claimable(item) && !API.isUnoffered(c.offerId) && !API.isManualCard(c.offerId)) pending++;
                        else lockedNow++;
                    }
                }
            } catch (_) {}
            if (pending === 0) {
                this.promosDate = RewardsAuto.state.dateNowNum;
                this.save();
            }
            const manualCards = (RewardsAuto.state.manualCards || []);
            if (manualCards.length > 0) {
                Utils.log("🖐️", "以下 " + manualCards.length + " 张卡已自动上报搜索，请在 earn 页手动点一次："
                    + manualCards.map(m => m.name).join("、"), true);
            }
            if (lockedNow > 0) {
                Utils.log("🔒", `另有 ${lockedNow} 张卡片处于锁定状态，不计入剩余量（满足条件后会自动重试）`);
            }
            Utils.log(pending === 0 ? "🔵" : "🟡",
                `活动完成: ${ok}成功/${fail}失败${pending > 0 ? `，仍剩 ${pending} 张未完成` : ""}（服务端已确认）${outOfTime ? "；本轮到点，剩余卡片下一轮继续" : ""}`,
                pending === 0 && ok > 0);
            return pending === 0;
        },

        async doSearch(roundDeadline) {
            if (!GM_getValue("Tasks.search", true)) return;
            const info = await API.getRewardsInfo();
            if (!info) { Utils.log("🔴", "无法获取积分信息"); return; }
            let progress = info.pc.progress;
            let max = info.pc.max;
            RewardsAuto.state.pcProgress = progress;
            RewardsAuto.state.pcMax = max;
            Utils.log("🔍", `搜索配额: PC ${progress}/${max}`);

            const markDone = () => {
                this.searchDate = RewardsAuto.state.dateNowNum;
                this.save();
                SEARCH_PACER.setPending(false);
                RewardsAuto.state.restrictedTimes = 0;
                GM_setValue("Config.restrictedTimes", 0);
                GM_setValue("Config.lastSearchProgress", -1);
            };

            if (progress >= max) {
                markDone();
                Utils.log("✅", `搜索配额已满 PC: ${progress}/${max}`);
                return;
            }
            if (this.searchDate === RewardsAuto.state.dateNowNum) {
                Utils.log("🟡", "搜索配额未满，继续执行搜索任务");
                this.searchDate = 0;
            }
            if (await API.checkSearchRestricted()) {
                this.searchDate = RewardsAuto.state.dateNowNum;
                this.save();
                SEARCH_PACER.setPending(false);
                return;
            }

            const budgetMin = 20;
            const startedAt = Date.now();
            const budgetDeadline = startedAt + budgetMin * 60 * 1000;
            const roundLimit = Number(roundDeadline) || 0;
            const softDeadline = roundLimit > 0 ? Math.min(budgetDeadline, roundLimit) : budgetDeadline;
            const hardDeadline = softDeadline;
            const deadlineMin = Math.max(0, Math.round((softDeadline - startedAt) / 60000));
            let gap = SEARCH_PACER.startGap();
            /* 固定节拍：gap 全程不变，这里只记录实际观测到的最大间隔，用于日志自证。 */
            let peakGap = gap;
            let lastStart = 0;
            const needed = Math.max(1, Math.ceil((max - progress) / 3));
            const attemptCap = Math.min(SEARCH_PACER.MAX_ATTEMPTS, Math.max(12, needed * 2));
            let attempts = 0, credits = 0, sinceCredit = 0, verifyFails = 0;
            let lastCreditAt = startedAt;
            const usedQueries = new Set();
            const pickPoolWord = () => RewardsAuto.searchPool[Utils.randomRange(0, RewardsAuto.searchPool.length - 1)];

            Utils.log("🔍", `单轮搜索最多 ${deadlineMin} 分钟（到点交班，未满的配额下一轮提前续做），固定间隔 ${Math.round(gap / 1000)}±${SEARCH_PACER.JITTER_MS / 1000} 秒，还差 ${Math.max(0, max - progress)} 分（约 ${needed} 次搜索）`);

            while (attempts < attemptCap && Date.now() < hardDeadline) {
                /* 每轮搜索前确认这一轮还活着（超时就抛错退出，锁被接管也退出） */
                this.tick();
                await RegionGuard.guard("PC 搜索");

                attempts++;
                const iterStart = Date.now();
                let query;
                try {
                    query = RewardsAuto.apiConfig.mode !== "offline"
                        ? await API.getHotSearchWord()
                        : "";
                } catch (_) {
                    query = "";
                }
                if (!query) query = pickPoolWord();
                for (let i = 0; i < 5 && query && usedQueries.has(query); i++) query = pickPoolWord();
                if (query) usedQueries.add(query);
                Utils.log("🔍", `[PC] 第 ${attempts} 次搜索（记账 ${progress}/${max}，节拍 ${Math.round(gap / 1000)}s）：${query}`);

                try {
                    const html = await API.getSearchPage(query, false);
                    if (html) await API.reportSearch(html, query, false);
                } catch (e) {
                    if (e && e.regionBlocked) throw e;
                    Utils.log("🟡", `搜索失败: ${e.message}`);
                }

                await Utils.delay(Utils.randomRange(SEARCH_PACER.OBSERVE_MIN, SEARCH_PACER.OBSERVE_MAX));
                const before = progress;
                let quota = await API.getPcQuota();
                if (quota && quota.progress <= before) {
                    await Utils.delay(Utils.randomRange(SEARCH_PACER.VERIFY_MIN, SEARCH_PACER.VERIFY_MAX));
                    const again = await API.getPcQuota();
                    if (again) quota = again;
                }
                if (quota) {
                    verifyFails = 0;
                    if (quota.max > 0) max = quota.max;
                    if (quota.progress > before) {
                        progress = quota.progress;
                        credits++;
                        sinceCredit = 0;
                        lastCreditAt = Date.now();
                        Utils.log("✅", `记账成功 +${progress - before}（${progress}/${max}）`);
                    } else {
                        progress = Math.max(progress, quota.progress);
                        sinceCredit++;
                        /* 间隔不再随失败放大：保持配置值，只把「连续未记账」记进日志。
                           连续太多次会有 NO_CREDIT_LIMIT 兜底收手。 */
                        const left = Math.round((SEARCH_PACER.NO_CREDIT_LIMIT - (Date.now() - lastCreditAt)) / 60000);
                        Utils.log("🟡", `本次未记账（${progress}/${max}，连续 ${sinceCredit} 次；再 ${Math.max(0, left)} 分钟没进展就本轮收手）`);
                    }
                } else {
                    verifyFails++;
                    sinceCredit++;
                    progress = Math.min(max, progress + 3);
                }
                RewardsAuto.state.pcProgress = progress;

                if (progress >= max) break;

                const noCreditMs = Date.now() - lastCreditAt;
                if (noCreditMs >= SEARCH_PACER.NO_CREDIT_LIMIT && attempts >= SEARCH_PACER.MIN_ATTEMPTS_BEFORE_GIVEUP) {
                    Utils.log("🟡", `连续 ${Math.round(noCreditMs / 60000)} 分钟没有任何记账（本轮 ${attempts} 次搜索），判定被限流，本轮收手（已记 ${progress}/${max}）`);
                    break;
                }
                if (verifyFails >= 6) {
                    Utils.log("🟡", `记账核对连续失败 ${verifyFails} 次，本轮按乐观估计结束（已记 ${progress}/${max}），下一轮用真实进度校正`);
                    break;
                }
                /* 固定节拍：从「本次搜索开始」起算，到下一次搜索开始前一共隔 gap±抖动。
                   把观察/复核已经花掉的时间扣掉，所以相邻两次搜索的间隔是稳定的，
                   不会因为检查耗时不同而忽长忽短。 */
                const cycle = SEARCH_PACER.jitter(gap);
                const now = Date.now();
                if (lastStart > 0) peakGap = Math.max(peakGap, now - lastStart);
                lastStart = now;
                const spent = now - iterStart;
                const wait = Math.max(3000, cycle - spent);
                /* 搜完 + 观察 + 复核已经花掉 spent，补到 cycle 就是下一次搜索的间隔。
                   网络慢到 spent 本身超过 cycle 时，下限 3 秒兜底，此时间隔 = spent + 3，
                   日志里如实报出来，不假装还在 ±10 秒内。 */
                const actual = Math.round((spent + wait) / 1000);
                Utils.log("⏳", `等待 ${(wait / 1000).toFixed(0)} 秒（两次搜索相隔约 ${actual} 秒）`);
                await Utils.delay(wait);
            }

            SEARCH_PACER.setLast({ attempts, credits, peak: Math.round(peakGap / 1000), at: Date.now() });
            SEARCH_PACER.saveGap(peakGap);
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            const finalInfo = await API.getRewardsInfo();
            if (finalInfo) {
                progress = finalInfo.pc.progress;
                max = finalInfo.pc.max || max;
                RewardsAuto.state.pcProgress = progress;
                RewardsAuto.state.pcMax = max;
            }
            const hitRate = attempts > 0 ? Math.round((credits / attempts) * 100) : 0;
            if (finalInfo && progress >= max) {
                markDone();
                Utils.log("🔵",
                    `🔍 搜索任务完成！PC: ${progress}/${max}（本轮 ${attempts} 次搜索、记账 ${credits} 次，用时 ${elapsed}s，最大间隔 ${Math.round(peakGap / 1000)}s）`, true);
            } else {
                SEARCH_PACER.setPending(true);
                Utils.log("🟡",
                    `搜索未满 PC: ${progress}/${max}，本轮 ${attempts} 次搜索、记账 ${credits} 次（${hitRate}%），用时 ${elapsed}s，最大间隔 ${Math.round(peakGap / 1000)}s，已安排提前续做`);
                this.save();
            }
        },

        async doDailySet(roundDeadline) {
            const today = Utils.getTodayNum();
            const todayStr = Utils.getTodayStr();
            const processedKey = "Config.dailySetProcessed";
            let processed = GM_getValue(processedKey, []);
            if (!Array.isArray(processed) || processed[0]?.date !== today) processed = [];
            const doneIds = new Set(processed.filter(p => p && p.ok).map(p => p.offerId));

            const maxRounds = 3;
            let totalOk = 0, totalFail = 0, remain = -1;
            let gap = SEARCH_PACER.startGap();
            let outOfTime = false;

            for (let round = 1; round <= maxRounds; round++) {
                if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                    Utils.log("🟡", `每日活动到点交班，剩下的卡片留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    outOfTime = true;
                    break;
                }
                await RegionGuard.guard("每日活动");
                Utils.log("📅", `第 ${round}/${maxRounds} 轮每日活动（服务端已确认 ${doneIds.size} 张）...`);
                await Utils.randomDelay(2000, 5000);

                let cards = [];
                let dapiOk = false;
                try {
                    const map = await API.getPromotionMap(true);
                    dapiOk = !!map;
                    cards = await API.discoverDailySetCards(map);
                    Utils.log("📅", `DAPI 发现 ${cards.length} 张未完成的日常活动卡片`);
                } catch (e) {
                    Utils.log("🟡", `DAPI 发现失败，回退网页解析: ${e.message}`);
                }
                if (cards.length === 0 && !dapiOk) {
                    try {
                        const allCards = await API.discoverCards();
                        cards = allCards.filter(c => (c.kind === "daily" || c.offerId.includes("DailySet")) && !doneIds.has(c.offerId));
                    } catch (e) {
                        Utils.log("🟡", `网页卡片解析失败: ${e.message}`);
                    }
                }

                if (round === 1 && cards.length > 0 && cards.some(c => !c.hash)) {
                    try {
                        const webCards = (await API.discoverCards()).filter(c => c.hash && (c.kind === "daily" || c.offerId.includes("DailySet")));
                        if (webCards.length > 0) {
                            const byId = new Map(webCards.map(c => [c.offerId, c]));
                            cards = cards.map(c => {
                                const w = byId.get(c.offerId);
                                if (!w) return c;
                                return {
                                    ...c,
                                    hash: w.hash,
                                    url: w.url || c.url,
                                    destination: c.destination || w.destination || "",
                                    ...(w.appOnly || c.appOnly ? { appOnly: true } : {}),
                                    ...(w.levelGated || c.levelGated ? { levelGated: true } : {})
                                };
                            });
                            const enriched = cards.filter(c => c.hash).length;
                            if (enriched > 0) Utils.log("🧩", `已为 ${enriched} 张日常卡补上网页交卷标识（hash）`);
                        }
                    } catch (e) {
                        Utils.log("🟡", `网页日常卡解析跳过: ${e.message}`);
                    }
                }

                let roundOutOfTime = false;
                for (const card of cards) {
                    if (doneIds.has(card.offerId)) continue;
                    await RegionGuard.guard("每日活动领取");
                    this.tick();
                    Utils.log("📅", `领取每日活动: ${card.title} +${card.points}p`);
                    if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                        Utils.log("🟡", `每日活动到点交班，剩余卡片留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                        roundOutOfTime = true;
                        break;
                    }
                    await SEARCH_PACER.beat(gap);
                    const res = await API.claimCard(card, round === 1 ? { attempts: 2 } : {});
                    if (res) { totalOk++; doneIds.add(card.offerId); } else { totalFail++; }
                    gap = SEARCH_PACER.nextGap(gap, !!res);
                }
                if (roundOutOfTime) {
                    outOfTime = true;
                    break;
                }

                remain = -1;
                try {
                    const map = await API.getPromotionMap(true);
                    if (map) {
                        const todays = [...map.values()].filter(i =>
                            (i.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix) || i.dailySetDate === todayStr)
                            && (i.dailySetDate === todayStr || i.offerId.includes(String(today))));
                        const openable = todays.filter(i => CardLock.claimable(i));
                        const lockedNow = todays.length - openable.length;
                        remain = openable.filter(i => !i.complete).length;
                        if (lockedNow > 0) {
                            Utils.log("🔒", `${lockedNow} 张日常活动卡处于锁定状态，不计入剩余量`);
                        }
                        for (const i of todays) {
                            if (i.complete) doneIds.add(i.offerId);
                            else doneIds.delete(i.offerId);
                        }
                    }
                } catch (_) {}
                GM_setValue(processedKey, [...doneIds].map(id => ({ date: today, offerId: id, ok: true })));

                if (remain === 0) break;
                if (cards.length === 0) break;
                if (round < maxRounds) {
                    const wait = Utils.randomRange(20000, 35000);
                    Utils.log("⏳", `仍有 ${remain < 0 ? "未知数量" : remain} 张未完成，${Math.round(wait / 1000)} 秒后进入下一轮`);
                    await Utils.randomDelay(wait, wait);
                }
            }

            if (remain === 0) GM_setValue("Config.dailySetDoneDate", today);
            else if (remain > 0) GM_setValue("Config.dailySetDoneDate", 0);

            if (totalOk > 0 || totalFail > 0 || remain > 0) {
                Utils.log(remain === 0 ? "🔵" : "🟡",
                    `每日活动完成: ${totalOk}成功/${totalFail}失败${remain > 0 ? `，仍剩 ${remain} 张未完成` : ""}（服务端已确认）${outOfTime ? "；本轮到点，剩余卡片下一轮继续" : ""}`,
                    remain === 0);
            } else if (remain === 0) {
                Utils.log("✅", "每日活动已全部完成（服务端已确认）");
            }
            this.dailySetSummary = remain >= 0
                ? `${doneIds.size} 张已完成${remain > 0 ? `，剩 ${remain} 张` : ""}`
                : `${doneIds.size} 张已完成 · 服务端状态未知`;
            if (remain < 0) return true;
            return remain === 0;
        },

        async doClaimPoints() {
            await RegionGuard.guard("领取积分");
            if (!GM_getValue("Tasks.claimPoints", true)) {
                this.claimSummary = "⏭️ 已关闭";
                Utils.log("✅", "自动领取待领积分已关闭（Config：Tasks.claimPoints）");
                return;
            }
            try {
                try { await API.getCookieHeader(); } catch (_) {}
                const res = await ClaimPoints.run();
                if (res.empty) {
                    /* empty 现在有两层含义：池子确认为空 / 池子被本次领取清空。
                       后者是真领到了，不能再报「无可领」。 */
                    this.claimSummary = res.settled
                        ? (res.claimed > 0 ? `✅ +${res.claimed} · 池已清空` : "✅ 已领取 · 池已清空")
                        : "✅ 无可领";
                    this.claimReason = res.settled ? "" : (res.uncertain ? (res.reason || "") : "");
                    Utils.log("🎁", res.reason || "已领取");
                    return;
                }
                if (res.claimed > 0) {
                    this.claimSummary = `✅ +${res.claimed} · 余额 ${res.after}`;
                    this.claimReason = "";
                    Utils.log("🎁", `已自动领取 ${res.claimed} 积分（当前余额：${res.after}）`);
                } else if (res.variant) {
                    this.claimSummary = "⏳ 已受理待复核";
                    this.claimReason = res.reason || "";
                    Utils.log("🟡", `积分领取请求已受理，但没能确认到账（${res.reason}）；下一轮再复核`);
                } else {
                    this.claimSummary = "⏳ 未成功";
                    this.claimReason = res.reason || "";
                    /* 不单独推送：收尾通知的「受限制未完成」里会点名 */
                    Utils.log("🟡", `待领积分自动领取未成功：${res.reason}`);
                    this._explainClaimChannels();
                }
            } catch (e) {
                this.claimSummary = "⏳ 异常";
                this.claimReason = e.message || "";
                Utils.log("🟡", `领取积分执行异常: ${e.message}`);
            }
        },

        _explainClaimChannels() {
            const env = BrowserEnv.info();
            const lines = [`当前浏览器：${BrowserEnv.summary()}；后台直发请求的 Origin 是扩展源`];
            if (env.extOriginRisky) {
                lines.push(`Edge ${env.major} 对扩展源 origin 的 server action 会回 500 —— 这不是脚本参数错了，是浏览器强制的头。`);
            }
            const cdpPort = Number(GM_getValue("Config.cdpPort", 9224)) || 9224;
            lines.push(`① CDP 同源通道：用桌面「Rewards Edge」快捷方式启动（端口 ${cdpPort}），并留一个 rewards 页面开着；`);
            lines.push(`② 页面代发通道：在 rewards.bing.com 页面里跑过一次脚本后自动可用（Config.usePageChannel 打开）；`);
            lines.push(`③ 后台直发：Chrome / 旧版 Edge 上通常能过，新版 Edge 上常被拒。`);
            Utils.log("🟡", lines.join("\n"));
        },

        async doStreak() {
            await RegionGuard.guard("连签检测");
            Utils.log("📅", "开始检测连签任务...");
            try {
                const map = await API.getPromotionMap(true);
                if (map) {
                    const streak = map.get(RewardsAuto.appConfig.offerIds.streakCounter);
                    if (streak && streak.progress > 0) {
                        this.streakDays = streak.progress;
                        Utils.log("📅", `每日连续打卡：${this.streakDays} 天（DAPI 权威值）`);
                    }
                    const todayStr = Utils.getTodayStr();
                    const children = [...map.values()].filter(i =>
                        i.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix) && i.dailySetDate === todayStr);
                    if (children.length > 0) {
                        const done = children.filter(i => i.complete).length;
                        Utils.log(done >= children.length ? "✅" : "📅", `每日连续打卡活动：${done}/${children.length} 张已完成`);
                    }
                }
            } catch (_) {}
            try {
                const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!earnHtml) { Utils.log("🟡", "无法获取 earn 页面"); return; }
                const text = earnHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
                const streakDaysMatch = text.match(/每日连续打卡\s*(\d+)/);
                if (streakDaysMatch) {
                    this.streakDays = parseInt(streakDaysMatch[1]) || 0;
                    Utils.log("📅", `每日连续打卡：${this.streakDays} 天`);
                }
                const taskPatterns = [
                    { name: "必应搜索连续打卡", pattern: /必应搜索连续打卡[\s\S]*?搜索:\s*(\d+)\/(\d+)/ },
                    { name: "每日连续打卡活动", pattern: /每日连续打卡活动[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                    { name: "必应应用连续打卡", pattern: /必应应用连续打卡[\s\S]*?签到:\s*(\d+)\/(\d+)/ },
                    { name: "视觉搜索连续打卡", pattern: /视觉搜索连续打卡[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                ];
                let visualSearchDone = true;
                for (const { name, pattern } of taskPatterns) {
                    const m = text.match(pattern);
                    if (m) {
                        const cur = parseInt(m[1]), max = parseInt(m[2]);
                        const done = cur >= max;
                        Utils.log(done ? "✅" : "📅", `${name}: ${cur}/${max}${done ? " 已完成" : ""}`);
                        if (name === "视觉搜索连续打卡" && !done) visualSearchDone = false;
                    }
                }
                if (!visualSearchDone) {
                    Utils.log("📅", "视觉搜索未完成，尝试后台打卡...");
                    try {
                        await Utils.xhr({
                            url: "https://www.bing.com/?features=vsstreak,vstooltip&form=ML2XES",
                            headers: {
                                "user-agent": RewardsAuto.ua.pc,
                                "referer": "https://www.bing.com/"
                            }
                        });
                        Utils.log("✅", "视觉搜索打卡请求已发送（后台）");
                        await Utils.randomDelay(3000, 5000);
                    } catch (e) {
                        Utils.log("🟡", `视觉搜索打卡失败: ${e.message}`);
                    }
                }
                const stampMatch = text.match(/(\d+)\s*个印章/) || text.match(/印章\s*(\d+)/);
                if (stampMatch) {
                    Utils.log("📅", `连签奖励印章进度: ${stampMatch[1]}/12`);
                }
                Utils.log("📅", "连签任务检测完成，未完成任务将由活动卡片模块处理");
            } catch (e) {
                Utils.log("🔴", `连签任务异常: ${e.message}`);
            }
        },

        async runAll() {
            this.lastRunStarted = false;
            if (this.running) {
                /* 本上下文内存标记还立着：只有心跳/进展都停了才算残留。
                   以前这里只看 runningSince + 40 分钟，卡住的轮次会一直拦着自己。 */
                const st = Sched.getState() || {};
                const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0, this.runningSince || 0);
                if (Date.now() - lastAct < RUN_STALE) {
                    Utils.log("🟡", "任务正在运行中，请勿重复触发");
                    return;
                }
                Utils.log("🟡", "上一轮的运行标记是残留的（上下文被冻结过），清理后继续");
                this.forceCleanupOwnRound("");
            }
            /* 先回收已经死掉的轮次（条目不新鲜就清掉），再看是否真的有人在跑。
               顺序不能反：反了的话一条死记录会永远拦住新的一轮。 */
            Sched.reap();
            if (Sched.isBusy()) {
                const st = Sched.getState() || {};
                const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0);
                Utils.log("🟡", `上一轮（${st.ctx || "未知"}）还在执行中（最后活动 ${Math.round((Date.now() - lastAct) / 1000)} 秒前），本次触发跳过`);
                return;
            }
            Utils.log("▶️", `本轮进入执行流程（${Utils.hasDOM() ? "页面" : "后台"}上下文）`);
            this.abortRound = false;
            if (!Utils.acquireLock("Config.runLock", RUN_LOCK_TTL)) {
                const hold = Utils.lockInfo("Config.runLock");
                Utils.log("⏳", `另一个上下文正在运行任务（锁 ${hold ? Math.round((Date.now() - hold.ts) / 1000) + " 秒前更新" : "未知"}），本次跳过（避免并发重复上报）`);
                return;
            }
            this.running = true;
            this.runningSince = Date.now();
            this.lastRunStarted = true;
            this.roundSeq++;
            this.roundId = this.roundSeq;
            const myRound = this.roundId;
            Sched.state("running");
            this.startHeartbeat();
            const roundDeadline = this.runningSince + ROUND_BUDGET_MS;
            try {
                this.signTimes = 0;
                this.readTimes = 0;
                this.promosTimes = 0;
                RewardsAuto.state.lockedCount = 0;
                RewardsAuto.state.lockedPoints = 0;
                RewardsAuto.state.lockedTitles = [];
                RewardsAuto.state.desktopPendingTitles = [];
                RewardsAuto.state.weeklyQuestDone = 0;
                RewardsAuto.state.weeklyQuestPending = 0;
                RewardsAuto.state.weeklyQuestFailed = 0;
                RewardsAuto.state.monthlyFound = 0;
                RewardsAuto.state.monthlyDone = 0;
                RewardsAuto.state.monthlyTotal = 0;
                RewardsAuto.state.monthlyPending = 0;
                RewardsAuto.state.monthlyComplete = false;
                RewardsAuto.state.webNoAuth = false;
                RewardsAuto.state.webFailStreak = 0;
                RewardsAuto.state.startTime = Utils.getTimestamp();
                Utils.log("🚀", "启动全能自动化任务...");
                this.init();
                if (!(await API.checkRegion())) {
                    Utils.log("🛑", "出口检测未通过：本轮不发任何微软请求，关掉 VPN/梯子（或恢复直连）后会自动恢复");
                    return;
                }
                const startBalance = await API.getBalance();
                Utils.log("📊", `初始积分: ${startBalance}`);
                let isTokenOK = await API.renewToken();
                if (!isTokenOK) {
                    /* Token 失效会每轮都命中，6 小时内只提醒一次 */
                    Utils.logOnce("🟡", "Token失败，跳过签入/阅读", "tokenFail", 6 * 60 * 60 * 1000);
                } else {
                    Utils.resetOnce("tokenFail");
                }
                const retryDelay = 60000;
                const maxRetries = 2;
                const withRetry = async (taskFn, taskName, retries = 0) => {
                    /* 进每个阶段都先确认这一轮还活着，并标记一次真实进展 */
                    this.ensureAlive();
                    Sched.progress();
                    try {
                        const result = await taskFn();
                        if (result === false && retries < maxRetries) {
                            if (this.aborted()) return result;
                            Utils.log("🟡", `${taskName} 失败，${retryDelay/1000}秒后重试 (${retries + 1}/${maxRetries})`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        return result;
                    } catch (e) {
                        if (e && e.regionBlocked) throw e;
                        if (e && e.roundAborted) throw e;
                        if (retries < maxRetries) {
                            if (this.aborted()) return false;
                            Utils.log("🟡", `${taskName} 异常: ${e.message}，${retryDelay/1000}秒后重试`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        Utils.log("🔴", `${taskName} 失败: ${e.message}`);
                        return false;
                    }
                };
                await withRetry(() => this.doSign(), "签到");
                await Utils.randomDelay();
                if (isTokenOK) {
                    if (RewardsAuto.state.pc401) {
                        Utils.log("🟡", "PC 会话不可用（只影响 PC 通道任务），阅读改用 App 通道继续执行");
                    }
                    await withRetry(() => this.doRead(roundDeadline), "阅读");
                    await Utils.randomDelay();
                }

                await this.doDesktopWeekly();
                await Utils.randomDelay();
                await withRetry(() => this.doMonthlyPlan(), "月度计划");
                await Utils.randomDelay();
                await withRetry(() => this.doPromos(roundDeadline), "活动卡片");
                await Utils.randomDelay();
                await withRetry(() => this.doSearch(roundDeadline), "搜索");
                await withRetry(() => this.doStreak(), "连签检测");
                const roundExpired = () => Date.now() > roundDeadline;
                const skipByDeadline = name => Utils.log("🟡", `本轮已到 ${ROUND_BUDGET_MS / 60000} 分钟上限，${name}交给下一轮`);
                await Utils.randomDelay();
                let dailySetRes = null;
                if (roundExpired()) {
                    skipByDeadline("每日活动");
                } else {
                    Utils.log("📅", "开始执行每日活动任务...");
                    await Utils.randomDelay();
                    dailySetRes = await withRetry(() => this.doDailySet(roundDeadline), "每日活动");
                }
                try {
                    await this.doClaimPoints();
                } catch (e) {
                    if (e && e.regionBlocked) throw e;
                    Utils.log("🟡", `领取积分执行异常: ${e.message}`);
                }
                if (roundExpired()) {
                    skipByDeadline("二次扫描");
                } else {
                    Utils.log("🔄", "二次扫描：检查是否有新解锁的卡片...");
                    await Utils.randomDelay(3000, 8000);
                    const newCards = await API.discoverCards();
                    if (newCards.length > 0) {
                        Utils.log("🧩", `二次扫描发现 ${newCards.length} 个新卡片`);
                        let ok = 0, fail = 0;
                        let rescanGap = SEARCH_PACER.startGap();
                        for (const card of newCards) {
                            await RegionGuard.guard("二次扫描");
                            this.tick();
                            Utils.log("  ", `[${card.kind}] ${card.title} +${card.points}p`);
                            if (card.kind === "quiz" && !GM_getValue("Tasks.quiz", true)) continue;
                            if (!SEARCH_PACER.fits(roundDeadline, rescanGap)) {
                                Utils.log("🟡", `二次扫描到点交班，剩余卡片留给下一轮（当前节拍 ${Math.round(rescanGap / 1000)} 秒）`);
                                break;
                            }
                            await SEARCH_PACER.beat(rescanGap);
                            const result = await API.claimCard(card);
                            result ? ok++ : fail++;
                            rescanGap = SEARCH_PACER.nextGap(rescanGap, !!result);
                        }
                        Utils.log("🔵", `二次扫描完成: ${ok}成功/${fail}失败`);
                    } else {
                        Utils.log("✅", "二次扫描：无新卡片");
                    }
                }
                Utils.log("🌐", "检查 Edge 浏览连签进度...");
                await EdgePacer.maybeReport();
                const endTime = Utils.getTimestamp();
                const totalTime = ((endTime - RewardsAuto.state.startTime) / 1000).toFixed(1);
                const endBalance = await API.getBalance();
                const earned = (startBalance > 0 && endBalance > 0) ? (endBalance - startBalance) : 0;
                const info = await API.getRewardsInfo();
                if (info) {
                    /* 汇总的图标约定：一枚图标只表达一件事
                       🌐 Edge 浏览连签  🧩 活动卡片  ✨ 每日活动  📅 签到  📋 阅读
                       🔍 PC 搜索  📱 手机搜索  🔒 锁卡  🎁 领取积分  💰 积分总账
                       ✅ 达标  ⏳ 未达标/进行中  ⏭️ 今日已跳过 */
                    const today = RewardsAuto.state.dateNowNum;
                    const readProg = info.readProgress ?? RewardsAuto.state.readProgress ?? 0;
                    const readMaxProg = info.readMax ?? RewardsAuto.state.readMax ?? 30;
                    const signOk = this.signDate === today;
                    /* 进度已满也算达标：标记位可能因刷新/跨实例丢失，服务端进度才是事实 */
                    const readOk = this.readDate === today || (readMaxProg > 0 && readProg >= readMaxProg);
                    const searchOk = info.pc.progress >= info.pc.max;
                    const promosOk = this.promosDate === today;
                    const dailyOk = !!dailySetRes;
                    const edge = EdgeStreak.summary();
                    const edgeOk = !edge || edge.done || edge.skipped;
                    const mob = info.mobile || {};
                    const mobOk = !mob.max || mob.progress >= mob.max;
                    const tick = ok => (ok ? '✅' : '⏳');

                    /* 只把「开启的任务」计入达标分母，关掉的项不该被算成差一项 */
                    const on = key => GM_getValue(key, true);
                    const signOn = on("Tasks.sign"), readOn = on("Tasks.read");
                    const searchOn = on("Tasks.search"), promosOn = on("Tasks.promos");
                    const desktopOn = on("Tasks.desktopWeekly");
                    const monthlyOn = on("Tasks.monthly");
                    const goals = [];
                    if (signOn) goals.push(signOk);
                    if (readOn) goals.push(readOk);
                    if (searchOn) goals.push(searchOk);
                    if (promosOn) goals.push(promosOk);
                    goals.push(dailyOk);
                    if (edge) goals.push(edgeOk);
                    const doneCount = goals.filter(Boolean).length;
                    const allDone = goals.length > 0 && doneCount === goals.length;

                    /* 三类「受环境限制」的项目不参与达标判定：
                       🖥️ 桌面专属任务（交卷了但服务端不一定记账）
                       🔒 日常带锁卡（必须在必应 App 里点）
                       🎁 首页待领取（通道被浏览器安全策略挡掉）
                       它们没完成不影响「全部完成」的判定，但通知里要点名。 */
                    const desktopPending = Number(RewardsAuto.state.weeklyQuestPending) || 0;
                    const desktopFailed = Number(RewardsAuto.state.weeklyQuestFailed) || 0;
                    /* 具体卡片名只在后台日志里保留（state 里仍记录），通知只报数量 */
                    const claimPending = /未成功|异常|待复核/.test(this.claimSummary || "");
                    const blocked = [];
                    if (desktopOn && (desktopPending > 0 || desktopFailed > 0)) {
                        const parts = [];
                        if (desktopPending > 0) {
                            parts.push(`${desktopPending} 张未记账`);
                        }
                        if (desktopFailed > 0) parts.push(`${desktopFailed} 个入口读取失败`);
                        blocked.push("🖥️ 桌面专属任务 " + parts.join("，"));
                    }
                    if (RewardsAuto.state.lockedCount > 0) {
                        blocked.push(`🔒 带锁卡片 ${RewardsAuto.state.lockedCount} 张 / ${RewardsAuto.state.lockedPoints} 分`);
                    }
                    if (claimPending) {
                        /* 通道类失败的原话太技术，换成一句人话；其它原因照抄 */
                        const rawReason = String(this.claimReason || "");
                        const claimText = (/三种通道都没受理/.test(rawReason)
                            ? "领取通道被浏览器拒绝"
                            : (rawReason || String(this.claimSummary).replace("⏳ ", "")))
                            .replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
                        blocked.push("🎁 首页待领取" + String(this.claimSummary).replace("⏳ ", "")
                            + (claimText ? `：${claimText}` : ""));
                    }

                    /* 关掉的项要写「已关闭」：显示 ⏳ 0/90 会让人误以为没做完 */
                    const rows = [];
                    const row = (label, enabled, ok, detail) => rows.push(
                        label + " · " + (!enabled ? "⏭️ 已关闭" : tick(ok) + (detail ? " " + detail : "")));

                    rows.push("🌐 Edge 浏览连签 · " + (edge
                        ? (edge.done ? "✅" : edge.skipped ? "⏭️" : "⏳") + " " + edge.text
                        : "⏭️ 已关闭"));
                    row("🧩 活动卡片", promosOn, promosOk, "");
                    row("✨ 每日活动", true, dailyOk, this.dailySetSummary || "");
                    row("🖥️ 桌面专属任务", desktopOn, desktopPending === 0 && desktopFailed === 0,
                        desktopPending > 0 ? `${desktopPending} 张未记账`
                            : (desktopFailed > 0 ? `${desktopFailed} 个入口读取失败` : ""));
                    /* 月度计划是「按月」的，子项按天解锁，不属于当天的达标口径：
                       只报进度，不参与 allDone 判定，也不进「受限制未完成」。 */
                    if (monthlyOn && RewardsAuto.state.monthlyFound > 0) {
                        const mDone = Number(RewardsAuto.state.monthlyDone) || 0;
                        const mTotal = Number(RewardsAuto.state.monthlyTotal) || 0;
                        rows.push("📆 月度计划 · " + (RewardsAuto.state.monthlyComplete ? "✅" : "⏳")
                            + ` ${mDone}/${mTotal}`
                            + (RewardsAuto.state.monthlyPending > 0 && !RewardsAuto.state.monthlyComplete
                                ? "，子项按天解锁" : ""));
                    } else if (monthlyOn) {
                        rows.push("📆 月度计划 · ⏭️ 本月无进行中任务");
                    }
                    row("📅 签到", signOn, signOk, this.streakDays > 0 ? "连签 " + this.streakDays + " 天" : "");
                    row("📋 阅读", readOn, readOk, readProg + "/" + readMaxProg);
                    row("🔍 PC 搜索", searchOn, searchOk, info.pc.progress + "/" + info.pc.max);
                    if (mob.max > 0) rows.push("📱 手机搜索 · " + tick(mobOk) + " " + mob.progress + "/" + mob.max);
                    if (RewardsAuto.state.lockedCount > 0) {
                        rows.push("🔒 锁卡 · " + RewardsAuto.state.lockedCount + " 张 / " + RewardsAuto.state.lockedPoints + " 分");
                    }
                    if (this.claimSummary) rows.push("🎁 领取积分 · " + this.claimSummary);
                    rows.push("💰 今日获取 +" + earned + " · 总积分 " + (info.balance || endBalance));

                    /* 标题不带图标：推送图标由 Utils.log 第一参数统一加，
                       否则会拼成「🎉 🎉 今日任务已全部完成！」 */
                    const head = allDone
                        ? (blocked.length > 0
                            ? "今日任务已完成"
                            : "今日任务已全部完成！")
                        : "本轮结果 · 还差 " + (goals.length - doneCount) + " 项";
                    let logMsg = head + "\n\n" + rows.join("\n")
                        + "\n\n✅ 达标 " + doneCount + "/" + goals.length + " · ⏱️ 用时 " + totalTime + " 秒";
                    if (blocked.length > 0) {
                        logMsg += "\n\n⏳ 受限制未完成：\n"
                            + blocked.map(s => "· " + s).join("\n")
                            + "\n💡 上面三项要自动完成，需用 Chrome 浏览器运行脚本";
                    }

                    /* 通知策略：常规任务全达标才推一条汇总；中间轮次只写日志。
                       同一天同一状态只推一次，避免每轮一条的骚扰；
                       若后来受限制项清零，允许再推一次「全部完成」。 */
                    if (allDone) {
                        const dayKey = `roundDone:${today}`;
                        Utils.logOnce("🎉", logMsg, dayKey, 20 * 60 * 60 * 1000,
                            `${dayKey}:${blocked.length > 0 ? "partial" : "full"}`);
                    } else {
                        Utils.log("📊", logMsg);
                    }
                } else {
                    Utils.log("📊", ("本轮执行完成 · ⏱️ 用时 " + totalTime + " 秒 · 服务端状态读取失败，明细见日志"));
                }
                if (!GM_getValue("Config.keep", true) && isDayComplete()) markDayComplete();
            } catch (e) {
                if (e && e.regionBlocked) {
                    Utils.log("🛑", `本轮已中止：${e.message}`);
                } else if (this.aborted()) {
                    Utils.log("🛑", "本轮已超时收尾，剩余任务交给下一轮");
                } else {
                    Utils.log("🔴", `本轮任务异常终止: ${e.message}`);
                }
            } finally {
                /* 被强制收尾后可能已经有新的一轮接上来了：
                   旧轮的 finally 不能把新一轮的 running/锁/阶段清掉。 */
                if (myRound === this.roundId) {
                    this.stopHeartbeat();
                    this.running = false;
                    this.runningSince = 0;
                    this.abortRound = false;
                    Utils.releaseLock("Config.runLock");
                    Sched.state("done");
                } else {
                    Utils.log("🟡", "上一轮的收尾被跳过（已经由更新的那一轮接管）");
                }
            }
        }
    };

    GM_registerMenuCommand("🔑 手动授权", () => {
        try {
            GM_openInTab(Auth.authUrl, { active: true });
            Utils.log("🟡", "已打开微软授权页：登录后会自动捕获授权码并换取 Token（无需手动复制）");
        } catch (e) {
            Utils.uiAlert(`❌ 无法打开授权页：${e.message}\n\n请手动访问：\n${Auth.authUrl}`);
        }
    });

    GM_registerMenuCommand("📋 粘贴授权码", () => { Auth.pasteFlow().catch(e => Utils.log("🔴", `粘贴授权码失败：${e.message}`)); });

    GM_registerMenuCommand("📊 Token状态", () => {
        const token = GM_getValue("Config.token", false);
        const time = Number(GM_getValue("Config.tokenTime", 0)) || 0;
        let ageStr = "未知";
        if (time > 0) {
            const diff = Utils.getTimestamp() - time;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const parts = [];
            if (days > 0) parts.push(`${days}天`);
            if (hours > 0) parts.push(`${hours}小时`);
            parts.push(`${minutes}分钟`);
            ageStr = parts.join("");
        }
        const tokenDate = time > 0 ? new Date(time).toLocaleString("zh-CN") : "未知";
        const rawCode = GM_getValue("Config.code", "");
        const parsed = rawCode ? Auth.parseCode(rawCode) : null;
        const codeUsed = !!(parsed && Auth.used(parsed));
        const codeStr = !rawCode
            ? "无"
            : (!parsed
                ? `有但无法解析（长度 ${String(rawCode).length}）`
                : `有（${Auth.preview(parsed)}${codeUsed ? "，已兑换为 Token，保留中" : "，尚未兑换"}）`);
        Utils.uiAlert(
            `Token: ${token ? "已保存" : "无"}\n` +
            `获取时间: ${tokenDate}\n` +
            `已过: ${ageStr}\n` +
            `授权码: ${codeStr}`
        );
    });

    const diagClaim = async () => {
        const env = BrowserEnv.info();
        const saved = String(GM_getValue("Config.claimVariant", "") || "");
        const cdpPort = Number(GM_getValue("Config.cdpPort", 9224)) || 9224;
        let text = "🎁 待领积分 / 领取通道诊断\n\n";
        text += `任务开关：${GM_getValue("Tasks.claimPoints", true) ? "开启" : "关闭"}\n`;
        text += `当前浏览器：${BrowserEnv.summary()}${env.extOriginRisky ? "（新版本，后台直发大概率被拒）" : ""}\n`;
        text += `已记住通道：${saved || "未记录（会按 page → proxy → xhr 逐个试）"}\n`;
        text += `CDP 调试端口 ${cdpPort}：${(await CDP.available()) ? "✅ 可连" : "❌ 不可连"}\n`;
        text += `页面代发服务：${API._pageChannelAlive() ? "✅ 在线" : "❌ 不在线"}\n`;
        const table = ActionMap._readMap();
        text += `标识表：${Object.keys(table).length ? `已缓存 ${Object.keys(table).length} 个（部署 ${GM_getValue("Config.actionDpl", "未知")}）` : "空（用已知兜底标识）"}\n`;
        text += `领取标识：${ActionMap.get("reportClaimAllPoints").slice(0, 12)}…\n\n`;
        /* 先把原始解析结果打出来：金额读到 0 时，这一段能直接看出是字段名变了、
           还是 dashboard 根本不是登录态（这时 pointClaim 片段是空的）。 */
        let dashHtml = "";
        try { dashHtml = await Utils.xhr({ url: "https://rewards.bing.com/dashboard" }); } catch (_) { dashHtml = ""; }
        const raw = ClaimPoints.parse(dashHtml);
        text += `dashboard 抓取：${dashHtml ? `${dashHtml.length} 字节` : "❌ 失败（请求没回来 / 未登录）"}\n`;
        text += `原始解析：known=${raw.known} has=${raw.has} amount=${raw.amount} source=${raw.source || "-"}`
            + `${raw.uncertain ? "（金额读不准）" : ""}\n`;
        if (raw.snippet) text += `pointClaim 片段：${raw.snippet}\n`;
        text += `余额：${ClaimPoints._balance(dashHtml) || "读不到"}\n\n`;
        const pool = await ClaimPoints.run();
        text += `待领状态：${pool.empty
            ? (pool.settled ? "已领取，池已清空" : (pool.uncertain ? "读不准（标记在、金额 0）" : "空池"))
            : (pool.variant ? `已受理（${pool.variant}）` : "未受理")}\n`;
        text += `本次结果：${pool.claimed > 0 ? `+${pool.claimed} 分（余额 ${pool.before} → ${pool.after}）` : (pool.reason || "—")}\n`;
        if (!pool.variant && !pool.empty) {
            text += `\n提示：新版 Edge 请用桌面「Rewards Edge」快捷方式启动（端口 ${cdpPort}）并留一个 rewards 页面，`
                + "这样领取会走页面同源请求；Chrome 上后台直发通常也能过。";
        }
        text += "\n判定口径：余额上涨 > 待领池清空 > 待领金额下降；三者都拿不到才记「无法确认」。";
        if (pool.claimed > 0) Utils.log("🎁", `诊断中已自动领取 ${pool.claimed} 积分`, true);
        return text;
    };

    const diagEdgeStreak = () => {
        const enabled = GM_getValue("Tasks.edge", true);
        const st = EdgeStreak.state();
        const total = st.total || Math.ceil(EDGE.TARGET_MINUTES / Math.max(1, st.intervalMin));
        const waitMs = (!st.complete && st.count > 0 && st.last)
            ? Math.max(0, st.last + st.intervalMin * 60000 - Date.now()) : 0;
        let text = "🌐 Edge 浏览连签\n\n";
        text += `任务开关：${enabled ? "开启" : "关闭"}\n`;
        text += `上报进度：${Math.min(st.count, total)}/${total} 次（每次覆盖 ${st.intervalMin} 分钟，满 ${EDGE.TARGET_MINUTES} 分钟记账）\n`;
        text += `服务端状态：${st.complete ? "✅ 已完成" : (st.giveUp ? "⏭️ 今日已跳过" : "⏳ 未完成")}\n`;
        text += `上次上报：${st.last ? new Date(st.last).toLocaleString("zh-CN") : "无"}\n`;
        if (waitMs > 0) text += `下次上报：约 ${Math.ceil(waitMs / 60000)} 分钟后\n`;
        text += `活动激活：${st.activated ? "已尝试" : "未尝试"}${st.extra ? `（已重来 ${st.extra}/${EDGE.MAX_EXTRA_ROUNDS} 轮）` : ""}\n`;
        text += `客户端：${RewardsAuto.ua.edge}\n\n`;
        text += "现在立刻推进一次（不足一个计费窗口会自动跳过，不刷接口）。";
        EdgePacer.nextAt = 0;
        EdgePacer.maybeReport().catch(e => Utils.log("🟡", `Edge 连签手动推进失败：${e.message}`));
        return text;
    };

    const diagPcSearch = async () => {
        const pacer = SEARCH_PACER.summary();
        const restricted = Number(GM_getValue("Config.restrictedTimes", 0)) || 0;
        let text = "🔍 PC 搜索诊断\n\n";
        text += `任务开关：${GM_getValue("Tasks.search", true) ? "开启" : "关闭"}\n`;
        text += `固定间隔：${pacer.min} ± ${SEARCH_PACER.JITTER_MS / 1000} 秒（Config.span，搜索/阅读/卡片共用）\n`;
        text += `节拍策略：固定间隔，不随成功/失败放大（旧版会一路涨到 100 秒）\n`;
        text += `间隔自证：日志里的「两次搜索相隔约 N 秒」就是实际补到的间隔\n`;
        text += `限流刹车：连续 ${SEARCH_PACER.NO_CREDIT_LIMIT / 60000} 分钟没记账则本轮收手（间隔本身不再拖慢）\n`;
        text += `阅读/卡片节拍：复用同一套，间隔同为 ${pacer.min} ± ${SEARCH_PACER.JITTER_MS / 1000} 秒\n`;
        if (pacer.last) {
            text += `上一轮：${pacer.last.attempts} 次搜索 / 记账 ${pacer.last.credits} 次（实测最大间隔 ${pacer.last.peak} 秒）\n`;
        } else {
            text += `上一轮：还没有记录\n`;
        }
        text += `单轮搜索上限：20 分钟（到点交班，未满的配额 5 分钟后提前续做）\n`;
        text += `整轮墙钟预算：20 分钟（到点不再开新阶段，剩余任务交给下一轮）\n`;
        text += `提前续做：${pacer.pending ? "已排程（本轮没搜满）" : "无"}\n`;
        text += `限流计数：${restricted}/3\n`;
        text += `任务标记：${TaskManager.searchDate === RewardsAuto.state.dateNowNum ? "今日已完成" : "今日未完成"}\n\n`;
        const info = await API.getRewardsInfo();
        if (info) text += `服务端配额：PC ${info.pc.progress}/${info.pc.max}\n`;
        else text += "服务端配额：读取失败\n";
        text += "\n调用后会立刻单独跑一次 PC 搜索（日志里能看到每次是否真的记账）。";
        if (!Utils.acquireLock("Config.runLock", 45 * 60 * 1000)) {
            Utils.log("🟡", "已有一轮任务在跑，搜索诊断跳过");
            return;
        }
        Promise.resolve()
            .then(() => TaskManager.doSearch())
            .catch(e => Utils.log("🔴", `搜索异常：${e && e.message ? e.message : e}`))
            .finally(() => Utils.releaseLock("Config.runLock"));
        return text;
    };

    GM_registerMenuCommand("🚀 立即运行", () => {
        Utils.log("🚀", "手动触发：立即运行一轮");
        /* 手动触发前先把卡死的记录收掉：否则用户点一次还是只会看到
           「上一轮任务还在执行中」，那正是这次要修的现象。 */
        const reaped = Sched.reapDeadRound();
        if (!reaped && Sched.isBusy()) {
            const st = Sched.getState() || {};
            Utils.log("🟡", `上一轮任务还在执行中（${st.ctx || "未知"}，最后活动 ${Sched.fmt(st.at)}），请等它跑完或先用「🔓 释放运行锁」`);
            return;
        }
        if (TaskManager.running) {
            Utils.log("🟡", "当前上下文已有一轮在跑，本次手动触发跳过");
            return;
        }
        Promise.resolve()
            .then(() => TaskManager.runAll())
            .catch(e => Utils.log("🔴", `本轮任务异常：${e && e.message ? e.message : e}`))
            /* runAll 因为拿不到锁而直接返回时 lastRunStarted 仍是 false：
               用它区分「真的跑了一轮」和「没跑起来」，后者 2 分钟后就重试。 */
            .finally(() => Sched.finish(true, TaskManager.lastRunStarted));
    });

    const diagReleaseLock = () => {
        try { Utils.releaseLock("Config.runLock"); } catch (_) {}
        try { GM_setValue("Config.runLock", null); } catch (_) {}
        try { Sched.clearClaim(); } catch (_) {}
        GM_setValue("Config.runState", null);
        try { TaskManager.stopHeartbeat(); } catch (_) {}
        TaskManager.running = false;
        TaskManager.runningSince = 0;
        TaskManager.abortRound = false;
        Utils.log("🔓", "已强制释放运行锁并清理运行状态，下一轮可正常触发");
    };

    GM_registerMenuCommand("🔔 配置通知接口", async () => {
        const configNames = [
            { key: "Notice.wework", name: "企业微信 Webhook", hint: "群机器人webhook key" },
            { key: "Notice.dingding", name: "钉钉机器人 Access Token", hint: "不加签，关键词需包含 #" },
            { key: "Notice.feishu", name: "飞书机器人 Webhook", hint: "不加签，关键词需包含 #" },
            { key: "Notice.pushme", name: "PushMe Key", hint: "push.i-i.me 推送key" },
            { key: "Notice.bark", name: "Bark Key", hint: "bark.day.app 推送key" }
        ];
        let configStr = "🔔 通知接口配置\n==================\n\n";
        configNames.forEach((item, index) => {
            const saved = GM_getValue(item.key, "");
            configStr += `${index + 1}. ${item.name}\n   状态: ${saved ? "✅ 已配置" : "❌ 未配置"}\n   说明: ${item.hint}\n\n`;
        });
        configStr += "请输入要配置的编号 (1-5)，或输入 0 清除所有配置：";
        const choice = await Utils.uiPrompt(configStr);
        if (!choice) return;
        const num = parseInt(choice);
        if (num === 0) {
            if (Utils.uiConfirm("确定要清除所有通知接口配置吗？")) {
                configNames.forEach(item => GM_setValue(item.key, ""));
                Utils.uiAlert("所有通知接口配置已清除！");
            }
            return;
        }
        if (num >= 1 && num <= 5) {
            const selected = configNames[num - 1];
            const current = GM_getValue(selected.key, "");
            const newValue = await Utils.uiPrompt(`配置 ${selected.name}\n\n当前值: ${current || "(空)"}\n\n请输入新的值：`, current);
            if (newValue !== null) {
                GM_setValue(selected.key, newValue.trim());
                Utils.uiAlert(`${selected.name} 已${newValue.trim() ? "配置" : "清除"}！`);
            }
        } else {
            Utils.uiAlert("无效的编号！");
        }
    });

    GM_registerMenuCommand("📢 测试通知", () => {
        RewardsAuto.state.sendMSG = "🧪 这是一条测试消息\n如果你看到这条消息，说明通知接口配置成功！";
        Utils.log("📢", "测试通知已发送", true);
        Utils.uiAlert("测试消息已发送，请检查各通知渠道！");
    });

    const updateBroMenu = () => {
        const enabled = GM_getValue("Notice.bro", true);
        return enabled ? "🔕 关闭浏览器通知" : "🔔 开启浏览器通知";
    };
    GM_registerMenuCommand(updateBroMenu(), () => {
        const current = GM_getValue("Notice.bro", true);
        GM_setValue("Notice.bro", !current);
        Utils.uiAlert(`浏览器通知已${!current ? "开启" : "关闭"}`);
        try { if (Utils.hasDOM()) location.reload(); } catch (_) {}
    });

    GM_registerMenuCommand("📋 查看通知状态", () => {
        const wework = GM_getValue("Notice.wework", "");
        const dingding = GM_getValue("Notice.dingding", "");
        const feishu = GM_getValue("Notice.feishu", "");
        const pushme = GM_getValue("Notice.pushme", "");
        const bark = GM_getValue("Notice.bark", "");
        let status = "📊 通知接口配置状态：\n\n";
        status += `企业微信: ${wework ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `钉钉: ${dingding ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `飞书: ${feishu ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `PushMe: ${pushme ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `Bark: ${bark ? "✅ 已配置" : "❌ 未配置"}\n`;
        Utils.uiAlert(status);
    });

    const diagRegion = async () => {
        const v = await RegionGuard.check({ fresh: true });
        let text = "🌍 网络出口检测\n\n";
        if (v.skipped) {
            text += "「锁定国区」已关闭：不做出口限制，也不拦代理。\n\n";
        } else {
            text += `结论：${v.ok ? "✅ 出口在大陆，可以继续" : "⛔ 已拦截，任务不会上报"}\n`;
            if (v.reasons.length) text += `原因：${v.reasons.join("；")}\n`;
        }
        text += `出口 IP：${v.ip || "未知"}\n`;
        if (v.ipInfo) text += `${v.ipInfo}\n`;
        const msSignals = v.signals.filter(s => /^bing=/.test(s));
        const otherSignals = v.signals.filter(s => !/^bing=/.test(s));
        text += `\n各路信号：\n`;
        text += `  微软侧（bing.com）：${msSignals.length ? msSignals.join(" ") : "（无）"}\n`;
        text += `  第三方/国内视角：${otherSignals.length ? otherSignals.join(" ") : "（无）"}\n`;
        if (v.failed && v.failed.length) text += `\n探测失败：\n${v.failed.map(s => `  ${s}`).join("\n")}\n`;
        text += "\n探测源：bing.com（不带 Cookie）/ cloudflare / ipinfo.io / api.ip.sb / 腾讯 IP 库\n";
        text += `结论缓存：通过 ${RegionGuard.TTL_OK / 1000} 秒、拦截 ${RegionGuard.TTL_BLOCK / 1000} 秒\n`;
        text += `「锁定国区」：${RegionGuard.enabled() ? "开启（非大陆出口、机房/代理 IP、WARP 都会停）" : "关闭"}`;
        if (!v.skipped && v.ok) {
            text += "\n\n规则模式提示：只有「微软侧」才是风控依据。bing.com 判定为 CN 就代表微软把你看成大陆；"
                + "若第三方也全 CN，说明梯子的规则没接管微软域名 —— 这正是最安全的用法。"
                + "想确认业务域名有没有漏走代理，去客户端「连接/日志」里搜 "
                + "rewards.bing.com、prod.rewardsplatform.microsoft.com、login.live.com，应显示 DIRECT。";
        }
        return text;
    };

    const CRON_PERIOD = 20 * 60 * 1000;
    const CRON_HEARTBEAT = 20 * 1000;
    const CRON_FIRST_DELAY = 5 * 1000;
    const CRON_HEARTBEAT_LOG = 10 * 60 * 1000;
    const CRON_HEARTBEAT_LOG_IDLE = 60 * 60 * 1000;
    const CRON_STALL = 3 * 60 * 1000;
    /* 「心跳」判据：真正在跑的上下文每 20 秒刷一次 aliveAt。
       超过 RUN_STALE 两个时间都没动，就判定它已经死了。
       以前只按「开始时间」算且窗口是 40 分钟，于是一轮卡住后
       每次触发都只打印「上一轮任务还在执行中」，看起来就是永久卡进程。 */
    const RUN_STALE = 5 * 60 * 1000;
    /* 孤儿轮次的宽限期：浏览器重启回来时，上一个上下文的 aliveAt 可能只过去几秒，
       等 3 个心跳周期还不刷新，就说明那是残留而不是真的在跑。 */
    const ORPHAN_GRACE = 45 * 1000;
    /* 运行锁租期：心跳每 20 秒续期一次，正常跑永不过期；
       中断后最多这么久就会被下一个上下文抢走，不再永久占位。 */
    const RUN_LOCK_TTL = 6 * 60 * 1000;
    const RUN_HEARTBEAT_GAP = 20 * 1000;
    /* 「活着但不动」判据：上下文还在心跳，可任务已经这么久没有任何推进，
       说明卡在某个永不 settle 的 await 上（典型是 MV3 后台被杀后
       GM_xmlhttpRequest 的回调永远不会来）。这种情况不能再等，
       否则就是用户看到的「一直卡着，重启浏览器也没用」。
       取 15 分钟：单张卡最长要约 8 分钟，正常长任务不会被误伤。 */
    const ROUND_STALL = 15 * 60 * 1000;
    /* 单轮硬上限：预算 20 分钟 + 收尾阶段（连签/领奖/Edge），
       留 20 分钟余量，到点无论卡在哪都由心跳强制收尾。 */
    const ROUND_HARD_LIMIT = ROUND_BUDGET_MS + 20 * 60 * 1000;

    const Sched = {
        timer: null,
        started: false,
        startedAt: 0,
        lastHbLog: 0,
        task: null,

        fmt(ts) {
            if (!ts) return "未知";
            const d = new Date(ts);
            const p = n => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
        },

        lastRun() { return Number(GM_getValue("Config.cronLastRun", 0)) || 0; },

        plan(now = Date.now()) {
            const next = Number(GM_getValue("Config.cronNextRun", 0)) || 0;
            if (next) return next;
            const last = this.lastRun();
            return last ? last + CRON_PERIOD : now + CRON_FIRST_DELAY;
        },

        saveNext(ts) { GM_setValue("Config.cronNextRun", ts); },

        ctxName() { return Utils.hasDOM() ? "页面" : "后台"; },

        getClaim() {
            const c = GM_getValue("Config.cronClaim", null);
            return c && typeof c === "object" ? c : null;
        },
        claim() { GM_setValue("Config.cronClaim", { at: Date.now(), ctx: this.ctxName(), id: Utils.lockId() }); },
        clearClaim() { GM_setValue("Config.cronClaim", null); },

        state(phase, extra) {
            const now = Date.now();
            const base = { phase, at: now, ctx: this.ctxName() };
            /* running 阶段一定要带上 aliveAt：它是「这个上下文还活着」的唯一凭据，
               下一轮/下一个上下文靠它区分「真的在跑」和「早就断了」。 */
            if (phase === "running") base.aliveAt = now;
            GM_setValue("Config.runState", Object.assign(base, extra || {}));
        },
        getState() {
            const s = GM_getValue("Config.runState", null);
            return s && typeof s === "object" ? s : null;
        },

        /* 任务真的有推进时调一次：只更新 at（最后进展），不碰 aliveAt */
        progress(extra) {
            const st = this.getState() || {};
            GM_setValue("Config.runState", Object.assign({}, st, { phase: "running", at: Date.now() }, extra || {}));
        },

        isBusy(now = Date.now()) {
            const s = this.getState();
            if (!s || s.phase !== "running") return false;
            /* 存活判据取两个时间的较大者：
               at       = 最后一次「任务真的有推进」
               aliveAt  = 最后一次心跳（证明上下文没被冻结）
               两个都停了才算死。只卡在一个 await 上时 aliveAt 还在走，
               说明上下文活着，不该被新的一轮插进来并发。 */
            const last = Math.max(Number(s.at) || 0, Number(s.aliveAt) || 0);
            return now - last < RUN_STALE;
        },

        /* 收掉一条已经死掉的 running 记录：清阶段 + 清认领 + 放掉那个上下文留下的锁。
           返回被回收的记录（没什么可收就返回 null）。
           能走到这里说明心跳和进展都停了 = 持有锁的那个上下文已经不在了，
           所以连锁一起收掉，否则下一轮会卡在「另一个上下文正在运行」上。 */
        reap(now = Date.now()) {
            const s = this.getState();
            if (!s || s.phase !== "running") return null;
            if (this.isBusy(now)) return null;
            this.state("done");
            if (this.getClaim()) this.clearClaim();
            const lock = Utils.lockInfo("Config.runLock");
            if (lock && !lock.mine) GM_setValue("Config.runLock", null);
            return s;
        },

        finish(ok, ran = true) {
            const now = Date.now();
            const claim = this.getClaim();
            if (claim && claim.id && claim.id !== Utils.lockId()) return;
            const base = (claim && claim.at) || now;
            /* ran=false 表示这一轮根本没拿到锁、什么也没做：
               不要按 20 分钟排下一轮，否则一次抢锁失败就要干等一整轮。 */
            this.clearClaim();
            GM_setValue("Config.cronLastRun", now);
            const next = base + CRON_PERIOD;
            let plan = next > now + 60 * 1000 ? next : now + 60 * 1000;
            if (!ran) {
                plan = Math.min(plan, now + 2 * 60 * 1000);
            } else if (GM_getValue("Tasks.search", true) && SEARCH_PACER.isPending()) {
                const sooner = now + SEARCH_PACER.RETRY_GAP;
                if (sooner < plan) {
                    plan = sooner;
                    Utils.log("🔍", `PC 搜索未满，${Math.round(SEARCH_PACER.RETRY_GAP / 60000)} 分钟后提前续做`);
                }
            }
            this.saveNext(plan);
            this.state(ok ? "done" : "idle");
            if (!ran) {
                Utils.log("🕒", `本轮没有真正开始（多半在等上一轮的锁），${Math.max(1, Math.round((plan - now) / 60000))} 分钟后重试`);
            } else if (ok) {
                Utils.log("🕒", `本轮结束（用时 ${Math.max(0, Math.round((now - base) / 60000))} 分钟，上限 ${ROUND_BUDGET_MS / 60000} 分钟），下一轮 ${this.fmt(this.plan(now))}`);
            }
        },

        start(task) {
            if (this.started) return;
            this.started = true;
            this.startedAt = Date.now();
            this.task = task;

            /* 新上下文启动时先看遗留记录。
               执行者每 20 秒刷一次 aliveAt，所以「aliveAt 已经超过 ORPHAN_GRACE」
               就足以证明那个上下文已经不在了（浏览器关过 / 脚本重载 / 页面被回收）。
               这种情况下不用等满 RUN_STALE —— 用户关了浏览器再打开，
               旧记录可能才过去几十秒，以前就是卡在这一步：
               新实例看到「上一轮还在执行」直接不动，于是无论重开几次都一样。 */
            const st = this.getState();
            const staleRunning = st && st.phase === "running";
            const lastAct = staleRunning ? Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0) : 0;
            /* 有 aliveAt = 新版记录，心跳 20 秒一跳，45 秒没 Refresh 就肯定是残留；
               没有 aliveAt = 老版本留下的记录，分不清它是不是还在跑，
               保守一点，只按 RUN_STALE 判定。 */
            const grace = (st && Number(st.aliveAt) > 0) ? ORPHAN_GRACE : RUN_STALE;
            const ownerGone = staleRunning && (this.startedAt - lastAct) >= grace;
            const lock = Utils.lockInfo("Config.runLock");
            const lockGrace = (st && Number(st.aliveAt) > 0) ? ORPHAN_GRACE : RUN_LOCK_TTL;
            const lockOrphan = lock && !lock.mine && (this.startedAt - lock.ts) >= lockGrace;

            if (ownerGone) {
                this.state("done");
                Utils.log("♻️", `上一轮（${st.ctx || "未知"}）的执行上下文已不存在（最后心跳 ${this.fmt(lastAct)}），继续沿用它的遗留标记并接手`);
            } else if (staleRunning && this.isBusy(this.startedAt)) {
                Utils.log("🕒", `检测到另一个上下文正在执行（${st.ctx || "未知"}，最后心跳 ${this.fmt(lastAct)}），本上下文只负责调度，不重复跑`);
            }
            if ((ownerGone || lockOrphan) && lock && !lock.mine) {
                GM_setValue("Config.runLock", null);
                Utils.log("♻️", `已清理上一轮遗留的运行锁（${this.fmt(lock.ts)} 写入）`);
            }
            if (ownerGone && this.getClaim()) this.clearClaim();
            if (!staleRunning && !lockOrphan) {
                /* 没有遗留执行痕迹：顺手把过期的认领也清掉 */
                const claim = this.getClaim();
                if (claim && claim.at && this.startedAt - claim.at >= ORPHAN_GRACE) this.clearClaim();
            }

            const next = this.plan(this.startedAt);
            if (next > this.startedAt) this.saveNext(next);
            Utils.log("🕒", `常驻调度已启动（${this.ctxName()}上下文）：v${(GM_info.script && GM_info.script.version) || "?"}，每 ${CRON_PERIOD / 60000} 分钟一轮，下一轮 ${this.fmt(next)}`);
            this.arm(true);
        },

        arm(immediate) {
            if (this.timer) clearTimeout(this.timer);
            const now = Date.now();
            const next = this.plan(now);
            let wait;
            if (next > now) wait = Math.min(next - now, CRON_HEARTBEAT);
            else if (immediate) wait = 0;
            else wait = CRON_HEARTBEAT;
            this.timer = setTimeout(() => this.tick(), wait);
        },

        watchdog(now) {
            const claim = this.getClaim();
            if (!claim || !claim.at) return;
            if (this.isBusy(now)) return;
            if (now - claim.at <= CRON_STALL) return;
            Utils.log("♻️", `上次触发（${claim.ctx || "未知"}）${Math.round((now - claim.at) / 60000)} 分钟内没有真正开始执行，现在补跑`);
            this.clearClaim();
            this.fire(now);
        },

        tick() {
            this.timer = null;
            try {
                const now = Date.now();
                /* 先回收死掉的轮次，再算计划和补跑：
                   顺序反了的话 watchdog / fire 会对着一条死记录反复跳过。 */
                this.reapDeadRound(now);
                const next = this.plan(now);
                this.watchdog(now);
                EdgePacer.maybeReport().catch(() => {});
                const stopped = !GM_getValue("Config.keep", true)
                    && (Number(GM_getValue("Config.doneDate", 0)) || 0) === Utils.getTodayNum();
                if (!stopped && now >= next && !this.getClaim()) {
                    this.fire(now);
                } else if (now - this.lastHbLog >= (stopped ? CRON_HEARTBEAT_LOG_IDLE : CRON_HEARTBEAT_LOG)) {
                    this.lastHbLog = now;
                    GM_setValue("Config.heartbeatAt", now);
                    const st = this.getState() || {};
                    const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0);
                    const tip = stopped
                        ? "，今日任务已全部完成、检测已停止，明天自动恢复"
                        : this.isBusy(now)
                            ? `，本轮正在执行中（最后活动 ${Math.max(0, Math.round((now - lastAct) / 60000))} 分钟前）`
                            : this.getClaim() ? "，本轮已触发，正在等它跑起来" : `，约 ${Math.round((next - now) / 60000)} 分钟后进入下一轮`;
                    Utils.log("💓", `常驻调度心跳：后台实例已存活 ${Math.round((now - this.startedAt) / 60000)} 分钟${tip}`);
                }
            } catch (e) {
                Utils.log("🔴", `常驻调度异常：${e && e.message ? e.message : e}`);
            }
            this.arm(false);
        },

        /* 关键修复：一轮要是被挂死了（请求卡住 / 上下文被冻结），
           以前它的 running 阶段会一直挂着，于是每次触发都只会打印
           「上一轮任务还在执行中」然后跳过，看起来就是永久卡进程。
           这里按「最后活动时间」判定，超时就直接收掉，让下一轮正常进来。 */
        reapDeadRound(now = Date.now()) {
            const dead = this.reap(now);
            if (!dead) return false;
            Utils.log("♻️", `上一轮（${dead.ctx || "未知"}）已经 ${Math.max(0, Math.round((now - (dead.at || now)) / 60000))} 分钟没有动静，判定为卡死，已回收运行标记`);
            return true;
        },

        fire(now) {
            if (this.isBusy(now)) {
                const s = this.getState() || {};
                this.saveNext(now + 2 * 60 * 1000);
                Utils.log("🟡", `上一轮任务还在执行中（${s.ctx || "未知"}，最后活动 ${Math.max(0, Math.round((now - (s.at || now)) / 60000))} 分钟前），本次触发跳过`);
                return;
            }
            this.claim();
            this.state("claimed");
            Utils.log("⏰", `常驻调度：开始本轮任务（${this.ctxName()}上下文）`);
            try {
                const started = this.task();
                /* 任务入口是 async 的：必须把返回的 Promise 接住，
                   否则内部异常会变成未处理的 rejection，
                   finished 永远不跑，claim 也就一直挂着。 */
                if (started && typeof started.then === "function") {
                    started.catch(e => {
                        Utils.log("🔴", `本轮任务启动失败：${e && e.message ? e.message : e}`);
                        this.clearClaim();
                        this.saveNext(Date.now() + CRON_PERIOD);
                    });
                }
            } catch (e) {
                Utils.log("🔴", `本轮任务启动失败：${e && e.message ? e.message : e}`);
                this.clearClaim();
                this.saveNext(now + CRON_PERIOD);
            }
        }
    };

    let bootstrapped = false;
    const bootstrap = () => {
        if (bootstrapped) return;
        bootstrapped = true;
        TaskManager.init();

        Utils.probeCookiePermission().catch(() => {});

        const consumePendingPaste = () => {
            if (!GM_getValue("Config.pendingPaste", false) || !Utils.hasDOM()) return false;
            GM_setValue("Config.pendingPaste", false);
            Utils.waitForBody().then(ok => {
                if (!ok) return;
                setTimeout(() => {
                    Auth.pasteFlow().catch(e => Utils.log("🔴", `粘贴授权码失败：${e.message}`));
                }, 500);
            });
            return true;
        };
        if (!consumePendingPaste() && Utils.hasDOM()) {
            window.addEventListener("focus", () => {
                setTimeout(() => consumePendingPaste(), 300);
            }, { once: false });
        }
    };

    const isDayComplete = () => {
        TaskManager.init();
        const today = RewardsAuto.state.dateNowNum;
        const checkDone = (enabled, date) => !enabled || date === today;
        const processed = GM_getValue("Config.dailySetProcessed", []);
        const dailySetDone = (Array.isArray(processed) && processed.length > 0 && processed[0]?.date === today)
            || (Number(GM_getValue("Config.dailySetDoneDate", 0)) || 0) === today;
        const edgeDone = !GM_getValue("Tasks.edge", true)
            || !GM_getValue("Config.token", false)
            || (() => { const st = EdgeStreak.state(); return st.complete || st.giveUp; })();
        return checkDone(GM_getValue("Tasks.sign"), TaskManager.signDate) &&
            checkDone(GM_getValue("Tasks.read"), TaskManager.readDate) &&
            checkDone(GM_getValue("Tasks.promos"), TaskManager.promosDate) &&
            checkDone(GM_getValue("Tasks.search"), TaskManager.searchDate) &&
            dailySetDone &&
            edgeDone;
    };

    const markDayComplete = () => {
        const today = RewardsAuto.state.dateNowNum;
        const prev = Number(GM_getValue("Config.doneDate", 0)) || 0;
        GM_setValue("Config.doneDate", today);
        if (prev !== today) Utils.log("💤", "今日任务已全部完成，已停止检测（明天自动恢复）");
    };

    const init = () => {
        bootstrap();

        const isKeep = GM_getValue("Config.keep", true);
        if (!isKeep && isDayComplete()) {
            markDayComplete();
            Sched.finish(false);
            return;
        }
        const delay = Utils.randomRange(3000, 12000);
        Utils.log("⏳", `${(delay / 1000).toFixed(1)} 秒后启动...`);
        Sched.state("waiting", { runAt: Date.now() + delay });
        setTimeout(() => {
            Promise.resolve()
                .then(() => TaskManager.runAll())
                .catch(e => Utils.log("🔴", `本轮任务异常：${e && e.message ? e.message : e}`))
                .finally(() => Sched.finish(true, TaskManager.lastRunStarted));
        }, delay);
    };

    const isBingSearchPage = typeof location !== "undefined"
        && location.hostname
        && (location.hostname === "www.bing.com" || location.hostname === "cn.bing.com");

    if (IS_OAUTH_CALLBACK) {
        Auth.handleCallback().catch(e => Utils.log("🔴", `授权回调处理失败：${e.message}`));
        return;
    }

    if (isBingSearchPage) {

        const sp = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); } })();
        const isRewardSearch = /^(ML2W4J|ML2Y2H)$/i.test(sp.get("form") || "")
            || (sp.get("PUBL") || "").toUpperCase() === "REWARDSDO";

        if (isRewardSearch) {
            Promise.resolve().then(async () => {
                try {
                    const host = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
                    let ready = false;
                    for (let i = 0; i < 24; i++) {
                        await Utils.delay(500);
                        if (typeof host.sj_rra === "function" && typeof host.sj_gx === "function") { ready = true; break; }
                    }
                    if (!ready) {
                        GM_log("🎯 奖励搜索页：页面未提供 sj_rra（非 Bing 奖励页或模块未加载）");
                        return;
                    }
                    const href = String(location.href || "");
                    const rdrig = sp.get("rdrig") || "";
                    const ig = String((host._G && host._G.IG) || "");
                    host.sj_rra(href);
                    GM_log(`🎯 奖励搜索页：已调用 sj_rra（IG=${ig.slice(0,12)||"无"} rdrig=${rdrig ? rdrig.slice(0,8) : "无"}）`);
                    GM_setValue("Config.rewardSearchSeenAt", Date.now());

                    GM_log("🎯 注意：sj_rra 已尽力上报；若卡片仍显示未完成，需在 earn 页手动点一次该卡");
                } catch (e) {
                    GM_log(`🎯 奖励搜索页处理异常：${e.message}`);
                }
            });
        }
        GM_log("⏭️ 当前为 Bing 搜索页，跳过脚本初始化（防止重复执行/打开多余页面）");
        return;
    }

    bootstrap();
    Sched.start(init);

    const diagSchedStatus = () => {
        const now = Date.now();
        const next = Sched.plan(now);
        const last = Sched.lastRun();
        const st = Sched.getState();
        const claim = Sched.getClaim();
        const lock = Utils.lockInfo("Config.runLock");
        const phaseText = { claimed: "已触发，等待执行", waiting: "等待延时结束", running: "正在执行", done: "上一轮已完成", idle: "空闲" };
        const lastAct = st ? Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0) : 0;
        let text = "🕒 常驻调度状态\n\n";
        text += `调度间隔：${CRON_PERIOD / 60000} 分钟\n`;
        text += `最近结束：${Sched.fmt(last)}\n`;
        text += `下次触发：${Sched.fmt(next)}（约 ${Math.max(0, Math.ceil((next - now) / 60000))} 分钟后）\n`;
        text += `运行阶段：${st ? (phaseText[st.phase] || st.phase) : "未知"}${st && st.ctx ? `（${st.ctx}）` : ""}\n`;
        if (st) {
            text += `  最后进展：${Sched.fmt(st.at)}（${Math.max(0, Math.round((now - (Number(st.at) || 0)) / 60000))} 分钟前）\n`;
            text += `  最后心跳：${Sched.fmt(st.aliveAt)}${st.aliveAt ? `（${Math.max(0, Math.round((now - Number(st.aliveAt)) / 1000))} 秒前）` : "（未记录）"}\n`;
        }
        if (lock) text += `运行锁：${lock.mine ? "✅ 本上下文持有" : "🔒 其它上下文持有"}（${Sched.fmt(lock.ts)} 更新）\n`;
        else text += "运行锁：空闲\n";
        if (claim) text += `当前认领：${claim.ctx || "未知"}，${Sched.fmt(claim.at)}\n`;
        text += `本次上下文：${Sched.ctxName()}（已运行 ${Math.round((now - Sched.startedAt) / 60000)} 分钟）\n`;
        text += `卡死阈值：心跳 ${RUN_STALE / 60000} 分钟 / 无进展 ${ROUND_STALL / 60000} 分钟 / 单轮硬上限 ${ROUND_HARD_LIMIT / 60000} 分钟\n\n`;
        if (st && st.phase === "running" && !Sched.isBusy(now)) {
            text += `⚠️ 有一条 running 记录已经 ${Math.max(0, Math.round((now - lastAct) / 60000))} 分钟没动静，下一次调度会自动回收它。\n\n`;
        }
        text += "「运行阶段」一直停在「已触发」或「等待延时结束」，说明触发它的上下文被打断了，\n调度会自动补跑；也可以打开任意 rewards.bing.com 页面立刻救一轮。";
        return text;
    };

    const diagResetSchedule = () => {
        Sched.clearClaim();
        GM_setValue("Config.runState", null);
        GM_setValue("Config.cronNextRun", null);
        try { GM_setValue("Config.runLock", null); } catch (_) {}
        Utils.log("🧹", "调度计划已重置（含运行锁），下一轮将立刻开始");
        Sched.arm(true);
    };

    try {
        const host = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : globalThis;
        host.__MPDiagnostics = {
            edgeStreak: diagEdgeStreak,
            pcSearch: diagPcSearch,
            region: diagRegion,
            schedule: diagSchedStatus,
            resetSchedule: diagResetSchedule,
            releaseLock: diagReleaseLock,
            claim: diagClaim
        };
    } catch (_) {}

    if (typeof __MP_TEST_HOOK__ === "function") {
        try {
            __MP_TEST_HOOK__({ Utils, API, RewardsAuto, RegionGuard, Webhooks, Sched, TaskManager, Auth,
                CardLock, SEARCH_PACER, EdgeStreak, EdgePacer, UA, EDGE, CDP,
                BrowserEnv, ActionMap, ClaimPoints, MONTHLY });
        } catch (_) {}
    }

    if (!Utils.hasDOM()) {
        return new Promise(() => {});
    }
})();

if (__scBgKeepAlive && typeof __scBgKeepAlive.then === "function") {
    return __scBgKeepAlive;
}
