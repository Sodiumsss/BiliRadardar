import { checked, searchIcon } from '../scanner/state.js';
import { fallbackIcon } from '../config/constants.js';
import { installTrollButton } from './trollButton.js';
import { checkComposition } from '../api/bilibiliApi.js';
import { ensureContainerWrap } from '../scanner/domUtils.js';

// 应用/复用缓存结果到指定的 DOM 元素
export function applyCacheResult(userID, element, btnNode) {
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

export function installCheckButton(element, userID) {
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
export function installComposition(element, { setting, reasons }, userName) {
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

export function showEvidenceModal(setting, reasons, userName, displayTitle) {
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
