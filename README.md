# LX Music 移动版 · Tingfe 同步增强版

面向 Android 的 LX Music 移动端 Fork。它与 Tingfe 的私有同步服务、桌面版和车机版配套使用，重点是让音乐数据、可信自定义音源和跨端体验设置在个人设备间流转。

- 下载测试包：[Releases](https://github.com/Tingfe/lx-music-mobile/releases)
- 同步服务：[Tingfe/lx-music-sync-server](https://github.com/Tingfe/lx-music-sync-server)
- 当前版本：`v1.9.3`
- 更新检查修复与维护说明：[docs/UPDATE_CHECK.md](docs/UPDATE_CHECK.md)
- 支持 Android 5 及以上；发布包仅提供一个 `universal.apk`。

## 本 Fork 的功能

- 同步歌单、收藏与不喜欢列表。
- 同步「设置 → 自定义源」中导入的完整 JavaScript 音源脚本及元信息，在线设备会实时收到更新。
- 同步播放、搜索、歌词与列表偏好；主题、语言、存储路径、缓存、音频硬件和同步凭据始终只保存在当前设备。
- 当同账号车机在线时，首页顶部显示带绿色圆点的“车机”入口；可查看状态、切歌、播放/暂停，或让车机播放手机当前歌曲。控制页使用专属大尺寸底部面板，支持默认车机、独立设备加载状态与持续在线状态刷新；离线车机不会显示，也不会接收离线指令。
- 应用内更新读取本 Fork 的公开更新清单，不受 GitHub REST API 匿名限流影响；`master` 自动构建的 Pre-release 测试 APK 也可在开启测试版更新后直接检测和安装。
- 默认只检查正式版；在「设置 → 关于」开启“接收测试版更新”后，可直接检测和安装最新 Pre-release 的 universal APK。

## v1.8.12 稳定性改进

- 重连和切换服务时隔离旧连接回调，避免旧会话覆盖当前同步状态。
- 手机和服务端统一设置白名单及类型、枚举、范围校验；主题、语言、界面布局保持设备本地独立。
- 修复更新检查状态残留，以及同步删除当前音源后的运行状态。
- 配合服务端 v2.1.12，车机短暂状态超时后可自动恢复发现，控制失败会显示重试提示。
- 认证日志不再输出连接码，自动发布前运行同步回归检查。

## 开始使用

1. 部署或升级同步服务到 [`v2.1.12` 及以上](https://github.com/Tingfe/lx-music-sync-server/releases)。
2. 在「设置 → 数据同步」填写私有服务地址、账号和连接码。
3. 使用相同账号连接手机、桌面和车机；设置中的“控制在线车机”保留用于手动刷新和排查连接。

完整升级、验证、安装和设置同步边界见：[移动端升级说明](docs/CUSTOM_SOURCE_SYNC_UPGRADE.md)。

## 相关项目

- 桌面端：[Tingfe/lx-music-desktop](https://github.com/Tingfe/lx-music-desktop)
- 车机端：[Tingfe/lx-music-car](https://github.com/Tingfe/lx-music-car)
- 同步服务：[Tingfe/lx-music-sync-server](https://github.com/Tingfe/lx-music-sync-server)

自定义音源是可执行 JavaScript，只应导入可信来源，并只在自己控制的账号和服务之间同步。

## 隐私保护

v1.8.13 清理认证与完整请求地址日志，加入日志脱敏、敏感文件忽略规则和发布前隐私回归检查。公网同步必须使用 HTTPS/WSS；已有旧日志不会自动清理。详情见：[隐私与安全说明](docs/PRIVACY_SECURITY.md)。

## GD音乐台可选接入（v1.8.14 测试版）

设置中的音源列表新增“GD音乐台（网易云·在线播放）”，需手动选择；支持 128k、320k 和无损请求，保留原有搜索、歌单、自定义音源与同步。当前 GD 官方禁止下载，因此仅用于在线播放；其他允许下载的音源不受影响。请从本仓库 Releases 安装 v1.8.14 或之后的测试包，旧发布包不会自动获得此功能。

使用方式、音质边界、限流、升级和回归说明：[GD音乐台接入说明](docs/GD_STUDIO.md)。

## 上游修复同步（v1.9.2 测试版）

已选择性引入上游搜索、歌单、歌曲匹配和歌词修复，保留本 Fork 的同步扩展、GD 接入。歌曲菜单新增单曲播放地址缓存清理，并适配 GD 的短期内存缓存。这不是整仓覆盖；版本号不代表完整合入上游全部提交。

引入范围、保留项、依赖边界与验证步骤见：[上游同步与升级说明](docs/UPSTREAM_SYNC.md)。

## 上游项目与许可证

本仓库基于 [lyswhut/lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 维护；原始功能说明、FAQ、源码开发方式和完整使用限制请参阅上游 [README](https://github.com/lyswhut/lx-music-mobile#readme) 与 [官方文档](https://lyswhut.github.io/lx-music-doc/mobile/)。

本项目遵循仓库中的 [Apache-2.0 License](LICENSE) 及其适用说明。
