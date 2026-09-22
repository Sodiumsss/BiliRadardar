import { defaultTrollRubric } from '../config/typesafeConfig.js';
import { showToast } from '../ui/toast.js';

export function loadTrollRubric() {
    try {
        let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_troll_rubric') : localStorage.getItem('bili_typesafe_troll_rubric');
        if (stored) {
            let parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            if (parsed && typeof parsed === 'object' && parsed.questions) {
                // 如果用户没有进行手动修改过配置，或者版本落后于默认版本，自动同步到新版本
                if (!parsed.is_custom_user_override && parsed.version !== defaultTrollRubric.version) {
                    parsed = JSON.parse(JSON.stringify(defaultTrollRubric));
                    saveTrollRubric(parsed, false);
                }
                return parsed;
            }
        }
    } catch (e) {
        console.error("[串子识别] 读取 Rubric 配置失败", e);
    }
    return JSON.parse(JSON.stringify(defaultTrollRubric));
}

let trollRubric = loadTrollRubric();

export function getTrollRubric() {
    return trollRubric;
}

export function hasCustomTrollRubric() {
    try {
        let stored = typeof GM_getValue !== 'undefined' ? GM_getValue('bili_typesafe_troll_rubric') : localStorage.getItem('bili_typesafe_troll_rubric');
        return !!stored;
    } catch (e) {
        return false;
    }
}

export function saveTrollRubric(newRubric, isExplicitUserAction = false) {
    if (isExplicitUserAction) {
        newRubric.is_custom_user_override = true;
    }
    trollRubric = newRubric;
    let jsonStr = JSON.stringify(newRubric);
    if (typeof GM_setValue !== 'undefined') {
        GM_setValue('bili_typesafe_troll_rubric', jsonStr);
    }
    localStorage.setItem('bili_typesafe_troll_rubric', jsonStr);
    return trollRubric;
}

export function resetTrollRubric() {
    if (typeof GM_deleteValue !== 'undefined') {
        GM_deleteValue('bili_typesafe_troll_rubric');
    }
    localStorage.removeItem('bili_typesafe_troll_rubric');
    trollRubric = JSON.parse(JSON.stringify(defaultTrollRubric));
    return trollRubric;
}

export function validateTrollRubric(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { valid: false, error: '配置必须为有效的 JSON 对象' };
    }
    if (!obj.questions || typeof obj.questions !== 'object') {
        return { valid: false, error: '缺少 questions 定义对象' };
    }
    if (!obj.questions.is_troll || obj.questions.is_troll.type !== 'noul') {
        return { valid: false, error: '缺少 questions.is_troll 或其 type 不为 "noul"' };
    }
    if (!obj.questions.troll_type || obj.questions.troll_type.type !== 'choice') {
        return { valid: false, error: '缺少 questions.troll_type 或其 type 不为 "choice"' };
    }
    if (!obj.questions.is_troll.criteria || typeof obj.questions.is_troll.criteria !== 'object') {
        return { valid: false, error: 'questions.is_troll 必须包含 criteria 判定准则对象' };
    }
    if (!obj.questions.troll_type.criteria || typeof obj.questions.troll_type.criteria !== 'object') {
        return { valid: false, error: 'questions.troll_type 必须包含 criteria 类别描述对象' };
    }
    return { valid: true, data: obj };
}

export function exportRubricToFile(rubric) {
    try {
        let jsonStr = JSON.stringify(rubric, null, 2);
        let blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = `chuanzi_rubric_config_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('已导出 Rubric 准则文件到本地！');
    } catch (e) {
        showToast('导出准则失败：' + e.message);
    }
}
