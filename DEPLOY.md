# 部署指南（方案 C：上云，任何设备可访问）

本项目是标准 Node + Express 应用，已做好生产化准备：
- 入口：`server/server.js`（由 `npm start` 启动）
- 端口读取 `process.env.PORT`（默认 3000），绑定 `0.0.0.0`
- 敏感配置（DeepSeek 密钥、音乐解析源等）走环境变量，不写进代码
- 前端依赖（Three.js / Tone.js / Tesseract.js）走 CDN，无需打包

---

## 两条免费上云路线对比

| | Oracle Cloud 永久免费（推荐·无额度） | Render 免费版（最省事） |
|---|---|---|
| 费用 | **永久免费，无额度限制** | 免费，但有 750 小时/月 + 资源上限 |
| 常驻 | 7×24 一直在线 | 15 分钟无人访问会休眠，首次慢几秒 |
| 注册门槛 | 需信用卡做身份校验（只用 Always Free 资源不扣费） | GitHub 登录，无需卡 |
| 技术门槛 | 中等（要 SSH 进 VM 跑脚本） | 低（网页点几下） |
| 适合 | 想长期稳定、后续不断加功能 | 想快速上线、能接受休眠 |

---

## 路线一：Oracle Cloud Always Free（无额度、永久在线）

> 为什么选它：Oracle 的 Always Free 提供 2 台 AMD 微型机（1GB）或 4 核 ARM（24GB），**永不收费、无使用额度上限**，最适合"长期运行 + 后续扩展功能"。

### 步骤
1. 注册 Oracle Cloud 免费账号（free tier），区域任意。
2. 控制台创建 VM：镜像选 Ubuntu 22.04，形状选 **Always Free**（`VM.Standard.E2.1.Micro` 或 `VM.Standard.A1.Flex`）。
3. 生成 SSH 密钥，SSH 登录虚拟机。
4. 把代码弄进 VM：
   - 方式 A（推荐）：`git clone <你的仓库> /opt/aggregate-site`
   - 方式 B：本地把项目打成 zip 后 `scp` 上去解压
5. 在 VM 上执行一键脚本：
   ```bash
   cd /opt/aggregate-site
   bash scripts/oracle-setup.sh
   ```
   脚本会自动装 Node、依赖、pm2 守护进程、Caddy（提供 HTTPS），并开放防火墙。
6. **关键一步**：到 Oracle 控制台 → 该实例的 Virtual Cloud Network → **Security List**，添加入站规则放行 `80 / 443 / 3000`（TCP，源 `0.0.0.0/0`）。Oracle 自己的防火墙不归系统 `ufw` 管，不配这步外网进不来。
7. 浏览器访问 `http://<VM公网IP>:3000/home/` 即可。有域名就在脚本里填，自动上 HTTPS。

### 可选：配置敏感环境变量
编辑 `/opt/aggregate-site/.env`（参照 `.env.example`），例如：
```
DEEPSEEK_API_KEY=sk-xxxx      # 不填则 AI 聊天走本地情绪支持回退
```
改完 `pm2 restart aggregate-site`。

---

## 路线二：Render 免费版（最省事）

1. 把代码推到 GitHub 仓库。
2. Render 控制台 → New → **Blueprint**，选中仓库，会自动读取 `render.yaml`。
3. 免费套餐选 `free`；在环境变量里填 `DEEPSEEK_API_KEY`（可选）。
4. 部署完成后得到 `https://aggregate-site.onrender.com`，手机/任意设备直接打开。
5. 注意：免费版会休眠，可在 `render.yaml` 把 `plan` 改为 `hobby`（付费）保持常驻；或用外部监控（如 UptimeRobot 免费）定时 ping `/api/health` 保活。

---

## 功能在云端的兼容性说明（重要）

| 功能 | 电脑浏览器 | 手机浏览器 | 说明 |
|---|---|---|---|
| 语言互译 / 截图翻译 | ✅ | ✅ | 走公共 API，任何设备可用 |
| 音乐解析下载 | ✅ | ✅ | 服务端代理，任何设备可用 |
| AI 聊天 | ✅ | ✅ | 配密钥走 DeepSeek，否则本地回退 |
| 桌面 Q 版桌宠 | ✅ | ✅ | Three.js 跑在浏览器，手机也支持 WebGL |
| AI 智能作曲 | ✅ | ✅ | Tone.js 浏览器端生成，可导出 WAV |
| 文件整理 | ✅（仅 Chrome/Edge） | ❌ | 依赖浏览器 File System Access API，**手机不可用** |
| 文件查重 | ✅（仅 Chrome/Edge） | ❌ | 同上 |

> 文件整理/查重是"纯本地处理、文件不上传"的设计，必须依赖浏览器的文件夹读写能力，而该能力目前**仅桌面版 Chromium 内核浏览器（Chrome/Edge）支持**，与部署到哪台服务器无关。手机打开这两个功能会看到友好提示，不会报错。

---

## 故障排查
- 外网打不开：先确认 VM 控制台 Security List 已放行对应端口（Oracle 最常见坑）。
- `npm start` 报错找不到模块：确认在 `aggregate-site` 目录下执行过 `npm install`。
- AI 聊天只能情绪支持：未填 `DEEPSEEK_API_KEY`，属预期行为。
- 音乐解析失败：第三方公共解析源 `api.imjad.cn` 可能失效，在 `.env` 的 `MUSIC_*` 换成你自建/合规的服务即可。
