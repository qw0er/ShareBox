# ShareBox 交接文档

> 更新日期：2026-10-26  
> 分支：`next`  
> 基线提交：`80937e5 change public behavior`  
> 工作区：新增本文档；`docs/architecture.md` 有少量措辞修订，尚未提交  
> 运行环境：Node.js `v24.22.0`、npm `12.2.1`

> 交接前建议先提交本文档和 `docs/architecture.md` 的修订，避免工作区改动丢失：  
> `git add docs && git commit -m "docs: add handover notes"`

## 1. 项目定位

ShareBox 是个人服务器上的统一文件中转、管理与分发平台，目标覆盖三个场景：

| 场景 | 目标能力 |
| --- | --- |
| 跨设备传递 | 管理员在设备 A 上传，在设备 B 登录后下载 |
| 对外分享 | 将单个文件或目录显式发布为匿名可访问链接 |
| 服务器代下载 | 从 HTTP/HTTPS 获取文件并保存到私有文件空间 |

产品保持单服务器、单管理员、模块化单体，不引入多租户、独立 API 服务或下载 Worker。

## 2. 当前状态

| 项目 | 状态 |
| --- | --- |
| 私有文件空间 | 已完成 |
| 管理端私有下载 | 已完成 |
| 旧 `/public` 匿名入口 | 已删除，默认 404 |
| 上传落盘到私有空间 | 已完成 |
| 旧公开布局迁移脚本 | 已完成 |
| 单文件分享链接 | 未开始（Step 2） |
| 目录发布 | 未开始，已确认暂不实现 |
| 数据库 / SQLite / Drizzle | 未引入，Step 2 开始 |
| HTTP/HTTPS 代下载 | 未开始 |
| 反向代理/Caddy 文档 | 已移除 |

### 2.1 已完成的行为

- 所有文件存放在 `STATE_DIR/files/`，默认私有。
- 管理员通过 `/download?path=...` 下载文件，支持 `HEAD` 和单段 `Range`。
- 浏览器管理页的文件行和操作区都有下载入口。
- 上传使用 tus，暂存在 `STATE_DIR/staging/tus/`，完成后复制到 `files/`。
- 上传完成回执在 `STATE_DIR/staging/tus-receipts/`，保留 7 天。
- `/public`、公开页组件、公开下载链接生成功能全部删除。
- 未登录访问 `/` 跳转 `/login`；匿名访问 `/download` 和 `/uploads` 返回 401。
- 重命名现在拒绝已存在的目标名称，避免 `fs.rename` 静默覆盖。
- `STATE_DIR`、`files/`、`staging/` 及 `staging/tus*` 权限为 `0700`。
- 旧布局检测：存在 `data/` 或 `tmp/tus*` 而新布局不存在时拒绝启动，提示运行迁移脚本。

### 2.2 当前验证结果

在提交 `80937e5` 上验证：

- `npm test`：12 个测试文件、168 个测试通过。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm run lint` / `npm run check`：退出码 0；仓库仍有 30 条既有 warning，新文件无新增诊断。
- 端到端手工验证：匿名 `/` 302、`/public` 404、`/download` 401；登录后下载 200、Range 206、HEAD 200、路径穿越 400。
- 本地 `./tmp` 已迁移为 `tmp/files/` + `tmp/staging/`，文件内容未改。

## 3. 仓库结构（关键文件）

| 位置 | 职责 |
| --- | --- |
| `app/routes/home.tsx` | 管理页 loader、私有文件树、上传面板 |
| `app/routes/download.ts` | 管理员私有下载资源路由 |
| `app/routes/files-remove.ts` / `files-rename.ts` | 删除/重命名资源路由 |
| `app/routes/uploads.ts` | tus 资源路由 |
| `app/server/files/paths.server.ts` | 唯一的相对路径、根目录、符号链接校验 |
| `app/server/files/repository.server.ts` | 递归读取私有文件树 |
| `app/server/files/delivery.server.ts` | HEAD/Range/流式下载与错误映射 |
| `app/server/storage.server.ts` | `files/`、`staging/` 布局、权限、旧布局检测 |
| `app/server/tus.server.ts` | tus 生命周期、暂存、落盘、回执、清理 |
| `app/server/remove-action.server.ts` | 删除逻辑 |
| `app/server/rename-action.server.ts` | 重命名、同名冲突检查 |
| `scripts/migrate-state.mjs` | `data/`、`tmp/tus*` 到新布局的迁移 |
| `docs/requirements.md` | 产品需求；第 2 节尚未同步当前实现 |
| `docs/architecture.md` | 架构；当前版本已同步私有布局，目标章节保留 |
| `docs/code-structure.md` | 当前代码结构 |
| `README.md` | 部署、配置、迁移、使用说明 |

## 4. 磁盘布局

```text
STATE_DIR/                    0700
├─ files/                     0700   私有文件内容
│  └─ <文件、目录>
└─ staging/                   0700
   ├─ tus/                    0700   未完成上传 + tus JSON 元数据
   └─ tus-receipts/           0700   完成回执，文件 0600
