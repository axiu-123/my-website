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

## 路线二：Render 免费版（最省事，无需信用卡）

> 前提：一个 GitHub 账号（免费，无需信用卡）。本项目已初始化为 git 仓库并切到 `main` 分支。

### 步骤 A：把代码推到 GitHub
1. 在 GitHub 网页端新建一个**空的**仓库（如 `aggregate-site`），**不要**勾选 README/.gitignore 自动生成。
2. 在本机项目目录执行（把 URL 换成你刚建的仓库地址）：
   ```bash
   git remote add origin https://github.com/<你的用户名>/aggregate-site.git
   git push -u origin main
   ```
   > 若本地没有 git 凭据，GitHub 会让你用 **Personal Access Token**（在 GitHub → Settings → Developer settings 生成，勾 repo 权限）代替密码登录。
   > 嫌命令行麻烦，也可在 GitHub 网页端直接把 `aggregate-site-export.zip` 解压后拖拽上传（等价于上面的 push）。

### 步骤 B：Render 一键部署
1. 打开 https://render.com ，用 GitHub 登录。
2. 控制台 → **New** → **Blueprint**（或 New → Web Service → 选仓库）。
3. Render 会自动读取仓库里的 `render.yaml`，套餐选 **Free**。
4. 点 **Deploy**。约 1–2 分钟后，得到固定地址 `https://aggregate-site.onrender.com`。
5. （可选）想接真实 AI 聊天：在 Render 服务页 → **Environment** → 添加变量 `DEEPSEEK_API_KEY=sk-xxxx`，保存后自动重新部署；不填则走本地情绪支持回退。

### 步骤 C：防止免费版休眠（保活，可选但推荐）
免费版 15 分钟无人访问会休眠，首次打开慢几秒。用免费监控每 5 分钟 ping 一次即可常驻：
1. 打开 https://uptimerobot.com 注册（免费）。
2. **Add New Monitor** → Monitor Type 选 **HTTP(s)**；
   URL 填 `https://aggregate-site.onrender.com/api/health`；
   Monitoring Interval 选 **5 minutes**。
3. 保存。之后服务几乎不会休眠。

> 至此，手机/平板/任意网络打开 `https://aggregate-site.onrender.com/home/` 即可使用全部功能（文件整理/查重限桌面 Chrome/Edge，见上方兼容性说明）。后续加功能：push 新代码 → Render 自动重新部署。

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

## 翻译源配置（云端部署后重要）

免费公共接口（Google / Bing / MyMemory）都会**按 IP 限流**，而 Render / 云主机用的是共享出口 IP，很容易被限到全灭。表现是翻译页报「翻译源暂时不可用」。

配置任意一个**有免费额度、无需信用卡**的正式接口即可永久解决（配一个就够，系统会自动优选）：

| 方案 | 免费额度 | 是否需信用卡 | 环境变量 | 申请地址 |
|------|----------|--------------|----------|----------|
| **百度翻译（推荐，国内最省事）** | 5 万字符/天 | ❌ 不需要 | `BAIDU_TRANSLATE_APPID`、`BAIDU_TRANSLATE_KEY` | https://fanyi-api.baidu.com/ → 通用文本翻译 → 标准版 |
| DeepL API Free | 50 万字符/月 | ❌ 不需要 | `DEEPL_API_KEY` | https://www.deepl.com/pro-api （选 Free） |
| DeepSeek 大模型翻译 | 按量计费（很便宜） | ❌ 支付宝充值 | `DEEPSEEK_API_KEY` | https://platform.deepseek.com |
| LibreTranslate 自建 | 无限 | ❌ 不需要 | `LIBRETRANSLATE_URL`（可选 `LIBRETRANSLATE_KEY`） | 自行部署 |

**在 Render 里怎么加**：服务页 → 左侧 **Environment** → **Add Environment Variable** → 填 Key / Value → 保存后点 **Manual Deploy → Deploy latest commit**（或直接 Save 会自动重启）。

**验证是否生效**：浏览器打开
```
https://<你的域名>/api/translate/diagnose
```
会逐个探测各源并显示 `ok` 与返回样句；加 `?debug=1` 还能看到 Bing 会话的详细失败原因。

---

## 故障排查
- 外网打不开：先确认 VM 控制台 Security List 已放行对应端口（Oracle 最常见坑）。
- `npm start` 报错找不到模块：确认在 `aggregate-site` 目录下执行过 `npm install`。
- AI 聊天只能情绪支持：未填 `DEEPSEEK_API_KEY`，属预期行为。
- 翻译报「所有翻译源暂时不可用」：见上节「翻译源配置」，配一个免费密钥即可。
- 音乐解析失败：第三方公共解析源 `api.imjad.cn` 可能失效，在 `.env` 的 `MUSIC_*` 换成你自建/合规的服务即可。
