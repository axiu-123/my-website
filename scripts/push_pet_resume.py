#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
续传：只补传失败的分片(part00, part01)与加载页 index.html。
分片规则必须与首次完全一致(CHUNK=5MB, 命名 pet.partNN)，否则偏移错位。
对瞬时 502/5xx 做最多 4 次重试。
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
MESSAGE = "feat(pet): 续传缺失分片(part00/part01)与加载页"
CHUNK = 5 * 1024 * 1024
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
    req.add_header("User-Agent", "aggregate-site-pet-resume")
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


def put_with_retry(token, rel, raw_bytes, retries=4):
    content = base64.b64encode(raw_bytes).decode("ascii")
    for attempt in range(1, retries + 1):
        try:
            info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
            sha = info.get("sha")
        except ApiError as e:
            if e.code == 404:
                sha = None
            else:
                print("  ! GET %s 失败(%d) 尝试 %d/%d: %s" % (rel, e.code, attempt, retries, e.msg))
                time.sleep(1)
                continue
        data = {"message": MESSAGE, "content": content, "branch": BRANCH}
        if sha:
            data["sha"] = sha
        try:
            res = gh("repos/%s/contents/%s" % (REPO, rel), token, method="PUT", data=data)
            print("  ok %s -> %s%s" % (rel, res.get("commit", {}).get("sha", "")[:8], " (新建)" if not sha else ""))
            return True
        except ApiError as e:
            print("  XX PUT %s 失败(%d) 尝试 %d/%d: %s" % (rel, e.code, attempt, retries, e.msg))
            time.sleep(1.5)
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
    with open(PET_PATH, "rb") as fh:
        data = fh.read()
    size = len(data)
    n = (size + CHUNK - 1) // CHUNK
    width = len(str(n - 1)) if n > 1 else 1
    print("文件 %d 字节，共 %d 片，补传 part00/part01 + 加载页" % (size, n))

    token = get_token()
    print("已认证为 %s" % gh("user", token).get("login"))

    ok = True
    for i in (0, 1):
        chunk = data[i * CHUNK:(i + 1) * CHUNK]
        rel = "public/pet/parts/pet.part%s" % str(i).zfill(width)
        if not put_with_retry(token, rel, chunk):
            ok = False

    if ok:
        loader = build_loader(n, width).encode("utf-8")
        if not put_with_retry(token, "public/pet/index.html", loader):
            ok = False
        else:
            with open(PET_PATH, "wb") as fh:
                fh.write(loader)
            print("加载页已上传并同步到本地。")
    print("完成。" if ok else "仍有失败，请重试。")


if __name__ == "__main__":
    main()
