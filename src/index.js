import { scan } from './scanner/pageScanner.js';
import { setResultApplier } from './api/bilibiliApi.js';
import { applyCacheResult } from './ui/checkButton.js';

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