```

`STATE_DIR` 的默认值：

- 本地开发：`./tmp`（`npm run dev` 固定使用）
- Docker：`/var/lib/sharebox`
- 未设置时：`platformdirs.userDataDir("sharebox", false)`

### 4.1 迁移

旧版本布局是 `data/` + `tmp/tus*`。迁移脚本只做重命名：

```bash
# 本地
STATE_DIR=./tmp npm run migrate:state -- --dry-run
STATE_DIR=./tmp npm run migrate:state

# Docker：先 docker compose stop
docker run --rm -v sharebox-state:/var/lib/sharebox ghcr.io/qw0er/sharebox:latest \
  node scripts/migrate-state.mjs
```

迁移不会自动创建分享。`data/` 与 `files/` 同时存在、或 `staging/tus` 与 `tmp/tus` 同时存在时，脚本会拒绝执行。

## 5. 运行与检查

```bash
npm ci

set -a
. ./sharebox.env
set +a

STATE_DIR=./tmp npm run dev
```

检查命令：

```bash
npm run lint
npm run check
npm run typecheck
npm test
npm run build
```

生产启动需要 `USER_URL`、管理员凭据和 HTTPS 访问入口；应用自身不监听 TLS。仓库不再提供 Caddy 或反向代理示例。

## 6. 已确定的设计决策

### 6.1 分享范围

1. **先做单文件分享，不做目录发布。**
   - 本期的分享入口是文件级别。
   - 目录发布延后，因为目前没有新建目录、移动、上传到指定目录等目录操作。
2. **根目录文件允许分享。**
   - 当前上传只能到根目录；如果禁止根目录文件分享，大部分文件将无法分享。
3. **`/s/:shareId` 直接返回文件附件。**
   - 不做“先展示文件信息再点下载”的落地页。
   - 支持 `HEAD`、单段 `Range`，方便浏览器、curl 和手机下载。
4. **一个文件路径同时只有一个有效分享链接。**
   - 重复发布返回原链接；失效记录重新发布时替换。
5. **目录发布以后只允许子目录，不允许根目录。**
   - 这条约束待目录操作实现后执行。
6. **不实现文件级权限、密码、有效期、下载次数。**
   - 分享链接本身是不可猜测的 token；撤销即失效。

### 6.2 数据库选型

**已决定：Step 2 引入 SQLite + Drizzle ORM + better-sqlite3。**

不要再用 JSON 存储作为最终方案。JSON 对当前数据量可行，但既然路线图包含代下载任务，提前定型可以避免两套存储实现。

计划依赖：

```text
dependencies:
  better-sqlite3
  drizzle-orm

devDependencies:
  drizzle-kit
  @types/better-sqlite3
