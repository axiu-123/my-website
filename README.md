# 多功能聚合站 (Aggregate Site)

一个集成了 7 大功能的聚合网站。每个功能都有**独立可访问的链接**，前端为纯静态多页，后端为 Node + Express 提供 API 代理与本地计算服务。

## 功能与独立链接

| 功能 | 链接 | 说明 |
| --- | --- | --- |
| 首页 | `/` 或 `/home/` | 功能总览 |
| 语言互译 | `/translate/` | 主流语言互译（MyMemory，免费无需密钥） |
| 音乐解析 | `/music/` | QQ音乐 / 网易云音乐 解析并直链转 MP3 下载 |
| 文件整理 | `/organize/` | 按自定义规则归类/重命名本地文件 |
| 文件查重 | `/dedup/` | 按 SHA-256 指纹查重并标记/隔离重复项 |
| AI 聊天 | `/chat/` | 解答问题 + 情绪价值（DeepSeek / 本地回退） |
| 桌面宠宠 | `/pet/` | 3D Q 版桌宠（Three.js），支持上传本地模型 |
| AI 作曲 | `/compose/` | 参考 Suno 的本地生成式作曲（Tone.js），可导出 WAV |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2.（可选）配置密钥：复制 .env.example 为 .env 并填写
cp .env.example .env

# 3. 启动
npm start
```

浏览器访问 http://localhost:3000

## 各功能说明

### 1. 语言互译
后端代理 MyMemory 公共翻译接口，支持 15+ 语种与自动检测，无需密钥。可在 `.env` 的 `TRANSLATE_ENDPOINT` 替换为自建 LibreTranslate。

**截图 / 图片翻译**：在「截图 / 图片翻译」标签页中，上传、拖拽或粘贴（Ctrl/⌘+V）截图，由浏览器端 **Tesseract.js** 本地识别文字后再翻译。图片全程在本地处理、不上传服务器；首次识别需联网下载 OCR 语言包（之后浏览器会缓存）。OCR 语言可在中文+英文、英文、日文、韩文等之间切换。

### 2. 音乐解析下载
- 支持网易云 / QQ音乐 的分享链接或歌曲 ID，以及关键词搜索。
- 解析依赖第三方公开解析源（默认 `api.imjad.cn`），可能因平台风控失效；可在 `server/config.js` 或 `.env` 的 `MUSIC_NETCLOUD_ENDPOINT` / `MUSIC_QQ_ENDPOINT` 替换为自建/合规服务。
- 下载由服务端代理音频流并命名为 `.mp3`，规避跨域与防盗链。
- ⚠️ 请遵守相关平台服务条款与版权规定，仅用于个人合法用途。

### 3. 文件整理
基于浏览器 **File System Access API**，需使用 Chrome / Edge 打开。选择文件夹后按「扩展名 / 修改年月 / 自定义规则」预览并真正移动文件。文件不会上传，全部本地完成。

### 4. 文件查重
同样基于 File System Access API。扫描目录（可选递归），用 SHA-256 计算指纹，找出内容完全相同的重复文件并标记；可一键将重复项移入「重复文件」文件夹，保留每组首个原件。

### 5. AI 聊天
配置 `DEEPSEEK_API_KEY` 后由 DeepSeek 大模型驱动（既解答问题也提供情绪价值）；未配置时使用内置本地情绪支持回退引擎，保证始终可用。

### 6. 桌面宠宠
基于 Three.js（WebGL）。默认加载**内置程序生成的 Q 版模型**（离线可用）；可粘贴「网上模型 URL」或**上传本地模型文件**（支持 glTF / GLB / FBX / OBJ）。点击「作为桌宠悬浮窗启动」会以独立小窗常驻。

**适配的主流 3D 软件与格式：**
- Blender：glTF / GLB、FBX、OBJ
- Maya / 3ds Max：FBX、glTF、OBJ（需导出插件）
- Cinema 4D：FBX、glTF、OBJ
- ZBrush：OBJ
- Sketchfab / Mixamo：glTF / FBX

> 注：动画（骨骼）在 glTF / FBX 中可保留；OBJ 为静态网格，不带动画。

### 7. AI 智能作曲
参考 Suno 的端侧生成式作曲（Tone.js）。用一句话提示词或选择风格/情绪，即时生成旋律+和声+鼓点并播放，可导出 WAV。配置 `COMPOSE_API_BASE` / `COMPOSE_API_KEY` 可接入 Suno 类外部服务获得更强能力。

## 目录结构

```
aggregate-site/
├── server/
│   ├── config.js          # 运行时配置（读 .env）
│   ├── server.js          # Express 入口
│   └── routes/            # translate / chat / music / compose 接口
├── public/                # 前端（每个功能独立目录 + index.html）
│   ├── assets/            # 共享样式/脚本
│   ├── home/ translate/ music/ organize/ dedup/ chat/ pet/ compose/
├── package.json
└── .env.example
```

## 部署 / 导出
项目为标准的 Node 应用，可直接部署到任意支持 Node 的服务器/容器。导出时整体打包（含 node_modules 或仅源码 + `npm install`）即可。
