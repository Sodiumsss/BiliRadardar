// ==UserScript==
// @name         B站成分雷达 (BiliRadardar)
// @version      1.0.1
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
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    // 默认备用图标（B站Favicon）
    const fallbackIcon = "https://static.hdslb.com/images/favicon.ico";

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

    function saveCheckers(newCheckers) {
        checkers = newCheckers;
        let jsonStr = JSON.stringify(newCheckers);
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue('bili_composition_checkers', jsonStr);
        }
        localStorage.setItem('bili_composition_checkers', jsonStr);
    }

    let checkers = loadCheckers();

    const spaceApiUrl = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=';
    const followingApiUrl = 'https://api.bilibili.com/x/relation/followings?vmid=';

    const checked = {};
    const checking = {};
    const autoCheckQueue = [];
    let isProcessingQueue = false;

    const searchIcon = `<svg width="12" height="12" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M16.3451 15.2003C16.6377 15.4915 16.4752 15.772 16.1934 16.0632C16.15 16.1279 16.0958 16.1818 16.0525 16.2249C15.7707 16.473 15.4456 16.624 15.1854 16.3652L11.6848 12.8815C10.4709 13.8198 8.97529 14.3267 7.44714 14.3267C3.62134 14.3267 0.5 11.2314 0.5 7.41337C0.5 3.60616 3.6105 0.5 7.44714 0.5C11.2729 0.5 14.3943 3.59538 14.3943 7.41337C14.3943 8.98802 13.8524 10.5087 12.8661 11.7383L16.3451 15.2003ZM2.13647 7.4026C2.13647 10.3146 4.52083 12.6766 7.43624 12.6766C10.3517 12.6766 12.736 10.3146 12.736 7.4026C12.736 4.49058 10.3517 2.1286 7.43624 2.1286C4.50999 2.1286 2.13647 4.50136 2.13647 7.4026Z" fill="currentColor"></path></svg>`;

    console.log("[B站成分雷达 BiliRadardar] 启动成功!");

    // 应用/复用缓存结果到指定的 DOM 元素
    function applyCacheResult(userID, element, btnNode) {
        if (element.dataset.compDone) return;

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
        }
    }

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

    function queryShadowDOM(selector, root = document) {
        let matches = [];
        function traverse(node) {
            if (!node) return;
            if (node.querySelectorAll) {
                try {
                    let els = node.querySelectorAll(selector);
                    els.forEach(el => matches.push(el));
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

    setInterval(scan, 1000);

    function getUserId(el) {
        let uid = el.getAttribute("data-user-id") || el.getAttribute("data-usercard-mid") || el.getAttribute("user-id");
        if (uid) return uid;

        let href = el.getAttribute("href") || (el.closest('a') && el.closest('a').getAttribute("href"));
        if (href) {
            let match = href.match(/space\.bilibili\.com\/(\d+)/);
            if (match && match[1]) return match[1];
        }

        let childA = el.querySelector('a[href*="space.bilibili.com"]');
        if (childA) {
            let match = childA.getAttribute("href").match(/space\.bilibili\.com\/(\d+)/);
            if (match && match[1]) return match[1];
        }

        return null;
    }

    function installCheckButton(element, userID) {
        let node = document.createElement('span');
        node.className = 'composition-checkable';
        node.style.cssText = 'display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle; cursor: pointer; text-decoration: none;';
        node.innerHTML = `<span style="display: inline-flex; align-items: center; background: #ffffff; border: 1px solid #e3e5e7; border-radius: 10px; padding: 2px 6px; font-size: 11px; color: #666; line-height: 12px; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.05);" title="点击检测成分" class="comp-btn-txt">
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

        node.style.cssText = `display: inline-flex; align-items: center; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 10px; margin: 0 4px; padding: 1px 6px; vertical-align: middle; text-decoration: none; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.06);`;
        node.title = "点击查看成分判定依据";
        node.innerHTML = `<img src="${setting.displayIcon}" onerror="this.src='${fallbackIcon}'" style="width: 15px; height: 15px; border-radius: 50%; margin-right: 4px; vertical-align: middle; object-fit: cover;">
            <span style="font-size: 12px; color: ${txtColor}; line-height: 14px; font-weight: 500;">${displayTitle}</span>`;

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

    function checkComposition(userID, element, btnNode) {
        if (checked[userID] !== undefined) {
            applyCacheResult(userID, element, btnNode);
            return;
        }

        if (checking[userID] !== undefined) {
            if (!checking[userID].some(item => item.element === element)) {
                checking[userID].push({ element, btnNode });
            }
            return;
        }

        checking[userID] = [{ element, btnNode }];

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
                applyCacheResult(userID, element, btnNode);
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

    function request(option) {
        return new Promise((resolve, reject) => {
            let requestFunction = GM_xmlhttpRequest ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);
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
})();