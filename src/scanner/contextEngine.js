import { queryShadowDOM, getUserId, closestCrossShadow, extractCommentText } from './domUtils.js';

// 获取评论区点赞前 6 的热门评论（自动排除目标用户本人）
export function getHotComments(targetUid, limit = 6) {
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
export function getThreadSpeeches(targetElement, targetUid) {
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
