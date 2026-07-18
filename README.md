# LX Music 移动版 · Tingfe 同步增强版

面向 Android 的 LX Music 移动端 Fork。它与 Tingfe 的私有同步服务、桌面版和车机版配套使用，重点是让音乐数据、可信自定义音源和跨端体验设置在个人设备间流转。

- 下载测试包：[Releases](https://github.com/Tingfe/lx-music-mobile/releases)
- 同步服务：[Tingfe/lx-music-sync-server](https://github.com/Tingfe/lx-music-sync-server)
- 当前版本：`v1.8.11`
- 支持 Android 5 及以上；发布包仅提供一个 `universal.apk`。

## 本 Fork 的功能

- 同步歌单、收藏与不喜欢列表。
- 同步「设置 → 自定义源」中导入的完整 JavaScript 音源脚本及元信息，在线设备会实时收到更新。
- 同步播放、搜索、歌词与列表偏好；主题、语言、存储路径、缓存、音频硬件和同步凭据始终只保存在当前设备。
- 当同账号车机在线时，首页顶部显示带绿色圆点的“车机”入口；可查看状态、切歌、播放/暂停，或让车机播放手机当前歌曲。控制页使用专属大尺寸底部面板，支持默认车机、独立设备加载状态与持续在线状态刷新；离线车机不会显示，也不会接收离线指令。
- 应用内更新读取本 Fork 的公开更新清单，不受 GitHub REST API 匿名限流影响；`master` 自动构建的 Pre-release 测试 APK 也可在开启测试版更新后直接检测和安装。
- 默认只检查正式版；在「设置 → 关于」开启“接收测试版更新”后，可直接检测和安装最新 Pre-release 的 universal APK。

## 开始使用

1. 部署或升级同步服务到 [`v2.1.11` 及以上](https://github.com/Tingfe/lx-music-sync-server/releases)。
2. 在「设置 → 数据同步」填写私有服务地址、账号和连接码。
3. 使用相同账号连接手机、桌面和车机；设置中的“控制在线车机”保留用于手动刷新和排查连接。

完整升级、验证、安装和设置同步边界见：[移动端升级说明](docs/CUSTOM_SOURCE_SYNC_UPGRADE.md)。

## 相关项目

- 桌面端：[Tingfe/lx-music-desktop](https://github.com/Tingfe/lx-music-desktop)
- 车机端：[Tingfe/lx-music-car](https://github.com/Tingfe/lx-music-car)
- 同步服务：[Tingfe/lx-music-sync-server](https://github.com/Tingfe/lx-music-sync-server)

自定义音源是可执行 JavaScript，只应导入可信来源，并只在自己控制的账号和服务之间同步。

## 上游项目与许可证

本仓库基于 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 维护；原始功能说明、FAQ、源码开发方式和完整使用限制请参阅上游 [README](https://github.com/lyswhut/lx-music-mobile#readme) 与 [官方文档](https://lyswhut.github.io/lx-music-doc/mobile/)。

本项目遵循仓库中的 [Apache-2.0 License](LICENSE) 及其适用说明。
