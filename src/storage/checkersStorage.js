import { defaultCheckers } from '../config/defaultCheckers.js';

export function loadCheckers() {
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

let checkers = loadCheckers();

export function getCheckers() {
    return checkers;
}

export function saveCheckers(newCheckers) {
    checkers = newCheckers;
    let jsonStr = JSON.stringify(newCheckers);
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue('bili_composition_checkers', jsonStr);
    }
    localStorage.setItem('bili_composition_checkers', jsonStr);
}
