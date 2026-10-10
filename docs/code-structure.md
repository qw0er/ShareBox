# 代码结构

| 位置 | 职责 |
| --- | --- |
| `app/root.tsx` | HTML 文档、全局主题 Provider、路由出口和错误边界 |
| `app/theme.ts` | MUI 颜色、字体和组件样式默认值 |
| `app/routes/home.tsx` | 管理 loader/action 的会话校验、文件读取与操作入口、组件组合 |
| `app/routes/login.tsx`、`app/routes/logout.ts` | 登录表单、登录/退出 action 和跳转 |
| `app/server/auth.server.ts` | 签名 Cookie 会话、认证守卫、登录限流和认证日志 |
| `app/server/auth-config.server.ts` | 管理员凭据与会话签名配置校验 |
| `app/server/password.server.ts` | scrypt 密码哈希生成与验证 |
| `app/server/login-form.server.ts` | 有界的登录表单读取 |
| `scripts/hash-password.mjs` | 隐藏密码输入，输出密码哈希与随机签名密钥 |
| `app/components/layout/WorkspaceLayout.tsx` | 工作区页头、标题和双栏布局 |
| `app/components/feedback/GlobalErrorDialog.tsx` | 未捕获路由异常的全局弹窗与恢复入口 |
| `app/components/files/FileBrowser.tsx` | 管理目录导航和文件操作入口 |
| `app/components/files/DirectoryBrowser.tsx` | 管理页与公开页共用的面包屑、筛选、排序、刷新和空状态 |
| `app/components/files/FileEntryRow.tsx` | 共用文件条目内容和条状样式 |
| `app/components/files/DeleteFileButton.tsx` | 删除确认、提交状态和错误反馈 |
| `app/components/upload/UploadPanel.tsx` | 待上传文件、上传请求和结果反馈 |
| `app/components/upload/upload-queue.ts` | tus 客户端、进度、暂停恢复、删除、浏览器任务持久化和并发限制 |
| `app/routes/uploads.ts` | 同源 tus 资源路由 |
| `app/server/tus.server.ts` | UploadService 管理 tus 状态、共享锁、完成/恢复流程及清理生命周期；类外纯函数负责校验和转换，无实例状态的函数负责目录准备、文件复制与回执读写 |
| `app/components/upload/UploadDropzone.tsx` | 本地多文件选择和拖放 |
| `app/server/file-actions.server.ts` | 删除 action 的请求方法、来源、表单解析和 intent 分发 |
| `app/server/remove-action.server.ts` | 删除 action 的字段校验、文件操作、日志和错误映射 |
| `app/server/action-types.server.ts` | 各文件 action 共用的上下文和返回类型 |
| `app/server/read-files.server.ts` | 递归读取管理目录数据 |
| `app/server/config.server.ts` | 状态根目录、上传限额与来源配置及启动检查 |
| `app/server/storage.server.ts` | 创建和校验状态根目录及内部目录，保护私有目录权限并记录初始化日志 |
| `app/server/logger.server.ts` | Pino 服务端日志实例，直接写入标准输出 |
| `app/test/*.test.ts` | 会话、认证入口、文件系统、上传和客户端队列测试 |
| `app/types/files.ts` | 前后端共享的文件节点类型 |
| `app/utils/file-format.ts` | 文件大小格式化 |
| `packages/Dockerfile` | 多阶段构建应用，在 Alpine 中安装生产依赖并以非 root 用户运行 |
| `packages/server.mjs` | 加载生产构建，使用运行时 USER_URL 覆盖 React Router 允许的 action 来源 |
| `.dockerignore` | 限制项目根目录中的 Docker 构建输入 |

页面数据由 loader 提供；上传通过 tus 资源路由，发布成功后主动重新验证 loader；删除公开文件通过 fetcher 调用 action。展示组件不直接访问文件系统，上传组件也不依赖文件树的展示组件。`app/test/tus.server.test.ts` 覆盖续传、重启、中断、自动发布、复制失败与响应丢失恢复、并发删除/清理、冲突、过期及初始化重试，`app/test/upload-queue.test.ts` 覆盖客户端进度和任务控制。

管理页按目录逐级浏览，列表主区域与下载链接、重命名、删除操作分开，避免操作按钮触发目录导航。

部署示例位于根目录 `Caddyfile.example`；Caddy 提供 HTTPS 与代理，管理端认证由应用的 auth.server.ts 和登录/退出路由处理。
