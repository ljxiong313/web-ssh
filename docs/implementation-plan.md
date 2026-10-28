# WebSSH 社区版实现说明

> 本文档描述本仓库（社区版）已实现的功能、技术架构与部署方式。
> 商业版（Pro / Team / Enterprise）的团队协作、审计合规、单点登录等功能不在本仓库范围内，也不在此文档中描述。

---

## 一、已实现功能清单

### 1.1 用户与认证

| 功能 | 说明 |
|------|------|
| 注册 / 登录 | 邮箱 + 用户名 + 密码，JWT Access Token + Refresh Token 双令牌 |
| 注册开关 | `GET /api/settings/public` 返回 `allow_registration`，关闭时前端隐藏注册入口 |
| 密码强度提示 | 注册表单实时评分（长度 / 大小写 / 数字 / 符号） |
| 重置密码 | `POST /api/auth/reset-password`，需当前密码，成功后注销全部会话 |
| Token 自动刷新 | Access Token 过期后用 Refresh Token 续期，刷新失败清理会话并跳转登录页 |
| 登录限流 | `middleware.LoginRateLimit()` 按来源 IP 限制注册/登录/重置密码频率 |
| 个人信息管理 | 昵称、邮箱修改（`/api/profile`） |

### 1.2 SSH 终端

| 功能 | 说明 |
|------|------|
| WebSSH 终端 | WebSocket 代理（`/ws/terminal/:connId`）+ xterm.js 渲染，支持多 Tab |
| 尺寸自适应 | PTY 随窗口 resize 自动调整 |
| 会话保持 | 切换页面不中断，返回时重连 |
| 服务器指标条 | 解析 `top`/`df`/`free` 等输出，展示 CPU / 内存 / 磁盘 |
| 终端主题 | 5 套预设主题 + 颜色 / 字体 / 字号自定义，实时预览并持久化到 `/api/terminal-theme` |
| 快捷命令面板 | 终端内一键发送已保存命令 |

### 1.3 连接管理

| 功能 | 说明 |
|------|------|
| 连接 CRUD | 创建、编辑、删除、测试连通性、拖拽排序 |
| 文件夹分组 | 多层树形文件夹，支持展开/折叠、重命名、删除、排序 |
| 认证方式 | 密码 + SSH 私钥，凭据使用 AES-256-GCM 加密存储 |
| 搜索与筛选 | 按名称 / 主机地址搜索，按文件夹筛选 |
| 导入 / 导出 | JSON 批量导入（先预览再确认）与导出 |
| 连接日志 | 记录连接 / 断开时间、状态、时长、错误，支持 CSV 导出与清理 |

### 1.4 文件传输

| 功能 | 说明 |
|------|------|
| SFTP 文件管理 | 目录浏览、上传、下载、删除、新建目录、chmod 权限编辑 |
| 目录打包下载 | 目录递归打包为 ZIP |
| 拖拽上传 | 文件拖入 SFTP 面板即上传 |
| 终端联动 | 从终端 Tab 一键打开当前连接的 SFTP 面板 |

### 1.5 命令与历史

| 功能 | 说明 |
|------|------|
| 快捷命令 | 保存常用命令，一键发送，带使用频次统计 |
| 命令历史 | 记录终端执行的命令，支持搜索、重新执行、清空 |
| 终端会话 | 保存终端会话内容，支持回看与删除 |

### 1.6 界面

| 功能 | 说明 |
|------|------|
| 明暗双主题 | 全局 CSS 令牌驱动，深浅两套配色一致 |
| 统一规范 | 按钮 / 标题 / 空状态 / 弹层 / 表格 / 骨架屏 / 分页统一样式类 |
| 侧边栏收折 | 展开 / 收起，收起后为图标模式 |
| 用户菜单 | 用户卡片弹出菜单承载个人资料、设置、退出登录 |

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | React 19 + TypeScript 5.9 + Vite 6 + Tailwind CSS 3.4 + @xterm/xterm 6 |
| 后端 | Go 1.25 + Gin 1.9 + GORM 1.25 |
| 数据库 | SQLite（`github.com/glebarez/sqlite`，纯 Go 驱动，无需 CGO） |
| SSH | `golang.org/x/crypto/ssh` 原生客户端；`pkg/sftp` + 自研 SCP 走同一 SSH 通道 |
| 实时通信 | `gorilla/websocket` |
| 认证 | `github.com/golang-jwt/jwt/v5` + bcrypt；凭据加密使用 AES-256-GCM |
| 部署 | 单容器（Go 内嵌前端静态文件）/ systemd + nginx |

### 2.2 目录结构

```
backend/
  main.go             路由注册与全局中间件
  config/             环境变量、数据库初始化、迁移、个人 Workspace 回填
  db/                 GORM dialector（社区版仅 SQLite）
  models/             数据模型
  repositories/       数据访问层
  services/           SSH / SFTP / SCP / 文件服务
  handlers/           HTTP 与 WebSocket 处理
  middleware/         认证、限流、Workspace 解析、RBAC
src/
  pages/              连接、终端、SFTP、快捷命令、历史、设置、登录
  components/         Sidebar、布局、基础 UI 组件
  client/api.ts       类型化 API 客户端 + WebSocket URL 生成
  ctx/terminal.tsx    终端多 Tab 状态与 WebSocket 生命周期
docs/                 设计与分析文档
```

### 2.3 数据隔离模型

本仓库不存在订阅计划、付费门控或 Workspace 管理界面，但保留了 Workspace 数据模型作为隔离边界：

