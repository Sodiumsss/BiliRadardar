import { queryShadowDOM, getUserId, ensureContainerWrap } from './domUtils.js';
import { checked, checking } from './state.js';
import { applyCacheResult, installCheckButton } from '../ui/checkButton.js';
import { installTrollButton } from '../ui/trollButton.js';
import { viewportObserver } from './queue.js';
import { showSettingModal } from '../ui/modals/settingModal.js';

export function scan() {
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

export function scanSpaceHeader() {
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

export function scanSidenavStorage() {
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
