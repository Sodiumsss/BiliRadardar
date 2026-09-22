import { getCheckers, saveCheckers } from '../../storage/checkersStorage.js';
import { defaultCheckers } from '../../config/defaultCheckers.js';
import { fallbackIcon } from '../../config/constants.js';
import { getTypeSafeConfig } from '../../storage/typesafeStorage.js';
import { showTypeSafeConfigModal } from './typeSafeModal.js';
import { showToast } from '../toast.js';

export function validateCompositionInput(displayName, displayIcon, keywordsText, followingsText) {
    let name = (displayName || '').trim();
    if (!name) {
        return { valid: false, error: '成分名称不能为空！' };
    }

    let icon = (displayIcon || '').trim() || fallbackIcon;

    let keywords = (keywordsText || '').split(/[\n,，]+/).map(s => s.trim()).filter(Boolean);
    let rawFollowings = (followingsText || '').split(/[\n,，]+/).map(s => s.trim()).filter(Boolean);

    let followings = [];
    for (let f of rawFollowings) {
        if (!/^\d+$/.test(f)) {
            return { valid: false, error: `关注 UID "${f}" 格式不合法：必须为纯数字！` };
        }
        followings.push(Number(f));
    }

    if (keywords.length === 0 && followings.length === 0) {
        return { valid: false, error: '匹配关键词与关注 UID 不能同时为空！至少需填一项。' };
    }

    return {
        valid: true,
        data: { displayName: name, displayIcon: icon, keywords, followings }
    };
}

