# 代码结构

| 位置 | 职责 |
| --- | --- |
| `app/root.tsx` | HTML 文档、全局主题 Provider、路由出口和错误边界 |
| `app/theme.ts` | MUI 颜色、字体和组件样式默认值 |
| `app/routes/home.tsx` | 页面 loader/action 入口和组件组合 |
| `app/components/layout/WorkspaceLayout.tsx` | 工作区页头、标题和双栏布局 |
| `app/components/feedback/GlobalErrorDialog.tsx` | 未捕获路由异常的全局弹窗与恢复入口 |
| `app/components/files/FileBrowser.tsx` | 文件浏览卡片、统计、刷新和空状态 |
| `app/components/files/FileTree.tsx` | MUI 树视图的展开行为和样式 |
| `app/components/files/FileTreeItem.tsx` | 递归生成目录、文件和空目录节点 |
| `app/components/files/FileItemLabel.tsx` | 文件图标、名称、大小及操作入口 |
| `app/components/files/DeleteFileButton.tsx` | 删除确认、提交状态和错误反馈 |
| `app/components/upload/UploadPanel.tsx` | 待上传文件、上传请求和结果反馈 |
| `app/components/upload/upload-queue.ts` | tus 客户端、进度、暂停恢复、删除、浏览器任务持久化和并发限制 |
| `app/routes/uploads.ts` | 同源 tus 资源路由 |
| `app/server/tus.server.ts` | UploadService 管理 tus 状态、共享锁、完成/恢复流程及清理生命周期；类外纯函数负责校验和转换，无实例状态的函数负责目录准备、文件复制与回执读写 |
| `app/components/upload/UploadDropzone.tsx` | 本地多文件选择和拖放 |
| `app/server/file-actions.server.ts` | 删除 action 的请求方法、来源、表单解析和 intent 分发 |
| `app/server/remove-action.server.ts` | 删除 action 的字段校验、文件操作、日志和错误映射 |
| `app/server/action-types.server.ts` | 各文件 action 共用的上下文和返回类型 |
| `app/server/core.server.ts` | 文件树读取和受目录边界约束的删除操作 |
| `app/server/config.server.ts` | 存储目录、临时目录、上传限额与来源配置及启动检查 |
| `app/server/logger.server.ts` | Pino 服务端日志实例，直接写入标准输出 |
| `app/server/*.test.ts` | 文件系统核心与 action 的服务端测试 |
| `app/types/files.ts` | 前后端共享的文件节点类型 |
| `app/utils/file-format.ts` | 文件大小格式化 |
| `scripts/build_source.sh` | 构建、校验并生成生产发布包 |
| `scripts/deploy_server.sh` | 在 Linux 服务器创建隔离用户、替换程序并管理 systemd 服务 |

页面数据由 loader 提供；上传通过 tus 资源路由，发布成功后主动重新验证 loader；删除公开文件通过 fetcher 调用 action。旧 multipart 上传服务保留兼容。展示组件不直接访问文件系统，上传组件也不依赖文件树的展示组件。`app/test/tus.server.test.ts` 覆盖续传、重启、中断、自动发布、复制失败与响应丢失恢复、并发删除/清理、冲突、过期及初始化重试，`app/test/upload-queue.test.ts` 覆盖客户端进度和任务控制。

文件树使用 `expansionTrigger="content"`，目录名称、图标和行内空白都能展开/收起。删除入口阻止鼠标和键盘事件向树节点冒泡，避免确认删除时意外切换目录展开状态。

部署示例位于根目录 `Caddyfile.example`；管理端认证与公开文件服务独立配置。
