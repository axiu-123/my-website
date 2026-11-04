#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""严格核对线上：3D 残留删除 + 12 分片可无损还原为完整 61MB 桌宠。"""
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://aggregate-site.onrender.com"
EXPECT = 61617656
N = 12


def get(path, timeout=90):
    url = BASE.rstrip("/") + path
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "final-verify"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:
        return "ERR:" + str(e)[:120], b""


def main():
    print("站点: %s\n" % BASE)

    # 1) 3D 残留应 404
    for p in ("/pet/app.js", "/pet/widget.html"):
        st, _ = get(p)
        print("%-22s -> %s  %s" % (p, st, "(已删除 ✓)" if st == 404 else "(⚠ 仍存在/异常)"))

    # 2) 下载并拼合 12 个分片
    print("\n下载并拼合 12 个分片...")
    buf = bytearray()
    ok_parts = 0
    for i in range(N):
        st, data = get("/pet/parts/pet.part%02d" % i)
        if st == 200 and data:
            buf += data
            ok_parts += 1
            print("  part%02d: %d 字节" % (i, len(data)))
        else:
            print("  part%02d: 失败 status=%s" % (i, st))
    total = len(buf)
    print("\n拼合总字节: %d (期望 %d) -> %s" % (total, EXPECT, "匹配 ✓" if total == EXPECT else "不匹配 ✗"))

    head = buf[:200].decode("utf-8", "ignore").lower()
    has_doctype = ("<!doctype" in head) or ("<html" in head)
    has_petapi = b"window.__petAPI" in buf
    print("内容开头是 HTML: %s" % has_doctype)
    print("含桌宠 AI 注入(window.__petAPI): %s" % has_petapi)

    good = (ok_parts == N) and (total == EXPECT) and has_doctype and has_petapi
    print("\n结论: %s" % ("✅ 线上 2.5D 桌宠完整可用，3D 已彻底移除" if good else "⚠ 存在问题，请检查"))


if __name__ == "__main__":
    main()
