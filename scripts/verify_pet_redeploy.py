#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""轻量校验：仅用 Contents API 的元数据(小)拿到每片 git blob sha，
再与本地切片的 git blob sha 对比，无需下载 61MB。"""
import base64, hashlib, json, subprocess, shutil, sys, urllib.request

REPO = "axiu-123/my-website"; BRANCH = "main"
SRC = r"C:/Users/a1541/Desktop/aaa/pet(5)_noAItext.html"
N = 12; CHUNK = 5 * 1024 * 1024
LIVE = "https://aggregate-site.onrender.com"

def get_token():
    git = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
    out = subprocess.run([git, "credential", "fill"], input="protocol=https\nhost=github.com\n\n", capture_output=True, text=True)
    for line in out.stdout.splitlines():
        if line.startswith("password="): return line.split("=",1)[1].strip()
    raise SystemExit("no token")

def api_get(url, token):
    req = urllib.request.Request(url, headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","User-Agent":"verify"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8","ignore"))

def git_blob_sha(data):
    h = hashlib.sha1(); h.update(("blob %d\0"%len(data)).encode()); h.update(data); return h.hexdigest()

token = get_token()
with open(SRC, "rb") as f: data = f.read()
print("本地源文件: %d 字节, 切 %d 片" % (len(data), (len(data)+CHUNK-1)//CHUNK))

all_ok = True
for i in range(N):
    rel = "public/pet/parts/pet.part%s" % str(i).zfill(2)
    info = api_get("https://api.github.com/repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
    remote_sha = info.get("sha")
    chunk = data[i*CHUNK:(i+1)*CHUNK]
    local_sha = git_blob_sha(chunk)
    ok = (remote_sha == local_sha)
    all_ok = all_ok and ok
    print("part%02d: remote=%s local=%s -> %s" % (i, remote_sha[:10], local_sha[:10], "OK" if ok else "MISMATCH"))

print("\n全部分片 sha 一致:", all_ok)

# 加载页校验
idx = api_get("https://api.github.com/repos/%s/contents/public/pet/index.html?ref=%s" % (REPO, BRANCH), token)
idx_sha = idx.get("sha")
local_loader_sha = git_blob_sha(b"")  # 占位，仅打印
print("加载页 index.html sha:", idx_sha[:10], "(N=12 应不变)")

# 线上 Render 小请求
def http_get(url, t=30):
    req = urllib.request.Request(url, headers={"User-Agent":"verify"})
    try:
        with urllib.request.urlopen(req, timeout=t) as r:
            return r.status, len(r.read(200000))
    except Exception as e:
        return None, str(e)[:60]
st,_ = http_get(LIVE + "/pet/")
print("线上 /pet/ 状态:", st)
st2,sz = http_get(LIVE + "/pet/parts/pet.part00")
print("线上 /pet/parts/pet.part00 状态:%s 已读字节:%d" % (st2, sz))
