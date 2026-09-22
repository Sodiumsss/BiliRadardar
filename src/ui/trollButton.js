import { loadTypeSafeConfig } from '../storage/typesafeStorage.js';
import { showToast } from './toast.js';
import { showSettingModal } from './modals/settingModal.js';
import { trollAnalysisCache } from '../scanner/state.js';
import { trollTypeNames } from '../config/typesafeConfig.js';
import { getHotComments, getThreadSpeeches } from '../scanner/contextEngine.js';
import { analyzeTrollWithJev } from '../api/typesafeApi.js';
import { closestCrossShadow, ensureContainerWrap } from '../scanner/domUtils.js';

// 安装“鉴串”按钮
export function installTrollButton(element, userID) {
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
export function renderTrollBadge(btnNode, element, userID, result) {
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
export function showTrollDetailModal(result) {
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
