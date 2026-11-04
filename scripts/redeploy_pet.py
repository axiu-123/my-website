#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
重新部署 2.5D 桌宠：读取桌面上的真实 61MB 单文件，切片成 12 片(5MB/片)，
经 GitHub Contents API 覆盖上传到 public/pet/parts/pet.part00..11（带 502 重试）。
加载页 public/pet/index.html（N=12）保持不变，浏览器端已能正确拼合。
本地 aggregate-site/public/pet/index.html 保持为加载页，不被本脚本改写。
"""
import base64
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
MESSAGE = "feat(pet): 重新部署 2.5D 桌宠（单击/双击/拖拽交互区分 + 撒娇摸头）"
CHUNK = 5 * 1024 * 1024
UPLOAD_TIMEOUT = 600
RETRIES = 4
SOURCE = r"C:/Users/a1541/Desktop/aaa/pet(5)_noAItext.html"


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


def put_file(token, rel, raw_bytes):
    content = base64.b64encode(raw_bytes).decode("ascii")
    sha = None
    try:
        info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
        sha = info.get("sha")
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
            # 502 是 GitHub 瞬时错误，重试
            if e.code == 502 and attempt < RETRIES:
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

    # 重新上传加载页（内容不变，确保与 N=12 一致）
    loader = build_loader(n, width).encode("utf-8")
    put_file(token, "public/pet/index.html", loader)
    print("完成。线上 /pet/ 将加载 12 个分片并渲染更新后的 2.5D 桌宠。")


if __name__ == "__main__":
    main()
