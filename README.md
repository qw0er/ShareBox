# ShareBox

ShareBox 定位为个人服务器上的统一文件中转、管理与分发平台，覆盖对外发布文件夹、自己跨设备传递文件和服务器代下载三个场景。

目标是以模块化单体提供统一入口：Sharing 管理公开分享，Transfer 支持设备经服务器上传和下载，Acquisition 管理远程获取。文件保存在统一文件空间中，默认私有，只有显式分享的目录允许匿名访问；分享引用原文件，无需复制一份公开副本。

**当前实现是私有文件空间的基础版本**：网页上传、浏览、重命名和删除文件，管理员可在任意设备登录后下载文件，所有文件默认私有；`/public` 匿名入口已移除。单文件分享链接、目录分享、SQLite 分享规则和 HTTP/HTTPS 代下载待后续实现。产品目标、验收标准和实施顺序见 [项目需求](docs/requirements.md)，实现与目标边界见 [架构设计](docs/architecture.md)。

## 当前版本功能

- **文件管理**：浏览目录树，上传、重命名和删除文件；支持删除空目录，同名文件不覆盖。
- **断点上传**：多文件选择和拖放，显示进度，支持暂停、继续、失败重试和取消；默认每个文件最多 10 GiB，同时上传最多 2 个。
- **私有下载**：管理员点击文件行或下载按钮获取文件，支持 HEAD 和单段 Range；可在另一台设备登录后下载同一文件。
- **访问控制**：同一个 HTTPS 域名，管理页、下载和上传全部要求应用内登录；不再提供匿名公开入口。

面向单服务器和单个管理员凭据。文件系统是文件列表的唯一数据来源，配置、上传暂存和分享元数据不对外公开。详细需求和实现见 [项目需求](docs/requirements.md) 与 [架构设计](docs/architecture.md)。

## 使用方法

部署后，将以下地址中的域名替换为你的站点域名：

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 管理页 | `https://sharebox.example.com/` | 认证后上传、下载、重命名和删除文件 |
| 私有下载 | `https://sharebox.example.com/download?path=...` | 认证后下载单个文件，支持 Range |

在管理页选择或拖入文件，点击“开始全部上传”。暂停后可以继续；刷新页面后需要重新选择原文件才能续传。上传任务保留 7 天，上传完成后自动落入私有文件空间并刷新文件列表。

点击文件行或右侧下载按钮即可下载。目录条目用于进入子目录，面包屑和“返回上级目录”用于导航。当前版本不提供匿名分享链接。

上传只能添加到根目录，暂不支持上传目录或创建目录。删除非空目录会被拒绝。文件写入采用复制，复制期间或进程被强制终止时可能出现不完整文件；下载入口需要应用持续运行。

## 部署方法

预构建镜像仅提供 `linux/amd64`（x86_64）版本。

选择 Docker Compose 或 rootless Podman Quadlet 中的一种。两种方式均使用命名 volume 保存整个状态目录，不需要绑定宿主机数据路径。

容器监听 `8123`，仅发布到宿主机 `127.0.0.1:8123`。生产环境通过 HTTPS 访问，`USER_URL` 必须设置为用户实际访问的主机名。镜像以 UID/GID `1000:1000` 运行。

### 管理员凭据

先生成密码哈希和会话签名密钥。源码使用 Node.js 24 执行：

```bash
npm run auth:hash
```

也可直接使用镜像（尚未配置站点时即可运行）：

```bash
docker run --rm -it --entrypoint node ghcr.io/qw0er/sharebox:latest scripts/hash-password.mjs
# rootless Podman 使用 podman run 的同样参数。
```

命令隐藏密码输入，要求输入两次，输出 `ADMIN_PASSWORD_HASH` 和随机 `SESSION_SECRET`。将输出与 `ADMIN_USERNAME=admin` 保存到私有配置文件，保留哈希两侧的单引号；不保存明文密码，不将文件放入公开数据目录或提交到 Git。

Docker Compose 将文件保存为部署目录的 `sharebox.env`；Quadlet 保存为独立用户的 `~/.config/sharebox/auth.env`。设置文件权限为 `0600`，Quadlet 配置目录为 `0700`。三个配置项必须同时提供；生产环境缺少或无效时拒绝启动，本地开发缺少时也不能访问管理功能。

登录入口为 `/login`，登录成功后返回管理页。会话固定有效 7 天，刷新及重启不会使会话失效；修改用户名、密码哈希或签名密钥并重启会使旧会话失效。退出通过管理页右上角按钮清除当前浏览器 Cookie。会话无需数据库，退出不能撤销已经复制到其他设备的 Cookie。

单实例在 15 分钟内最多允许 10 次登录尝试，成功登录后重置计数；这是进程内共享限流，重启清空。上传遇到登录过期会停止重试并保留任务，重新登录后选择原文件继续上传。

### Docker Compose

安装 Docker Engine 和 Compose 插件，在部署目录创建 `compose.yaml`，替换 `USER_URL`：

