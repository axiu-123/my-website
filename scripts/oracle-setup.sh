#!/usr/bin/env bash
# ============================================================
# Oracle Cloud 永久免费(Always Free) 一键部署脚本
# 适用：Ubuntu / Debian 系 VM（在 Oracle 控制台创建好 VM 后，SSH 进去执行）
# 前置：已把本项目放到 /opt/aggregate-site（git clone 或 scp）
# 作用：装 Node -> 装依赖 -> pm2 守护进程 -> Caddy 反代 + 自动 HTTPS
# 全程免费，无额度限制，VM 关机重启后自动拉起。
# ============================================================
set -e

APP_DIR="/opt/aggregate-site"
PORT=3000

echo "==> [1/5] 更新系统并安装基础工具"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg ufw

echo "==> [2/5] 安装 Node.js 20 LTS（NodeSource）"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

echo "==> [3/5] 安装项目依赖"
cd "$APP_DIR"
sudo -u "$USER" npm install --omit=dev || npm install --omit=dev

echo "==> [4/5] 用 pm2 守护进程（崩溃自启 + 开机自启）"
sudo npm install -g pm2
pm2 start "$APP_DIR/server/server.js" --name aggregate-site
pm2 save
sudo env PATH="$PATH:/usr/bin" /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u "$USER" --hp "/home/$USER"

echo "==> [5/5] 安装 Caddy 做 HTTPS 反代（自动申请证书）"
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.caddy.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/caddy-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-archive-keyring.gpg] https://deb.caddy.com/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy.list
sudo apt-get update -y
sudo apt-get install -y caddy

# 写入反代配置（把你的域名替换到下面 DOMAIN 处；没域名先用 IP 也行，只是浏览器会提示非 HTTPS）
read -rp "请输入绑定域名（如 site.example.com，留空则用 :$PORT 纯 HTTP）: " DOMAIN
if [ -n "$DOMAIN" ]; then
cat | sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:$PORT
}
EOF
else
cat | sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
:$PORT {
    reverse_proxy 127.0.0.1:$PORT
}
EOF
fi
sudo systemctl restart caddy
sudo systemctl enable caddy

echo "==> 开放防火墙端口"
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow "$PORT"
sudo ufw --force enable

echo ""
echo "✅ 部署完成！"
echo "   本机服务:  http://127.0.0.1:$PORT"
echo "   外网访问:  http://<你的VM公网IP>:$PORT  (或上面填的域名)"
echo "⚠️ 重要：还要到 Oracle 控制台 -> 该实例的 'Virtual Cloud Network' -> Security List，"
echo "   添加入站规则放行 80/443/3000 (协议 TCP，源 0.0.0.0/0)。"
echo "   否则外部仍访问不通（这是 Oracle 自己的防火墙，脚本里 ufw 管不到）。"
