export function queryShadowDOM(selector, root = document) {
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
export function closestCrossShadow(el, selector) {
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
export function extractCommentText(el) {
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

export function getUserId(el) {
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
export function ensureContainerWrap(element) {
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