```yaml
services:
  sharebox:
    image: ghcr.io/qw0er/sharebox:latest
    restart: unless-stopped
    init: true
    env_file:
      - ./sharebox.env
    environment:
      USER_URL: sharebox.example.com
    ports:
      - "127.0.0.1:8123:8123"
    volumes:
      - sharebox-state:/var/lib/sharebox

volumes:
  sharebox-state:
    name: sharebox-state
```

启动并查看日志：

```bash
docker compose config
docker compose up -d
docker compose ps
docker compose logs --tail 100 -f
```

`sharebox-state` 由 Docker 管理，容器首次挂载时使用镜像目录初始化。应用在 volume 中创建私有的 `files/` 和 `staging/` 目录。删除或重建容器不会删除命名 volume。[Docker Compose volume 文档](https://docs.docker.com/reference/compose-file/volumes/)

更新镜像：

```bash
docker compose pull
docker compose up -d
```

停止服务使用 `docker compose down`；需要保留数据时不要加 `--volumes` 或手动删除 `sharebox-state`。更新前停止服务并备份 volume，回滚时将 `image` 改为保留的版本标签后重新启动。

### Podman Quadlet（rootless，独立用户）

安装支持 Quadlet 的 Podman，系统需要使用 cgroup v2。创建专门运行 ShareBox 的普通用户，不使用 root 的容器存储或用户服务。

以下命令由有 sudo 权限的管理员执行：

```bash
sudo useradd --create-home --shell /bin/bash sharebox
sudo loginctl enable-linger sharebox
sudo systemctl start "user@$(id -u sharebox).service"
```

确认 `/etc/subuid` 和 `/etc/subgid` 中均有 `sharebox` 的映射；没有时，为该用户分配至少 65536 个不与其他用户重叠的 subordinate UID/GID。不要将该用户加入 sudo 组。

切换到独立用户，设置用户服务连接环境：

```bash
sudo -iu sharebox
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
mkdir -p ~/.config/containers/systemd
```

后续 `podman`、`systemctl --user` 和 `journalctl --user` 命令均在这个用户的终端中执行，不加 sudo。

创建 `~/.config/containers/systemd/sharebox-state.volume`：

```ini
[Volume]
VolumeName=sharebox-state
```

创建 `~/.config/containers/systemd/sharebox.container`，替换 `USER_URL`：

```ini
[Unit]
Description=ShareBox

[Container]
Image=ghcr.io/qw0er/sharebox:latest
ContainerName=sharebox
UserNS=keep-id:uid=1000,gid=1000
User=1000:1000
Environment=USER_URL=sharebox.example.com
EnvironmentFile=%h/.config/sharebox/auth.env
PublishPort=127.0.0.1:8123:8123
Volume=sharebox-state.volume:/var/lib/sharebox:U
RunInit=true
LogDriver=journald

[Service]
Restart=on-failure
TimeoutStartSec=900

[Install]
WantedBy=default.target
```

Quadlet 自动创建 `sharebox-state` 命名 volume 并建立启动依赖。`keep-id` 将宿主机独立用户映射到容器的 `1000:1000`，挂载选项 `:U` 将 volume 内文件所有者调整为容器运行用户。数据由该用户的 Podman 存储管理，无需手动设置宿主机目录权限。

加载并启动：

```bash
systemctl --user daemon-reload
systemctl --user start sharebox.service
systemctl --user status sharebox.service
journalctl --user -u sharebox.service -n 100 --no-pager
```

`WantedBy=default.target` 与 linger 负责开机启动，不需要对生成的服务执行 `systemctl --user enable`。修改 Quadlet 文件后重新执行 `daemon-reload` 和 `restart`。[Podman Quadlet 文档](https://docs.podman.io/en/stable/markdown/podman-systemd.unit.5.html)

更新镜像：

```bash
podman pull ghcr.io/qw0er/sharebox:latest
systemctl --user restart sharebox.service
```

停止服务使用 `systemctl --user stop sharebox.service`。更新前停止服务并备份 `sharebox-state` volume；回滚时修改 Quadlet 的 `Image` 为保留的版本标签，再重新加载和启动。命名 volume 属于独立用户，其他用户或 root 的 `podman` 命令不会操作同一份存储。

### 访问验证

应用监听 `8123`；生产环境通过 HTTPS 访问，并将 `USER_URL` 设为用户实际访问的主机名。验证入口：

```bash
curl -I https://sharebox.example.com/
curl -I 'https://sharebox.example.com/download?path=missing.txt'
curl -I https://sharebox.example.com/public
curl -I https://sharebox.example.com/uploads
```

匿名管理页跳转 `/login`，匿名下载和上传返回 `401`，`/public` 返回 `404`。浏览器登录后验证上传、下载、重命名、删除和退出。

### 配置项

Compose 在 `environment` 下配置，Quadlet 使用 `[Container]` 下的 `Environment=`。应用直接读取进程环境变量，不主动加载 `.env` 文件。

| 配置 | 说明 |
| --- | --- |
| `USER_URL` | 生产环境必填，站点主机名，可包含端口，不含协议或路径 |
| `STATE_DIR` | 状态根目录，程序维护其中的 `files/` 和 `staging/`；镜像默认 `/var/lib/sharebox`，与 volume 挂载目标一致 |
| `MAX_UPLOAD_BYTES` | 单文件大小上限，默认 `10737418240`（10 GiB），必须为正安全整数 |
| `LOGGER_LEVEL` | 日志阈值，默认 `info`；支持 `trace`、`debug`、`info`、`warn`、`error`、`fatal`、`silent` |
| `ADMIN_USERNAME` | 管理员用户名 |
| `ADMIN_PASSWORD_HASH` | `npm run auth:hash` 生成的带盐 scrypt 哈希 |
| `SESSION_SECRET` | 随机签名密钥，至少 32 字节；跨重启保持一致 |

同一个状态 volume 只供一个应用实例使用。状态根目录包含 `files/`（私有文件）和 `staging/`（上传暂存），两者权限均为 `0700`。旧的 `DATA_DIR`、`UPLOAD_TMP_DIR` 已被忽略。

### 从旧公开布局迁移

旧版本的 `data/` 是公开根目录，`tmp/tus*` 保存上传暂存。升级到本版本前必须停止应用并迁移：

```bash
# 本地开发：先预览，再执行
STATE_DIR=./tmp npm run migrate:state -- --dry-run
STATE_DIR=./tmp npm run migrate:state

# Docker Compose：先 docker compose stop
docker run --rm -v sharebox-state:/var/lib/sharebox ghcr.io/qw0er/sharebox:latest \
  node scripts/migrate-state.mjs
```

迁移会把 `data/` 改名为 `files/`、`tmp/tus*` 改名为 `staging/tus*`，不会创建任何分享；迁移后所有文件默认私有。脚本拒绝 `data/` 与 `files/` 同时存在的歧义布局。升级前请停止服务并备份整个状态 volume。

## 源码构建

使用 Node.js 24 和 npm：

```bash
git clone https://github.com/qw0er/ShareBox.git
cd ShareBox
npm ci
```

本地开发前按上文生成凭据，并保存到私有的 `sharebox.env`，再导入环境：

```bash
set -a
. ./sharebox.env
set +a
npm run dev
```

打开终端显示的本地地址，管理页为 `/`。开发数据存放在项目 `tmp/` 下的 `files/` 和 `staging/`；如果启动时提示 legacy storage layout，先按上文迁移 `./tmp`。开发日志通过 `pino-pretty` 管道美化；本地开发也使用应用登录，HTTP 开发 Cookie 不带 Secure。

检查和构建：

```bash
npm run lint
npm run check
npm run typecheck
npm test
npm run build
```

`npm run check` 会自动整理格式和导入。构建产物输出到 `build/client` 与 `build/server`。

运行生产构建：

```bash
USER_URL=sharebox.example.com STATE_DIR=./tmp HOST=127.0.0.1 PORT=8123 npm start
```

生产启动输出 JSON 日志，需要提前导入管理员凭据，并由部署环境提供 HTTPS 访问入口。

从源码构建容器镜像：

```bash
docker build -f packages/Dockerfile -t sharebox:local .
# 使用 Podman 时执行：
podman build -f packages/Dockerfile -t localhost/sharebox:local .
```

构建后，将 Compose 的 `image` 改为 `sharebox:local`，或将 Quadlet 的 `Image` 改为 `localhost/sharebox:local`。rootless Podman 镜像应由运行服务的独立用户构建或导入。

### 日志排查

日志写入标准输出；生产环境保留 Pino JSON，开发环境由 `pino-pretty` 美化。用 `LOGGER_LEVEL=debug npm run dev` 查看流程细节，`trace` 还会记录上传锁等待，排查后建议恢复 `info`。

- `info`：配置与存储初始化、路由操作结果、登录登出、重命名和删除、上传落盘与过期清理、下载流开始与结束。
- `warn`：认证失败、无效输入、资源不存在、上传冲突等预期的请求拒绝。
- `error`：存储权限、读写故障、上传落盘或清理失败等需要排查的异常；`fatal` 表示阻止启动的配置错误。
- `debug` / `trace`：请求开始、上传偏移与完成凭据恢复、清理扫描、下载取消、上传锁等详细过程。

应用路由的日志包含 `requestId`、`method`、`path`，结果日志包含 `status` 和 `durationMs`；按 `requestId` 关联同一次路由调用的日志，按 `uploadId` 追踪跨请求上传。路由结果表示数据或响应已准备好，下载流结束表示服务端已读完文件，不代表客户端已保存。未登录页面跳转按正常重定向记录；主动取消的下载按 `debug` 记录。

不记录请求正文、查询字符串或密码，常见 Cookie、Authorization 和密钥字段会脱敏。详细错误留在服务端日志，界面展示中文原因和可执行的恢复步骤。
