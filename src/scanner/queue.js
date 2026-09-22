import { checked, checking, autoCheckQueue } from './state.js';
import { applyCacheResult } from '../ui/checkButton.js';
import { checkComposition } from '../api/bilibiliApi.js';

let isProcessingQueue = false;

// IntersectionObserver 视口检测监听器
export const viewportObserver = new IntersectionObserver((entries) => {
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

export function enqueueAutoCheck(userID, element) {
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

export function processQueue() {
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
