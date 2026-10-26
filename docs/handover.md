# ShareBox 交接文档

> 更新日期：2026-10-27
> 分支：`next`  
> 单文件分享 Step 2 已完成；本轮代码与文档尚未提交。

## 认证流程更新（2026-10-27）

- 新迁移 `0001_loud_toxin.sql` 增加 `admin_credentials` 单例表，id 约束为 1，保存用户名、scrypt 哈希和会话密钥。
- 启动时自动创建用户名 admin 和 32 位随机密码，提交后仅输出一次密码；不强制修改。重启复用已有凭据和会话。
- 旧认证环境变量读取、旧配置导入和 `auth:hash` 命令已移除；尚无管理员记录的实例首次升级会生成新密码，请查看日志。
- 停机执行 `npm run auth:reset` 对原 STATE_DIR 重置密码和会话密钥，再启动；文件、分享及用户名保留。
- 初始化失败不输出未持久化密码，损坏的凭据拒绝启动。并发初始化保证只有一个账户和一次密码输出。
- 运行镜像包含重置命令依赖的源码，直接使用 Node.js 24 运行，不依赖开发工具。

## 1. 当前可用能力

ShareBox 是单服务器、单管理员的文件中转、管理与分发应用，保持模块化单体。

- 文件位于 `STATE_DIR/files/`，默认私有；管理员可登录后上传、浏览、下载、重命名及删除文件或空目录。
- 私有下载 `/download?path=...` 支持附件、HEAD、单段 Range 和 416；旧 `/public` 已删除，返回 404。
- tus 上传暂存于 `staging/tus/`，完成回执位于 `staging/tus-receipts/`，任务和回执保留 7 天；完成响应丢失后可以恢复。
- 单文件分享已包含创建、撤销、匿名附件下载和管理界面。根目录文件允许分享，目录不能分享。
- 文件行提供分享入口；上传面板下方的 SharesPanel 显示路径、有效/失效状态、复制、打开、管理/重新分享及取消发布。
- 创建和重新分享前确认；链接对话框支持手动选择复制，剪贴板失败时显示提示。
- 管理员重命名文件或父目录后维护分享路径、保留链接；删除文件或空目录后清理对应与子路径规则。
- 文件操作完成后分享同步失败会记录日志并显示 warning，不将文件操作误报失败。对话框由 FileBrowser 托管，提醒不会随旧文件行卸载而丢失。

## 2. 已确定的边界

1. 本阶段只做单文件分享，目录发布等待目录操作完善后再做；不允许发布根目录。
2. `/s/:shareId` 直接返回文件附件，不提供落地页；每次请求重新授权。
3. 一个路径只有一条分享记录，同路径同 dev/ino 重复创建返回原链接；身份变化后重新发布替换旧记录并生成新链接。
4. id 为 16 字节随机 hex，规则保存 POSIX 相对路径及 bigint dev/ino 字符串。数据库不保存文件内容。
5. 下载在打开的文件描述符上核对身份；未知 id、撤销、缺失、符号链接及身份不匹配统一 404。
6. 外部移动/替换使旧链接失效，原地编辑且 inode 不变时返回最新内容。撤销不回收副本，也不终止已有传输。
7. 不做密码、有效期、下载次数或统计；不引入多用户系统、多租户、独立 API 服务或 Worker。
8. `USER_URL`、Origin 校验和 Secure Cookie 保留；生产 HTTPS 入口由部署环境提供，应用不监听 TLS。
9. 仅支持一个 Node 进程操作状态目录，不支持横向扩容。

## 3. 状态布局与数据库

```text
STATE_DIR/                         0700
├─ files/                          0700  私有文件
├─ staging/                        0700
│  ├─ tus/                         0700  未完成上传
│  └─ tus-receipts/                 0700  完成回执（文件 0600）
├─ state.db                        0600  SQLite 管理员凭据与分享规则
├─ state.db-wal / state.db-shm            WAL sidecar
└─ backups/                        0700
   └─ pre-migration-<随机 ID>/      0700  迁移前运行状态快照
```

- SQLite + Drizzle ORM + better-sqlite3，依赖沿用稳定版 Drizzle 0.45.x。
- `shares` 包含 id、kind、target_path、target_dev、target_ino、created_at；target_path 唯一。
- 初始化存储后同步打开数据库，启用 WAL、5000 ms busy timeout，调用 Drizzle migrator，成功后才处理请求。
- 初始化/升级前核对完整迁移历史前缀；未来版本、历史不匹配及未知非空 schema 拒绝启动。数据库与 sidecar 拒绝符号链接。
- 待迁移时先复制整个运行状态到状态根内快照目录，排除旧备份；适配容器 volume 权限。备份失败不迁移，不自动删除备份。
- 升级及回滚必须停机。恢复完整匹配快照，不能混用主库与其他版本的 WAL/SHM。复制恢复或跨文件系统迁移可能改变身份，原链接可能需要重新创建。
- Dockerfile 已复制 `drizzle/` 进运行镜像。当前环境无 Docker/Podman，Alpine 镜像实际构建尚未验证；本机 SQLite 可用，npm 包中存在 linuxmusl-x64 预编译文件。

