// ==UserScript==
// @name         B站成分雷达 (BiliRadardar)
// @version      1.2.0
// @author       xulaupuz,trychen,oyyo
// @namespace    trychen.com
// @license      GPLv3
// @description  支持B站 Shadow DOM 评论区检测，视口自动排队检测，内置最新图标与 onerror 防裂图机制，同UID检测结果自动复用缓存，source：https://github.com/trychen/bilibili-comment-checker
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/read/*
// @match        https://www.bilibili.com/bangumi/*
// @match        https://www.bilibili.com/opus/*
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @icon         https://static.hdslb.com/images/favicon.ico
// @connect      bilibili.com
// @connect      api.typesafe.ai
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==


(function () {
    'use strict';

    function queryShadowDOM(selector, root = document) {
        let matches = [];
        let seen = new Set();

        function traverse(node) {
            if (!node) return;

            // 若当前节点本身包含 shadowRoot，先穿透遍历其内部 Shadow DOM
            if (node.shadowRoot) {
                traverse(node.shadowRoot);
            }

            if (node.querySelectorAll) {
                try {
                    let els = node.querySelectorAll(selector);
                    for (let i = 0; i < els.length; i++) {
                        let el = els[i];
                        if (!seen.has(el)) {
                            seen.add(el);
                            matches.push(el);
                        }
                    }
                } catch (e) {}

                let children = node.querySelectorAll('*');
                for (let i = 0; i < children.length; i++) {
                    if (children[i].shadowRoot) {
                        traverse(children[i].shadowRoot);
                    }
                }
            }
        }

        traverse(root);
        return matches;
    }

    // 跨越 Shadow DOM 边界向上查找匹配选择器的最近祖先节点
    function closestCrossShadow(el, selector) {
        if (!el || !selector) return null;
        let current = el;
        while (current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                if (current.matches && current.matches(selector)) {
                    return current;
                }
                if (current.closest) {
                    try {
                        let found = current.closest(selector);
                        if (found) return found;
                    } catch (e) {}
                }
            }
            let root = current.getRootNode ? current.getRootNode() : null;
            if (root && root instanceof ShadowRoot) {
                current = root.host;
            } else {
                current = current.parentElement || current.parentNode;
            }
        }
        return null;
    }

    // 提取评论节点文本，严格剔除 <style> CSS 与脚本，保留表情包 alt 文字
    function extractCommentText(el) {
        if (!el) return '';
        try {
            // 1. 精准定位正文容器：优先在 shadowRoot 或自身查找 #contents / .text-con / .reply-content
            let root = el.shadowRoot || el;
            let contentEl = (root.querySelector && root.querySelector('#contents, .text-con, .reply-content, .contents')) ||
                            (el.querySelector && el.querySelector('#contents, .text-con, .reply-content, .contents')) ||
                            null;

            let target = contentEl || root;

            // 若目标本身为 style/script 标签，直接返回空
            let targetTag = target.tagName ? target.tagName.toLowerCase() : '';
            if (targetTag === 'style' || targetTag === 'script' || targetTag === 'link') {
                return '';
            }

            // 2. 将子节点克隆进虚拟容器处理，显式跳过所有 style, script, link 元素
            let tempDiv = document.createElement('div');
            let children = target.childNodes || [];
            for (let i = 0; i < children.length; i++) {
                let child = children[i];
                let tag = child.tagName ? child.tagName.toLowerCase() : '';
                if (tag === 'style' || tag === 'script' || tag === 'link') {
                    continue;
                }
                try {
                    tempDiv.appendChild(child.cloneNode(true));
                } catch (_) {}
            }

            // 双重防护：移除内部可能残余的所有 style 和 script 节点
            try {
                tempDiv.querySelectorAll('style, script, link').forEach(s => s.remove());
            } catch (_) {}

            // 3. 将表情包图片 <img class="emoji" alt="[doge]"> 替换为文本 alt
            try {
                let imgs = tempDiv.querySelectorAll('img[alt]');
                for (let i = 0; i < imgs.length; i++) {
                    let img = imgs[i];
                    let alt = img.getAttribute('alt');
                    if (alt) {
                        img.replaceWith(document.createTextNode(alt));
                    }
                }
            } catch (_) {}

            let text = (tempDiv.textContent || '').trim();

            // 4. 终极文本清洗：如果文本意外包含了 :host 或 CSS 规则残片，使用正则剔除
            if (text.includes(':host') || text.includes('--bili-rich-text') || text.includes('var(--')) {
                text = text.replace(/:host\s*\{[^}]*\}/gi, '');
                text = text.replace(/--bili-rich-text-[^;]+;?/gi, '');
                text = text.replace(/var\(--[^)]+\)/gi, '');
                text = text.replace(/(color|font|display|white-space|word-break):[^;]+;?/gi, '');
            }

            return text.trim().replace(/\s+/g, ' ');
        } catch (err) {
            console.warn("[extractCommentText] 异常:", err);
            let fallback = (el.textContent || '').trim();
            fallback = fallback.replace(/:host\s*\{[^}]*\}/gi, '').replace(/--bili-rich-text-[^;]+;?/gi, '').trim();
            return fallback.replace(/\s+/g, ' ');
        }
    }

    function getUserId(el) {
        if (!el) return null;
        let uid = el.getAttribute("data-user-id") ||
            el.getAttribute("data-usercard-mid") ||
            el.getAttribute("user-id") ||
            el.getAttribute("data-user-profile-id") ||
            el.getAttribute("mid");
        if (uid) return uid;

        let href = el.getAttribute("href") || (closestCrossShadow(el, 'a')?.getAttribute("href"));
        if (href) {
            let match = href.match(/space\.bilibili\.com\/(\d+)/);
            if (match && match[1]) return match[1];
        }

        let childA = el.querySelector ? el.querySelector('a[href*="space.bilibili.com"]') : null;
        if (childA) {
            let match = childA.getAttribute("href").match(/space\.bilibili\.com\/(\d+)/);
            if (match && match[1]) return match[1];
        }

        return null;
    }

    // 确保用户名与成分标签容器支持自动换行，防止挤压文字竖排
    function ensureContainerWrap(element) {
        if (!element) return;
        try {
            element.style.whiteSpace = 'nowrap';
            element.style.flexShrink = '0';

            let parent = element.parentElement;
            if (parent) {
                parent.style.flexWrap = 'wrap';
                parent.style.rowGap = '4px';
                parent.style.alignItems = 'center';
                try {
                    if (window.getComputedStyle && window.getComputedStyle(parent).display === 'inline') {
                        parent.style.display = 'inline-flex';
                    }
                } catch (_) {}
            }

            let root = element.getRootNode ? element.getRootNode() : null;
            if (root && root instanceof ShadowRoot && root.host) {
                root.host.style.flexWrap = 'wrap';
                if (root.host.parentElement) {
                    root.host.parentElement.style.flexWrap = 'wrap';
                }
            }
        } catch (_) {}
    }

    const spaceApiUrl = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=';
    const followingApiUrl = 'https://api.bilibili.com/x/relation/followings?vmid=';

    const checked = {};
    const checking = {};
    const autoCheckQueue = [];
    const trollAnalysisCache = {};

    const searchIcon = `<svg width="12" height="12" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M16.3451 15.2003C16.6377 15.4915 16.4752 15.772 16.1934 16.0632C16.15 16.1279 16.0958 16.1818 16.0525 16.2249C15.7707 16.473 15.4456 16.624 15.1854 16.3652L11.6848 12.8815C10.4709 13.8198 8.97529 14.3267 7.44714 14.3267C3.62134 14.3267 0.5 11.2314 0.5 7.41337C0.5 3.60616 3.6105 0.5 7.44714 0.5C11.2729 0.5 14.3943 3.59538 14.3943 7.41337C14.3943 8.98802 13.8524 10.5087 12.8661 11.7383L16.3451 15.2003ZM2.13647 7.4026C2.13647 10.3146 4.52083 12.6766 7.43624 12.6766C10.3517 12.6766 12.736 10.3146 12.736 7.4026C12.736 4.49058 10.3517 2.1286 7.43624 2.1286C4.50999 2.1286 2.13647 4.50136 2.13647 7.4026Z" fill="currentColor"></path></svg>`;

    // 默认备用图标（B站Favicon）
    const fallbackIcon = "https://static.hdslb.com/images/favicon.ico";

    // TypeSafe AI (Jev) 默认配置与存储机制
    const defaultTypeSafeConfig = {
        apiKey: '',
        endpoint: 'https://api.typesafe.ai/v1/systemone',
        model: 'jev-latest',
        enabled: false
    };

    const defaultTrollRubric = {
        version: "1.3.0",
        name: "B站评论区串子/带节奏识别准则",
        questions: {
            is_troll: {
                type: "noul",
                instructions: "判定目标用户在发言中是否属于‘恶意串子/反串水军/刻意带节奏者’。特别注意：在当前二次元/游戏社区中，许多恶意串子并不使用粗俗脏话，而是刻意借‘男女角色绑定’、‘角色CP（如将女角色称为xx夫人、给角色组CP、祝某某锁死）’、‘戏谑男角色出去霍霍其他女角色’、‘戴帽子/看戒指节奏’、借‘xx也有自己的生活’进行滑坡嘲弄、‘投降书/恶意氪金反讽’，或表面极度狂热肉麻/高调口号/大量爱心表情（如‘挺起胸膛我们最棒’、带[给心心]、[打call]、[笑哭]），行借争议点恶意恶心玩家、假粉反串捧杀、挑拨社区对立、搞玩家心态之实。只要发言具有此类借题发挥、反串戏谑、借争议点挑衅制造矛盾的行为，即属于恶意串子。",
                criteria: {
                    true: [
                        "【借男女角色关系/CP故意挑衅搞心态】在评论区故意以戏谑、反串口吻将女性角色定性为某男性角色的'夫人/伴侣'，或调侃男角色'霍霍其他女角色'、给角色'戴帽子/看戒指'、祝角色'锁紧锁死'等（如：'安魂曲夫人小心啊，管严一点别让白大哥又出去霍霍其他女角色[笑哭]'、'喜欢给白藏兄弟戴帽子吗？你不会没看到三命图里的戒指吧？'、'官方一创cp...祝高甜的安白99啦'）。表面看似打趣，实则恶意利用社区敏感雷区恶心正常玩家，属于典型的反串串子",
                        "【借捧暗讽/表面祝贺实则阴阳】表面采用夸奖、打call或祝贺句式，实则暗藏贬损、嘲讽或借题发挥（如：'什么时候能做到不瘟不火，就是对玩家最大的报答了[打call]'）",
                        "【假粉反串/借CP觉醒图高调反向捧杀】表面极度狂热夸张，使用虚浮高调口号（如'来自正式服的认可'、'挺起胸膛我们是最棒的'、'高甜剧情再来多点[给心心]'、'官方一创cp...祝高甜安白99'）刻意借争议觉醒图或CP关系反向大肆吹捧，表面打气实则恶意借雷区激化社区矛盾对立",
                        "【反串检讨书/反语抵制与退坑煽动】采用'投降书'、'认罪检讨'等戏谑格式，用'承认恶意氪金'等反语构陷游戏机制，表面祝贺蒸蒸日上，实则在评论区煽动停氪弃坑或冷嘲热讽正常玩家（如：'投降书🏳️🏳️🏳️ 本人承认之前对异环有过恶意氪金的行为...在未来我会坚决抵制恶意氪金'）",
                        "【反讽洗地/白骑士反串嘲弄】故意以极其夸张的弱者视角或推脱之词帮官方“叫屈辩解”（如：'面对天崩地裂,末日降临的危机时，官方又能怎么办啊？不要为难人家啦[大哭]'），实则通过反串洗地行极端嘲弄之实",
                        "【荒诞滑坡反讽/借公关话术借题发挥】抓住官方或社区公关黑梗（如“xx也有自己的生活”），故意进行逻辑荒谬的无限滑坡演绎（如：'什么时候发个公告，公告一下数据也有自己的生活，墙也有自己的生活水泥也有自己的生活...这不是压榨电脑吗？我们电脑也有自己的脑权😡'）",
                        "【反串道德审判/宏大叙事构陷】以极其夸张严厉的审查卫士姿态，高举“主流价值观”、“保护未成年”等宏大旗号，对正常二创或立绘扣大帽子，反向挑起社区审查争议与道德对立（如：'报告环大人，今天也是努力捍卫海特洛主流价值观的一天...严防死守社会底线'）",
                        "【黑称复读/纯粹发泄恶意与制造焦虑】频繁复读游戏或厂商侮辱性黑称（如'瘟'、'冥'等），脱离客观评测与事实，通篇只为发泄攻击欲、宣泄恶意、唱衰作品（如：'瘟瘟瘟，今天又要bug谁瘟，1.4结束都拿不动一个门面，开服门面能叫门面吗'）",
                        "【魔怔发病/极端脑补挑起角色对立】虚构极其荒诞、暴力、羞辱性的角色剧情或极端受虐情节，以抽象或发病形式挑衅特定角色受众与玩家情感（如：'很难想象镜流去自首后，景元蒙着面删了她一巴掌再来个审问完之后有她好受镜流终于昏了过去，我们的崩铁会变成什么样子[大哭][大哭]'）",
                        "【无客观论据扣帽子与人身攻击】直接使用攻击性画像标签（如'经典XX'、'差不多得了'、'XX人是这样的'、'典中典'、'孝子'）进行定性或人身攻击，无事实论证",
                        "【无端拉踩对立】在与讨论焦点无关的情境下，故意提及竞品作品、对立阵营或圈子历史黑料煽动敌意，诱导玩家群体间的大规模互撕"
                    ],
                    false: [
                        "【客观评测与真实体验反馈】正常讨论角色技能机制、倍率毒点、数值强度、抽取建议、深渊表现或时装美工建议（如分析满命提升、建议深渊难度、反馈时装红黑比例与饱和度等客观评测）",
                        "【普通玩家求助与攻略问答】询问卡池复刻时间、专武搭配、配队养成攻略（如'4命还需要补满吗'、'专武能给薄荷用吗'）",
                        "【普通日常交流与善意互动】完全不涉及角色CP敏感雷区、不带挑衅暗示的正常互动（注意：凡涉及把角色定性为某人夫人、戏谑男角色霍霍女角色、戴帽子看戒指、复读黑称、投降书反语、借争议觉醒图高调吹捧等言论，绝不属于正常善意互动）"
                    ]
                }
            },
            troll_type: {
                type: "choice",
                instructions: "该用户的发言表现出哪种主要特征类型？",
                criteria: {
                    normal: "正常表达：抽取建议、攻略提问、数值机制分析、时装美工客观建议等正常讨论",
                    emotional_vent: "情绪吐槽：言辞较激烈或粗暴宣泄，但属真实玩家关于机制缺陷/Bug的正常抱怨",
                    sarcastic_bait: "阴阳怪气/反串搞心态：表面祝贺/辩解实则贬损、借男女角色/CP挑衅、戴帽子看戒指、投降书反语或滑坡反讽",
                    faction_conflict: "阵营拉踩/反串捧杀：刻意借争议点高调反串吹捧、制造群体对立、道德审判构陷或魔怔发病",
                    malicious_smear: "造谣抹黑/黑称唱衰：脱离客观事实、频繁复读侮辱性黑称（如'瘟'）、断章取义制造焦虑与唱衰"
                }
            }
        },
        custom_supplement_rules: [
            "若评论表面充满爱心表情（如[给心心]、[打call]、💖）或笑哭[笑哭]，但内容刻意涉及高争议性男女角色关系、CP绑定、xx夫人、霍霍女角色、戴帽子等，应判定为 true",
            "若评论采用'投降书'、'检讨书'反讽格式，或借'恶意氪金'等反语借题发挥煽动抵制，判定为 true",
            "若评论以'xx也有自己的生活'等荒谬滑坡讽刺或白骑士叫屈反串口吻借题发挥，判定为 true",
            "若评论出现厂商/作品侮辱性黑称复读（如'瘟瘟瘟'）且无建设性事实陈述，判定为 true"
        ]
    };

    const trollTypeNames = {
        normal: "正常交流",
        emotional_vent: "情绪吐槽",
        sarcastic_bait: "阴阳怪气/反串搞心态",
        faction_conflict: "阵营拉踩/反串捧杀",
        malicious_smear: "恶意抹黑/黑称唱衰"
    };

    function loadTypeSafeConfig() {
        try {
            let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_config') : localStorage.getItem('bili_typesafe_config');
            if (stored) {
                let parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                if (parsed && typeof parsed === 'object') {
                    return {
                        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
                        endpoint: typeof parsed.endpoint === 'string' && parsed.endpoint.trim() ? parsed.endpoint.trim() : defaultTypeSafeConfig.endpoint,
                        model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : defaultTypeSafeConfig.model,
                        enabled: Boolean(parsed.enabled)
                    };
                }
            }
        } catch (e) {
            console.error("[成分检测] 读取 TypeSafe 配置失败", e);
        }
        return JSON.parse(JSON.stringify(defaultTypeSafeConfig));
    }

    let typeSafeConfig = loadTypeSafeConfig();

    function getTypeSafeConfig() {
        return typeSafeConfig;
    }

    function saveTypeSafeConfig(newConfig) {
        typeSafeConfig = {
            apiKey: (newConfig.apiKey || '').trim(),
            endpoint: (newConfig.endpoint || '').trim() || defaultTypeSafeConfig.endpoint,
            model: (newConfig.model || '').trim() || defaultTypeSafeConfig.model,
            enabled: Boolean(newConfig.enabled)
        };
        let jsonStr = JSON.stringify(typeSafeConfig);
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('bili_typesafe_config', jsonStr);
        }
        localStorage.setItem('bili_typesafe_config', jsonStr);
        return typeSafeConfig;
    }

    function showToast(msg) {
        let toast = document.createElement('div');
        toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85); color: #fff; padding: 8px 18px;
        border-radius: 20px; font-size: 13px; z-index: 1000005;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); transition: opacity 0.3s;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    }

    // 默认成分配置清单
    const defaultCheckers = [
        {
            displayName: "绝区零",
            displayIcon: "https://i1.hdslb.com/bfs/face/75ad0ecdbf7c6a5c801e4f3945457bc961da3c9f.jpg@128w_128h_1c_1s.webp",
            keywords: ["#绝区零#", "互动抽奖 #绝区零", "绝区零", "Zenless Zone Zero", "邦布"],
            followings: [1636034895]
        },
        {
            displayName: "明日方舟",
            displayIcon: "https://i1.hdslb.com/bfs/face/d4005a0f9b898d8bb049caf9c6355f8e8f772a8f.jpg@128w_128h_1c_1s.webp",
            keywords: ["#明日方舟#", "明日方舟", "鹰角", "罗德岛"],
            followings: [161775300]
        },
        {
            displayName: "明日方舟终末地",
            displayIcon: "https://i1.hdslb.com/bfs/face/84152816c725e6d38128336d0f99d7c7c258cfa4.jpg@128w_128h_1c_1s.webp",
            keywords: ["#明日方舟终末地#", "#终末地#", "明日方舟终末地", "明日方舟：终末地", "终末地", "Endfield", "Arknights: Endfield"],
            followings: [1265652806]
        },
        {
            displayName: "异环",
            displayIcon: "https://i0.hdslb.com/bfs/face/5790579b2517b237df23d765719157ddf3537091.jpg",
            keywords: ["异环", "NTE", "Neverness To Everness", "我们play的异环"],
            followings: [3546636978489848]
        },
        {
            displayName: "黑神话悟空",
            displayIcon: "https://i1.hdslb.com/bfs/face/83e2465c27a1afb69316d270a94cbf9ca64a4070.jpg@128w_128h_1c_1s.webp",
            keywords: ["黑神话", "黑神话悟空", "黑神话：悟空", "天命人", "黑神话悟空攻略在此", "黑马喽"],
            followings: [642465224]
        },
        {
            displayName: "无畏契约",
            displayIcon: "https://i0.hdslb.com/bfs/face/b854b73b5f65f3efeb42e8ea027d140e6c518aa2.jpg",
            keywords: ["无畏契约", "瓦罗兰特", "VALORANT", "#无畏契约！#"],
            followings: [1420556272]
        },
        {
            displayName: "原神",
            displayIcon: "https://i2.hdslb.com/bfs/face/d2a95376140fb1e5efbcbed70ef62891a3e5284f.jpg",
            keywords: ["互动抽奖 #原神", "#原神#", "#米哈游#", "#miHoYo#", "原神"],
            followings: [401742377]
        },
        {
            displayName: "鸣潮",
            displayIcon: "https://i1.hdslb.com/bfs/face/0abd6b9df304334a9388e968740b5b9b7d1a84be.jpg@128w_128h_1c_1s.webp",
            keywords: ["#鸣潮#", "鸣潮", "库洛", "漂泊者"],
            followings: [2144596522]
        },
        {
            displayName: "崩坏星穹铁道",
            displayIcon: "https://i2.hdslb.com/bfs/face/c27e19b8861be105b9d80b6743756c35027ae736.jpg",
            keywords: ["互动抽奖 #崩坏星穹铁道", "关注并转发本条动态，帕姆将", "#崩坏星穹铁道#", "星穹铁道", "崩铁"],
            followings: [1340190821, 508103429]
        },
        {
            displayName: "王者荣耀",
            displayIcon: "https://i2.hdslb.com/bfs/face/effbafff589a27f02148d15bca7e97031a31d772.jpg",
            keywords: ["互动抽奖 #王者荣耀", "#王者荣耀#", "王者荣耀"],
            followings: [57863910, 392836434]
        },
        {
            displayName: "英雄联盟",
            displayIcon: "https://i1.hdslb.com/bfs/face/544c89e68f2b1f12ffcbb8b3c062a3328e8692d9.jpg@240w_240h_1c_1s_!web-avatar-search-user.webp",
            keywords: ["英雄联盟", "LOL", "LPL", "S14", "S15", "Faker"],
            followings: [50329118]
        },
        {
            displayName: "崩坏3",
            displayIcon: "https://i0.hdslb.com/bfs/face/f861b2ff49d2bb996ec5fd05ba7a1eeb320dbf7b.jpg",
            keywords: ["互动抽奖 #崩坏", "关注爱酱并转发本条动态", "#崩坏3#", "崩坏3"],
            followings: [27534330]
        },
        {
            displayName: "碧蓝航线",
            displayIcon: "https://i1.hdslb.com/bfs/face/1fd5b43d5f619e6df8c8adcf13c962a3e80ee971.jpg@128w_128h_1c_1s.webp",
            keywords: ["碧蓝航线", "蛮啾"],
            followings: [233114659]
        },
        {
            displayName: "永劫无间",
            displayIcon: "https://i0.hdslb.com/bfs/face/15d97f262a677462fa1a0be5b8a07153723bdcd1.jpg",
            keywords: ["永劫无间", "NARAKA"],
            followings: [597280387]
        },
        {
            displayName: "VTB",
            displayIcon: "https://i2.hdslb.com/bfs/face/d399d6f5cf7943a996ae96999ba3e6ae2a2988de.jpg",
            keywords: ["@嘉然今天吃什么", "东雪莲", "永雏塔菲", "vtuber", "vtb"],
            followings: [672328094, 1437582453, 1265680561]
        },
        {
            displayName: "Asoul",
            displayIcon: "https://i2.hdslb.com/bfs/face/43b21998da8e7e210340333f46d4e2ae7ec046eb.jpg",
            keywords: ["@A-SOUL_Official", "#A_SOUL#"],
            followings: [703007996, 547510303, 672342685, 351609538, 672346917, 672353429]
        },
        {
            displayName: "无限大",
            displayIcon: "https://i1.hdslb.com/bfs/face/354f81e2d54c7ff3481727244f71989db225d23e.jpg@128w_128h_1c_1s.webp",
            keywords: ["#代号无限大#", "#无限大#", "代号无限大", "无限大", "Project Ananta", "Ananta"],
            followings: [3494379073309365]
        }
    ];

    function loadCheckers() {
        try {
            let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_composition_checkers') : localStorage.getItem('bili_composition_checkers');
            if (stored) {
                let parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("[成分检测] 读取配置失败", e);
        }
        return JSON.parse(JSON.stringify(defaultCheckers));
    }

    let checkers = loadCheckers();

    function getCheckers() {
        return checkers;
    }

    function saveCheckers(newCheckers) {
        checkers = newCheckers;
        let jsonStr = JSON.stringify(newCheckers);
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('bili_composition_checkers', jsonStr);
        }
        localStorage.setItem('bili_composition_checkers', jsonStr);
    }

    function loadTrollRubric() {
        try {
            let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_troll_rubric') : localStorage.getItem('bili_typesafe_troll_rubric');
            if (stored) {
                let parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                if (parsed && typeof parsed === 'object' && parsed.questions) {
                    // 如果用户没有进行手动修改过配置，或者版本落后于默认版本，自动同步到新版本
                    if (!parsed.is_custom_user_override && parsed.version !== defaultTrollRubric.version) {
                        parsed = JSON.parse(JSON.stringify(defaultTrollRubric));
                        saveTrollRubric(parsed, false);
                    }
                    return parsed;
                }
            }
        } catch (e) {
            console.error("[串子识别] 读取 Rubric 配置失败", e);
        }
        return JSON.parse(JSON.stringify(defaultTrollRubric));
    }

    let trollRubric = loadTrollRubric();

    function hasCustomTrollRubric() {
        try {
            let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_troll_rubric') : localStorage.getItem('bili_typesafe_troll_rubric');
            return !!stored;
        } catch (e) {
            return false;
        }
    }

    function saveTrollRubric(newRubric, isExplicitUserAction = false) {
        if (isExplicitUserAction) {
            newRubric.is_custom_user_override = true;
        }
        trollRubric = newRubric;
        let jsonStr = JSON.stringify(newRubric);
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('bili_typesafe_troll_rubric', jsonStr);
        }
        localStorage.setItem('bili_typesafe_troll_rubric', jsonStr);
        return trollRubric;
    }

    function resetTrollRubric() {
        if (typeof GM_deleteValue !== 'undefined') {
            GM_deleteValue('bili_typesafe_troll_rubric');
        }
        localStorage.removeItem('bili_typesafe_troll_rubric');
        trollRubric = JSON.parse(JSON.stringify(defaultTrollRubric));
        return trollRubric;
    }

    function validateTrollRubric(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return { valid: false, error: '配置必须为有效的 JSON 对象' };
        }
        if (!obj.questions || typeof obj.questions !== 'object') {
            return { valid: false, error: '缺少 questions 定义对象' };
        }
        if (!obj.questions.is_troll || obj.questions.is_troll.type !== 'noul') {
            return { valid: false, error: '缺少 questions.is_troll 或其 type 不为 "noul"' };
        }
        if (!obj.questions.troll_type || obj.questions.troll_type.type !== 'choice') {
            return { valid: false, error: '缺少 questions.troll_type 或其 type 不为 "choice"' };
        }
        if (!obj.questions.is_troll.criteria || typeof obj.questions.is_troll.criteria !== 'object') {
            return { valid: false, error: 'questions.is_troll 必须包含 criteria 判定准则对象' };
        }
        if (!obj.questions.troll_type.criteria || typeof obj.questions.troll_type.criteria !== 'object') {
            return { valid: false, error: 'questions.troll_type 必须包含 criteria 类别描述对象' };
        }
        return { valid: true, data: obj };
    }

    function exportRubricToFile(rubric) {
        try {
            let jsonStr = JSON.stringify(rubric, null, 2);
            let blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = `chuanzi_rubric_config_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('已导出 Rubric 准则文件到本地！');
        } catch (e) {
            showToast('导出准则失败：' + e.message);
        }
    }

    function testTypeSafeConnection(config) {
        return new Promise((resolve, reject) => {
            const apiKey = (config.apiKey || '').trim();
            if (!apiKey) {
                return reject(new Error('请先填写 TypeSafe API Key！'));
            }

            const endpoint = (config.endpoint || '').trim() || defaultTypeSafeConfig.endpoint;
            const model = (config.model || '').trim() || defaultTypeSafeConfig.model;

            const payload = JSON.stringify({
                model: model,
                state: "ping test connection",
                questions: {
                    ping: {
                        type: "noul",
                        instructions: "Is this a connection test?"
                    }
                }
            });

            let requestFunction = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);

            if (requestFunction) {
                requestFunction({
                    method: 'POST',
                    url: endpoint,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: payload,
                    timeout: 10000,
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                const data = JSON.parse(res.responseText);
                                resolve({ success: true, message: `连接成功 (HTTP ${res.status})！Jev 模型响应正常。`, data });
                            } catch (e) {
                                resolve({ success: true, message: `连接成功 (HTTP ${res.status})！`, raw: res.responseText });
                            }
                        } else if (res.status === 401) {
                            reject(new Error(`认证失败 (401 Unauthorized)：API Key 无效或未授权，请检查输入的 Key。`));
                        } else if (res.status === 403) {
                            reject(new Error(`访问受限 (403 Forbidden)：无权访问该模型 (${model}) 或该接口。`));
                        } else if (res.status === 404) {
                            reject(new Error(`端点未找到 (404 Not Found)：请检查 Endpoint 地址是否正确。`));
                        } else if (res.status === 429) {
                            reject(new Error(`请求过于频繁或配额超限 (429 Too Many Requests)。`));
                        } else {
                            let detail = '';
                            try {
                                const errJson = JSON.parse(res.responseText);
                                detail = errJson.message || errJson.error || JSON.stringify(errJson);
                            } catch (_) {
                                detail = res.responseText || `HTTP ${res.status}`;
                            }
                            reject(new Error(`服务响应异常 (${res.status}): ${detail}`));
                        }
                    },
                    ontimeout: () => {
                        reject(new Error('请求超时 (10s)，请检查网络连接或 Endpoint 地址。'));
                    },
                    onerror: (err) => {
                        reject(new Error('网络请求异常，请检查油猴 @connect 权限或跨域网络连接。'));
                    }
                });
            } else if (typeof fetch !== 'undefined') {
                fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: payload
                }).then(async (res) => {
                    if (res.ok) {
                        resolve({ success: true, message: `连接成功 (HTTP ${res.status})！Jev 模型响应正常。` });
                    } else if (res.status === 401) {
                        reject(new Error(`认证失败 (401 Unauthorized)：API Key 无效。`));
                    } else {
                        const txt = await res.text().catch(() => '');
                        reject(new Error(`服务响应异常 (${res.status}): ${txt}`));
                    }
                }).catch(err => {
                    reject(new Error(`网络请求失败: ${err.message}`));
                });
            } else {
                reject(new Error('未检测到可用的网络请求环境 (GM_xmlhttpRequest / fetch)'));
            }
        });
    }

    // 调用 TypeSafe AI Jev 进行串子识别
    function analyzeTrollWithJev(state) {
        return new Promise((resolve, reject) => {
            const cfg = loadTypeSafeConfig();
            if (!cfg.apiKey) {
                return reject(new Error('未配置 API Key'));
            }
            if (!cfg.enabled) {
                return reject(new Error('未启用 TypeSafe AI'));
            }

            const rubric = loadTrollRubric();
            const isTrollQ = rubric.questions.is_troll;
            const trollTypeQ = rubric.questions.troll_type;

            let trueCriteria = Array.isArray(isTrollQ.criteria?.true) ? [...isTrollQ.criteria.true] : [];
            if (Array.isArray(rubric.custom_supplement_rules)) {
                rubric.custom_supplement_rules.forEach(rule => {
                    if (rule && typeof rule === 'string' && rule.trim()) {
                        trueCriteria.push(`【自定义特征】${rule.trim()}`);
                    }
                });
            }

            const payload = JSON.stringify({
                model: cfg.model || defaultTypeSafeConfig.model,
                state: state,
                questions: {
                    is_troll: {
                        type: "noul",
                        instructions: isTrollQ.instructions,
                        criteria: {
                            true: trueCriteria,
                            false: isTrollQ.criteria?.false || []
                        }
                    },
                    troll_type: {
                        type: "choice",
                        instructions: trollTypeQ.instructions,
                        criteria: trollTypeQ.criteria
                    }
                }
            });

            let requestFunction = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);
            if (!requestFunction) {
                return reject(new Error('未检测到 GM_xmlhttpRequest 环境'));
            }

            requestFunction({
                method: 'POST',
                url: cfg.endpoint || defaultTypeSafeConfig.endpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cfg.apiKey}`
                },
                data: payload,
                timeout: 15000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const data = JSON.parse(res.responseText);
                            const answers = data.answers || {};
                            const trollProb = answers.is_troll?.noul ?? 0;
                            const trollType = answers.troll_type?.choice || 'normal';
                            const trollConfidence = answers.troll_type?.confidence ?? 0;
                            resolve({
                                isTrollProb: trollProb,
                                trollType: trollType,
                                trollConfidence: trollConfidence,
                                rawAnswers: answers,
                                model: data.model
                            });
                        } catch (e) {
                            reject(new Error('解析 Jev 响应失败: ' + e.message));
                        }
                    } else if (res.status === 401) {
                        reject(new Error('认证失败 (401)：API Key 无效'));
                    } else if (res.status === 429) {
                        reject(new Error('请求频控 (429)：额度用尽或频率超限'));
                    } else {
                        let detail = '';
                        try {
                            let ej = JSON.parse(res.responseText);
                            detail = ej.detail ? (typeof ej.detail === 'string' ? ej.detail : JSON.stringify(ej.detail)) : res.responseText;
                        } catch (_) {
                            detail = res.responseText || `HTTP ${res.status}`;
                        }
                        reject(new Error(`响应异常 (${res.status}): ${detail}`));
                    }
                },
                ontimeout: () => reject(new Error('请求超时 (15s)')),
                onerror: () => reject(new Error('网络请求异常'))
            });
        });
    }

    function showRubricJsonEditorModal(onSave) {
        let editorModal = document.createElement('div');
        editorModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);
        z-index: 1000005; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

        const currentRubric = loadTrollRubric();
        const initialText = JSON.stringify(currentRubric, null, 2);

        editorModal.innerHTML = `
        <div style="background: #fff; border-radius: 12px; width: 92%; max-width: 580px; padding: 22px; box-shadow: 0 16px 36px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column; max-height: 90vh;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="font-size: 16px; font-weight: bold; color: #18191C; display: flex; align-items: center; gap: 6px;">
                    <span>📝 在线编辑鉴串准则 (Rubric JSON)</span>
                </div>
                <span id="ts-rubric-editor-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>
            <div style="font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.4;">
                遵循 TypeSafe AI Jev 判定规范。直接在此修改准则与分类，保存后持久化存入浏览器本地存储。
            </div>
            <div id="ts-rubric-editor-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 10px; line-height: 1.4; word-break: break-all;"></div>
            <textarea id="ts-rubric-json-area" rows="16" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d3adf7; border-radius: 6px; font-size: 12px; font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace; line-height: 1.45; resize: vertical; outline: none; background: #fdfaff; flex-grow: 1; min-height: 280px;"></textarea>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px solid #f0f0f0; padding-top: 12px;">
                <button id="ts-rubric-format-btn" type="button" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
                    <span>✨ 格式化 JSON</span>
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="ts-rubric-editor-cancel" type="button" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="ts-rubric-editor-save" type="button" style="background: #722ed1; color: #fff; border: none; padding: 6px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">保存并生效</button>
                </div>
            </div>
        </div>
    `;

        document.body.appendChild(editorModal);

        const area = editorModal.querySelector('#ts-rubric-json-area');
        const errBox = editorModal.querySelector('#ts-rubric-editor-error');
        const btnClose = editorModal.querySelector('#ts-rubric-editor-close');
        const btnCancel = editorModal.querySelector('#ts-rubric-editor-cancel');
        const btnFormat = editorModal.querySelector('#ts-rubric-format-btn');
        const btnSave = editorModal.querySelector('#ts-rubric-editor-save');

        area.value = initialText;

        function showError(msg) {
            errBox.style.display = 'block';
            errBox.textContent = msg;
        }

        btnFormat.onclick = () => {
            try {
                let parsed = JSON.parse(area.value);
                area.value = JSON.stringify(parsed, null, 2);
                errBox.style.display = 'none';
            } catch (e) {
                showError('JSON 语法错误：' + e.message);
            }
        };

        btnSave.onclick = () => {
            try {
                let parsed = JSON.parse(area.value);
                let validCheck = validateTrollRubric(parsed);
                if (!validCheck.valid) {
                    showError(validCheck.error);
                    return;
                }
                saveTrollRubric(parsed);
                showToast('串子判定准则已保存并更新！');
                if (typeof onSave === 'function') {
                    onSave(parsed);
                }
                editorModal.remove();
            } catch (e) {
                showError('JSON 解析错误：' + e.message);
            }
        };

        btnCancel.onclick = () => editorModal.remove();
        btnClose.onclick = () => editorModal.remove();
        editorModal.onclick = (e) => { if (e.target === editorModal) editorModal.remove(); };
    }

    function showTypeSafeConfigModal(onSuccess) {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
        z-index: 1000000; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

        const currentCfg = loadTypeSafeConfig();
        const currentRubric = loadTrollRubric();

        subModal.innerHTML = `
        <div style="background: #fff; border-radius: 12px; width: 92%; max-width: 490px; padding: 22px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #18191C; display: flex; align-items: center; gap: 6px;">
                        <span>⚡ TypeSafe AI (Jev) 配置</span>
                    </div>
                    <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4;">
                        基于 TypeSafe AI 的 Jev 决策模型，为 B站成分雷达赋能快速结构化识别与串子鉴别。
                    </div>
                </div>
                <span id="ts-sub-modal-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>

            <div id="ts-modal-msg" style="display: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; line-height: 1.4; word-break: break-all;"></div>

            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #606266; margin-top: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                        TypeSafe API Key <span style="color: #f56c6c;">*</span>
                    </label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input id="ts-api-key" type="password" value="${currentCfg.apiKey || ''}" placeholder="例如：ts_sec_..." style="width: 100%; box-sizing: border-box; padding: 7px 36px 7px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px; font-family: monospace; outline: none; transition: border-color 0.2s;">
                        <span id="ts-toggle-key-visibility" title="显示/隐藏 Key" style="position: absolute; right: 10px; cursor: pointer; user-select: none; font-size: 14px; opacity: 0.65; transition: opacity 0.2s;">👁️</span>
                    </div>
                    <div style="font-size: 11px; color: #909399; margin-top: 4px;">
                        Key 仅存储在浏览器本地（通过 Tampermonkey GM 存储），绝不上报第三方。
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; background: #f9fafb; padding: 8px 12px; border-radius: 6px; border: 1px solid #ebeef5;">
                    <label for="ts-enabled-checkbox" style="font-size: 13px; font-weight: 500; color: #303133; cursor: pointer;">启用 TypeSafe AI (Jev) 分析</label>
                    <input id="ts-enabled-checkbox" type="checkbox" ${currentCfg.enabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #00AEEC;">
                </div>

                <div>
                    <div id="ts-advanced-toggle" style="cursor: pointer; font-size: 12px; color: #00AEEC; display: inline-flex; align-items: center; gap: 4px; user-select: none;">
                        <span>⚙️ 高级选项 (Endpoint 与模型名称)</span>
                        <span id="ts-advanced-arrow" style="font-size: 10px;">▼</span>
                    </div>
                    <div id="ts-advanced-body" style="display: none; flex-direction: column; gap: 10px; margin-top: 8px; background: #fafafa; padding: 10px; border-radius: 6px; border: 1px dashed #dcdfe6;">
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">API Endpoint</label>
                            <input id="ts-endpoint" type="text" value="${currentCfg.endpoint}" placeholder="https://api.typesafe.ai/v1/systemone" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; font-family: monospace;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Model</label>
                            <input id="ts-model" type="text" value="${currentCfg.model}" placeholder="jev-latest" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; font-family: monospace;">
                        </div>
                    </div>
                </div>

                <div>
                    <div id="ts-rubric-toggle" style="cursor: pointer; font-size: 12px; color: #722ed1; display: inline-flex; align-items: center; gap: 4px; user-select: none;">
                        <span>🎭 串子识别准则与样本管理</span>
                        <span id="ts-rubric-arrow" style="font-size: 10px;">▼</span>
                    </div>
                    <div id="ts-rubric-body" style="display: none; flex-direction: column; gap: 10px; margin-top: 8px; background: #faf5ff; padding: 12px; border-radius: 6px; border: 1px dashed #d3adf7;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span id="ts-rubric-status-badge" style="font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; border: 1px solid ${hasCustomTrollRubric() ? '#d3adf7' : '#b7eb8f'}; color: ${hasCustomTrollRubric() ? '#722ed1' : '#52c41a'}; background: ${hasCustomTrollRubric() ? '#f9f0ff' : '#f6ffed'};">
                                ${hasCustomTrollRubric() ? '🟣 使用自定义准则' : '🟢 使用内置默认准则'}
                            </span>
                            <div style="display: flex; gap: 5px; align-items: center;">
                                <input type="file" id="ts-rubric-file-input" accept=".json,.txt" style="display: none;">
                                <button id="ts-btn-import-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="从本地选择 chuanzi_rubric_sample.json 导入">📥 导入文件</button>
                                <button id="ts-btn-edit-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="在线编辑当前生效的 Rubric JSON">📝 在线编辑</button>
                                <button id="ts-btn-export-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="导出当前生效准则到本地 JSON 文件">📤 导出</button>
                                <button id="ts-btn-reset-rubric" type="button" style="background: #fff; color: #909399; border: 1px solid #dcdfe6; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="清除自定义准则，恢复系统出厂内置设定">🔄 恢复默认</button>
                            </div>
                        </div>
                        <div id="ts-rubric-summary-info" style="font-size: 11px; color: #531dab; line-height: 1.4;">
                            准则概览：True 判定准则 ${((currentRubric.questions?.is_troll?.criteria?.true) || []).length} 项，类别细分 ${Object.keys((currentRubric.questions?.troll_type?.criteria) || {}).length} 种。
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #391085;">快捷圈子黑话/样本补充（每行一条，每次判定自动追加）</label>
                            <textarea id="ts-custom-rubric-rules" rows="3" placeholder="例如：&#10;若包含'XX人是这样的'等贴标签话术，判定为 true&#10;若对角色/剧情发表正常吐槽，不判定为 true" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d3adf7; border-radius: 4px; font-size: 11px; font-family: monospace; resize: vertical; outline: none;">${(currentRubric.custom_supplement_rules || []).join('\n')}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid #f0f0f0; padding-top: 14px;">
                <button id="ts-btn-test" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px; transition: 0.2s;">
                    <span>🧪 测试连接</span>
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="ts-btn-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="ts-btn-save" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">保存配置</button>
                </div>
            </div>
        </div>
    `;

        document.body.appendChild(subModal);

        const msgBox = subModal.querySelector('#ts-modal-msg');
        const keyInput = subModal.querySelector('#ts-api-key');
        const toggleKey = subModal.querySelector('#ts-toggle-key-visibility');
        const advToggle = subModal.querySelector('#ts-advanced-toggle');
        const advBody = subModal.querySelector('#ts-advanced-body');
        const advArrow = subModal.querySelector('#ts-advanced-arrow');
        const rubricToggle = subModal.querySelector('#ts-rubric-toggle');
        const rubricBody = subModal.querySelector('#ts-rubric-body');
        const rubricArrow = subModal.querySelector('#ts-rubric-arrow');
        const rubricStatusBadge = subModal.querySelector('#ts-rubric-status-badge');
        const rubricSummaryInfo = subModal.querySelector('#ts-rubric-summary-info');
        const rubricFileInput = subModal.querySelector('#ts-rubric-file-input');
        const btnImportRubric = subModal.querySelector('#ts-btn-import-rubric');
        const btnEditRubric = subModal.querySelector('#ts-btn-edit-rubric');
        const btnExportRubric = subModal.querySelector('#ts-btn-export-rubric');
        const btnResetRubric = subModal.querySelector('#ts-btn-reset-rubric');
        const customRubricTextarea = subModal.querySelector('#ts-custom-rubric-rules');
        const endpointInput = subModal.querySelector('#ts-endpoint');
        const modelInput = subModal.querySelector('#ts-model');
        const enabledCheckbox = subModal.querySelector('#ts-enabled-checkbox');
        const btnTest = subModal.querySelector('#ts-btn-test');
        const btnSave = subModal.querySelector('#ts-btn-save');
        const btnCancel = subModal.querySelector('#ts-btn-cancel');
        const btnClose = subModal.querySelector('#ts-sub-modal-close');

        function showStatus(text, type = 'error') {
            msgBox.style.display = 'block';
            if (type === 'error') {
                msgBox.style.background = '#fef0f0';
                msgBox.style.color = '#f56c6c';
                msgBox.style.border = '1px solid #fde2e2';
            } else if (type === 'success') {
                msgBox.style.background = '#f0f9eb';
                msgBox.style.color = '#67c23a';
                msgBox.style.border = '1px solid #e1f3d8';
            } else {
                msgBox.style.background = '#edf5ff';
                msgBox.style.color = '#409eff';
                msgBox.style.border = '1px solid #d9ecff';
            }
            msgBox.textContent = text;
        }

        function updateRubricStatusView(rubricData) {
            const r = rubricData || loadTrollRubric();
            const isCustom = hasCustomTrollRubric();
            if (rubricStatusBadge) {
                rubricStatusBadge.textContent = isCustom ? '🟣 使用自定义准则' : '🟢 使用内置默认准则';
                rubricStatusBadge.style.color = isCustom ? '#722ed1' : '#52c41a';
                rubricStatusBadge.style.borderColor = isCustom ? '#d3adf7' : '#b7eb8f';
                rubricStatusBadge.style.background = isCustom ? '#f9f0ff' : '#f6ffed';
            }
            if (rubricSummaryInfo) {
                const trueCount = (r.questions?.is_troll?.criteria?.true || []).length;
                const typeCount = Object.keys(r.questions?.troll_type?.criteria || {}).length;
                rubricSummaryInfo.textContent = `准则概览：True 判定准则 ${trueCount} 项，类别细分 ${typeCount} 种。`;
            }
            if (customRubricTextarea) {
                customRubricTextarea.value = (r.custom_supplement_rules || []).join('\n');
            }
        }

        btnImportRubric.onclick = () => rubricFileInput.click();

        rubricFileInput.onchange = (e) => {
            let file = e.target.files[0];
            if (file) {
                let reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        let parsed = JSON.parse(evt.target.result);
                        let validCheck = validateTrollRubric(parsed);
                        if (!validCheck.valid) {
                            showStatus(`❌ 准则导入失败：${validCheck.error}`, 'error');
                            return;
                        }
                        saveTrollRubric(parsed);
                        updateRubricStatusView(parsed);
                        showStatus(`✅ 成功导入准则文件（${file.name}）！`, 'success');
                        showToast('准则文件已成功导入并持久化！');
                    } catch (err) {
                        showStatus(`❌ JSON 解析失败：${err.message}`, 'error');
                    }
                };
                reader.readAsText(file);
            }
        };

        btnEditRubric.onclick = () => {
            showRubricJsonEditorModal((savedRubric) => {
                updateRubricStatusView(savedRubric);
                showStatus('✅ 串子准则已通过在线编辑器更新！', 'success');
            });
        };

        btnExportRubric.onclick = () => {
            exportRubricToFile(loadTrollRubric());
        };

        btnResetRubric.onclick = () => {
            if (confirm('确定要恢复出厂内置的鉴串准则吗？自定义准则将被清空。')) {
                resetTrollRubric();
                updateRubricStatusView(defaultTrollRubric);
                showStatus('✅ 已恢复出厂系统默认准则！', 'info');
                showToast('已恢复内置默认准则！');
            }
        };

        toggleKey.onclick = () => {
            if (keyInput.type === 'password') {
                keyInput.type = 'text';
                toggleKey.textContent = '🔒';
            } else {
                keyInput.type = 'password';
                toggleKey.textContent = '👁️';
            }
        };

        advToggle.onclick = () => {
            if (advBody.style.display === 'none') {
                advBody.style.display = 'flex';
                advArrow.textContent = '▲';
            } else {
                advBody.style.display = 'none';
                advArrow.textContent = '▼';
            }
        };

        rubricToggle.onclick = () => {
            if (rubricBody.style.display === 'none') {
                rubricBody.style.display = 'flex';
                rubricArrow.textContent = '▲';
            } else {
                rubricBody.style.display = 'none';
                rubricArrow.textContent = '▼';
            }
        };

        btnTest.onclick = async () => {
            const rawKey = keyInput.value.trim();
            if (!rawKey) {
                showStatus('请先输入 TypeSafe API Key 后再测试连接！', 'error');
                keyInput.focus();
                return;
            }

            const targetEndpoint = endpointInput.value.trim() || defaultTypeSafeConfig.endpoint;
            const targetModel = modelInput.value.trim() || defaultTypeSafeConfig.model;

            btnTest.disabled = true;
            btnTest.style.opacity = '0.6';
            btnTest.style.cursor = 'not-allowed';
            showStatus('⏳ 正在向 TypeSafe AI Jev 端点发起连接测试...', 'info');

            try {
                const res = await testTypeSafeConnection({
                    apiKey: rawKey,
                    endpoint: targetEndpoint,
                    model: targetModel
                });
                showStatus(`✅ ${res.message}`, 'success');
            } catch (err) {
                showStatus(`❌ ${err.message}`, 'error');
            } finally {
                btnTest.disabled = false;
                btnTest.style.opacity = '1';
                btnTest.style.cursor = 'pointer';
            }
        };

        btnSave.onclick = () => {
            const rawKey = keyInput.value.trim();
            const isEnabled = enabledCheckbox.checked;

            if (isEnabled && !rawKey) {
                showStatus('已勾选启用 TypeSafe AI，但尚未填写 API Key！请填写后再保存。', 'error');
                keyInput.focus();
                return;
            }

            const newCfg = {
                apiKey: rawKey,
                endpoint: endpointInput.value.trim() || defaultTypeSafeConfig.endpoint,
                model: modelInput.value.trim() || defaultTypeSafeConfig.model,
                enabled: isEnabled
            };

            saveTypeSafeConfig(newCfg);

            // 保存自定义补充样本规则
            let customRulesText = customRubricTextarea ? customRubricTextarea.value.trim() : '';
            let customRules = customRulesText ? customRulesText.split('\n').map(s => s.trim()).filter(Boolean) : [];
            let updatedRubric = loadTrollRubric();
            updatedRubric.custom_supplement_rules = customRules;
            saveTrollRubric(updatedRubric);

            showToast('TypeSafe AI 配置与准则已保存！');
            if (typeof onSuccess === 'function') {
                onSuccess(newCfg);
            }
            subModal.remove();
        };

        btnCancel.onclick = () => subModal.remove();
        btnClose.onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };
    }

    function validateCompositionInput(displayName, displayIcon, keywordsText, followingsText) {
        let name = (displayName || '').trim();
        if (!name) {
            return { valid: false, error: '成分名称不能为空！' };
        }

        let icon = (displayIcon || '').trim() || fallbackIcon;

        let keywords = (keywordsText || '').split(/[\n,，]+/).map(s => s.trim()).filter(Boolean);
        let rawFollowings = (followingsText || '').split(/[\n,，]+/).map(s => s.trim()).filter(Boolean);

        let followings = [];
        for (let f of rawFollowings) {
            if (!/^\d+$/.test(f)) {
                return { valid: false, error: `关注 UID "${f}" 格式不合法：必须为纯数字！` };
            }
            followings.push(Number(f));
        }

        if (keywords.length === 0 && followings.length === 0) {
            return { valid: false, error: '匹配关键词与关注 UID 不能同时为空！至少需填一项。' };
        }

        return {
            valid: true,
            data: { displayName: name, displayIcon: icon, keywords, followings }
        };
    }

    function showSettingModal() {
        let oldModal = document.getElementById('comp-setting-modal');
        if (oldModal) oldModal.remove();

        const checkers = getCheckers();
        const typeSafeConfig = getTypeSafeConfig();
        let tempCheckers = JSON.parse(JSON.stringify(checkers));

        let modal = document.createElement('div');
        modal.id = 'comp-setting-modal';
        modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(5px);
        z-index: 999999; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

        modal.innerHTML = `
        <div style="background: #fff; border-radius: 14px; width: 92%; max-width: 550px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
                <span style="font-size: 16px; font-weight: bold; color: #18191C;">成分设置</span>
                <span id="comp-setting-modal-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>

            <!-- 顶栏一排按钮区域 -->
            <div style="display: flex; gap: 8px; margin-bottom: 14px; align-items: center; flex-wrap: wrap;">
                <button id="btn-comp-reset" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">恢复默认</button>
                <button id="btn-comp-import" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">📥 导入</button>
                <button id="btn-comp-export" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">📤 导出</button>
                <button id="btn-comp-typesafe" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s; display: flex; align-items: center; gap: 5px;">
                    <span>⚡ TypeSafe AI</span>
                    <span id="typesafe-status-dot" title="${typeSafeConfig.apiKey ? (typeSafeConfig.enabled ? '已启用' : '已配置Key(未启用)') : '未配置Key'}" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${typeSafeConfig.apiKey ? (typeSafeConfig.enabled ? '#52c41a' : '#faad14') : '#d9d9d9'};"></span>
                </button>
                <button id="btn-comp-add" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">+ 添加成分</button>
                <button id="btn-comp-save" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; margin-left: auto; transition: 0.2s;">保存生效</button>
            </div>

            <!-- 下方 List 列表区域 -->
            <div id="comp-setting-modal-list" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        const listContainer = document.getElementById('comp-setting-modal-list');

        function renderList() {
            listContainer.innerHTML = '';
            if (tempCheckers.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 30px 0;">暂无成分配置，点击上方“+ 添加成分”添加。</div>';
                return;
            }

            tempCheckers.forEach((item, index) => {
                let row = document.createElement('div');
                row.style.cssText = `
                display: flex; justify-content: space-between; align-items: center;
                background: #f9fafb; border: 1px solid #ebeef5; border-radius: 8px;
                padding: 8px 12px; transition: background 0.15s;
            `;

                let kwCount = item.keywords ? item.keywords.length : 0;
                let fwCount = item.followings ? item.followings.length : 0;

                row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                    <img src="${item.displayIcon || fallbackIcon}" onerror="this.src='${fallbackIcon}'" style="width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <span style="font-size: 14px; font-weight: bold; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.displayName}</span>
                        <span style="font-size: 11px; color: #909399;">关键词: ${kwCount} 个 | 关注 UID: ${fwCount} 个</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-shrink: 0; margin-left: 10px;">
                    <button class="btn-item-edit" style="background: #fff; color: #00AEEC; border: 1px solid #00AEEC; padding: 3px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">编辑</button>
                    <button class="btn-item-delete" style="background: #fff; color: #f56c6c; border: 1px solid #f56c6c; padding: 3px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">删除</button>
                </div>
            `;

                row.querySelector('.btn-item-edit').onclick = () => showEditModal(item, index);
                row.querySelector('.btn-item-delete').onclick = () => showConfirmDeleteModal(item, index);

                listContainer.appendChild(row);
            });
        }

        function showImportModal(onSuccess) {
            let subModal = document.createElement('div');
            subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

            subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 460px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">导入成分配置</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #606266;">
                    <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px dashed #dcdfe6;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">方式一：选择 JSON 配置文件上传</label>
                        <input id="import-file-input" type="file" accept=".json,.txt" style="font-size: 12px;">
                    </div>
                    <div style="text-align: center; color: #909399; font-size: 11px;">— 或粘贴代码 —</div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">方式二：直接粘贴 JSON 配置数组</label>
                        <textarea id="import-json-text" rows="5" placeholder="例如：[{ &quot;displayName&quot;: &quot;...&quot;, &quot;keywords&quot;: [...], &quot;followings&quot;: [...] }]" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 11px; font-family: monospace; resize: vertical;"></textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-import-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-import-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认导入</button>
                </div>
            </div>
        `;

            document.body.appendChild(subModal);

            const fileInput = subModal.querySelector('#import-file-input');
            const jsonTextarea = subModal.querySelector('#import-json-text');
            const errBox = subModal.querySelector('#sub-modal-error');

            fileInput.onchange = (e) => {
                let file = e.target.files[0];
                if (file) {
                    let reader = new FileReader();
                    reader.onload = (evt) => {
                        jsonTextarea.value = evt.target.result;
                    };
                    reader.readAsText(file);
                }
            };

            subModal.querySelector('#sub-import-cancel').onclick = () => subModal.remove();
            subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

            subModal.querySelector('#sub-import-confirm').onclick = () => {
                let rawStr = jsonTextarea.value.trim();
                if (!rawStr) {
                    errBox.style.display = 'block';
                    errBox.textContent = '导入内容不能为空！';
                    return;
                }

                try {
                    let parsed = JSON.parse(rawStr);
                    if (!Array.isArray(parsed)) {
                        throw new Error('导入的内容必须为数组格式！');
                    }
                    for (let item of parsed) {
                        if (!item || typeof item !== 'object' || !item.displayName) {
                            throw new Error('存在无效格式的成分项，每项必须包含 displayName！');
                        }
                    }
                    onSuccess(parsed);
                    subModal.remove();
                    showToast(`成功导入 ${parsed.length} 项成分配置（点击保存生效）`);
                } catch (err) {
                    errBox.style.display = 'block';
                    errBox.textContent = '解析配置失败：' + err.message;
                }
            };
        }

        function exportConfig(data) {
            try {
                let jsonStr = JSON.stringify(data, null, 2);
                let blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
                let url = URL.createObjectURL(blob);
                let a = document.createElement('a');
                a.href = url;
                a.download = `bilibili_checkers_config_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('已导出 JSON 配置文件到本地！');
            } catch (e) {
                showToast('导出失败：' + e.message);
            }
        }

        function showEditModal(item, index) {
            let subModal = document.createElement('div');
            subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

            subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 440px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">编辑成分 - 【${item.displayName}】</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #606266;">
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">成分显示名称 *</label>
                        <input id="edit-name" type="text" value="${item.displayName}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">图标 URL (可选)</label>
                        <input id="edit-icon" type="text" value="${item.displayIcon || ''}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">匹配关键词 (用逗号或换行分隔)</label>
                        <textarea id="edit-keywords" rows="3" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;">${(item.keywords || []).join(', ')}</textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">官方关注 UID (用逗号或换行分隔，必须为数字)</label>
                        <textarea id="edit-followings" rows="2" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;">${(item.followings || []).join(', ')}</textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-edit-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-edit-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认</button>
                </div>
            </div>
        `;

            document.body.appendChild(subModal);

            const errBox = subModal.querySelector('#sub-modal-error');
            subModal.querySelector('#sub-edit-cancel').onclick = () => subModal.remove();
            subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

            subModal.querySelector('#sub-edit-confirm').onclick = () => {
                let name = subModal.querySelector('#edit-name').value;
                let icon = subModal.querySelector('#edit-icon').value;
                let kw = subModal.querySelector('#edit-keywords').value;
                let fw = subModal.querySelector('#edit-followings').value;

                let check = validateCompositionInput(name, icon, kw, fw);
                if (!check.valid) {
                    errBox.style.display = 'block';
                    errBox.textContent = check.error;
                    return;
                }

                tempCheckers[index] = check.data;
                subModal.remove();
                renderList();
            };
        }

        function showAddModal() {
            let subModal = document.createElement('div');
            subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

            subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 440px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">添加新成分</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #606266;">
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">成分名称 *</label>
                        <input id="add-name" type="text" placeholder="例如：鸣潮 / 明日方舟" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">图标 URL (可选)</label>
                        <input id="add-icon" type="text" placeholder="留空使用默认图标" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">匹配关键词 (用逗号或换行分隔)</label>
                        <textarea id="add-keywords" rows="3" placeholder="例如：#鸣潮#, 鸣潮, 库洛" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;"></textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">官方关注 UID (用逗号或换行分隔，必须为数字)</label>
                        <textarea id="add-followings" rows="2" placeholder="例如：2144596522" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;"></textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-add-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-add-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认添加</button>
                </div>
            </div>
        `;

            document.body.appendChild(subModal);

            const errBox = subModal.querySelector('#sub-modal-error');
            subModal.querySelector('#sub-add-cancel').onclick = () => subModal.remove();
            subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

            subModal.querySelector('#sub-add-confirm').onclick = () => {
                let name = subModal.querySelector('#add-name').value;
                let icon = subModal.querySelector('#add-icon').value;
                let kw = subModal.querySelector('#add-keywords').value;
                let fw = subModal.querySelector('#add-followings').value;

                let check = validateCompositionInput(name, icon, kw, fw);
                if (!check.valid) {
                    errBox.style.display = 'block';
                    errBox.textContent = check.error;
                    return;
                }

                tempCheckers.push(check.data);
                subModal.remove();
                renderList();
            };
        }

        function showConfirmDeleteModal(item, index) {
            let subModal = document.createElement('div');
            subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

            subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 380px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 10px;">确认删除</div>
                <div style="font-size: 13px; color: #606266; line-height: 1.5;">
                    确定要删除成分【<b style="color: #f56c6c;">${item.displayName}</b>】吗？
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
                    <button id="sub-del-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-del-confirm" style="background: #f56c6c; color: #fff; border: none; padding: 5px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认删除</button>
                </div>
            </div>
        `;

            document.body.appendChild(subModal);

            subModal.querySelector('#sub-del-cancel').onclick = () => subModal.remove();
            subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

            subModal.querySelector('#sub-del-confirm').onclick = () => {
                tempCheckers.splice(index, 1);
                subModal.remove();
                renderList();
            };
        }

        renderList();

        // 按钮绑定事件
        document.getElementById('btn-comp-reset').onclick = () => {
            tempCheckers = JSON.parse(JSON.stringify(defaultCheckers));
            renderList();
            showToast('已恢复默认配置列表（点击“保存生效”持久化）');
        };

        document.getElementById('btn-comp-import').onclick = () => {
            showImportModal((importedList) => {
                tempCheckers = importedList;
                renderList();
            });
        };

        document.getElementById('btn-comp-export').onclick = () => {
            exportConfig(tempCheckers);
        };

        document.getElementById('btn-comp-typesafe').onclick = () => {
            showTypeSafeConfigModal((newCfg) => {
                const dot = document.getElementById('typesafe-status-dot');
                if (dot) {
                    let newDotColor = '#d9d9d9';
                    let title = '未配置Key';
                    if (newCfg.apiKey) {
                        newDotColor = newCfg.enabled ? '#52c41a' : '#faad14';
                        title = newCfg.enabled ? '已启用' : '已配置Key(未启用)';
                    }
                    dot.style.background = newDotColor;
                    dot.title = title;
                }
            });
        };

        document.getElementById('btn-comp-add').onclick = () => {
            showAddModal();
        };

        function showUnsavedConfirmModal(onConfirmDiscard) {
            let subModal = document.createElement('div');
            subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000002; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

            subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 400px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 10px;">未保存提示</div>
                <div style="font-size: 13px; color: #606266; line-height: 1.5; margin-bottom: 18px;">
                    检测到成分配置已修改但尚未保存，确定要放弃修改并关闭吗？
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="sub-unsaved-discard" style="background: #fff; color: #f56c6c; border: 1px solid #f56c6c; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">放弃修改并关闭</button>
                    <button id="sub-unsaved-continue" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">继续编辑</button>
                </div>
            </div>
        `;

            document.body.appendChild(subModal);

            subModal.querySelector('#sub-unsaved-continue').onclick = () => subModal.remove();
            subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

            subModal.querySelector('#sub-unsaved-discard').onclick = () => {
                subModal.remove();
                onConfirmDiscard();
            };
        }

        function safeCloseModal() {
            let isModified = JSON.stringify(tempCheckers) !== JSON.stringify(checkers);
            if (isModified) {
                showUnsavedConfirmModal(() => {
                    modal.remove();
                });
            } else {
                modal.remove();
            }
        }

        document.getElementById('btn-comp-save').onclick = () => {
            saveCheckers(tempCheckers);
            showToast('成分设置已保存并持久化生效！');
            modal.remove();
        };

        document.getElementById('comp-setting-modal-close').onclick = safeCloseModal;
        modal.onclick = (e) => { if (e.target === modal) safeCloseModal(); };
    }

    // 获取评论区点赞前 6 的热门评论（自动排除目标用户本人）
    function getHotComments(targetUid, limit = 6) {
        let threads = queryShadowDOM('bili-comment-thread-renderer, .reply-item');
        if (!threads || threads.length === 0) {
            threads = Array.from(document.querySelectorAll('bili-comment-thread-renderer, .reply-item'));
        }

        let candidates = [];
        threads.forEach(thread => {
            let rootEls = queryShadowDOM('bili-comment-renderer, .root-reply', thread);
            let rootEl = (rootEls && rootEls.length > 0) ? rootEls[0] : thread;

            let userEls = queryShadowDOM('#user-name, .user-name, .reply-user .name', rootEl);
            let userEl = userEls[0] || null;

            let textEls = queryShadowDOM('bili-rich-text, #contents, .reply-content, .text-con, .con', rootEl);
            let textEl = textEls[0] || null;

            let likeEls = queryShadowDOM('span.reply-like, .like-count, #like .count, #like span, .like', rootEl);
            let likeEl = likeEls[0] || null;

            let text = extractCommentText(textEl);
            if (text) {
                let uid = userEl ? getUserId(userEl) : null;
                let likeCount = 0;
                if (likeEl) {
                    let rawLike = likeEl.textContent?.trim() || '';
                    if (rawLike.includes('万')) likeCount = Math.round(parseFloat(rawLike) * 10000);
                    else likeCount = parseInt(rawLike, 10) || 0;
                }
                candidates.push({
                    uid: uid,
                    author: userEl ? userEl.textContent.trim() : '用户',
                    text: text.slice(0, 150),
                    likes: likeCount
                });
            }
        });

        // 按点赞数降序
        candidates.sort((a, b) => b.likes - a.likes);

        // 如果包含目标用户本身的情况，予以排除
        let filtered = candidates.filter(c => !targetUid || String(c.uid) !== String(targetUid));
        return filtered.slice(0, limit);
    }

    // 获取目标用户在当前楼层的主楼及楼中楼发言
    function getThreadSpeeches(targetElement, targetUid) {
        let rootCommentText = "";
        let isRootAuthor = false;
        let targetUserSpeeches = [];

        // 1. 核心必保：首先抓取当前点击按钮所在的直接评论文本
        let directReplyContainer = closestCrossShadow(targetElement, 'bili-comment-renderer, bili-comment-reply-renderer, .sub-reply-item, .root-reply, .reply-item');
        if (directReplyContainer) {
            let textEls = queryShadowDOM('bili-rich-text, #contents, .reply-content, .text-con, .con', directReplyContainer);
            for (let textEl of textEls) {
                let speech = extractCommentText(textEl);
                if (speech && !targetUserSpeeches.includes(speech)) {
                    targetUserSpeeches.push(speech);
                    break;
                }
            }
        }

        // 向上穿透回溯兜底：若当前容器没找到文本，顺着节点树向上找最近包含文本的祖先
        if (targetUserSpeeches.length === 0) {
            let curr = targetElement;
            while (curr && curr !== document.body) {
                let textEls = queryShadowDOM('bili-rich-text, #contents, .reply-content, .text-con, .con', curr);
                if (textEls && textEls.length > 0) {
                    let speech = extractCommentText(textEls[0]);
                    if (speech) {
                        targetUserSpeeches.push(speech);
                        break;
                    }
                }
                let root = curr.getRootNode ? curr.getRootNode() : null;
                if (root && root instanceof ShadowRoot) {
                    curr = root.host;
                } else {
                    curr = curr.parentElement;
                }
            }
        }

        // 2. 查找整层楼中该用户的所有历史发言（主楼+楼中楼）
        let threadContainer = closestCrossShadow(targetElement, 'bili-comment-thread-renderer, .reply-item, .comment-thread');
        if (!threadContainer) {
            threadContainer = directReplyContainer || targetElement.parentElement;
        }

        if (threadContainer) {
            let rootNodes = queryShadowDOM('bili-comment-renderer, .root-reply', threadContainer);
            let rootNode = (rootNodes && rootNodes.length > 0) ? rootNodes[0] : (threadContainer.classList?.contains('reply-item') ? threadContainer : null);

            if (rootNode) {
                let rootUserEls = queryShadowDOM('#user-name, .user-name, .reply-user .name', rootNode);
                let rootUserEl = rootUserEls[0] || null;

                let rootTextEls = queryShadowDOM('bili-rich-text, #contents, .reply-content, .text-con, .con', rootNode);
                let rootTextEl = rootTextEls[0] || null;

                if (rootTextEl) {
                    rootCommentText = extractCommentText(rootTextEl).slice(0, 250);
                }
                if (rootUserEl && String(getUserId(rootUserEl)) === String(targetUid)) {
                    isRootAuthor = true;
                }
            }

            // 查找该楼层中所有目标用户的发言
            let allUserNodes = queryShadowDOM('#user-name, .user-name, .sub-user-name', threadContainer);
            allUserNodes.forEach(userNode => {
                let uid = getUserId(userNode);
                if (String(uid) === String(targetUid)) {
                    let replyContainer = closestCrossShadow(userNode, 'bili-comment-renderer, bili-comment-reply-renderer, .sub-reply-item, .root-reply, .reply-item');
                    if (replyContainer) {
                        let speechTextEls = queryShadowDOM('bili-rich-text, #contents, .reply-content, .text-con, .con', replyContainer);
                        let speechTextEl = speechTextEls[0] || null;
                        if (speechTextEl) {
                            let speech = extractCommentText(speechTextEl);
                            if (speech && !targetUserSpeeches.includes(speech)) {
                                targetUserSpeeches.push(speech);
                            }
                        }
                    }
                }
            });
        }

        return {
            rootCommentText,
            isRootAuthor,
            targetUserSpeeches
        };
    }

    // 安装“鉴串”按钮
    function installTrollButton(element, userID) {
        if (!element || !userID) return;
        ensureContainerWrap(element);

        // 限制在评论区节点中安装，穿透 Web Components Shadow DOM 树查找评论容器
        const commentSelector = 'bili-comments, bili-comment-thread-renderer, bili-comment-renderer, bili-comment-reply-renderer, .reply-item, .sub-reply-item, #comment, .comment-container, #comment-module, #aside-comment-module, .comment-list';
        const isCommentNode = closestCrossShadow(element, commentSelector) ||
            element.id === 'user-name' ||
            element.classList?.contains('user-name') ||
            element.classList?.contains('sub-user-name');

        if (!isCommentNode) return;

        // 排除个人空间头部等非评论区元素
        if (closestCrossShadow(element, '#h-name, .space-header-username, .upinfo-detail__top, .h-name, #header-info')) {
            return;
        }

        let parent = element.parentElement;
        if (!parent) return;

        // 检查是否已经在该元素后续挂载了鉴串按钮或徽章
        let sibling = element.nextElementSibling;
        while (sibling) {
            if (sibling.classList?.contains('troll-check-btn') || sibling.classList?.contains('troll-badge')) {
                return;
            }
            if (sibling.id === 'user-name' || sibling.classList?.contains('user-name') || sibling.classList?.contains('sub-user-name')) {
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        if (parent.querySelector(':scope > .troll-check-btn, :scope > .troll-badge')) return;

        let btn = document.createElement('span');
        btn.className = 'troll-check-btn';
        btn.style.cssText = `
        display: inline-flex; align-items: center; justify-content: center;
        background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
        margin: 0 4px; padding: 2px 9px; vertical-align: middle;
        font-size: 11px; color: #64748b; cursor: pointer; user-select: none;
        white-space: nowrap; height: 22px; line-height: 18px; box-sizing: border-box;
        transition: all 0.15s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;
        btn.title = "点击使用 TypeSafe Jev 模型检测此人在本楼是否有串子/带节奏行为";
        btn.innerHTML = `<span style="pointer-events: none; display: inline-flex; align-items: center;">🎭 鉴串</span>`;

        btn.onmouseenter = () => {
            btn.style.borderColor = '#00AEEC';
            btn.style.color = '#00AEEC';
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 2px 5px rgba(0,174,236,0.15)';
        };
        btn.onmouseleave = () => {
            btn.style.borderColor = '#e2e8f0';
            btn.style.color = '#64748b';
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
        };

        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const cfg = loadTypeSafeConfig();
            if (!cfg.apiKey || !cfg.enabled) {
                showToast('请先在【🧪 成分 -> ⚡ TypeSafe AI】配置并启用 API Key 后使用鉴串功能！');
                showSettingModal();
                return;
            }

            let threadContainer = closestCrossShadow(element, 'bili-comment-thread-renderer, .reply-item, .comment-thread') || element.parentElement;
            let threadKey = threadContainer?.id || threadContainer?.getAttribute('data-id') || element.textContent.trim();
            let cacheKey = `${userID}_${threadKey}`;

            if (trollAnalysisCache[cacheKey]) {
                renderTrollBadge(btn, element, userID, trollAnalysisCache[cacheKey]);
                return;
            }

            btn.innerHTML = `<span style="display: inline-block; animation: compSpin 1s linear infinite;">⏳</span><span style="margin-left: 3px;">诊断中...</span>`;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.75';

            try {
                const videoTitle = document.querySelector('h1.video-title, .video-title h1, .article-title, .opus-title, h1[title]')?.textContent?.trim() || document.title;
                const videoDesc = document.querySelector('.desc-info-text, #v_desc .info, .basic-desc-info, .article-content, .opus-module-content')?.textContent?.trim()?.slice(0, 300) || '';
                const hotComments = getHotComments(userID, 6);
                const threadData = getThreadSpeeches(element, userID);

                if (!threadData.targetUserSpeeches || threadData.targetUserSpeeches.length === 0) {
                    console.error('[串子识别] 未捕获到用户有效发言', { element, userID, threadData });
                    throw new Error('未能截取到评论正文内容，请刷新重试');
                }

                const state = {
                    video_info: {
                        title: videoTitle,
                        description: videoDesc
                    },
                    hot_comments_context: hotComments.map(c => ({
                        author: c.author,
                        text: c.text,
                        likes: c.likes
                    })),
                    thread_context: {
                        is_root_author: threadData.isRootAuthor,
                        root_comment: threadData.rootCommentText
                    },
                    target_user_speeches: threadData.targetUserSpeeches
                };

                console.log(`[串子识别 诊断发起] 👤 用户: ${element.textContent.trim()} (UID: ${userID})`, state);

                const result = await analyzeTrollWithJev(state);
                result.contextState = state;
                result.userName = element.textContent.trim();

                trollAnalysisCache[cacheKey] = result;
                renderTrollBadge(btn, element, userID, result);
            } catch (err) {
                console.error('[串子识别] 失败', err);
                btn.innerHTML = `<span style="color: #f56c6c;">失败: ${err.message}</span>`;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                setTimeout(() => {
                    btn.innerHTML = `<span>🎭 鉴串</span>`;
                }, 3000);
            }
        };

        let nextSibling = element.nextElementSibling;
        let insertAnchor = element;
        while (nextSibling && (nextSibling.classList.contains('composition-badge') || nextSibling.classList.contains('composition-checkable'))) {
            insertAnchor = nextSibling;
            nextSibling = nextSibling.nextElementSibling;
        }
        insertAnchor.insertAdjacentElement('afterend', btn);
    }

    // 渲染判定后的结果徽章
    function renderTrollBadge(btnNode, element, userID, result) {
        ensureContainerWrap(element);
        let prob = result.isTrollProb || 0;
        let percent = Math.round(prob * 100);
        let typeName = trollTypeNames[result.trollType] || result.trollType;

        let badge = document.createElement('span');
        badge.className = 'troll-badge';

        let bgColor, borderColor, textColor, iconText;
        if (prob >= 0.7) {
            bgColor = '#fff1f0';
            borderColor = '#ffa39e';
            textColor = '#cf1322';
            iconText = '🚨 疑似串子';
        } else if (prob >= 0.4) {
            bgColor = '#fffbe6';
            borderColor = '#ffe58f';
            textColor = '#d48806';
            iconText = '⚠️ 存疑';
        } else {
            bgColor = '#f6ffed';
            borderColor = '#b7eb8f';
            textColor = '#389e0d';
            iconText = '🌱 正常';
        }

        badge.style.cssText = `
        display: inline-flex; align-items: center; justify-content: center;
        background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 12px;
        margin: 2px 4px; padding: 2px 10px; vertical-align: middle;
        font-size: 11px; color: ${textColor}; cursor: pointer; user-select: none;
        white-space: nowrap; flex-shrink: 0; height: 22px; line-height: 18px; box-sizing: border-box;
        font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        transition: all 0.15s ease;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;
        badge.title = `串度: ${percent}% | 特征: ${typeName} (点击查看完整 AI 诊断依据)`;
        badge.innerHTML = `<span style="pointer-events: none; display: inline-flex; align-items: center; gap: 3px;">${iconText} (${percent}%)</span>`;

        badge.onmouseenter = () => {
            badge.style.transform = 'translateY(-1px)';
            badge.style.boxShadow = '0 3px 8px rgba(0,0,0,0.12)';
        };
        badge.onmouseleave = () => {
            badge.style.transform = 'translateY(0)';
            badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        };

        badge.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTrollDetailModal(result);
        };

        btnNode.replaceWith(badge);
    }

    // 弹窗展示诊断报告详情
    function showTrollDetailModal(result) {
        let oldModal = document.getElementById('comp-troll-detail-modal');
        if (oldModal) oldModal.remove();

        let modal = document.createElement('div');
        modal.id = 'comp-troll-detail-modal';
        modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(5px);
        z-index: 1000003; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

        const prob = result.isTrollProb || 0;
        const percent = Math.round(prob * 100);
        const typeName = trollTypeNames[result.trollType] || result.trollType;
        const confPercent = Math.round((result.trollConfidence || 0) * 100);

        let statusColor = '#389e0d';
        let statusTitle = '🌱 正常观点交流';
        let statusDesc = '该用户在本楼发言主要为正常讨论或合理吐槽，未检测到显著的煽动、反串或挑拨对立意图。';

        if (prob >= 0.7) {
            statusColor = '#cf1322';
            statusTitle = '🚨 疑似恶意串子';
            statusDesc = '该用户在本楼发言具有明显的反串煽动、阴阳怪气或恶意扣帽子倾向，涉嫌刻意带节奏输出负面情绪。';
        } else if (prob >= 0.4) {
            statusColor = '#d48806';
            statusTitle = '⚠️ 行为特征存疑';
            statusDesc = '该用户发言包含情绪宣泄或轻度讽刺，存在一定的带节奏嫌疑，建议结合上下文理性判断。';
        }

        const speeches = result.contextState?.target_user_speeches || [];
        const hotComments = result.contextState?.hot_comments_context || [];
        const videoTitle = result.contextState?.video_info?.title || '未知视频';
        const rootComment = result.contextState?.thread_context?.root_comment;
        const isRoot = result.contextState?.thread_context?.is_root_author;

        let speechesHtml = speeches.map((s, idx) => `
        <div style="background: #f8fafc; border-left: 3px solid ${statusColor}; padding: 8px 12px; border-radius: 4px; font-size: 13px; color: #1e293b; line-height: 1.5; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 2px;">发言 #${idx + 1}:</span>
            ${s}
        </div>
    `).join('');

        if (!speechesHtml) {
            speechesHtml = '<div style="color: #94a3b8; font-size: 12px;">未捕获到具体的发言切片</div>';
        }

        let hotHtml = hotComments.map((hc, idx) => `
        <div style="font-size: 11px; color: #64748b; background: #fff; border: 1px solid #f1f5f9; padding: 4px 8px; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${idx + 1}. <b>${hc.author}:</b> ${hc.text}</span>
            <span style="color: #00AEEC; flex-shrink: 0;">👍 ${hc.likes}</span>
        </div>
    `).join('');

        modal.innerHTML = `
        <div style="background: #fff; border-radius: 14px; width: 92%; max-width: 520px; max-height: 85vh; padding: 22px; box-shadow: 0 16px 36px rgba(0,0,0,0.25); display: flex; flex-direction: column; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px; font-weight: bold; color: #0f172a;">🎭 AI 串度诊断报告</span>
                    <span style="font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 10px;">${result.userName || '目标用户'}</span>
                </div>
                <span id="comp-troll-modal-close" style="cursor: pointer; font-size: 18px; color: #94a3b8; padding: 0 4px; line-height: 1;">✕</span>
            </div>

            <div style="overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 14px;">
                <!-- 综合评分卡片 -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                        <span style="font-size: 14px; font-weight: bold; color: ${statusColor};">${statusTitle}</span>
                        <div style="font-size: 12px; color: #64748b;">
                            串度判定指数: <b style="font-size: 18px; color: ${statusColor}; font-family: monospace;">${percent}%</b>
                        </div>
                    </div>
                    <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                        <div style="background: ${statusColor}; width: ${percent}%; height: 100%; transition: width 0.3s;"></div>
                    </div>
                    <div style="font-size: 12px; color: #64748b; line-height: 1.4;">${statusDesc}</div>
                    <div style="display: flex; gap: 10px; margin-top: 10px; font-size: 12px;">
                        <span style="background: #fff; padding: 3px 8px; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155;">
                            表现特征: <b>${typeName}</b>
                        </span>
                        <span style="background: #fff; padding: 3px 8px; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155;">
                            特征确信度: <b>${confPercent}%</b>
                        </span>
                    </div>
                </div>

                <!-- 目标用户送审发言 -->
                <div>
                    <div style="font-size: 13px; font-weight: bold; color: #334155; margin-bottom: 6px; display: flex; align-items: center; gap: 5px;">
                        <span>💬 本楼提取发言 (${speeches.length} 条)</span>
                        ${isRoot ? '<span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px;">本楼楼主</span>' : ''}
                    </div>
                    <div style="max-height: 140px; overflow-y: auto;">
                        ${speechesHtml}
                    </div>
                </div>

                <!-- 综合背景参考 -->
                <div style="background: #fafafa; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px;">
                    <div style="font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 6px;">🌐 评估环境参考</div>
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <b>当前主题:</b> ${videoTitle}
                    </div>
                    ${rootComment && !isRoot ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px;"><b>主楼原帖:</b> ${rootComment}</div>` : ''}
                    ${hotHtml ? `
                        <div style="font-size: 11px; color: #475569; margin-top: 6px; margin-bottom: 4px; font-weight: 500;">评论区 Top 6 热门氛围（已排除本人）:</div>
                        <div style="max-height: 90px; overflow-y: auto;">
                            ${hotHtml}
                        </div>
                    ` : ''}
                </div>
            </div>

            <div style="margin-top: 14px; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                <button id="comp-troll-modal-ok" style="background: #00AEEC; color: #fff; border: none; padding: 6px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">关闭</button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);
        modal.querySelector('#comp-troll-modal-close').onclick = () => modal.remove();
        modal.querySelector('#comp-troll-modal-ok').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    let resultApplier = null;
    function setResultApplier(fn) {
        resultApplier = fn;
    }

    function request(option) {
        return new Promise((resolve, reject) => {
            let requestFunction = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);
            if (!requestFunction) return reject("无 GM API");
            requestFunction({
                method: "GET",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.bilibili.com/'
                },
                ...option,
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); } catch (e) { reject(e); }
                },
                onerror: (err) => reject(err)
            });
        });
    }

    function checkComposition(userID, element, btnNode) {
        if (checked[userID] !== undefined) {
            if (resultApplier) resultApplier(userID, element, btnNode);
            return;
        }

        if (checking[userID] !== undefined) {
            if (!checking[userID].some(item => item.element === element)) {
                checking[userID].push({ element, btnNode });
            }
            return;
        }

        checking[userID] = [{ element, btnNode }];
        const checkers = getCheckers();

        Promise.allSettled([
            request({ url: spaceApiUrl + userID }),
            request({ url: followingApiUrl + userID })
        ]).then(([spaceRes, followRes]) => {
            let found = [];

            let hasDynamicMatch = false;
            let hasFollowingMatch = false;

            if (spaceRes.status === 'fulfilled' && spaceRes.value && spaceRes.value.code === 0 && spaceRes.value.data?.items) {
                let items = spaceRes.value.data.items;

                for (let setting of checkers) {
                    if (!setting.keywords) continue;

                    items.forEach(item => {
                        let textParts = [];
                        let dyn = item.modules?.module_dynamic;
                        if (dyn?.major?.archive?.title) textParts.push(dyn.major.archive.title);
                        if (dyn?.major?.archive?.desc) textParts.push(dyn.major.archive.desc);
                        if (dyn?.desc?.text) textParts.push(dyn.desc.text);
                        if (dyn?.topic?.name) textParts.push('#' + dyn.topic.name);
                        if (item.orig?.modules?.module_author?.name) textParts.push('转发: ' + item.orig.modules.module_author.name);

                        let fullText = textParts.join(' ');
                        let pubTime = item.modules?.module_author?.pub_time || '';
                        let jumpUrl = dyn?.major?.archive?.jump_url ? ('https:' + dyn.major.archive.jump_url) : (item.id_str ? `https://t.bilibili.com/${item.id_str}` : '');

                        setting.keywords.forEach(keyword => {
                            if (fullText.includes(keyword)) {
                                hasDynamicMatch = true;
                                let entry = found.find(f => f.setting === setting);
                                if (!entry) {
                                    entry = { setting, reasons: [] };
                                    found.push(entry);
                                }
                                if (!entry.reasons.some(r => r.text === fullText)) {
                                    entry.reasons.push({
                                        type: 'dynamic',
                                        keyword: keyword,
                                        text: fullText || '发布了相关动态',
                                        time: pubTime,
                                        url: jumpUrl
                                    });
                                }
                            }
                        });
                    });
                }
            }

            if (followRes.status === 'fulfilled' && followRes.value && followRes.value.code === 0 && followRes.value.data && followRes.value.data.list) {
                let followings = followRes.value.data.list.map(it => String(it.mid));
                for (let setting of checkers) {
                    if (setting.followings) {
                        setting.followings.forEach(mid => {
                            if (followings.some(f => f === String(mid))) {
                                hasFollowingMatch = true;
                                let entry = found.find(f => f.setting === setting);
                                if (!entry) {
                                    entry = { setting, reasons: [] };
                                    found.push(entry);
                                }
                                if (!entry.reasons.some(r => String(r.mid) === String(mid))) {
                                    entry.reasons.push({
                                        type: 'following',
                                        mid: mid
                                    });
                                }
                            }
                        });
                    }
                }
            }

            // 判断关注状态：不让看关注 (code: 22115) / 公开未匹配 (无匹配关注)
            let isHideFollowing = (followRes.status === 'fulfilled' && followRes.value && followRes.value.code === 22115);
            let isFollowPublic = (followRes.status === 'fulfilled' && followRes.value && followRes.value.code === 0);

            // 判断动态状态：无动态 (data.items.length === 0) / 有动态未匹配 (无匹配动态)
            let isNoDynamic = false;
            let hasDynamicContent = false;
            if (spaceRes.status === 'fulfilled' && spaceRes.value && spaceRes.value.code === 0) {
                let items = spaceRes.value.data?.items;
                if (!items || (Array.isArray(items) && items.length === 0)) {
                    isNoDynamic = true;
                } else if (Array.isArray(items) && items.length > 0) {
                    hasDynamicContent = true;
                }
            }

            // 特殊合成条件：既隐私隐藏关注，又公开发布动态为空
            if (isHideFollowing && isNoDynamic) {
                found.push({
                    setting: {
                        displayName: "不让看关注+无动态",
                        displayIcon: fallbackIcon,
                        badgeColor: "rgba(255, 87, 34, 0.15)",
                        textColor: "#FF5722",
                        isSpecial: true
                    },
                    reasons: [
                        { type: 'special', text: '🔒 该用户设置了隐私，隐藏了关注列表 (错误码 22115)' },
                        { type: 'special', text: '📭 该用户公开动态列表为空' }
                    ]
                });
            } else {
                // 1. 关注维度互斥标签生成：
                if (isHideFollowing) {
                    found.push({
                        setting: {
                            displayName: "不让看关注",
                            displayIcon: fallbackIcon,
                            badgeColor: "rgba(255, 152, 0, 0.15)",
                            textColor: "#FF9800",
                            isSpecial: true
                        },
                        reasons: [
                            { type: 'special', text: '🔒 该用户设置了隐私，隐藏了关注列表 (错误码 22115)' }
                        ]
                    });
                } else if (isFollowPublic && !hasFollowingMatch) {
                    found.push({
                        setting: {
                            displayName: "无匹配关注",
                            displayIcon: fallbackIcon,
                            badgeColor: "rgba(120, 144, 156, 0.15)",
                            textColor: "#78909C",
                            isSpecial: true
                        },
                        reasons: [
                            { type: 'special', text: '👀 关注列表已公开，但未关注任何已设定的官方账号' }
                        ]
                    });
                }

                // 2. 动态维度互斥标签生成：
                if (isNoDynamic) {
                    found.push({
                        setting: {
                            displayName: "无动态",
                            displayIcon: fallbackIcon,
                            badgeColor: "rgba(158, 158, 158, 0.15)",
                            textColor: "#757575",
                            isSpecial: true
                        },
                        reasons: [
                            { type: 'special', text: '📭 该用户公开动态列表为空' }
                        ]
                    });
                } else if (hasDynamicContent && !hasDynamicMatch) {
                    found.push({
                        setting: {
                            displayName: "无匹配动态",
                            displayIcon: fallbackIcon,
                            badgeColor: "rgba(120, 144, 156, 0.15)",
                            textColor: "#78909C",
                            isSpecial: true
                        },
                        reasons: [
                            { type: 'special', text: '📝 已检查近期公开动态，未发现任何已设定的成分关键字' }
                        ]
                    });
                }
            }

            checked[userID] = found;
            const targetNodes = checking[userID] || [];
            delete checking[userID];

            const userName = targetNodes[0]?.element?.textContent?.trim() || '未知用户';
            if (found.length > 0) {
                const summary = found.map(f => {
                    let label = f.setting.displayName;
                    if (!f.setting.isSpecial && f.reasons) {
                        let hasFollowing = f.reasons.some(r => r.type === 'following');
                        let hasDynamic = f.reasons.some(r => r.type === 'dynamic');
                        if (hasFollowing && hasDynamic) label += '(关注,动态)';
                        else if (hasFollowing) label += '(关注)';
                        else if (hasDynamic) label += '(动态)';
                    }
                    const detail = f.reasons.map(r => r.type === 'dynamic' ? `关键词:"${r.keyword}"` : (r.type === 'following' ? `关注UID:${r.mid}` : r.text)).join(', ');
                    return `${label} [${detail}]`;
                }).join('; ');
                console.log(`[成分检测 log] 👤 用户: ${userName} (UID: ${userID}) | 匹配成分: ${summary}`, { uid: userID, userName, found, spaceRes, followRes });
            } else {
                console.log(`[成分检测 log] 👤 用户: ${userName} (UID: ${userID}) | 无匹配成分`, { uid: userID, userName, spaceRes, followRes });
            }

            targetNodes.forEach(({ element, btnNode }) => {
                if (resultApplier) resultApplier(userID, element, btnNode);
            });
        }).catch(err => {
            console.error(`[成分检测] 失败`, err);
            if (checking[userID]) {
                checking[userID].forEach(({ btnNode }) => {
                    if (btnNode) {
                        let btnTxt = btnNode.querySelector('.comp-btn-txt');
                        if (btnTxt) btnTxt.textContent = '失败';
                    }
                });
                delete checking[userID];
            }
        });
    }

    // 应用/复用缓存结果到指定的 DOM 元素
    function applyCacheResult(userID, element, btnNode) {
        if (element.dataset.compDone) return;
        ensureContainerWrap(element);

        const userName = element.textContent.trim();
        const found = checked[userID];

        if (!btnNode) {
            btnNode = element.nextElementSibling;
            if (btnNode && !btnNode.classList.contains('composition-checkable')) {
                btnNode = null;
            }
        }

        if (found && found.length > 0) {
            if (btnNode) btnNode.remove();
            if (!element.nextElementSibling?.classList.contains('composition-badge')) {
                for (let item of found) {
                    installComposition(element, item, userName);
                }
            }
            element.dataset.compDone = 'true';
            installTrollButton(element, userID);
        } else {
            if (btnNode) {
                let btnTxt = btnNode.querySelector('.comp-btn-txt');
                if (btnTxt) btnTxt.textContent = '无匹配';
            } else {
                installCheckButton(element, userID);
                let newBtn = element.nextElementSibling;
                if (newBtn && newBtn.classList.contains('composition-checkable')) {
                    let btnTxt = newBtn.querySelector('.comp-btn-txt');
                    if (btnTxt) btnTxt.textContent = '无匹配';
                }
            }
            element.dataset.compDone = 'true';
            installTrollButton(element, userID);
        }
    }

    function installCheckButton(element, userID) {
        ensureContainerWrap(element);

        let node = document.createElement('span');
        node.className = 'composition-checkable';
        node.style.cssText = 'display: inline-flex; align-items: center; margin: 2px 4px; vertical-align: middle; cursor: pointer; text-decoration: none; white-space: nowrap; flex-shrink: 0; height: 20px; box-sizing: border-box;';
        node.innerHTML = `<span style="display: inline-flex; align-items: center; background: #ffffff; border: 1px solid #e3e5e7; border-radius: 10px; padding: 2px 6px; font-size: 11px; color: #666; line-height: 14px; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05); white-space: nowrap;" title="点击检测成分" class="comp-btn-txt">
        ${searchIcon}
    </span>`;

        node.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            let btnTxt = node.querySelector('.comp-btn-txt');
            if (btnTxt) btnTxt.textContent = "检查中...";
            checkComposition(userID, element, node);
        });

        element.insertAdjacentElement('afterend', node);
    }

    // 安装成分 Tag（支持白色背景 + 专属主题 Border 边框风格与 onerror 防裂图机制）
    function installComposition(element, { setting, reasons }, userName) {
        ensureContainerWrap(element);

        let node = document.createElement('span');
        node.className = 'composition-badge';
        const txtColor = setting.textColor || '#00AEEC';
        const bgColor = '#ffffff';
        const borderColor = setting.textColor ? setting.textColor : '#00AEEC';

        // 动态生成类型后缀 (关注 / 动态)
        let displayTitle = setting.displayName;
        if (!setting.isSpecial && reasons && reasons.length > 0) {
            let hasFollowing = reasons.some(r => r.type === 'following');
            let hasDynamic = reasons.some(r => r.type === 'dynamic');
            if (hasFollowing && hasDynamic) {
                displayTitle += '(关注,动态)';
            } else if (hasFollowing) {
                displayTitle += '(关注)';
            } else if (hasDynamic) {
                displayTitle += '(动态)';
            }
        }

        node.style.cssText = `
        display: inline-flex; align-items: center; background: ${bgColor};
        border: 1px solid ${borderColor}; border-radius: 10px;
        margin: 2px 4px; padding: 1px 7px; vertical-align: middle;
        text-decoration: none; cursor: pointer;
        white-space: nowrap; flex-shrink: 0;
        height: 20px; line-height: 16px; box-sizing: border-box;
        transition: transform 0.15s, box-shadow 0.15s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    `;
        node.title = "点击查看成分判定依据";
        node.innerHTML = `
        <img src="${setting.displayIcon}" onerror="this.src='${fallbackIcon}'" style="width: 14px; height: 14px; border-radius: 50%; margin-right: 4px; vertical-align: middle; object-fit: cover; flex-shrink: 0;">
        <span style="font-size: 11px; color: ${txtColor}; line-height: 14px; font-weight: 500; white-space: nowrap;">${displayTitle}</span>
    `;

        node.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            showEvidenceModal(setting, reasons, userName, displayTitle);
        });

        element.insertAdjacentElement('afterend', node);
    }

    function showEvidenceModal(setting, reasons, userName, displayTitle) {
        let oldModal = document.getElementById('comp-evidence-modal');
        if (oldModal) oldModal.remove();

        let modal = document.createElement('div');
        modal.id = 'comp-evidence-modal';
        modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(5px);
        z-index: 999999; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

        let contentHtml = (reasons || []).map(r => {
            if (r.type === 'dynamic') {
                return `<div style="background: #f7f9fa; border-left: 3px solid #00AEEC; padding: 10px 12px; margin-top: 10px; border-radius: 6px;">
                <div style="font-size: 12px; color: #888; display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>📌 命中关键字: <b style="color: #00AEEC;">${r.keyword}</b></span>
                    <span>${r.time || ''}</span>
                </div>
                <div style="font-size: 13px; color: #222; line-height: 1.5; font-weight: 500;">${r.text}</div>
                ${r.url ? `<a href="${r.url}" target="_blank" style="font-size: 12px; color: #00AEEC; text-decoration: none; display: inline-block; margin-top: 6px;">查看原动态 ↗</a>` : ''}
            </div>`;
            } else if (r.type === 'following') {
                return `<div style="background: #f7f9fa; border-left: 3px solid #FB7299; padding: 10px 12px; margin-top: 10px; border-radius: 6px;">
                <div style="font-size: 13px; color: #333;">
                    🎯 关注了官方账号 (UID: <b style="color: #FB7299;">${r.mid}</b>)
                </div>
            </div>`;
            } else if (r.type === 'special') {
                return `<div style="background: #f7f9fa; border-left: 3px solid #FF9800; padding: 10px 12px; margin-top: 10px; border-radius: 6px;">
                <div style="font-size: 13px; color: #333; font-weight: 500;">
                    ${r.text}
                </div>
            </div>`;
            }
        }).join('');

        const modalTitle = displayTitle || setting.displayName;

        modal.innerHTML = `
        <div style="background: #fff; border-radius: 14px; width: 90%; max-width: 450px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${setting.displayIcon}" onerror="this.src='${fallbackIcon}'" style="width: 22px; height: 22px; border-radius: 50%;">
                    <span style="font-size: 15px; font-weight: bold; color: #18191C;">${userName} 的【${modalTitle}】成分依据</span>
                </div>
                <span id="comp-modal-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>
            <div style="max-height: 320px; overflow-y: auto; padding-right: 4px;">
                ${contentHtml || '<div style="color: #999; text-align: center; padding: 20px;">暂未找到详细截图依据</div>'}
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        document.getElementById('comp-modal-close').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    let isProcessingQueue = false;

    // IntersectionObserver 视口检测监听器
    const viewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const userID = el.dataset.compUserId;
                if (!userID) return;

                if (checked[userID] !== undefined) {
                    // 已有缓存：直接渲染缓存结果
                    applyCacheResult(userID, el);
                } else if (checking[userID] !== undefined) {
                    // 正在检测中：将当前节点加入通知队列
                    let btnNode = el.nextElementSibling;
                    if (btnNode && btnNode.classList.contains('composition-checkable')) {
                        let btnTxt = btnNode.querySelector('.comp-btn-txt');
                        if (btnTxt) btnTxt.textContent = "自动检测...";
                    }
                    if (!checking[userID].some(item => item.element === el)) {
                        checking[userID].push({ element: el, btnNode });
                    }
                } else {
                    // 未检测：加入请求队列
                    enqueueAutoCheck(userID, el);
                }
            }
        });
    }, {
        root: null,
        rootMargin: '0px 0px 100px 0px',
        threshold: 0.1
    });

    function enqueueAutoCheck(userID, element) {
        if (checked[userID] !== undefined) {
            applyCacheResult(userID, element);
            return;
        }
        if (checking[userID] !== undefined) {
            let btnNode = element.nextElementSibling;
            if (!checking[userID].some(item => item.element === element)) {
                checking[userID].push({ element, btnNode });
            }
            return;
        }

        if (autoCheckQueue.some(item => item.userID === userID)) return;
        autoCheckQueue.push({ userID, element });
        processQueue();
    }

    function processQueue() {
        if (isProcessingQueue || autoCheckQueue.length === 0) return;

        isProcessingQueue = true;
        const task = autoCheckQueue.shift();

        // 若出队时该 UID 已有缓存，直接渲染缓存，无需等待延迟
        if (checked[task.userID] !== undefined) {
            applyCacheResult(task.userID, task.element);
            isProcessingQueue = false;
            processQueue();
            return;
        }

        // 若出队时该 UID 已在检测中，收集进队列，跳过发起请求
        if (checking[task.userID] !== undefined) {
            let btnNode = task.element.nextElementSibling;
            if (!checking[task.userID].some(item => item.element === task.element)) {
                checking[task.userID].push({ element: task.element, btnNode });
            }
            isProcessingQueue = false;
            processQueue();
            return;
        }

        let btnNode = task.element.nextElementSibling;
        if (btnNode && btnNode.classList.contains('composition-checkable')) {
            let btnTxt = btnNode.querySelector('.comp-btn-txt');
            if (btnTxt) btnTxt.textContent = "自动检测...";
        }

        checkComposition(task.userID, task.element, btnNode);

        const randomDelay = Math.floor(Math.random() * 500) + 300;

        setTimeout(() => {
            isProcessingQueue = false;
            processQueue();
        }, randomDelay);
    }

    function scan() {
        const illegalBtns = queryShadowDOM('#user-avatar + .composition-checkable');
        illegalBtns.forEach(btn => btn.remove());

        const selectors = [
            '#user-name',
            '#main a[href*="space.bilibili.com/"]',
            '.user-name',
            '.sub-user-name',
            '#h-name'
        ];

        const elements = queryShadowDOM(selectors.join(','));

        elements.forEach(el => {
            ensureContainerWrap(el);
            const elId = el.getAttribute('id') || el.id || '';
            const elClass = el.getAttribute('class') || el.className || '';

            if (elId === 'user-avatar' ||
                elId.includes('avatar') ||
                (typeof elClass === 'string' && elClass.includes('avatar')) ||
                el.closest('#user-avatar, bili-avatar, .avatar, #avatar')) {
                return;
            }

            if (!el.textContent.trim() || el.querySelector('img, svg, picture, bili-avatar-layer')) {
                return;
            }

            if (el.dataset.compInstalled || el.closest('[data-comp-installed]')) return;

            if (el.nextElementSibling?.classList.contains('composition-checkable') ||
                el.nextElementSibling?.classList.contains('composition-badge') ||
                el.parentElement?.querySelector(':scope > .composition-checkable, :scope > .composition-badge')) {
                el.dataset.compInstalled = 'true';
                return;
            }

            const userID = getUserId(el);
            if (!userID) return;

            el.dataset.compInstalled = 'true';
            el.dataset.compUserId = userID;

            if (checked[userID] !== undefined) {
                // 已存在检测缓存：直接复用缓存并更新 DOM
                applyCacheResult(userID, el);
            } else if (checking[userID] !== undefined) {
                // 正在检测中：创建按钮并加入待渲染列表
                installCheckButton(el, userID);
                let btnNode = el.nextElementSibling;
                if (btnNode && btnNode.classList.contains('composition-checkable')) {
                    let btnTxt = btnNode.querySelector('.comp-btn-txt');
                    if (btnTxt) btnTxt.textContent = "检查中...";
                }
                checking[userID].push({ element: el, btnNode });
            } else {
                // 尚未检测：安装按钮并加入视口监听
                installCheckButton(el, userID);
                viewportObserver.observe(el);
            }
        });

        // 为评论区用户节点挂载鉴串按钮
        const commentUserEls = queryShadowDOM('#user-name, .user-name, .sub-user-name');
        commentUserEls.forEach(el => {
            const uid = getUserId(el);
            if (uid) {
                installTrollButton(el, uid);
            }
        });

        scanSidenavStorage();
        scanSpaceHeader();
    }

    function scanSpaceHeader() {
        if (!location.hostname.includes('space.bilibili.com')) return;

        const match = location.pathname.match(/\/(\d+)/);
        if (!match || !match[1]) return;
        const spaceUID = match[1];

        const spaceHeaderEls = queryShadowDOM('#h-name, .upinfo-detail__top, .user-info .name, .h-name');
        spaceHeaderEls.forEach(container => {
            if (container.dataset.compInstalled || container.closest('[data-comp-installed]')) return;

            let targetEl = container;
            if (container.classList.contains('upinfo-detail__top')) {
                // 针对新版个人主页的 upinfo-detail__top 提取名字节点
                let firstTextNode = null;
                for (let child of container.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                        firstTextNode = child;
                        break;
                    }
                }
                if (firstTextNode) {
                    let spanWrapper = document.createElement('span');
                    spanWrapper.className = 'space-header-username';
                    spanWrapper.style.cssText = 'display: inline-block; vertical-align: middle; margin-right: 4px;';
                    spanWrapper.textContent = firstTextNode.textContent.trim();
                    firstTextNode.parentNode.replaceChild(spanWrapper, firstTextNode);
                    targetEl = spanWrapper;
                } else {
                    let firstSpan = container.querySelector('span');
                    if (firstSpan) targetEl = firstSpan;
                }
            }

            if (targetEl.dataset.compInstalled) return;

            if (targetEl.nextElementSibling?.classList.contains('composition-checkable') ||
                targetEl.nextElementSibling?.classList.contains('composition-badge') ||
                targetEl.parentElement?.querySelector(':scope > .composition-checkable, :scope > .composition-badge')) {
                targetEl.dataset.compInstalled = 'true';
                return;
            }

            targetEl.dataset.compInstalled = 'true';
            targetEl.dataset.compUserId = spaceUID;

            if (checked[spaceUID] !== undefined) {
                applyCacheResult(spaceUID, targetEl);
            } else if (checking[spaceUID] !== undefined) {
                installCheckButton(targetEl, spaceUID);
                let btnNode = targetEl.nextElementSibling;
                if (btnNode && btnNode.classList.contains('composition-checkable')) {
                    let btnTxt = btnNode.querySelector('.comp-btn-txt');
                    if (btnTxt) btnTxt.textContent = "检查中...";
                }
                checking[spaceUID].push({ element: targetEl, btnNode });
            } else {
                installCheckButton(targetEl, spaceUID);
                viewportObserver.observe(targetEl);
            }
        });
    }

    function scanSidenavStorage() {
        const containers = queryShadowDOM('.fixed-sidenav-storage');
        containers.forEach(container => {
            if (container.dataset.compNavInstalled) return;
            container.dataset.compNavInstalled = 'true';

            // 动态获取 Vue Scoped CSS 属性 (如 data-v-2f795f20)
            const dataVAttrs = Array.from(container.attributes)
                .filter(attr => attr.name.startsWith('data-v-'));

            let wrapper = document.createElement('div');
            wrapper.className = 'sidenav-item-wrapper';

            let aNode = document.createElement('a');
            aNode.className = 'fixed-sidenav-storage-item storable';
            aNode.title = '成分';
            aNode.href = 'javascript:void(0);';
            aNode.innerHTML = `
            <div class="sidenav-icon" style="display: flex; justify-content: center; align-items: center; font-size: 14px; font-weight: bold;">
                🧪
            </div>
            <span class="sidenav-text" style="font-size: 12px; margin-top: 2px;">成分</span>
        `;

            // 将拿到的 data-v-xxx 属性赋予我们的 div、a 标签及子元素
            dataVAttrs.forEach(attr => {
                wrapper.setAttribute(attr.name, attr.value);
                aNode.setAttribute(attr.name, attr.value);
                aNode.querySelectorAll('*').forEach(child => child.setAttribute(attr.name, attr.value));
            });

            aNode.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                showSettingModal();
            });

            wrapper.appendChild(aNode);
            container.appendChild(wrapper);
        });
    }

    // 注册成分检测结果应用回调
    setResultApplier(applyCacheResult);

    console.log("[B站成分雷达 BiliRadardar] 启动成功!");

    (function injectStyles() {
        let style = document.createElement('style');
        style.textContent = `
        @keyframes compSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
        if (document.head) {
            document.head.appendChild(style);
        } else {
            document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
        }
    })();

    // 启动周期性评论区与页面扫描
    setInterval(scan, 1000);

})();
