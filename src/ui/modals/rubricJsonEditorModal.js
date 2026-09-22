import { loadTrollRubric, saveTrollRubric, validateTrollRubric } from '../../storage/rubricStorage.js';
import { showToast } from '../toast.js';

export function showRubricJsonEditorModal(onSave) {
    let editorModal = document.createElement('div');
    editorModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);
        z-index: 1000005; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

    const currentRubric = loadTrollRubric();
    const initialText = JSON.stringify(currentRubric, null, 2);

    editorModal.innerHTML = `
        <div style="background: #fff; border-radius: 12px; width: 92%; max-width: 580px; padding: 22px; box-shadow: 0 16px 36px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column; max-height: 90vh;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="font-size: 16px; font-weight: bold; color: #18191C; display: flex; align-items: center; gap: 6px;">
                    <span>📝 在线编辑鉴串准则 (Rubric JSON)</span>
                </div>
                <span id="ts-rubric-editor-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>
            <div style="font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.4;">
                遵循 TypeSafe AI Jev 判定规范。直接在此修改准则与分类，保存后持久化存入浏览器本地存储。
            </div>
            <div id="ts-rubric-editor-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 10px; line-height: 1.4; word-break: break-all;"></div>
            <textarea id="ts-rubric-json-area" rows="16" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d3adf7; border-radius: 6px; font-size: 12px; font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace; line-height: 1.45; resize: vertical; outline: none; background: #fdfaff; flex-grow: 1; min-height: 280px;"></textarea>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px solid #f0f0f0; padding-top: 12px;">
                <button id="ts-rubric-format-btn" type="button" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;">
                    <span>✨ 格式化 JSON</span>
                </button>
                <div style="display: flex; gap: 8px;">
                    <button id="ts-rubric-editor-cancel" type="button" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="ts-rubric-editor-save" type="button" style="background: #722ed1; color: #fff; border: none; padding: 6px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">保存并生效</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(editorModal);

    const area = editorModal.querySelector('#ts-rubric-json-area');
    const errBox = editorModal.querySelector('#ts-rubric-editor-error');
    const btnClose = editorModal.querySelector('#ts-rubric-editor-close');
    const btnCancel = editorModal.querySelector('#ts-rubric-editor-cancel');
    const btnFormat = editorModal.querySelector('#ts-rubric-format-btn');
    const btnSave = editorModal.querySelector('#ts-rubric-editor-save');

    area.value = initialText;

    function showError(msg) {
        errBox.style.display = 'block';
        errBox.textContent = msg;
    }

    btnFormat.onclick = () => {
        try {
            let parsed = JSON.parse(area.value);
            area.value = JSON.stringify(parsed, null, 2);
            errBox.style.display = 'none';
        } catch (e) {
            showError('JSON 语法错误：' + e.message);
        }
    };

    btnSave.onclick = () => {
        try {
            let parsed = JSON.parse(area.value);
            let validCheck = validateTrollRubric(parsed);
            if (!validCheck.valid) {
                showError(validCheck.error);
                return;
            }
            saveTrollRubric(parsed);
            showToast('串子判定准则已保存并更新！');
            if (typeof onSave === 'function') {
                onSave(parsed);
            }
            editorModal.remove();
        } catch (e) {
            showError('JSON 解析错误：' + e.message);
        }
    };

    btnCancel.onclick = () => editorModal.remove();
    btnClose.onclick = () => editorModal.remove();
    editorModal.onclick = (e) => { if (e.target === editorModal) editorModal.remove(); };
}