本地开发 `STATE_DIR=./tmp`；Docker 默认 `/var/lib/sharebox`。未设置时使用平台用户数据目录。

旧 `data/`、`tmp/tus*` 布局必须先停机并执行 `npm run migrate:state -- --dry-run`，核对后执行 `npm run migrate:state`。迁移不创建分享；歧义布局拒绝执行。

## 4. 关键代码

| 位置 | 职责 |
| --- | --- |
| `app/server/db/`、`drizzle/`、`drizzle.config.ts` | schema、初始化、版本检查、备份和迁移 |
| `app/server/shares/store.server.ts` | 分享 CRUD 与文件路径范围的事务更新 |
| `app/server/shares/service.server.ts` | 发布校验、有效状态查询、匿名读取授权 |
| `app/server/shares/file-sync.server.ts` | 文件操作结果与分享同步，失败后保留成功并提醒 |
| `app/server/shares/actions.server.ts` | 分享请求方法、Origin、有界表单与错误映射 |
| `app/server/form.server.ts` | 登录/分享共用的有界 URL 编码表单读取 |
| `app/routes/shares-create.ts`、`shares-revoke.ts`、`share.ts` | 创建/撤销认证边界与匿名附件路由 |
| `app/routes/home.tsx` | 认证后加载文件树和分享状态，组合管理界面 |
| `app/components/shares/` | 分享面板、链接对话框、复制和打开 |
| `app/components/files/FileBrowser.tsx` | 文件行操作与持久的操作反馈 |
| `app/server/remove-action.server.ts`、`rename-action.server.ts` | 文件操作，只返回路径变更，不直接依赖分享模块 |
| `app/server/files/paths.server.ts`、`delivery.server.ts` | 根路径与符号链接校验、句柄身份检查、HEAD/Range/流传输 |
| `app/server/logger.server.ts` | 请求关联和 `/s/[shareId]` 路径脱敏 |

路由：管理员 POST `/shares/create`（path）、`/shares/revoke`（shareId）；匿名 GET/HEAD `/s/:shareId`。分享写表单仅支持 URL 编码且上限 16 KiB。

## 5. 验证

```bash
npm run check
npm run lint
npm run typecheck
npm test
npm run build
```

- 16 个测试文件、206 个测试通过；类型检查和生产构建通过，Biome lint/check 零 warning。
- 覆盖创建幂等、拒绝目录/符号链接、持久化、撤销、替换竞态、HEAD/Range/416、认证/Origin、有效状态、文件/父目录重命名、删除及同步失败。
- 路径范围测试包含 `%`、`_` 和相似前缀，事务失败回滚测试涵盖重命名目标失效记录。
- 数据库覆盖空库、v1→v2、失败回滚、未来版本/历史拒绝、权限、符号链接、备份及无迁移时不重复备份。
- Chrome 隔离测试实例验证创建、复制、重命名后保持链接、外部替换后失效、重新发布、撤销和 390px 对话框布局。
- 在隔离库注入更新失败后，页面仍显示已完成重命名的文件及分享同步提醒，未误报文件操作失败。
- 第一批已用生产构建请求处理器验证登录、创建、匿名下载、HEAD/Range/416、撤销与 404。
- 新认证流程用生产构建验证随机密码登录后直接进入管理页、重启不再输出密码且保留会话、重置后旧会话失效且新密码可用。

## 6. 已知限制与下一步

- 上传仍使用非原子复制：复制期间或进程崩溃后可能留下残缺文件。后续与代下载统一为 staging → 原子提交及可恢复完成记录。
- 路径检查和文件操作之间仍有 TOCTOU 竞态，不能视为针对本机恶意目录修改者的文件系统沙箱。
- SQLite 与文件系统不在同一事务中。同步失败会保留失效记录并提醒人工检查；尚无跨崩溃的文件操作日志与自动修复。
- 管理员删除仍仅支持文件和空目录，不提供递归删除。
- 下一阶段先完善新建目录、移动、上传到指定目录，再实施子目录分享；HTTP/HTTPS 代下载随后推进，需持久化、完整落盘、续传核对与 SSRF 防护。
- 具备容器引擎后补做 Alpine 镜像构建和容器运行验收。

本轮已同步 README、requirements、architecture 和 code-structure；以当前文档描述为准，不再沿用旧公开页行为。