```

2026-10-26 核对的版本：

- `drizzle-orm@0.45.4`
- `drizzle-kit@0.31.11`
- `better-sqlite3@13.0.3`
- `@types/better-sqlite3@9.6.0`

选择理由：

- Drizzle 对 `better-sqlite3` 是一等支持，有 `/better-sqlite3/migrator`，不需要自己写 proxy。
- `better-sqlite3@13` 的 npm 包已包含 `prebuilds/linuxmusl-x64.node`，当前 Alpine Docker 不需要额外编译工具或切换基础镜像。
- 同步 API，适合单进程、低频写入的场景。
- 相比 `node:sqlite + sqlite-proxy`，少一层自定义适配；相比 `@libsql/client`，少引入一个数据库引擎。
- 使用稳定版 Drizzle 0.45.x，不使用 1.0 beta。

### 6.3 其他决策

- 保持单实例、单进程；不支持多个应用实例共享同一个 `STATE_DIR`。
- 文件内容永远在文件系统，数据库只保存分享规则和后续任务状态。
- 管理端认证继续使用现有签名 Cookie 会话，不引入用户表。
- 文档中不再描述 Caddy 或反向代理；只保留“部署环境提供 HTTPS 访问入口”的通用表述。
- `USER_URL`、Origin 校验、Secure Cookie 是应用安全边界，不能因为移除反代文档而删除。

## 7. Step 2 实施规格

### 7.1 数据库

路径：`STATE_DIR/state.db`，权限 `0600`。状态根已经是 `0700`。

建议 schema：

```sql
CREATE TABLE shares (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'file',
  target_path TEXT NOT NULL,
  target_dev  TEXT NOT NULL,
  target_ino  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX shares_target_path_idx ON shares (target_path);
```

- `id`：16 字节随机 hex。
- `kind`：当前只写 `file`，为以后目录分享预留；当前访问时仍要求目标为普通文件。
- `target_dev` / `target_ino`：`lstat(..., { bigint: true })` 后转字符串，避免精度丢失。
- `target_path`：相对 `files/` 的 POSIX 路径。
- 一个路径同时只有一个分享记录。

数据库连接要求：

```text
PRAGMA journal_mode = WAL
PRAGMA busy_timeout = 5000
```

启动顺序：

1. 初始化存储布局；
2. 打开 `state.db`；
3. 应用 `drizzle/` 迁移；
4. 迁移成功后才开始处理请求。

迁移前备份整个状态目录；数据库版本高于代码支持版本时拒绝启动。

### 7.2 路由

| 方法/路径 | 认证 | 作用 |
| --- | --- | --- |
| `POST /shares/create` | 管理员 | 为文件创建分享，表单字段 `path` |
| `POST /shares/revoke` | 管理员 | 撤销分享，表单字段 `shareId` |
| `GET/HEAD /s/:shareId` | 匿名 | 直接下载被分享的文件 |
| `GET/HEAD /download?path=...` | 管理员 | 私有下载（已完成） |
| `POST /files/remove` / `POST /files/rename` | 管理员 | 文件操作（已完成） |
| `GET/HEAD /uploads/*` | 管理员 | tus（已完成） |

`/public` 不再存在，访问时由框架默认 404 处理。

### 7.3 创建分享流程

```text
POST /shares/create { path }
→ requireAdmin
→ 校验 POST、Origin、表单
→ resolveEntry(filesDir, path)
→ lstat(bigint)，必须是普通文件，拒绝符号链接/目录
→ 事务：
   - 同路径、同 dev/ino：返回已有 id
   - 同路径、不同身份：删除旧记录，插入新记录
   - 无记录：插入
→ 返回 { success: true, shareId }
```

管理端用 `window.location.origin` 拼出 `https://域名/s/{id}`。

### 7.4 访问分享流程

```text
GET/HEAD /s/:shareId
→ 校验 32 位 hex
→ 查 DB；不存在 → 404
→ 在 files 根下解析 target_path，拒绝符号链接
→ lstat(bigint)：必须是普通文件，dev/ino 与记录一致
→ deliverFile(...)：O_NOFOLLOW、附件、HEAD/Range/416
```

- 缺失、撤销、身份不匹配统一返回 404，不泄露目标是否存在。
- 响应带 `Cache-Control: no-store`、`X-Robots-Tag: noindex, nofollow`。
- 不要在 URL 中增加 `path` 参数；分享只对应一个文件。

### 7.5 分享生命周期

| 操作 | 行为 |
| --- | --- |
| 管理员重命名文件 | 成功后更新 `target_path`，链接继续有效 |
| 管理员重命名父目录 | 更新该目录下所有分享的路径 |
| 管理员删除文件/父目录 | 删除对应分享记录 |
| 服务器上直接移动/替换文件 | 路径找不到或 dev/ino 不匹配 → 失效，不重新绑定 |
| 原地修改文件内容 | inode 不变，链接返回最新内容 |
| 撤销分享 | 删除记录，后续请求立即 404 |
| 重启应用 | 数据库持久化，链接继续有效 |

建议让 `handleRemoveAction` / `handleRenameAction` 返回操作前后的路径，由资源路由调用分享同步；这样文件操作模块不直接依赖分享模块。同步失败只记日志并提示，不把已经完成的文件操作报成失败。

### 7.6 管理端 UI

- 文件行操作：下载、分享/管理分享、重命名、删除。
- 分享按钮：
  - 未分享：确认后创建，弹出链接对话框（复制、打开、取消发布）。
  - 已分享：打开链接对话框。
  - 已失效：提示重新分享，创建时替换旧记录。
- 上传面板下方增加 `SharesPanel`：列出路径、状态（有效/失效）、复制、打开、取消发布。
- 移除旧的按文件生成公开链接逻辑（已随 Step 1 删除）。
- 不添加目录发布按钮。

### 7.7 测试

必须覆盖：

- 创建分享、重复创建幂等、目录/符号链接拒绝、根目录文件允许。
- 撤销后立即 404。
- 未知 id、失效 id、目标被替换 → 404。
- 分享内 `HEAD`、`Range`、416。
- 重命名已分享文件/父目录后链接继续可用。
- 删除文件/父目录后记录清理。
- 重启后持久化。
- 数据库迁移：空库初始化、v1→v2、失败回滚、未来版本拒绝启动。
- 路由：匿名 action 401、Origin 拒绝、分享下载 200/404。

### 7.8 Docker 与迁移

- `drizzle/` 迁移目录必须复制进运行时镜像。
- `better-sqlite3` 在 Alpine 使用包内 `linuxmusl-x64` 预编译文件，预计不需要新增构建工具；实现后仍需实际构建镜像验证。
- `state.db` 位于 volume；备份时停服务，连同 `state.db-wal`、`state.db-shm` 一起复制。
- 旧状态目录仍需先运行 `scripts/migrate-state.mjs`。

## 8. 已知问题与风险

1. **上传落盘仍是复制，不是原子提交。**
   - 复制期间 `files/` 可能出现不完整文件；目前文件私有，只影响管理员。
   - 后续可与代下载一起改成 staging → 原子提交。
2. **路径检查与打开之间存在 TOCTOU 竞态。**
   - 最终组件使用 `O_NOFOLLOW`，逐级检查符号链接，但仍不能作为针对本机恶意目录修改者的文件系统沙箱。
3. **分享 token 可能进入请求日志。**
   - 当前 `withRequestLogging` 记录 URL path。Step 2 应给 `/s/:id` 增加日志路径脱敏（例如记录 `/s/[shareId]` 或 hash 前缀）。
4. **迁移后的子目录权限不递归修改。**
   - 例如 `tmp/files/dist` 仍是 `0755`；外层 `files/` 已是 `0700`，实际访问仍受保护。
5. **需求文档第 2 节仍是旧公开版本。**
   - `docs/requirements.md` 已移除 Caddy/反代相关表述，但“公开页/访客”章节尚未整体改写；Step 2 完成后应同步为“私有 + 单文件分享”。
6. **应用不监听 TLS。**
   - 移除 Caddy 文档后，部署方仍需提供 HTTPS 访问入口；不能直接把明文端口暴露到公网。
7. **数据库尚未安装。**
   - 不要误以为 `state.db` 或 `shares` 表已经存在；Step 2 才引入。
8. **单实例约束。**
   - 文件锁和后续 SQLite 都假定单个 Node 进程；不要横向扩容。

## 9. 文档状态

| 文档 | 状态 |
| --- | --- |
| `README.md` | 已更新为私有布局、私有下载、迁移步骤；已移除 Caddy/反代说明 |
| `docs/code-structure.md` | 已同步 Step 1 结构 |
| `docs/architecture.md` | 当前版本已同步私有布局；Caddy 已移除；目标章节保留 |
| `docs/requirements.md` | 已移除 Caddy/反代；第 2 节需要随 Step 2 重写 |
| `Caddyfile.example` | 已删除 |

## 10. 接手第一步

1. 确认在 `next` 分支、HEAD 为 `80937e5`，工作区干净。
2. 执行 `npm ci`，导入 `sharebox.env`，运行 `npm test`、`npm run typecheck`、`npm run build` 确认基线。
3. 安装数据库依赖：

   ```bash
   npm install drizzle-orm better-sqlite3
   npm install -D drizzle-kit @types/better-sqlite3
   ```

4. 新建 `drizzle.config.ts`、`app/server/db/schema.ts`、`app/server/db/client.server.ts`，生成第一版迁移。
5. 在 `CONFIG` 中增加 `dbPath`，启动时应用迁移。
6. 按第 7 节实现分享 store、`/shares/create`、`/shares/revoke`、`/s/:shareId` 和管理端 UI。
7. 最后更新需求文档、README，并跑完整测试和一次手工端到端验证。

当前最稳妥的交付顺序是：

```text
数据库基础 + shares 表
→ 分享 store / create / revoke
→ /s/:shareId 下载
→ 管理端按钮和分享面板
→ 重命名/删除同步
→ 迁移与文档
```
