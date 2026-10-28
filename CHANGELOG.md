# Changelog

本项目的所有显著变更都记录在此文件。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-10-28

首个社区版发布。

### Added
- 邮箱 + 密码注册 / 登录，JWT Access Token + Refresh Token 双令牌与自动续期
- 基于 IP 的登录限流与连续失败锁定（5 次失败锁定 30 分钟）
- 连接管理：CRUD、密码 / SSH 私钥两种认证、文件夹分组、拖拽排序、搜索
- 连接凭据使用 AES-256-GCM 加密存储
- WebSSH 终端：WebSocket 代理 + xterm.js，多标签、PTY 尺寸自适应、断线重连、切换页面会话不中断
- 服务器指标条（CPU / 内存 / 磁盘）
- SFTP 文件管理：目录浏览、上传（含拖拽）、下载、目录打包下载、新建目录、删除、chmod
- 快捷命令（使用频次统计）、命令历史、终端会话历史
- 连接日志与 CSV 导出
- 连接 JSON 导入 / 导出（导入前预览确认）
- 明暗双界面主题 + 7 套终端配色预设 + 颜色 / 字体 / 字号自定义与实时预览
- 侧边栏收折、统一按钮 / 标题 / 空状态 / 弹层规范
- 按用户个人 Workspace 的资源隔离
- Docker 镜像、docker-compose、systemd 与 nginx 部署配置

### Not included
社区版不含团队协作、审计与录像的查询/回放界面、连接分享、端口转发、MFA、LDAP / OAuth2 / SAML 单点登录，也不含任何版本门控逻辑。

[0.1.0]: https://github.com/ljxiong313/web-ssh/releases/tag/v0.1.0
