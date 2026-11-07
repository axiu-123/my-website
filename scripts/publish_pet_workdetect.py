#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""发布网页版「陪工作 / 工作状态检测」到 GitHub main（Render 自动部署）。

只提交 4 个文件，且用 Git Data API 合成**一个 commit**，避免把工作区里
其它未完成的改动带上线上，也避免多次部署。
  · public/pet/index.html      loader：拼分片后内联注入检测脚本 + 透传 ?wb=0
  · public/pet/workdetect.js  新增：浏览器可用的近似工作状态检测 + v9 陪工作造型
  · public/pet/desktop.html   文案：网页版也有陪工作（近似），桌面版才是精确判断
  · public/home/index.html    首页卡片补一行说明
"""
import base64
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = "axiu-123/my-website"
BRANCH = "main"
MESSAGE = "feat(pet): 网页版补上陪工作/工作状态检测（页面活跃度近似判断）并同步说明文案"
FILES = [
    "public/pet/index.html",
    "public/pet/workdetect.js",
    "public/pet/desktop.html",
    "public/home/index.html",
    "scripts/publish_pet_workdetect.py",
]

# 复用桌面版发布脚本里已验证过的 GitHub API / 凭据 / blob sha 工具
_spec = importlib.util.spec_from_file_location(
    "publish_pet_desktop", os.path.join(HERE, "publish_pet_desktop.py"))
pub = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pub)


def main():
    payload = []
    for rel in FILES:
        local = os.path.join(ROOT, rel)
        if not os.path.isfile(local):
            sys.stderr.write("缺少文件 " + local + "\n")
            raise SystemExit(1)
        data = open(local, "rb").read()
        payload.append((rel, data))
        print("  %-34s %7d 字节  blob %s" % (rel, len(data), pub.blob_sha(data)[:8]))

    if "--dry-run" in sys.argv:
        print("--dry-run：仅核对，未上传。")
        return

    token = pub.get_token()
    print("已认证为", pub.gh("user", token).get("login"))
    ref = pub.gh("repos/%s/git/ref/heads/%s" % (REPO, BRANCH), token)
    base_commit = ref["object"]["sha"]
    base_tree = pub.gh("repos/%s/git/commits/%s" % (REPO, base_commit), token)["tree"]["sha"]
    print("基线 commit", base_commit[:10])

    entries = []
    for rel, data in payload:
        try:
            info = pub.gh("repos/%s/contents/%s?ref=%s" % (REPO, rel, BRANCH), token, timeout=60)
            if info.get("sha") == pub.blob_sha(data):
                print("  %s 未变，复用 blob" % rel)
                entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": info["sha"]})
                continue
        except pub.ApiError as e:
            if e.code != 404:
                print("  ! GET %s 返回 %d，按新文件上传" % (rel, e.code))
        blob = pub.gh("repos/%s/git/blobs" % REPO, token, method="POST",
                      data={"content": base64.b64encode(data).decode("ascii"),
                            "encoding": "base64"})
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  已上传 %s -> %s" % (rel, blob["sha"][:8]))

    tree = pub.gh("repos/%s/git/trees" % REPO, token, method="POST",
                  data={"base_tree": base_tree, "tree": entries})
    commit = pub.gh("repos/%s/git/commits" % REPO, token, method="POST",
                    data={"message": MESSAGE, "tree": tree["sha"], "parents": [base_commit]})
    pub.gh("repos/%s/git/refs/heads/%s" % (REPO, BRANCH), token, method="PATCH",
           data={"sha": commit["sha"], "force": False})
    print("完成，单个 commit:", commit["sha"][:10])
    print("Render 部署后 /pet/、/pet/workdetect.js、/pet/desktop.html、/home/ 生效。")


if __name__ == "__main__":
    main()
