import { defaultTypeSafeConfig } from '../config/typesafeConfig.js';

export function loadTypeSafeConfig() {
    try {
        let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_config') : localStorage.getItem('bili_typesafe_config');
        if (stored) {
            let parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            if (parsed && typeof parsed === 'object') {
                return {
                    apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '',
                    endpoint: typeof parsed.endpoint === 'string' && parsed.endpoint.trim() ? parsed.endpoint.trim() : defaultTypeSafeConfig.endpoint,
                    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : defaultTypeSafeConfig.model,
                    enabled: Boolean(parsed.enabled)
                };
            }
        }
    } catch (e) {
        console.error("[成分检测] 读取 TypeSafe 配置失败", e);
    }
    return JSON.parse(JSON.stringify(defaultTypeSafeConfig));
}

let typeSafeConfig = loadTypeSafeConfig();

export function getTypeSafeConfig() {
    return typeSafeConfig;
}

export function saveTypeSafeConfig(newConfig) {
    typeSafeConfig = {
        apiKey: (newConfig.apiKey || '').trim(),
        endpoint: (newConfig.endpoint || '').trim() || defaultTypeSafeConfig.endpoint,
        model: (newConfig.model || '').trim() || defaultTypeSafeConfig.model,
        enabled: Boolean(newConfig.enabled)
    };
    let jsonStr = JSON.stringify(typeSafeConfig);
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue('bili_typesafe_config', jsonStr);
    }
    localStorage.setItem('bili_typesafe_config', jsonStr);
    return typeSafeConfig;
}
