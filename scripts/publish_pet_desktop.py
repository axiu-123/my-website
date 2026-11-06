#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
发布「桌面版下载」：把桌面绿色版 zip 切成 5MB 分片，并把分片、manifest、
下载路由、下载说明页、首页入口用 Git Data API 合并成**一个 commit** 推到 GitHub。

为什么不用 Contents API：它每上传一个文件就产生一个 commit，40 个分片会让
Render 连续排队 40 次部署；Git Data API 可以一次建 tree + commit + 更新 ref。

本地会保留 public/pet/downloads/ 下的分片，方便直接起服务验证下载路由。
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
MESSAGE = "feat(pet): 桌面版 v2026.11.06.2 新增陪工作监测（默认关闭、仅桌面版），更新分发包与说明"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = r"C:/Users/a1541/Desktop/aaa/desktop/WhaleGirlPet-win32-x64.zip"
MANIFEST_LOCAL = r"C:/Users/a1541/Desktop/aaa/desktop/download_manifest.json"
OUT_DIR = os.path.join(ROOT, "public", "pet", "downloads")
SITE_FILES = [
    "server/server.js",
    "public/pet/desktop.html",
    "public/home/index.html",
    "scripts/publish_pet_desktop.py",
]


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg


def gh(path, token, method="GET", data=None, timeout=600):
    req = urllib.request.Request("https://api.github.com/" + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "publish-pet-desktop")
    body = None
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, body, timeout=timeout) as r:
                txt = r.read().decode("utf-8", "ignore")
                return json.loads(txt) if txt else {}
        except urllib.error.HTTPError as e:
            last = ApiError(e.code, e.read().decode("utf-8", "ignore")[:300])
            if e.code in (500, 502, 503) and attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            raise last
    raise last


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


def blob_sha(data):
    h = hashlib.sha1()
    h.update(("blob %d\0" % len(data)).encode())
    h.update(data)
    return h.hexdigest()


def main():
    zipdata = open(ZIP, "rb").read()
    manifest = json.load(open(MANIFEST_LOCAL, "r", encoding="utf-8"))
    assert manifest["size"] == len(zipdata), "manifest.size 与 zip 不一致"
    assert manifest["sha256"] == hashlib.sha256(zipdata).hexdigest(), "zip 校验和不匹配"
    chunk = manifest["chunk"]
    n = (len(zipdata) + chunk - 1) // chunk
    assert n == manifest["parts"], "分片数与 manifest 不一致"
    print("zip %d 字节 / %d 片, sha256=%s" % (len(zipdata), n, manifest["sha256"][:16]))

    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.startswith("pkg.part") and f[8:].isdigit() and int(f[8:]) >= n:
            os.remove(os.path.join(OUT_DIR, f))
            print("删除多余旧分片", f)

    files = []  # (repo path, local path)
    for i in range(n):
        name = "pkg.part%s" % str(i).zfill(manifest["width"])
        local = os.path.join(OUT_DIR, name)
        with open(local, "wb") as fh:
            fh.write(zipdata[i * chunk:(i + 1) * chunk])
        files.append(("public/pet/downloads/" + name, local))
    mf = os.path.join(OUT_DIR, "manifest.json")
    with open(mf, "wb") as fh:
        fh.write(json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    files.append(("public/pet/downloads/manifest.json", mf))
    for rel in SITE_FILES:
        local = os.path.join(ROOT, rel)
        if not os.path.isfile(local):
            sys.stderr.write("缺少文件 " + local + "\n")
            raise SystemExit(1)
        files.append((rel, local))
    print("待提交文件 %d 个（%d 分片 + %d 站点文件）" % (len(files), n, len(files) - n - 1))
    if "--prepare" in sys.argv:
        print("--prepare：只生成本地分片，不上传。")
        return

    token = get_token()
    print("已认证为", gh("user", token).get("login"))
    ref = gh("repos/%s/git/ref/heads/%s" % (REPO, BRANCH), token)
    base_commit = ref["object"]["sha"]
    base_tree = gh("repos/%s/git/commits/%s" % (REPO, base_commit), token)["tree"]["sha"]
    print("基线 commit", base_commit[:8])

    # 与线上相同的文件直接复用已有 blob，不重复上传
    entries = []
    for idx, (rel, local) in enumerate(files, 1):
        data = open(local, "rb").read()
        try:
            info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token, timeout=60)
            if info.get("sha") == blob_sha(data):
                entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": info["sha"]})
                if idx % 10 == 0 or idx == len(files):
                    print("  [%d/%d] %s 未变，复用" % (idx, len(files), rel))
                continue
        except ApiError as e:
            # 取不到旧文件信息（含 403 大文件元数据等）时按新文件正常上传
            if e.code != 404:
                print("  ! GET %s 返回 %d，按新文件上传" % (rel, e.code))
        blob = gh("repos/%s/git/blobs" % REPO, token, method="POST",
                  data={"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        if idx % 5 == 0 or idx == len(files):
            print("  [%d/%d] 已上传 blob %s" % (idx, len(files), rel))

    tree = gh("repos/%s/git/trees" % REPO, token, method="POST",
              data={"base_tree": base_tree, "tree": entries})
    commit = gh("repos/%s/git/commits" % REPO, token, method="POST",
                data={"message": MESSAGE, "tree": tree["sha"], "parents": [base_commit]})
    gh("repos/%s/git/refs/heads/%s" % (REPO, BRANCH), token, method="PATCH",
       data={"sha": commit["sha"], "force": False})
    print("完成，单个 commit:", commit["sha"][:10])
    print("线上 /pet/desktop.html 与 /pet/download 将在 Render 部署后生效。")


if __name__ == "__main__":
    main()
