#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
重新部署 2.5D 桌宠：读取桌面上的最新单文件成品，按 5MB 切片（当前 13 片），
经 GitHub Contents API 覆盖上传到 public/pet/parts/pet.part00..12；
再生成/上传对应 N 的加载页 public/pet/index.html（并回写本地）；
最后同步网页版聊天依赖的同源代理 server/routes/petllm.js。

- 内容与线上一致的文件会自动跳过，不产生多余提交；500/502/503 自动重试。
- 分片只在 GitHub / 线上，本地 public/pet/ 只保留极小加载页。
"""
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "axiu-123/my-website"
BRANCH = "main"
MESSAGE = "feat(pet): 同步桌面最新桌宠（交互区分/摸头撒娇/尾巴轻摇/右键设置/摔落门槛）+ 13 分片 + 网页版同源 API 代理"
CHUNK = 5 * 1024 * 1024
UPLOAD_TIMEOUT = 600
RETRIES = 4
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = r"C:/Users/a1541/Desktop/aaa/pet(5)_interaction.html"
LOCAL_LOADER = os.path.join(ROOT, "public", "pet", "index.html")
EXTRA_FILES = [
    ("server/routes/petllm.js", os.path.join(ROOT, "server", "routes", "petllm.js")),
    ("scripts/redeploy_pet.py", os.path.join(ROOT, "scripts", "redeploy_pet.py")),
    ("scripts/verify_pet_redeploy.py", os.path.join(ROOT, "scripts", "verify_pet_redeploy.py")),
]


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg


def gh(path, token, method="GET", data=None, timeout=UPLOAD_TIMEOUT):
    req = urllib.request.Request("https://api.github.com/" + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "aggregate-site-pet-redeploy")
    body = None
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, body, timeout=timeout) as r:
            txt = r.read().decode("utf-8", "ignore")
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode("utf-8", "ignore")[:500])


def get_token():
    git = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
    out = subprocess.run([git, "credential", "fill"],
                         input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True)
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    sys.stderr.write("未取到本机 GitHub 凭据\n")
    raise SystemExit(1)


def git_blob_sha(data):
    h = hashlib.sha1()
    h.update(("blob %d\0" % len(data)).encode())
    h.update(data)
    return h.hexdigest()


def put_file(token, rel, raw_bytes):
    content = base64.b64encode(raw_bytes).decode("ascii")
    sha = None
    try:
        info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
        sha = info.get("sha")
        if sha == git_blob_sha(raw_bytes):
            print("  == %s 已是最新，跳过" % rel)
            return True
    except ApiError as e:
        if e.code != 404:
            print("  ! GET %s 失败(%d): %s" % (rel, e.code, e.msg))
            return False
    data = {"message": MESSAGE, "content": content, "branch": BRANCH}
    if sha:
        data["sha"] = sha
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            res = gh("repos/%s/contents/%s" % (REPO, rel), token, method="PUT", data=data)
            print("  ok %s -> %s" % (rel, res.get("commit", {}).get("sha", "")[:8]))
            return True
        except ApiError as e:
            last = e
            # 500/502/503 均为 GitHub 瞬时错误，重试
            if e.code in (500, 502, 503) and attempt < RETRIES:
                wait = 3 * attempt
                print("  .. %s 遇 %d，%ds 后重试(%d/%d)" % (rel, e.code, wait, attempt, RETRIES))
                time.sleep(wait)
                continue
            print("  XX PUT %s 失败(%d): %s" % (rel, e.code, e.msg))
            return False
    if last:
        print("  XX PUT %s 最终失败(%d)" % (rel, last.code))
    return False


def build_loader(n, width):
    return (
        "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>2.5D 桌宠</title>"
        "<style>html,body{margin:0;height:100%%;background:#f5f5f7;font-family:-apple-system,"
        "Segoe UI,sans-serif}#m{position:fixed;inset:0;display:flex;align-items:center;"
        "justify-content:center;color:#999;font-size:14px}</style></head>"
        "<body><div id=\"m\">2.5D 桌宠加载中…</div>"
        "<script>const N=%d;const W=%d;(async()=>{try{const buf=[];"
        "for(let i=0;i<N;i++){const u='parts/pet.part'+String(i).padStart(W,'0');"
        "const r=await fetch(u);if(!r.ok)throw new Error(u+' '+r.status);"
        "buf.push(await r.arrayBuffer());}"
        "const blob=new Blob(buf,{type:'text/html'});"
        "location.href=URL.createObjectURL(blob);}"
        "catch(e){document.getElementById('m').textContent='桌宠加载失败：'+e.message;}"
        "})();</script></body></html>" % (n, width)
    )


def main():
    if not os.path.isfile(SOURCE):
        sys.stderr.write("找不到源文件 %s\n" % SOURCE)
        raise SystemExit(1)
    with open(SOURCE, "rb") as fh:
        data = fh.read()
    size = len(data)
    n = (size + CHUNK - 1) // CHUNK
    width = len(str(n - 1)) if n > 1 else 1
    print("源文件 %d 字节，切成 %d 片(每片 %d 字节)..." % (size, n, CHUNK))

    token = get_token()
    who = gh("user", token)
    print("已认证为 %s" % who.get("login"))

    ok_all = True
    for i in range(n):
        chunk = data[i * CHUNK:(i + 1) * CHUNK]
        rel = "public/pet/parts/pet.part%s" % str(i).zfill(width)
        if not put_file(token, rel, chunk):
            ok_all = False

    if not ok_all:
        sys.stderr.write("有分片上传失败，中止（线上可能处于不一致状态，可重跑本脚本续传）\n")
        raise SystemExit(1)

    # 加载页：本地与 GitHub 同步更新（分片数变化时这一步是必须的）
    loader = build_loader(n, width).encode("utf-8")
    with open(LOCAL_LOADER, "wb") as fh:
        fh.write(loader)
    print("已回写本地加载页 %s (N=%d)" % (LOCAL_LOADER, n))
    if not put_file(token, "public/pet/index.html", loader):
        raise SystemExit(1)

    # 网页版聊天走的同源代理；内容没变时 put_file 会自动跳过
    for rel, local in EXTRA_FILES:
        if os.path.isfile(local):
            with open(local, "rb") as fh:
                if not put_file(token, rel, fh.read()):
                    raise SystemExit(1)
        else:
            print("  ! 本地缺少 %s，跳过" % local)

    print("完成。线上 /pet/ 将加载 %d 个分片并渲染最新 2.5D 桌宠。" % n)


if __name__ == "__main__":
    main()
