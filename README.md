# B站成分雷达 (BiliRadardar)

**B站成分雷达 (BiliRadardar)** 是一个用于在 B站 评论区、动态、视频及个人空间中自动检测并标注用户成分的 Tampermonkey 油猴脚本。

> 📌 **致谢与来源声明**  
> 本项目的 Base 代码来自开源项目 [trychen/bilibili-comment-checker](https://github.com/trychen/bilibili-comment-checker)。非常感谢原作者及其贡献者的开源贡献！

---

## ✨ 核心特性

- 🔍 **Shadow DOM 深入检测**：完整支持 B站 新版评论区、视频页、动态页、专栏及个人空间的 Shadow DOM 节点自动提取与标注。
- ⚡ **视口异步排队检测**：基于 `IntersectionObserver` 实现视口懒加载检测，减少不必要的 API 请求，提高页面顺畅度与加载性能。
- 🏷️ **多维度状态与互斥识别**：
  - 支持 **`不让看关注`**（错误码 22115 隐私隐藏）
  - 支持 **`无动态`**（公开动态列表为空）
  - 支持 **`不让看关注+无动态`** 特殊合成标签
  - 支持 **`无匹配关注`**（关注列表公开但未匹配官方账号）
  - 支持 **`无匹配动态`**（公开动态中未包含匹配关键词）
- 📌 **精准来源标注**：在成分标签末尾自动拼接来源后缀，如 `(关注)`、`(动态)`、`(关注,动态)`。
- ⚙️ **可视化自定义成分管理器**：
  - 自动在 B站 侧边栏挂载入口（继承原生 Vue Scope Scoped CSS 样式 `data-v-xxx`）。
  - 支持**新增、编辑、删除**成分项，配置实时持久化（`GM_setValue` / `localStorage`）。
  - 支持一键**恢复默认配置**。
  - 支持 JSON 配置文件的**导出 (Export)** 与 **导入 (Import)**（支持选择文件上传或代码粘贴）。
  - 拥有完善的数据校验与**未保存防误关二次确认**拦截。
- 🤖 **TypeSafe AI (Jev) 决策模型支持**：
  - 支持配置 TypeSafe AI API Key，数据仅保存在浏览器本地（`GM_setValue` / `localStorage`），绝不上报第三方。
  - 提供**一键测试连接**功能，实时探测 API Key 有效性及网络连通状态。
  - 支持密码明密文快速切换显示，保护隐私并方便核对。
  - 支持**高级选项自定义**：可按需自定义 System One Endpoint 与模型名称（兼容自建网关或代理）。
- 🎭 **Jev 智能串子/带节奏识别 (Troll Detection)**：
  - 评论区用户名及成分 Tag 旁挂载轻量 **`[🎭 鉴串]`** 按钮，手动按需触发，拒绝静默扣费，单次会话自动缓存。
  - **多维上下文联合研判**：自动综合视频标题、视频简介、评论区点赞数 Top 6 热评（若包含本人则自动剔除隔离），以及目标用户在该楼层的主楼与全部楼中楼发言。
  - **多题并行判定范式**：结合 `Noul`（输出量化串度概率）与 `Choice`（细分行为特征：正常表达、情绪吐槽、阴阳怪气、阵营拉踩、造谣抹黑）。
  - **原生 Prompt Rubric 准则管理**：
    - **开箱即用**：脚本内置默认标准判定准则，无需强制导入即可直接使用。
    - **本地导入**：根目录提供调优样本文件 [`chuanzi_rubric_sample.json`](chuanzi_rubric_sample.json)，在设置面板中可一键导入本地 JSON 并持久化到浏览器。
    - **在线编辑**：提供内置 JSON 在线编辑器，支持语法错误校验与一键格式化。
    - **导出与重置**：支持随时导出当前生效准则为 JSON 文件，或一键恢复出厂默认。
    - **快捷黑话补充**：支持文本框快捷单行补充最新圈子黑话或反串特征。
  - **可视化诊断报告**：点击诊断徽章可展开详尽弹窗，直观查看串度进度条、手法特征定性、被捕获的用户发言切片及环境热评对照。

---

## 🛠️ 安装与使用

1. 在浏览器中安装 [Tampermonkey (油猴)](https://www.tampermonkey.net/) 插件。
2. 创建新脚本，将 `script.js` 中的全量代码复制并保存。
3. 打开任意 B站 视频页、动态页或空间，即可在评论区用户昵称旁自动查看成分检测结果。
4. 点击网页侧边栏底部的 **🧪 成分** 挂件：
   - 可随时自定义与管理成分配置。
   - 点击顶部 **⚡ TypeSafe AI** 按钮，可配置 API Key 并测试连接，同时管理串子识别准则（导入/在线编辑/导出/重置）。

---

## 💻 本地工程化开发

本项目已重构为现代工程化架构（ES Modules 多模块开发 + Rollup 自动化构建打包）：

```bash
# 1. 安装构建依赖
npm install

# 2. 全量构建打包 (生成 script.js 及 dist/script.user.js)
npm run build

# 3. 监听热编译 (源码修改自动打包)
npm run dev
```

### 源码模块目录说明 (`src/`)

```
src/
├── banner.js                  # 油猴脚本元数据 Header (==UserScript==)
├── index.js                   # 顶层入口 (初始化、生命周期监听与周期扫描启动)
├── config/
│   ├── constants.js           # 备用图标等常量
│   ├── defaultCheckers.js     # 默认预设成分配置清单
│   └── typesafeConfig.js      # TypeSafe AI 配置默认值、defaultTrollRubric 及类别字典
├── storage/
│   ├── checkersStorage.js     # 成分数据本地持久化 (loadCheckers / saveCheckers)
│   ├── typesafeStorage.js     # TypeSafe API 配置持久化 (loadTypeSafeConfig / saveTypeSafeConfig)
│   └── rubricStorage.js       # 串子 Rubric 判定准则持久化、Schema 校验与导出
├── api/
│   ├── bilibiliApi.js         # B站官方接口交互 (动态/关注请求与成分规则匹配)
│   └── typesafeApi.js         # TypeSafe AI Jev 接口交互 (连接测试与 Noul+Choice 判定)
├── scanner/
│   ├── domUtils.js            # Shadow DOM 深度递归穿透与 UID 提取
│   ├── contextEngine.js       # 评论区热评语境采集 (Top 6 排除本人) 与楼层发言切片
│   ├── queue.js               # 视口异步排队与频控队列调度 (IntersectionObserver)
│   ├── state.js               # 共享缓存字典 (checked, checking, trollAnalysisCache 等)
│   └── pageScanner.js         # 页面扫描执行器 (视频页、动态页、个人空间与侧边挂件)
└── ui/
    ├── toast.js               # 轻提示组件
    ├── checkButton.js         # 成分检测按钮、成分标签挂载与佐证弹窗
    ├── trollButton.js         # 鉴串按钮挂载、诊断状态更新与详细依据报告弹窗
    └── modals/
        ├── settingModal.js    # 成分配置主面板与 CRUD 子弹窗
        ├── typeSafeModal.js   # TypeSafe AI 与 Rubric 管理弹窗
        └── rubricJsonEditorModal.js # Rubric 在线 JSON 代码编辑器弹窗
```

---

## 📄 开源协议

GPLv3 License

