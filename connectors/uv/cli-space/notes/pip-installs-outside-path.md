---
title: pip install 装到 user Scripts，PATH 上找不到
source: wizard
updated: 2026-10-11
---
Python 3.14（`C:\Python314`）走「仅自己用」安装时，pip 把可执行入口落到 `%APPDATA%\Python\Python314\Scripts\`，不在系统 PATH 里。

`where uv` 查不到是正常的，确认用绝对路径 `C:\Users\Shannon\AppData\Roaming\Python\Python314\Scripts\uv.exe` 跑能出 `--version` 即可。

排查链：先 `pip show uv` 拿到 Location，再 `find <Location>/.. -iname uv.exe` 定位入口。

CLI 空间 INSTALL.md 把 binPath 写绝对路径，框架靠它直接 spawn，不依赖 PATH。
