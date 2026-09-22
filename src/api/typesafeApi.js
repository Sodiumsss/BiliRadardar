import { defaultTypeSafeConfig } from '../config/typesafeConfig.js';
import { loadTypeSafeConfig } from '../storage/typesafeStorage.js';
import { loadTrollRubric } from '../storage/rubricStorage.js';

export function testTypeSafeConnection(config) {
    return new Promise((resolve, reject) => {
        const apiKey = (config.apiKey || '').trim();
        if (!apiKey) {
            return reject(new Error('请先填写 TypeSafe API Key！'));
        }

        const endpoint = (config.endpoint || '').trim() || defaultTypeSafeConfig.endpoint;
        const model = (config.model || '').trim() || defaultTypeSafeConfig.model;

        const payload = JSON.stringify({
            model: model,
            state: "ping test connection",
            questions: {
                ping: {
                    type: "noul",
                    instructions: "Is this a connection test?"
                }
            }
        });

        let requestFunction = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);

        if (requestFunction) {
            requestFunction({
                method: 'POST',
                url: endpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: payload,
                timeout: 10000,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const data = JSON.parse(res.responseText);
                            resolve({ success: true, message: `连接成功 (HTTP ${res.status})！Jev 模型响应正常。`, data });
                        } catch (e) {
                            resolve({ success: true, message: `连接成功 (HTTP ${res.status})！`, raw: res.responseText });
                        }
                    } else if (res.status === 401) {
                        reject(new Error(`认证失败 (401 Unauthorized)：API Key 无效或未授权，请检查输入的 Key。`));
                    } else if (res.status === 403) {
                        reject(new Error(`访问受限 (403 Forbidden)：无权访问该模型 (${model}) 或该接口。`));
                    } else if (res.status === 404) {
                        reject(new Error(`端点未找到 (404 Not Found)：请检查 Endpoint 地址是否正确。`));
                    } else if (res.status === 429) {
                        reject(new Error(`请求过于频繁或配额超限 (429 Too Many Requests)。`));
                    } else {
                        let detail = '';
                        try {
                            const errJson = JSON.parse(res.responseText);
                            detail = errJson.message || errJson.error || JSON.stringify(errJson);
                        } catch (_) {
                            detail = res.responseText || `HTTP ${res.status}`;
                        }
                        reject(new Error(`服务响应异常 (${res.status}): ${detail}`));
                    }
                },
                ontimeout: () => {
                    reject(new Error('请求超时 (10s)，请检查网络连接或 Endpoint 地址。'));
                },
                onerror: (err) => {
                    reject(new Error('网络请求异常，请检查油猴 @connect 权限或跨域网络连接。'));
                }
            });
        } else if (typeof fetch !== 'undefined') {
            fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: payload
            }).then(async (res) => {
                if (res.ok) {
                    resolve({ success: true, message: `连接成功 (HTTP ${res.status})！Jev 模型响应正常。` });
                } else if (res.status === 401) {
                    reject(new Error(`认证失败 (401 Unauthorized)：API Key 无效。`));
                } else {
                    const txt = await res.text().catch(() => '');
                    reject(new Error(`服务响应异常 (${res.status}): ${txt}`));
                }
            }).catch(err => {
                reject(new Error(`网络请求失败: ${err.message}`));
            });
        } else {
            reject(new Error('未检测到可用的网络请求环境 (GM_xmlhttpRequest / fetch)'));
        }
    });
}

// 调用 TypeSafe AI Jev 进行串子识别
export function analyzeTrollWithJev(state) {
    return new Promise((resolve, reject) => {
        const cfg = loadTypeSafeConfig();
        if (!cfg.apiKey) {
            return reject(new Error('未配置 API Key'));
        }
        if (!cfg.enabled) {
            return reject(new Error('未启用 TypeSafe AI'));
        }

        const rubric = loadTrollRubric();
        const isTrollQ = rubric.questions.is_troll;
        const trollTypeQ = rubric.questions.troll_type;

        let trueCriteria = Array.isArray(isTrollQ.criteria?.true) ? [...isTrollQ.criteria.true] : [];
        if (Array.isArray(rubric.custom_supplement_rules)) {
            rubric.custom_supplement_rules.forEach(rule => {
                if (rule && typeof rule === 'string' && rule.trim()) {
                    trueCriteria.push(`【自定义特征】${rule.trim()}`);
                }
            });
        }

        const payload = JSON.stringify({
            model: cfg.model || defaultTypeSafeConfig.model,
            state: state,
            questions: {
                is_troll: {
                    type: "noul",
                    instructions: isTrollQ.instructions,
                    criteria: {
                        true: trueCriteria,
                        false: isTrollQ.criteria?.false || []
                    }
                },
                troll_type: {
                    type: "choice",
                    instructions: trollTypeQ.instructions,
                    criteria: trollTypeQ.criteria
                }
            }
        });

        let requestFunction = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : null);
        if (!requestFunction) {
            return reject(new Error('未检测到 GM_xmlhttpRequest 环境'));
        }

        requestFunction({
            method: 'POST',
            url: cfg.endpoint || defaultTypeSafeConfig.endpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cfg.apiKey}`
            },
            data: payload,
            timeout: 15000,
            onload: (res) => {
                if (res.status >= 200 && res.status < 300) {
                    try {
                        const data = JSON.parse(res.responseText);
                        const answers = data.answers || {};
                        const trollProb = answers.is_troll?.noul ?? 0;
                        const trollType = answers.troll_type?.choice || 'normal';
                        const trollConfidence = answers.troll_type?.confidence ?? 0;
                        resolve({
                            isTrollProb: trollProb,
                            trollType: trollType,
                            trollConfidence: trollConfidence,
                            rawAnswers: answers,
                            model: data.model
                        });
                    } catch (e) {
                        reject(new Error('解析 Jev 响应失败: ' + e.message));
                    }
                } else if (res.status === 401) {
                    reject(new Error('认证失败 (401)：API Key 无效'));
                } else if (res.status === 429) {
                    reject(new Error('请求频控 (429)：额度用尽或频率超限'));
                } else {
                    let detail = '';
                    try {
                        let ej = JSON.parse(res.responseText);
                        detail = ej.detail ? (typeof ej.detail === 'string' ? ej.detail : JSON.stringify(ej.detail)) : res.responseText;
                    } catch (_) {
                        detail = res.responseText || `HTTP ${res.status}`;
                    }
                    reject(new Error(`响应异常 (${res.status}): ${detail}`));
                }
            },
            ontimeout: () => reject(new Error('请求超时 (15s)')),
            onerror: () => reject(new Error('网络请求异常'))
        });
    });
}
