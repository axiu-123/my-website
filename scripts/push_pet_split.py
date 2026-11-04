#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把过大的 2.5D 桌宠单文件(>GitHub Contents API 限制)切片后上传：
  - 读取 public/pet/index.html(原 61MB 完整桌宠)
  - 按 5MB 切片，逐块 base64 后经 Contents API 上传到 public/pet/parts/pet.partNN
  - 生成极小的 public/pet/index.html 加载页：浏览器端把分片拼回完整 HTML 并 Blob 导航渲染
  - 同时把本地 public/pet/index.html 改写为该加载页，保持本地与线上一致
这样桌宠仍在 render.com 同源加载，/api/pet/llm 无需跨域。
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "axiu-123/my-website"
BRANCH = "main"
MESSAGE = "feat(pet): 切片上传 2.5D 桌宠(绕过 Contents API 体积限制)，加载页在浏览器端拼合"
CHUNK = 5 * 1024 * 1024  # 5MB 一片，base64 后约 6.7MB，远低于 422 阈值
UPLOAD_TIMEOUT = 600

GIT = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
ROOT = os.path.dirname(os.path.abspath(__file__)) + os.sep + ".."
PET_PATH = os.path.join(ROOT, "public", "pet", "index.html")


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg


def gh(path, token, method="GET", data=None, timeout=UPLOAD_TIMEOUT):
    req = urllib.request.Request("https://api.github.com/" + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "aggregate-site-pet-split")
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
    out = subprocess.run([GIT, "credential", "fill"],
                         input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, cwd=ROOT)
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    sys.stderr.write("未取到本机 GitHub 凭据\n")
    raise SystemExit(1)


def put_file(token, rel, raw_bytes):
    """base64 编码后 PUT 到 contents API；返回是否成功。"""
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
    try:
        res = gh("repos/%s/contents/%s" % (REPO, rel), token, method="PUT", data=data)
        print("  ok %s -> %s" % (rel, res.get("commit", {}).get("sha", "")[:8]))
        return True
    except ApiError as e:
        print("  XX PUT %s 失败(%d): %s" % (rel, e.code, e.msg))
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
    if not os.path.isfile(PET_PATH):
        sys.stderr.write("找不到 %s\n" % PET_PATH)
        raise SystemExit(1)
    with open(PET_PATH, "rb") as fh:
        data = fh.read()
    size = len(data)
    n = (size + CHUNK - 1) // CHUNK
    width = len(str(n - 1)) if n > 1 else 1
    print("桌宠文件 %d 字节，切成 %d 片(每片 %d 字节)..." % (size, n, CHUNK))

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
        sys.stderr.write("有分片上传失败，中止（线上可能处于不一致状态）\n")
        raise SystemExit(1)

    loader = build_loader(n, width).encode("utf-8")
    put_file(token, "public/pet/index.html", loader)

    # 本地也改写为加载页，保持与线上一致
    with open(PET_PATH, "wb") as fh:
        fh.write(loader)
    print("完成。线上 /pet/ 将加载分片并渲染 2.5D 桌宠；本地 index.html 已同步为加载页。")


if __name__ == "__main__":
    main()
