#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
部署脚本：当 git push 因代理 502 / github.com 直连超时不可用时，改用 GitHub Contents API
直接把文件提交到 main 分支，触发 Render 自动部署。

能力：
  - 创建/更新文件（base64 写入 contents API）
  - 删除文件（git status 中状态为 D 的路径，经 API DELETE，让被删的 3D 桌宠文件真正下线）
  - 自动收集所有改动/未跟踪文件（.gitignore 已忽略的项不会被收集）
  - 单个文件失败不中断整体部署（打印错误后继续）
凭据取自本机 Git 凭据管理器，绝不打印。
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
MESSAGE = (
    "feat(pet): 用 2.5D 桌宠(本地AI意识)替换 3D 桌宠；新增 /api/pet/llm 代理；"
    "同步音乐/作曲/去重等改进"
)
UPLOAD_TIMEOUT = 600  # 61MB pet 文件需要更长超时

GIT = shutil.which("git") or r"D:\workbuddy\resources\vendor\PortableGit\mingw64\bin\git.exe"
ROOT = os.path.dirname(os.path.abspath(__file__)) + os.sep + ".."


class ApiError(Exception):
    def __init__(self, code, msg):
        self.code = code
        self.msg = msg


def gh(path, token, method="GET", data=None, timeout=UPLOAD_TIMEOUT):
    req = urllib.request.Request("https://api.github.com/" + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "aggregate-site-pusher")
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
    out = subprocess.run(
        [GIT, "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, cwd=ROOT,
    )
    for line in out.stdout.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1].strip()
    sys.stderr.write("未取到本机 GitHub 凭据\n")
    raise SystemExit(1)


def _status_list():
    out = subprocess.run([GIT, "status", "--porcelain"], capture_output=True, text=True, cwd=ROOT)
    rows = []
    for line in out.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        rows.append((parts[0], parts[-1]))
    return rows


def collect_dirty():
    files = []
    for status, rel in _status_list():
        if status.startswith("D"):
            continue  # 删除单独处理
        if rel.startswith(".workbuddy"):
            continue
        abs_path = os.path.normpath(os.path.join(ROOT, *rel.split("/")))
        if os.path.isdir(abs_path):
            for dp, _, names in os.walk(abs_path):
                for nm in names:
                    f = os.path.join(dp, nm)
                    files.append(os.path.relpath(f, ROOT).replace(os.sep, "/"))
        else:
            files.append(rel)
    return files


def collect_deleted():
    return [rel for status, rel in _status_list()
            if status.startswith("D") and not rel.startswith(".workbuddy")]


def push_file(token, rel):
    path = os.path.normpath(os.path.join(ROOT, *rel.split("/")))
    if not os.path.isfile(path):
        print("  - 跳过(非文件): %s" % rel)
        return
    with open(path, "rb") as fh:
        content = base64.b64encode(fh.read()).decode("ascii")
    sha = None
    try:
        info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
        sha = info.get("sha")
    except ApiError as e:
        if e.code != 404:
            print("  ! GET %s 失败(%d): %s" % (rel, e.code, e.msg))
            return
    data = {"message": MESSAGE, "content": content, "branch": BRANCH}
    if sha:
        data["sha"] = sha
    try:
        res = gh("repos/%s/contents/%s" % (REPO, rel), token, method="PUT", data=data)
        print("  ok %s  ->  %s%s" % (rel, res.get("commit", {}).get("sha", "")[:8], " (新建)" if not sha else ""))
    except ApiError as e:
        print("  XX PUT %s 失败(%d): %s" % (rel, e.code, e.msg))


def delete_file(token, rel):
    try:
        info = gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token)
        sha = info.get("sha")
    except ApiError as e:
        if e.code == 404:
            print("  . 已不存在，跳过删除: %s" % rel)
            return
        print("  ! GET(删) %s 失败(%d): %s" % (rel, e.code, e.msg))
        return
    try:
        gh("repos/%s/contents/%s" % (REPO, rel), token, method="DELETE",
           data={"message": MESSAGE, "sha": sha, "branch": BRANCH})
        print("  ok 已删除: %s" % rel)
    except ApiError as e:
        print("  XX 删除 %s 失败(%d): %s" % (rel, e.code, e.msg))


def main():
    files_arg = sys.argv[1:]
    token = get_token()
    who = gh("user", token)
    print("已认证为 %s" % who.get("login"))

    files = files_arg or collect_dirty()
    print("开始提交 %d 个文件(更新/创建)..." % len(files))
    for rel in files:
        if rel.startswith(".workbuddy"):
            continue
        push_file(token, rel)

    dels = collect_deleted()
    if dels:
        print("开始删除 %d 个已移除文件..." % len(dels))
        for rel in dels:
            delete_file(token, rel)
    print("部署提交完成（GitHub 收到后 Render 会自动重新部署）。")


if __name__ == "__main__":
    main()
