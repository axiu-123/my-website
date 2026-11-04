#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""实测线上 Render 站点：确认 2.5D 桌宠加载页、分片、3D 残留删除均已生效。"""
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://aggregate-site.onrender.com"


def fetch(path, timeout=90):
    url = BASE.rstrip("/") + path
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "live-check"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            return r.status, r.headers.get("Content-Length"), data
    except Exception as e:
        return None, None, str(e)[:200]


def main():
    print("目标站点: %s" % BASE)
    for attempt in range(1, 4):
        print("\n--- 尝试 %d ---" % attempt)
        st, cl, body = fetch("/pet/")
        print("/pet/ -> status=%s, len=%s" % (st, cl))
        if st == 200:
            text = body.decode("utf-8", "ignore") if isinstance(body, bytes) else ""
            print("  含加载页标记(2.5D 桌宠加载中): %s" % ("2.5D 桌宠加载中" in text))
            print("  含分片拼合脚本(parts/pet.part): %s" % ("parts/pet.part" in text))
            print("  是否仍是旧3D加载页(含 widget/app.js 引用): %s" % ("widget.html" in text or "pet/app.js" in text))
        st2, cl2, _ = fetch("/pet/app.js")
        print("/pet/app.js -> status=%s (期望 404 表示已删除)" % st2)
        st3, cl3, _ = fetch("/pet/parts/pet.part00")
        print("/pet/parts/pet.part00 -> status=%s, len=%s (期望 200 且 ~5242880)" % (st3, cl3))
        if st == 200 and "2.5D 桌宠加载中" in (body.decode("utf-8", "ignore") if isinstance(body, bytes) else "") \
           and st2 == 404 and st3 == 200:
            print("\n✅ 线上验证通过：2.5D 桌宠已上线，3D 残留已删除。")
            return
        print("  尚未就绪，等待 20s 后重试(可能 Render 仍在部署/冷启动)...")
        time.sleep(20)
    print("\n⚠️ 多次尝试后仍未完全就绪，请确认 Render 部署状态与站点地址是否正确。")


if __name__ == "__main__":
    main()