export function showSettingModal() {
    let oldModal = document.getElementById('comp-setting-modal');
    if (oldModal) oldModal.remove();

    const checkers = getCheckers();
    const typeSafeConfig = getTypeSafeConfig();
    let tempCheckers = JSON.parse(JSON.stringify(checkers));

    let modal = document.createElement('div');
    modal.id = 'comp-setting-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(5px);
        z-index: 999999; display: flex; justify-content: center; align-items: center;
        font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
    `;

    modal.innerHTML = `
        <div style="background: #fff; border-radius: 14px; width: 92%; max-width: 550px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
                <span style="font-size: 16px; font-weight: bold; color: #18191C;">成分设置</span>
                <span id="comp-setting-modal-close" style="cursor: pointer; font-size: 18px; color: #999; padding: 0 4px; line-height: 1;">✕</span>
            </div>

            <!-- 顶栏一排按钮区域 -->
            <div style="display: flex; gap: 8px; margin-bottom: 14px; align-items: center; flex-wrap: wrap;">
                <button id="btn-comp-reset" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">恢复默认</button>
                <button id="btn-comp-import" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">📥 导入</button>
                <button id="btn-comp-export" style="background: #f4f4f5; color: #606266; border: 1px solid #dcdfe6; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">📤 导出</button>
                <button id="btn-comp-typesafe" style="background: #f0f5ff; color: #2f54eb; border: 1px solid #adc6ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s; display: flex; align-items: center; gap: 5px;">
                    <span>⚡ TypeSafe AI</span>
                    <span id="typesafe-status-dot" title="${typeSafeConfig.apiKey ? (typeSafeConfig.enabled ? '已启用' : '已配置Key(未启用)') : '未配置Key'}" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${typeSafeConfig.apiKey ? (typeSafeConfig.enabled ? '#52c41a' : '#faad14') : '#d9d9d9'};"></span>
                </button>
                <button id="btn-comp-add" style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: 0.2s;">+ 添加成分</button>
                <button id="btn-comp-save" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; margin-left: auto; transition: 0.2s;">保存生效</button>
            </div>

            <!-- 下方 List 列表区域 -->
            <div id="comp-setting-modal-list" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const listContainer = document.getElementById('comp-setting-modal-list');

    function renderList() {
        listContainer.innerHTML = '';
        if (tempCheckers.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 30px 0;">暂无成分配置，点击上方“+ 添加成分”添加。</div>';
            return;
        }

        tempCheckers.forEach((item, index) => {
            let row = document.createElement('div');
            row.style.cssText = `
                display: flex; justify-content: space-between; align-items: center;
                background: #f9fafb; border: 1px solid #ebeef5; border-radius: 8px;
                padding: 8px 12px; transition: background 0.15s;
            `;

            let kwCount = item.keywords ? item.keywords.length : 0;
            let fwCount = item.followings ? item.followings.length : 0;

            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                    <img src="${item.displayIcon || fallbackIcon}" onerror="this.src='${fallbackIcon}'" style="width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; object-fit: cover;">
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <span style="font-size: 14px; font-weight: bold; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.displayName}</span>
                        <span style="font-size: 11px; color: #909399;">关键词: ${kwCount} 个 | 关注 UID: ${fwCount} 个</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-shrink: 0; margin-left: 10px;">
                    <button class="btn-item-edit" style="background: #fff; color: #00AEEC; border: 1px solid #00AEEC; padding: 3px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">编辑</button>
                    <button class="btn-item-delete" style="background: #fff; color: #f56c6c; border: 1px solid #f56c6c; padding: 3px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">删除</button>
                </div>
            `;

            row.querySelector('.btn-item-edit').onclick = () => showEditModal(item, index);
            row.querySelector('.btn-item-delete').onclick = () => showConfirmDeleteModal(item, index);

            listContainer.appendChild(row);
        });
    }

    function showImportModal(onSuccess) {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

        subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 460px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">导入成分配置</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: #606266;">
                    <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px dashed #dcdfe6;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">方式一：选择 JSON 配置文件上传</label>
                        <input id="import-file-input" type="file" accept=".json,.txt" style="font-size: 12px;">
                    </div>
                    <div style="text-align: center; color: #909399; font-size: 11px;">— 或粘贴代码 —</div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">方式二：直接粘贴 JSON 配置数组</label>
                        <textarea id="import-json-text" rows="5" placeholder="例如：[{ &quot;displayName&quot;: &quot;...&quot;, &quot;keywords&quot;: [...], &quot;followings&quot;: [...] }]" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 11px; font-family: monospace; resize: vertical;"></textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-import-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-import-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认导入</button>
                </div>
            </div>
        `;

        document.body.appendChild(subModal);

        const fileInput = subModal.querySelector('#import-file-input');
        const jsonTextarea = subModal.querySelector('#import-json-text');
        const errBox = subModal.querySelector('#sub-modal-error');

        fileInput.onchange = (e) => {
            let file = e.target.files[0];
            if (file) {
                let reader = new FileReader();
                reader.onload = (evt) => {
                    jsonTextarea.value = evt.target.result;
                };
                reader.readAsText(file);
            }
        };

        subModal.querySelector('#sub-import-cancel').onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

        subModal.querySelector('#sub-import-confirm').onclick = () => {
            let rawStr = jsonTextarea.value.trim();
            if (!rawStr) {
                errBox.style.display = 'block';
                errBox.textContent = '导入内容不能为空！';
                return;
            }

            try {
                let parsed = JSON.parse(rawStr);
                if (!Array.isArray(parsed)) {
                    throw new Error('导入的内容必须为数组格式！');
                }
                for (let item of parsed) {
                    if (!item || typeof item !== 'object' || !item.displayName) {
                        throw new Error('存在无效格式的成分项，每项必须包含 displayName！');
                    }
                }
                onSuccess(parsed);
                subModal.remove();
                showToast(`成功导入 ${parsed.length} 项成分配置（点击保存生效）`);
            } catch (err) {
                errBox.style.display = 'block';
                errBox.textContent = '解析配置失败：' + err.message;
            }
        };
    }

    function exportConfig(data) {
        try {
            let jsonStr = JSON.stringify(data, null, 2);
            let blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url;
            a.download = `bilibili_checkers_config_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('已导出 JSON 配置文件到本地！');
        } catch (e) {
            showToast('导出失败：' + e.message);
        }
    }

    function showEditModal(item, index) {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

        subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 440px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">编辑成分 - 【${item.displayName}】</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #606266;">
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">成分显示名称 *</label>
                        <input id="edit-name" type="text" value="${item.displayName}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">图标 URL (可选)</label>
                        <input id="edit-icon" type="text" value="${item.displayIcon || ''}" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">匹配关键词 (用逗号或换行分隔)</label>
                        <textarea id="edit-keywords" rows="3" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;">${(item.keywords || []).join(', ')}</textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">官方关注 UID (用逗号或换行分隔，必须为数字)</label>
                        <textarea id="edit-followings" rows="2" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;">${(item.followings || []).join(', ')}</textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-edit-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-edit-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(subModal);

        const errBox = subModal.querySelector('#sub-modal-error');
        subModal.querySelector('#sub-edit-cancel').onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

        subModal.querySelector('#sub-edit-confirm').onclick = () => {
            let name = subModal.querySelector('#edit-name').value;
            let icon = subModal.querySelector('#edit-icon').value;
            let kw = subModal.querySelector('#edit-keywords').value;
            let fw = subModal.querySelector('#edit-followings').value;

            let check = validateCompositionInput(name, icon, kw, fw);
            if (!check.valid) {
                errBox.style.display = 'block';
                errBox.textContent = check.error;
                return;
            }

            tempCheckers[index] = check.data;
            subModal.remove();
            renderList();
        };
    }

    function showAddModal() {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

        subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 440px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 12px;">添加新成分</div>
                <div id="sub-modal-error" style="display: none; background: #fef0f0; color: #f56c6c; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin-bottom: 10px;"></div>

                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: #606266;">
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">成分名称 *</label>
                        <input id="add-name" type="text" placeholder="例如：鸣潮 / 明日方舟" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">图标 URL (可选)</label>
                        <input id="add-icon" type="text" placeholder="留空使用默认图标" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 13px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">匹配关键词 (用逗号或换行分隔)</label>
                        <textarea id="add-keywords" rows="3" placeholder="例如：#鸣潮#, 鸣潮, 库洛" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;"></textarea>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-weight: 500;">官方关注 UID (用逗号或换行分隔，必须为数字)</label>
                        <textarea id="add-followings" rows="2" placeholder="例如：2144596522" style="width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid #dcdfe6; border-radius: 6px; font-size: 12px; resize: vertical;"></textarea>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
                    <button id="sub-add-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-add-confirm" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认添加</button>
                </div>
            </div>
        `;

        document.body.appendChild(subModal);

        const errBox = subModal.querySelector('#sub-modal-error');
        subModal.querySelector('#sub-add-cancel').onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

        subModal.querySelector('#sub-add-confirm').onclick = () => {
            let name = subModal.querySelector('#add-name').value;
            let icon = subModal.querySelector('#add-icon').value;
            let kw = subModal.querySelector('#add-keywords').value;
            let fw = subModal.querySelector('#add-followings').value;

            let check = validateCompositionInput(name, icon, kw, fw);
            if (!check.valid) {
                errBox.style.display = 'block';
                errBox.textContent = check.error;
                return;
            }

            tempCheckers.push(check.data);
            subModal.remove();
            renderList();
        };
    }

    function showConfirmDeleteModal(item, index) {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000000; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

        subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 380px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 10px;">确认删除</div>
                <div style="font-size: 13px; color: #606266; line-height: 1.5;">
                    确定要删除成分【<b style="color: #f56c6c;">${item.displayName}</b>】吗？
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px;">
                    <button id="sub-del-cancel" style="background: #fff; color: #606266; border: 1px solid #dcdfe6; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">取消</button>
                    <button id="sub-del-confirm" style="background: #f56c6c; color: #fff; border: none; padding: 5px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">确认删除</button>
                </div>
            </div>
        `;

        document.body.appendChild(subModal);

        subModal.querySelector('#sub-del-cancel').onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

        subModal.querySelector('#sub-del-confirm').onclick = () => {
            tempCheckers.splice(index, 1);
            subModal.remove();
            renderList();
        };
    }

    renderList();

    // 按钮绑定事件
    document.getElementById('btn-comp-reset').onclick = () => {
        tempCheckers = JSON.parse(JSON.stringify(defaultCheckers));
        renderList();
        showToast('已恢复默认配置列表（点击“保存生效”持久化）');
    };

    document.getElementById('btn-comp-import').onclick = () => {
        showImportModal((importedList) => {
            tempCheckers = importedList;
            renderList();
        });
    };

    document.getElementById('btn-comp-export').onclick = () => {
        exportConfig(tempCheckers);
    };

    document.getElementById('btn-comp-typesafe').onclick = () => {
        showTypeSafeConfigModal((newCfg) => {
            const dot = document.getElementById('typesafe-status-dot');
            if (dot) {
                let newDotColor = '#d9d9d9';
                let title = '未配置Key';
                if (newCfg.apiKey) {
                    newDotColor = newCfg.enabled ? '#52c41a' : '#faad14';
                    title = newCfg.enabled ? '已启用' : '已配置Key(未启用)';
                }
                dot.style.background = newDotColor;
                dot.title = title;
            }
        });
    };

    document.getElementById('btn-comp-add').onclick = () => {
        showAddModal();
    };

    function showUnsavedConfirmModal(onConfirmDiscard) {
        let subModal = document.createElement('div');
        subModal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(4px);
            z-index: 1000002; display: flex; justify-content: center; align-items: center;
            font-family: PingFang SC, HarmonyOS_Regular, Microsoft YaHei, sans-serif;
        `;

        subModal.innerHTML = `
            <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 400px; padding: 20px; box-shadow: 0 12px 32px rgba(0,0,0,0.25);">
                <div style="font-size: 15px; font-weight: bold; color: #18191C; margin-bottom: 10px;">未保存提示</div>
                <div style="font-size: 13px; color: #606266; line-height: 1.5; margin-bottom: 18px;">
                    检测到成分配置已修改但尚未保存，确定要放弃修改并关闭吗？
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="sub-unsaved-discard" style="background: #fff; color: #f56c6c; border: 1px solid #f56c6c; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">放弃修改并关闭</button>
                    <button id="sub-unsaved-continue" style="background: #00AEEC; color: #fff; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">继续编辑</button>
                </div>
            </div>
        `;

        document.body.appendChild(subModal);

        subModal.querySelector('#sub-unsaved-continue').onclick = () => subModal.remove();
        subModal.onclick = (e) => { if (e.target === subModal) subModal.remove(); };

        subModal.querySelector('#sub-unsaved-discard').onclick = () => {
            subModal.remove();
            onConfirmDiscard();
        };
    }

    function safeCloseModal() {
        let isModified = JSON.stringify(tempCheckers) !== JSON.stringify(checkers);
        if (isModified) {
            showUnsavedConfirmModal(() => {
                modal.remove();
            });
        } else {
            modal.remove();
        }
    }

    document.getElementById('btn-comp-save').onclick = () => {
        saveCheckers(tempCheckers);
        showToast('成分设置已保存并持久化生效！');
        modal.remove();
    };

    document.getElementById('comp-setting-modal-close').onclick = safeCloseModal;
    modal.onclick = (e) => { if (e.target === modal) safeCloseModal(); };
}
