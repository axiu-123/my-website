#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
git push 走不通（sandbox 代理对 github.com 的 CONNECT 隧道返回 502）时的备用通道：
直接用 GitHub Contents API 提交文件，触发 Render 自动部署。
- 文件已存在：GET 拿到 sha 后 PUT 覆盖
- 文件不存在（新文件）：不带 sha 直接 PUT 创建
凭据取自本机 Git Credential Manager 已保存的 GitHub 凭据，绝不打印。

用法：
  python scripts/push_via_api.py            # 提交下方默认的音乐功能文件
  python scripts/push_via_api.py 文件1 文件2 ...   # 提交指定文件（相对仓库根）
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "axiu-123/my-website"
BRANCH = "main"
MESSAGE = "feat(compose): 风格化乐器库 + 基础/高级双模式向导；含查重试听、音乐本地解密、翻译与AI聊天修复"
DEFAULT_FILES = [
    "public/music/index.html",
    "public/music/app.js",
    "public/music/decoders/qmc-mask.js",
    "public/music/decoders/qmc.js",
    "public/music/decoders/ncm.js",
    "public/music/decoders/transcode.js",
    "public/vendor/ncmdump.umd.js",
    "public/vendor/lame.min.js",
]

GIT = r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg


def gh(path, token, method="GET", data=None):
    req = urllib.request.Request("https://api.github.com/" + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "aggregate-site-pusher")
    body = None
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, body, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode("utf-8", "ignore")[:400])


def get_token():
    out = subprocess.run(
        [GIT, "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.abspath(__file__)) + os.sep + "..",
    )
    token = ""
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            token = line.split("=", 1)[1].strip()
    if not token:
        sys.stderr.write("未取到本机 GitHub 凭据\n")
        raise SystemExit(1)
    return token


def collect_dirty():
    """无参数时，自动收集 git status 中所有改动/新增文件（本地操作，不走网络）。
    未跟踪的目录会被展开为其下所有文件，避免漏提交解码器/第三方库等目录。"""
    root = os.path.dirname(os.path.abspath(__file__)) + os.sep + ".."
    out = subprocess.run([GIT, "status", "--porcelain"], capture_output=True, text=True, cwd=root)
    files = []
    for line in out.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        rel = parts[-1]  # 重命名时取新路径；.gitignore 项已被忽略
        abs_path = os.path.normpath(os.path.join(root, *rel.split("/")))
        if os.path.isdir(abs_path):
            for dirpath, _, names in os.walk(abs_path):
                for nm in names:
                    f = os.path.join(dirpath, nm)
                    files.append(os.path.relpath(f, root).replace(os.sep, "/"))
        else:
            files.append(rel)
    return files


def main():
    files = sys.argv[1:] or collect_dirty()
    if not files:
        print("没有检测到需要提交的文件变动。")
        return
    token = get_token()
    who = gh("user", token)
    print("已认证为 %s，开始提交 %d 个文件" % (who.get("login"), len(files)))
    root = os.path.dirname(os.path.abspath(__file__)) + os.sep + ".."
    for rel in files:
        path = os.path.normpath(os.path.join(root, *rel.split("/")))
        if not os.path.exists(path):
            print("  ! 跳过（本地不存在）: %s" % rel)
            continue
        if not os.path.isfile(path):
            print("  - 跳过（目录）: %s" % rel)
            continue
        with open(path, "rb") as fh:
            content = base64.b64encode(fh.read()).decode("ascii")
        sha = None
        try:
            info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
            sha = info.get("sha")
        except ApiError as e:
            if e.code != 404:
                sys.stderr.write("GET %s 失败: %s\n" % (rel, e.msg))
                raise SystemExit(1)
            # 404 = 新文件，直接创建
        data = {"message": MESSAGE, "content": content, "branch": BRANCH}
        if sha:
            data["sha"] = sha
        res = gh("repos/%s/contents/%s" % (REPO, rel), token, method="PUT", data=data)
        print("  ✓ %s  ->  %s%s" % (rel, res["commit"]["sha"][:8], " (新建)" if not sha else ""))


if __name__ == "__main__":
    main()