- 每个用户注册时自动获得一个**个人 Workspace**（`config/migration.go` 的 `BackfillPersonalWorkspace()` 会把历史 `workspace_id` 为 NULL/0 的数据归入个人空间）。
- `middleware.WorkspaceMiddleware()` 优先读取请求头 `X-Workspace-ID`，缺失或非法时回退到当前用户的个人 Workspace，因此**前端不需要发送任何 Workspace 头**即可正常使用全部功能。
- `middleware.RBACMiddleware` + `RequireResourcePermission` 依旧生效，个人 Workspace 中用户角色为 `admin`，所以所有写操作均可用。
- 资源的创建接口接受 `workspace_id` 字段，但服务端始终用请求作用域覆盖它，无法跨空间写入。

### 2.4 保留但未开放的运行时能力

`handlers/websocket.go` 中终端录像（`TerminalRecording`）、命令审计（`CommandAuditLog`）、敏感命令规则（`SensitiveCommandRule`）的**写入实现**与相应运行的模型/仓储层仍在代码库中，但本仓库没有提供它们的 HTTP 管理端点、查询界面和回放功能。这意味着：

- 数据库表会被创建，录像与审计记录会写入 `DATA_DIR`，但用户无法在界面中查看或删除。
- 如果下游 fork 需要关闭录像写入以节省磁盘，可在 `handlers/websocket.go` 的录制分支加开关。

数据库模型总览：

```
User ──► Personal Workspace ──► WorkspaceMember
   │            │
   │            ├──► Connection ──► Folder
   │            ├──► QuickCommand
   │            └──► AuditLog (workspace_id)
   ├──► RefreshToken
   ├──► CommandHistory
   ├──► ConnectionLog
   ├──► TerminalSession
   ├──► TerminalTheme
   ├──► TerminalRecording      （仅写入，无管理端点）
   ├──► CommandAuditLog        （仅写入，无管理端点）
   ├──► SensitiveCommandRule   （模型保留，无管理端点）
   └──► SystemSetting          （全局单例，只读公开项见 /api/settings/public）
```

---

## 三、部署方式

### 3.1 Docker

```bash
docker build -t webssh/webssh:latest .
docker run -d \
  -p 35781:37581 \
  -v webssh-data:/app/data \
  -e JWT_SECRET=<至少 32 字符> \
  -e ENCRYPTION_KEY=<至少 32 字符> \
  -e ALLOWED_ORIGINS=http://localhost:35781 \
  webssh/webssh:latest
```

或使用 Compose（根目录 `.env` 提供密钥后）：

```bash
cp .env.example .env   # 填入真实 JWT_SECRET / ENCRYPTION_KEY
docker compose up -d
```

### 3.2 二进制 + systemd

```bash
make build                          # 产物在 output/：webssh-backend + frontend/
# 将 output/ 内容部署到 /var/www/webssh/server，参照 start.sh 与 webssh.service
```

后端固定监听 `:37581`，`nginx.conf` 已包含 API 代理与 WebSocket 升级配置。

### 3.3 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `JWT_SECRET` | ✅ | - | JWT 签名密钥，至少 32 字符，不满足时启动即退出 |
| `ENCRYPTION_KEY` | ✅ | - | SSH 密码/私钥的 AES-256-GCM 加密密钥，至少 32 字符 |
| `ALLOWED_ORIGINS` | ✅ | - | CORS 白名单，逗号分隔；同时作为 `FRONTEND_URL` 的回退值 |
| `DATA_DIR` | ❌ | `./data` | SQLite 数据库与终端录像文件目录 |
| `ACCESS_TOKEN_EXPIRY` | ❌ | `30m` | Access Token 有效期（支持 m/h/d 单位） |
| `REFRESH_TOKEN_EXPIRY` | ❌ | `7d` | Refresh Token 有效期 |
| `FRONTEND_URL` | ❌ | `ALLOWED_ORIGINS` 首项 | 前端地址 |
| `MVP_MODE` | ❌ | `false` | 开发预览模式，绕过 CORS 与 RBAC 校验，**禁止用于生产** |

数据库固定为 SQLite，`DB_TYPE` 等变量在本仓库中不再被读取。

---

## 四、开发与测试

```bash
# 后端（监听 :37581）
cd backend && cp .env.example .env && go run .

# 前端（监听 :37580，API/WS 代理到后端）
npm ci
echo 'VITE_BACKEND_PROXY=http://127.0.0.1:37581' > .env.development.local
npm run dev

# 校验
make backend / make frontend / make test / make lint
cd backend && go vet ./... && go test ./...
npm run typecheck
npm run test:e2e        # Playwright，需先启动后端
```

Node 工具链统一通过 `volta run` 调用，`Makefile` 在缺少 volta 时直接报错。

---

## 五、已知限制

| 限制 | 说明 |
|------|------|
| 仅 SQLite | 高并发场景性能受限；如需 PostgreSQL/MySQL 请扩展 `backend/db` 并在 `config/env.go` 中放开 `DBType` |
| 无团队协作 | 不含成员邀请、共享连接、资源级权限管理界面 |
| 无审计界面 | 审计日志与终端录像只写入、不可查询或回放（见 §2.4） |
| 无端口转发 | 本地/远程端口转发功能不在本仓库 |
| 无 MFA / SSO | 不支持 TOTP 双因素、LDAP、OAuth2、SAML |
| 无移动端适配 | 小屏幕下仅有基础响应式，未做触摸优化 |

---

> 最后更新：2026-10-28
> 许可：AGPL-3.0（见 [LICENSE](../LICENSE)）
