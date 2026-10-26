# 代码结构

| 位置 | 职责 |
| --- | --- |
| `app/root.tsx` | HTML 文档、全局主题 Provider、路由出口和错误边界 |
| `app/theme.ts` | MUI 颜色、字体和组件样式默认值 |
| `app/routes/home.tsx` | 管理页 loader 的会话校验、私有文件树读取、组件组合和缓存控制 |
| `app/routes/shares-create.ts`、`shares-revoke.ts`、`share.ts` | 单文件分享创建、撤销和匿名附件下载 |
| `app/server/db/`、`drizzle/`、`drizzle.config.ts` | 分享 schema、数据库初始化、备份与版本检查、Drizzle SQL 迁移 |
| `app/server/shares/` | 分享记录事务、文件身份校验、有界表单与分享请求处理 |
| `app/routes/download.ts` | 管理员私有下载资源路由，支持 GET/HEAD 和 Range |
| `app/routes/login.tsx`、`app/routes/logout.ts` | 登录表单、登录/退出 action 和跳转 |
| `app/routes/files-remove.ts`、`app/routes/files-rename.ts` | 删除、重命名的同源资源路由 |
| `app/routes/uploads.ts` | 同源 tus 资源路由 |
| `app/server/files/paths.server.ts` | 唯一的相对路径、根目录和符号链接校验 |
| `app/server/files/repository.server.ts` | 递归读取私有文件树，忽略符号链接和特殊文件 |
| `app/server/files/delivery.server.ts` | 文件下载的 Range、响应头、流式传输和错误映射 |
| `app/server/storage.server.ts` | 创建并校验 `files/`、`staging/` 布局，检测旧公开布局并拒绝启动 |
| `app/server/auth.server.ts` | 签名 Cookie 会话、认证守卫、登录限流和认证日志 |
| `app/server/administrator.server.ts` | 单例管理员初始化、持久化、一次性密码输出与重置 |
| `app/server/password.server.ts` | scrypt 密码哈希生成与验证 |
| `app/server/form.server.ts`、`login-form.server.ts` | 登录与分享共用的有界 URL 编码表单读取，保留登录接口导出 |
| `app/server/config.server.ts` | 状态根目录、上传限额与来源配置及启动检查 |
| `app/server/logger.server.ts` | Pino 服务端日志实例，直接写入标准输出 |
| `app/server/file-actions.server.ts` | 文件操作资源路由共用的请求方法、来源、表单解析和上下文准备 |
| `app/server/remove-action.server.ts` | 删除操作的字段校验、文件操作、日志和错误映射 |
| `app/server/rename-action.server.ts` | 重命名操作的字段校验、同名冲突检查、文件操作和错误映射 |
| `app/server/action-types.server.ts` | 各文件 action 共用的上下文和返回类型 |
| `app/server/tus.server.ts` | UploadService 管理 tus 状态、共享锁、完成/恢复流程及清理生命周期；上传完成后复制到 `files/` |
| `app/server/utils.server.ts` | ENOENT 等错误判断 |
| `app/components/layout/WorkspaceLayout.tsx` | 管理页页头、标题和双栏布局 |
| `app/components/feedback/GlobalErrorDialog.tsx` | 未捕获路由异常的全局弹窗与恢复入口 |
| `app/components/files/FileBrowser.tsx` | 管理目录导航、文件下载、重命名和删除入口 |
| `app/components/files/DirectoryBrowser.tsx` | 管理页共用的面包屑、筛选、排序、刷新和空状态 |
| `app/components/files/FileEntryRow.tsx` | 文件条目内容和条状样式 |
| `app/components/files/DeleteFileDialog.tsx` | 删除确认、提交状态和错误反馈 |
| `app/components/files/RenameDialog.tsx` | 重命名对话框、提交状态和错误反馈 |
| `app/components/upload/UploadPanel.tsx` | 待上传文件、上传请求和结果反馈 |
| `app/components/upload/upload-queue.ts` | tus 客户端、进度、暂停恢复、删除、浏览器任务持久化和并发限制 |
| `app/components/upload/UploadDropzone.tsx` | 本地多文件选择和拖放 |
| `app/utils/download-links.ts` | 生成编码后的管理员下载地址 |
| `app/utils/file-format.ts` | 文件大小格式化 |
| `app/types/files.ts` | 前后端共享的文件节点类型 |
| `scripts/reset-password.mjs` | 停机后重置现有管理员随机密码并轮换会话密钥 |
| `scripts/migrate-state.mjs` | 将旧 `data/`、`tmp/tus*` 迁移为私有 `files/`、`staging/tus*`，支持 `--dry-run` |
| `packages/Dockerfile` | 多阶段构建应用，在 Alpine 中安装生产依赖并以非 root 用户运行 |
| `packages/server.mjs` | 加载生产构建，使用运行时 USER_URL 覆盖 React Router 允许的 action 来源 |
| `.dockerignore` | 限制项目根目录中的 Docker 构建输入 |

页面数据由 loader 提供，管理页只读取 `files/` 下的私有文件树。删除和重命名通过 fetcher 调用各自的资源路由 action；下载通过独立资源路由返回附件，支持 HEAD 和单段 Range。展示组件不直接访问文件系统，上传组件也不依赖文件树的展示组件。

`app/test/` 覆盖路径校验、私有下载、认证入口、文件操作、上传暂存与恢复、配置与迁移脚本。旧 `/public` 匿名入口已删除，访问时由框架默认 404 处理。

数据库与分享测试覆盖 schema 初始化/升级/回滚/未来版本拒绝、分享持久化、撤销、身份替换竞态、HEAD/Range 以及认证与 Origin 边界。分享界面与文件操作联动已接入；资源路由在文件操作成功后更新路径或清理规则，失败时保留成功结果并返回提醒。

`app/components/shares/` 包含分享列表、共用链接对话框和复制/打开操作；`app/server/shares/file-sync.server.ts` 负责文件操作结果与分享 store 的协调。重命名和删除对话框由 FileBrowser 托管，避免行卸载导致同步提醒丢失。
