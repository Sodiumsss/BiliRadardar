import { loadTypeSafeConfig, saveTypeSafeConfig } from '../../storage/typesafeStorage.js';
import { defaultTypeSafeConfig, defaultTrollRubric } from '../../config/typesafeConfig.js';
import {
    loadTrollRubric,
    saveTrollRubric,
    hasCustomTrollRubric,
    resetTrollRubric,
    validateTrollRubric,
    exportRubricToFile
} from '../../storage/rubricStorage.js';
import { testTypeSafeConnection } from '../../api/typesafeApi.js';
import { showToast } from '../toast.js';
import { showRubricJsonEditorModal } from './rubricJsonEditorModal.js';

export function showTypeSafeConfigModal(onSuccess) {
    let subModal = document.createElement('div');
    subModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
        z-index: 1000000; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

    const currentCfg = loadTypeSafeConfig();
    const currentRubric = loadTrollRubric();

    subModal.innerHTML = `
        <div style="background: #fff; border-radius: 12px; width: 92%; max-width: 490px; padding: 22px; box-shadow: 0 12px 32px rgba(0,0,0,0.25); box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #18191C; display: flex; align-items: center; gap: 6px;">
                        <span>⚡ TypeSafe AI (Jev) 配置</span>
                    </div>
                    <div style="font-size: 12px; color: #909399; margin-top: 4px; line-height: 1.4;">
                        基于 TypeSafe AI 的 Jev 决策模型，为 B站成分雷达赋能快速结构化识别与串子鉴别。
                    </div>
                </div>
                <span id="ts-sub-modal-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>

            <div id="ts-modal-msg" style="display: none; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; line-height: 1.4; word-break: break-all;"></div>

            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #606266; margin-top: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                        TypeSafe API Key <span style="color: #f56c6c;">*</span>
                    </label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input id="ts-api-key" type="password" value="${currentCfg.apiKey || ''}" placeholder="例如：ts_sec_..." style="width: 100%; box-sizing: border-box; padding: 7px 36px 7px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px; font-family: monospace; outline: none; transition: border-color 0.2s;">
                        <span id="ts-toggle-key-visibility" title="显示/隐藏 Key" style="position: absolute; right: 10px; cursor: pointer; user-select: none; font-size: 14px; opacity: 0.65; transition: opacity 0.2s;">👁️</span>
                    </div>
                    <div style="font-size: 11px; color: #909399; margin-top: 4px;">
                        Key 仅存储在浏览器本地（通过 Tampermonkey GM 存储），绝不上报第三方。
                    </div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; background: #f9fafb; padding: 8px 12px; border-radius: 6px; border: 1px solid #ebeef5;">
                    <label for="ts-enabled-checkbox" style="font-size: 13px; font-weight: 500; color: #303133; cursor: pointer;">启用 TypeSafe AI (Jev) 分析</label>
                    <input id="ts-enabled-checkbox" type="checkbox" ${currentCfg.enabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #00AEEC;">
                </div>

                <div>
                    <div id="ts-advanced-toggle" style="cursor: pointer; font-size: 12px; color: #00AEEC; display: inline-flex; align-items: center; gap: 4px; user-select: none;">
                        <span>⚙️ 高级选项 (Endpoint 与模型名称)</span>
                        <span id="ts-advanced-arrow" style="font-size: 10px;">▼</span>
                    </div>
                    <div id="ts-advanced-body" style="display: none; flex-direction: column; gap: 10px; margin-top: 8px; background: #fafafa; padding: 10px; border-radius: 6px; border: 1px dashed #dcdfe6;">
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">API Endpoint</label>
                            <input id="ts-endpoint" type="text" value="${currentCfg.endpoint}" placeholder="https://api.typesafe.ai/v1/systemone" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; font-family: monospace;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500;">Model</label>
                            <input id="ts-model" type="text" value="${currentCfg.model}" placeholder="jev-latest" style="width: 100%; box-sizing: border-box; padding: 5px 8px; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; font-family: monospace;">
                        </div>
                    </div>
                </div>

                <div>
                    <div id="ts-rubric-toggle" style="cursor: pointer; font-size: 12px; color: #722ed1; display: inline-flex; align-items: center; gap: 4px; user-select: none;">
                        <span>🎭 串子识别准则与样本管理</span>
                        <span id="ts-rubric-arrow" style="font-size: 10px;">▼</span>
                    </div>
                    <div id="ts-rubric-body" style="display: none; flex-direction: column; gap: 10px; margin-top: 8px; background: #faf5ff; padding: 12px; border-radius: 6px; border: 1px dashed #d3adf7;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <span id="ts-rubric-status-badge" style="font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 4px; border: 1px solid ${hasCustomTrollRubric() ? '#d3adf7' : '#b7eb8f'}; color: ${hasCustomTrollRubric() ? '#722ed1' : '#52c41a'}; background: ${hasCustomTrollRubric() ? '#f9f0ff' : '#f6ffed'};">
                                ${hasCustomTrollRubric() ? '🟣 使用自定义准则' : '🟢 使用内置默认准则'}
                            </span>
                            <div style="display: flex; gap: 5px; align-items: center;">
                                <input type="file" id="ts-rubric-file-input" accept=".json,.txt" style="display: none;">
                                <button id="ts-btn-import-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="从本地选择 chuanzi_rubric_sample.json 导入">📥 导入文件</button>
                                <button id="ts-btn-edit-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="在线编辑当前生效的 Rubric JSON">📝 在线编辑</button>
                                <button id="ts-btn-export-rubric" type="button" style="background: #fff; color: #722ed1; border: 1px solid #d3adf7; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="导出当前生效准则到本地 JSON 文件">📤 导出</button>
                                <button id="ts-btn-reset-rubric" type="button" style="background: #fff; color: #909399; border: 1px solid #dcdfe6; padding: 2px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;" title="清除自定义准则，恢复系统出厂内置设定">🔄 恢复默认</button>
                            </div>
                        </div>
                        <div id="ts-rubric-summary-info" style="font-size: 11px; color: #531dab; line-height: 1.4;">
                            准则概览：True 判定准则 ${((currentRubric.questions?.is_troll?.criteria?.true) || []).length} 项，类别细分 ${Object.keys((currentRubric.questions?.troll_type?.criteria) || {}).length} 种。
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #391085;">快捷圈子黑话/样本补充（每行一条，每次判定自动追加）</label>
                            <textarea id="ts-custom-rubric-rules" rows="3" placeholder="例如：&#10;若包含'XX人是这样的'等贴标签话术，判定为 true&#10;若对角色/剧情发表正常吐槽，不判定为 true" style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d3adf7; border-radius: 4px; font-size: 11px; font-family: monospace; resize: vertical; outline: none;">${(currentRubric.custom_supplement_rules || []).join('\n')}</textarea>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid #f0f0f0; padding-top: 14px;">
                <button id="ts-btn-test" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px; transition: 0.2s;">
                    <span>🧪 测试连接</span>
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="ts-btn-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="ts-btn-save" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">保存配置</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(subModal);

    const msgBox = subModal.querySelector('#ts-modal-msg');
    const keyInput = subModal.querySelector('#ts-api-key');
    const toggleKey = subModal.querySelector('#ts-toggle-key-visibility');
    const advToggle = subModal.querySelector('#ts-advanced-toggle');
    const advBody = subModal.querySelector('#ts-advanced-body');
    const advArrow = subModal.querySelector('#ts-advanced-arrow');
    const rubricToggle = subModal.querySelector('#ts-rubric-toggle');
    const rubricBody = subModal.querySelector('#ts-rubric-body');
    const rubricArrow = subModal.querySelector('#ts-rubric-arrow');
    const rubricStatusBadge = subModal.querySelector('#ts-rubric-status-badge');
    const rubricSummaryInfo = subModal.querySelector('#ts-rubric-summary-info');
    const rubricFileInput = subModal.querySelector('#ts-rubric-file-input');
    const btnImportRubric = subModal.querySelector('#ts-btn-import-rubric');
    const btnEditRubric = subModal.querySelector('#ts-btn-edit-rubric');
    const btnExportRubric = subModal.querySelector('#ts-btn-export-rubric');
    const btnResetRubric = subModal.querySelector('#ts-btn-reset-rubric');
    const customRubricTextarea = subModal.querySelector('#ts-custom-rubric-rules');
    const endpointInput = subModal.querySelector('#ts-endpoint');
    const modelInput = subModal.querySelector('#ts-model');
    const enabledCheckbox = subModal.querySelector('#ts-enabled-checkbox');
    const btnTest = subModal.querySelector('#ts-btn-test');
    const btnSave = subModal.querySelector('#ts-btn-save');
    const btnCancel = subModal.querySelector('#ts-btn-cancel');
    const btnClose = subModal.querySelector('#ts-sub-modal-close');

    function showStatus(text, type = 'error') {
        msgBox.style.display = 'block';
        if (type === 'error') {
            msgBox.style.background = '#fef0f0';
            msgBox.style.color = '#f56c6c';
            msgBox.style.border = '1px solid #fde2e2';
        } else if (type === 'success') {
            msgBox.style.background = '#f0f9eb';
            msgBox.style.color = '#67c23a';
            msgBox.style.border = '1px solid #e1f3d8';
        } else {
            msgBox.style.background = '#edf5ff';
            msgBox.style.color = '#409eff';
            msgBox.style.border = '1px solid #d9ecff';
        }
        msgBox.textContent = text;
    }

    function updateRubricStatusView(rubricData) {
        const r = rubricData || loadTrollRubric();
        const isCustom = hasCustomTrollRubric();
        if (rubricStatusBadge) {
            rubricStatusBadge.textContent = isCustom ? '🟣 使用自定义准则' : '🟢 使用内置默认准则';
            rubricStatusBadge.style.color = isCustom ? '#722ed1' : '#52c41a';
            rubricStatusBadge.style.borderColor = isCustom ? '#d3adf7' : '#b7eb8f';
            rubricStatusBadge.style.background = isCustom ? '#f9f0ff' : '#f6ffed';
        }
        if (rubricSummaryInfo) {
            const trueCount = (r.questions?.is_troll?.criteria?.true || []).length;
            const typeCount = Object.keys(r.questions?.troll_type?.criteria || {}).length;
            rubricSummaryInfo.textContent = `准则概览：True 判定准则 ${trueCount} 项，类别细分 ${typeCount} 种。`;
        }
        if (customRubricTextarea) {
            customRubricTextarea.value = (r.custom_supplement_rules || []).join('\n');
        }
    }

    btnImportRubric.onclick = () => rubricFileInput.click();

    rubricFileInput.onchange = (e) => {
        let file = e.target.files[0];
        if (file) {
            let reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    let parsed = JSON.parse(evt.target.result);
                    let validCheck = validateTrollRubric(parsed);
                    if (!validCheck.valid) {
                        showStatus(`❌ 准则导入失败：${validCheck.error}`, 'error');
                        return;
                    }
                    saveTrollRubric(parsed);
                    updateRubricStatusView(parsed);
                    showStatus(`✅ 成功导入准则文件（${file.name}）！`, 'success');
                    showToast('准则文件已成功导入并持久化！');
                } catch (err) {
                    showStatus(`❌ JSON 解析失败：${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
        }
    };

    btnEditRubric.onclick = () => {
        showRubricJsonEditorModal((savedRubric) => {
            updateRubricStatusView(savedRubric);
            showStatus('✅ 串子准则已通过在线编辑器更新！', 'success');
        });
    };

    btnExportRubric.onclick = () => {
        exportRubricToFile(loadTrollRubric());
    };

    btnResetRubric.onclick = () => {
        if (confirm('确定要恢复出厂内置的鉴串准则吗？自定义准则将被清空。')) {
            resetTrollRubric();
            updateRubricStatusView(defaultTrollRubric);
            showStatus('✅ 已恢复出厂系统默认准则！', 'info');
            showToast('已恢复内置默认准则！');
        }
    };

    toggleKey.onclick = () => {
        if (keyInput.type === 'password') {
            keyInput.type = 'text';
            toggleKey.textContent = '🔒';
        } else {
            keyInput.type = 'password';
            toggleKey.textContent = '👁️';
        }
    };

    advToggle.onclick = () => {
        if (advBody.style.display === 'none') {
            advBody.style.display = 'flex';
            advArrow.textContent = '▲';
        } else {
            advBody.style.display = 'none';
            advArrow.textContent = '▼';
        }
    };

    rubricToggle.onclick = () => {
        if (rubricBody.style.display === 'none') {
            rubricBody.style.display = 'flex';
            rubricArrow.textContent = '▲';
        } else {
            rubricBody.style.display = 'none';
            rubricArrow.textContent = '▼';
        }
    };

    btnTest.onclick = async () => {
        const rawKey = keyInput.value.trim();
        if (!rawKey) {
            showStatus('请先输入 TypeSafe API Key 后再测试连接！', 'error');
            keyInput.focus();
            return;
        }

        const targetEndpoint = endpointInput.value.trim() || defaultTypeSafeConfig.endpoint;
        const targetModel = modelInput.value.trim() || defaultTypeSafeConfig.model;

        btnTest.disabled = true;
        btnTest.style.opacity = '0.6';
        btnTest.style.cursor = 'not-allowed';
        showStatus('⏳ 正在向 TypeSafe AI Jev 端点发起连接测试...', 'info');

        try {
            const res = await testTypeSafeConnection({
                apiKey: rawKey,
                endpoint: targetEndpoint,
                model: targetModel
            });
            showStatus(`✅ ${res.message}`, 'success');
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
        } finally {
            btnTest.disabled = false;
            btnTest.style.opacity = '1';
            btnTest.style.cursor = 'pointer';
        }
    };

    btnSave.onclick = () => {
        const rawKey = keyInput.value.trim();
        const isEnabled = enabledCheckbox.checked;

        if (isEnabled && !rawKey) {
            showStatus('已勾选启用 TypeSafe AI，但尚未填写 API Key！请填写后再保存。', 'error');
            keyInput.focus();
            return;
        }

        const newCfg = {
            apiKey: rawKey,
            endpoint: endpointInput.value.trim() || defaultTypeSafeConfig.endpoint,
            model: modelInput.value.trim() || defaultTypeSafeConfig.model,
            enabled: isEnabled
        };

        saveTypeSafeConfig(newCfg);

        // 保存自定义补充样本规则
        let customRulesText = customRubricTextarea ? customRubricTextarea.value.trim() : '';
        let customRules = customRulesText ? customRulesText.split('\n').map(s => s.trim()).filter(Boolean) : [];
        let updatedRubric = loadTrollRubric();
        updatedRubric.custom_supplement_rules = customRules;
        saveTrollRubric(updatedRubric);

        showToast('TypeSafe AI 配置与准则已保存！');
        if (typeof onSuccess === 'function') {
            onSuccess(newCfg);
        }
        subModal.remove();
    };

    btnCancel.onclick = () => subModal.remove();
    btnClose.onclick = () => subModal.remove();
    subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };
}
