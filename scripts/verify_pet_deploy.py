#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""核对 GitHub 仓库里 2.5D 桌宠的分片与加载页是否齐全，以及 3D 残留是否已删除。"""
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

REPO = "axiu-123/my-website"
BRANCH = "main"
GIT = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
ROOT = os.path.dirname(os.path.abspath(__file__)) + os.sep + ".."


def gh(path, token):
    req = urllib.request.Request("https://api.github.com/" + path)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "verify-pet")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def get_token():
    out = subprocess.run([GIT, "credential", "fill"],
                         input="protocol=https\nhost=github.com\n\n",
                         capture_output=True, text=True, cwd=ROOT)
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("no token")


def main():
    token = get_token()
    # 分片目录
    parts = gh("repos/%s/contents/public/pet/parts?ref=%s" % (REPO, BRANCH), token)
    names = sorted(p["name"] for p in parts) if isinstance(parts, list) else []
    print("分片目录文件数: %d" % len(names))
    print("分片名: %s" % ", ".join(names))
    expected = ["pet.part%02d" % i for i in range(12)]
    missing = [n for n in expected if n not in names]
    print("缺失分片: %s" % (missing if missing else "无"))

    # pet 根目录
    root = gh("repos/%s/contents/public/pet?ref=%s" % (REPO, BRANCH), token)
    root_names = sorted(p["name"] for p in root) if isinstance(root, list) else []
    print("public/pet 内容: %s" % ", ".join(root_names))
    print("3D 残留(app.js/widget.html)仍在: %s" % ([n for n in root_names if n in ("app.js", "widget.html")] or "无"))
    print("index.html 存在: %s" % ("index.html" in root_names))

    ok = (not missing) and ("index.html" in root_names) and \
         (not any(n in root_names for n in ("app.js", "widget.html")))
    print("GitHub 侧核对: %s" % ("通过" if ok else "有问题"))


if __name__ == "__main__":
    main()
