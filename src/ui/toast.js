export function showToast(msg) {
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
