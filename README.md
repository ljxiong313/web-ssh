# WebSSH

基于 Go + React 的浏览器端 SSH 终端管理工具：连接与分组管理、xterm.js 终端、SFTP 文件传输、快捷命令、命令与会话历史、导入导出、主题定制。

本仓库是 **社区版（Community）** 源码：不含 Workspace 团队协作、审计与录像的查询/回放界面、连接分享、端口转发、MFA、LDAP/OAuth2/SAML 单点登录等付费功能，也不含任何版本门控逻辑。

## 功能

| 模块 | 说明 |
|------|------|
| 账号 | 邮箱+密码注册/登录、JWT 双令牌（Access + Refresh）、自动续期、401 失效清理、登录限流与锁定 |
| 连接管理 | 连接 CRUD、密码/私钥两种认证、5 层文件夹分组、排序、搜索、JSON 导入导出 |
| 终端 | WebSocket 代理 + xterm.js，多标签、尺寸自适应、断线重连、切换页面会话不中断 |
| SFTP | 目录浏览、上传（含拖拽）、下载、目录打包下载、新建目录、删除、chmod |
| 命令 | 快捷命令（频次统计）、命令历史（搜索/复制/清空）、终端会话历史 |
| 外观 | 明暗界面主题 + 终端主题预设与颜色/字体自定义 |

## 技术栈

- **后端**：Go 1.25 + Gin + GORM（仅 SQLite），`golang.org/x/crypto/ssh`，gorilla/websocket
- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + xterm.js
- **构建**：Makefile + Docker 多阶段镜像

## 快速开始（开发）

```bash
# 1. 准备后端环境变量
cp backend/.env.example backend/.env   # 修改 JWT_SECRET / ENCRYPTION_KEY

# 2. 启动后端（监听 :37581）
cd backend && go run .

# 3. 启动前端（监听 :37580，API/WS 代理到后端）
npm ci
echo 'VITE_BACKEND_PROXY=http://127.0.0.1:37581' > .env.development.local
npm run dev
```

前端 dev 代理目标通过 `VITE_BACKEND_PROXY` 配置（默认 `http://127.0.0.1:37581`）。

## 构建

```bash
make build      # 后端 + 前端，产物在 output/
make backend    # 仅后端
make frontend   # 仅前端
make test       # 后端 Go 测试
make lint       # 前端 oxlint
make clean
```

Windows 下可直接运行 `build.bat`。前端工具链统一走 [volta](https://volta.sh)（`volta run npm run ...`）。

## 数据隔离说明

注册/登录时后端会为每个用户创建一个「个人空间」Workspace（`plan=free`，成员上限 5），连接、文件夹、快捷命令等资源按 `workspace_id` 隔离。社区版没有 Workspace 管理界面，请求头 `X-Workspace-ID` 缺省时后端自动回退到个人空间。

## 部署

- **Docker**：`docker compose up -d`（根目录 `.env` 需提供 `JWT_SECRET`、`ENCRYPTION_KEY`，各至少 32 字符；容器内监听 37581）
- **单二进制**：`make build` 后把 `output/webssh-backend` 与 `output/frontend/` 放在同一目录运行，后端会自动托管前端静态文件
- **systemd**：参照 `webssh.service` + `start.sh`
- **反向代理**：`nginx.conf` 示例已包含 WebSocket 升级配置
- 环境变量清单见 [docs/implementation-plan.md](docs/implementation-plan.md)

## 测试

```bash
cd backend && go test ./...          # 后端单元测试
npm run typecheck                    # TypeScript 类型检查
npm run lint                         # oxlint
npm run test:e2e                     # Playwright E2E（需先启动后端，见 e2e/auth.spec.ts）
```

## 目录结构

```
backend/          Go 后端（handlers / services / repositories / middleware / models / db）
src/              React 前端（pages / components / client / ctx / lib）
e2e/              Playwright 端到端用例
docs/             设计与分析文档
public/           静态资源（favicon 等）
```

## 文档

- [implementation-plan.md](docs/implementation-plan.md) — 功能清单、技术架构、部署与环境变量
- [auth-analysis.md](docs/auth-analysis.md) — 认证与 Token 架构分析（历史快照，注意时效标注）

## 许可

本项目以 **AGPL-3.0** 开源（见 [LICENSE](LICENSE)）。
