import { spaceApiUrl, followingApiUrl, checked, checking } from '../scanner/state.js';
import { getCheckers } from '../storage/checkersStorage.js';
import { fallbackIcon } from '../config/constants.js';

let resultApplier = null;
export function setResultApplier(fn) {
    resultApplier = fn;
}

export function request(option) {
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

export function checkComposition(userID, element, btnNode) {
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
