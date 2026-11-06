#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""同步后校验：用 GitHub Contents API 的元数据对比每片 git blob sha（免下载 63MB），
再核对加载页分片数、线上分片可达性与 /api/pet/llm 代理状态。"""
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "axiu-123/my-website"
BRANCH = "main"
SITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:/Users/a1541/Desktop/aaa/pet(5)_interaction.html"
CHUNK = 5 * 1024 * 1024
LIVE = "https://aggregate-site.onrender.com"


def get_token():
    git = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
    out = subprocess.run([git, "credential", "fill"],
                         input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True)
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no token")


def gh_contents(path, token):
    url = "https://api.github.com/repos/%s/contents/%s?ref=%s" % (REPO, path, BRANCH)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "User-Agent": "verify-pet-redeploy",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def git_blob_sha(data):
    h = hashlib.sha1()
    h.update(("blob %d\0" % len(data)).encode())
    h.update(data)
    return h.hexdigest()


def http(url, method="GET", data=None, headers=None, timeout=60):
    hdr = {"User-Agent": "verify-pet-redeploy"}
    hdr.update(headers or {})
    req = urllib.request.Request(url, method=method, data=data, headers=hdr)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return None, {}, str(e)[:80].encode()


def main():
    with open(SRC, "rb") as f:
        data = f.read()
    n = (len(data) + CHUNK - 1) // CHUNK
    w = len(str(n - 1))
    print("本地成品: %s 字节, md5 %s, 应切 %d 片(W=%d)" %
          (len(data), hashlib.md5(data).hexdigest(), n, w))

    token = get_token()
    all_ok = True

    print("\n-- GitHub 分片逐片比对 --")
    for i in range(n):
        rel = "public/pet/parts/pet.part%s" % str(i).zfill(w)
        try:
            info = gh_contents(rel, token)
        except Exception as e:
            print("part%02d: 读取失败 %s" % (i, e))
            all_ok = False
            continue
        remote_sha = info.get("sha")
        chunk = data[i * CHUNK:(i + 1) * CHUNK]
        local_sha = git_blob_sha(chunk)
        ok = (remote_sha == local_sha)
        all_ok = all_ok and ok
        print("part%02d: remote=%s local=%s bytes=%d -> %s" %
              (i, (remote_sha or "")[:10], local_sha[:10], len(chunk), "OK" if ok else "MISMATCH"))

    print("\n-- 加载页 / 服务端文件 --")
    idx = gh_contents("public/pet/index.html", token)
    loader = base64.b64decode(idx.get("content") or b"").decode("utf-8", "ignore")
    want = "const N=%d;const W=%d;" % (n, w)
    ok = want in loader
    all_ok = all_ok and ok
    print("GitHub 加载页 N=%d,W=%d: %s (sha %s)" % (n, w, "OK" if ok else "MISMATCH", idx.get("sha", "")[:10]))

    srv_local = os.path.join(SITE_ROOT, "server", "routes", "petllm.js")
    if os.path.isfile(srv_local):
        srv = gh_contents("server/routes/petllm.js", token)
        ok = srv.get("sha") == git_blob_sha(open(srv_local, "rb").read())
        all_ok = all_ok and ok
        print("服务端 petllm.js 与本地一致: %s" % ("OK" if ok else "MISMATCH"))

    print("\n-- Render 线上 --")
    st, _, body = http(LIVE + "/pet/")
    ok = st == 200 and want in body.decode("utf-8", "ignore")
    all_ok = all_ok and ok
    print("线上 /pet/ 状态=%s, 含 %s: %s" % (st, want, "OK" if ok else "FAIL"))

    for i in (0, n - 1):
        rel = "public/pet/parts/pet.part%s" % str(i).zfill(w)
        size = min(CHUNK, len(data) - i * CHUNK)
        st, hdr, _ = http(LIVE + "/pet/parts/" + rel.split("/")[-1], method="HEAD", timeout=90)
        clen = hdr.get("Content-Length") or hdr.get("content-length")
        ok = st == 200 and (clen is None or int(clen) == size)
        all_ok = all_ok and ok
        print("线上 %s HEAD 状态=%s Content-Length=%s(应为 %d): %s" %
              (rel.split("/")[-1], st, clen, size, "OK" if ok else "FAIL"))

    st, _, body = http(LIVE + "/api/pet/llm", method="POST", data=b"{}",
                       headers={"Content-Type": "application/json"})
    ok = st == 400 and b"API Key" in body
    all_ok = all_ok and ok
    print("线上 /api/pet/llm 无 Key 状态=%s: %s" % (st, "OK" if ok else "FAIL"))

    print("\n总结果:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
