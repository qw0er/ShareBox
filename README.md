# ShareBox

## 软件介绍与功能

ShareBox 是部署在个人服务器上的轻量文件管理与分享工具，使用 React Router、React、MUI、Node.js 和本地文件系统，无需数据库。

- **文件管理**：浏览目录树，上传、重命名和删除文件；支持删除空目录，同名文件不覆盖。
- **断点上传**：多文件选择和拖放，显示进度，支持暂停、继续、失败重试和取消；默认每个文件最多 10 GiB，同时上传最多 2 个。
- **公开下载**：在 `/public` 浏览目录，按名称筛选、排序和刷新；点击文件整行下载，点击目录整行查看。
- **下载链接**：管理页提供公开页入口，可为文件生成并复制完整下载地址；下载支持 HEAD 和单段 Range。
- **访问控制**：同一个 HTTPS 域名，管理端由 Caddy Basic Auth 保护，公开页和下载入口无需认证。

面向单服务器和单个管理员凭据。文件系统是文件列表的唯一数据来源，配置与临时上传数据不对外公开。详细需求和实现见 [项目需求](docs/requirements.md) 与 [架构设计](docs/architecture.md)。

## 使用方法

部署后，将以下地址中的域名替换为你的站点域名：

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 管理页 | `https://sharebox.example.com/` | 认证后上传、重命名、删除文件和生成下载链接 |
| 公开页 | `https://sharebox.example.com/public` | 匿名浏览和下载文件 |

在管理页选择或拖入文件，点击“开始全部上传”。暂停后可以继续；刷新页面后需要重新选择原文件才能续传。上传任务保留 7 天，上传完成后自动发布并刷新文件列表。

点击文件旁的“生成下载链接”，可查看并复制该文件的公开下载地址。访客也可以通过公开页找到文件并点击整行下载。目录条目用于进入子目录，面包屑和“返回上级目录”用于导航。

上传只能添加到根目录，暂不支持上传目录或创建目录。删除非空目录会被拒绝。文件发布采用复制，复制期间或进程被强制终止时可能出现不完整文件；公开页和下载入口需要应用持续运行。

## 部署方法

选择 Docker Compose 或 rootless Podman Quadlet 中的一种。两种方式均使用命名 volume 保存整个状态目录，不需要绑定宿主机数据路径。

容器监听 `8123`，仅发布到宿主机 `127.0.0.1:8123`。在宿主机安装 Caddy，配置域名 DNS 指向服务器，并开放 HTTP/HTTPS 端口。镜像以 UID/GID `1000:1000` 运行。

### Docker Compose

安装 Docker Engine 和 Compose 插件，在部署目录创建 `compose.yaml`，替换 `USER_URL`：

```yaml
services:
  sharebox:
    image: ghcr.io/qw0er/sharebox:latest
    restart: unless-stopped
    init: true
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

`sharebox-state` 由 Docker 管理，容器首次挂载时使用镜像目录初始化。应用在 volume 中创建 `data/` 和私有 `tmp/` 目录。删除或重建容器不会删除命名 volume。[Docker Compose volume 文档](https://docs.docker.com/reference/compose-file/volumes/)

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

### Caddy：HTTPS、反向代理与管理认证

Docker Compose 和 Podman Quadlet 共用这套配置：Caddy 在宿主机上运行，应用容器只向本机发布 `8123` 端口。Caddy 负责 HTTPS 和管理认证，文件由应用读取，不需要给 Caddy 挂载数据 volume。

**安装与准备**

按 [Caddy 官方安装说明](https://caddyserver.com/docs/install) 安装对应发行版的软件包，使用随包提供的 `caddy.service` 管理服务。

- 将域名的 A 记录指向服务器；配置了 AAAA 记录时，IPv6 地址也必须可达。
- 在服务器防火墙、云安全组和路由器转发中开放 TCP `80`、`443`，并确保没有其他服务占用这两个端口。
- 保持应用端口只绑定 `127.0.0.1:8123`，通过 Caddy 访问站点。
- 将 Compose 或 Quadlet 的 `USER_URL` 设置为相同主机名，例如 `sharebox.example.com`，不带协议和路径。

以下配置使用真实域名时，Caddy 自动申请和续期证书，并将 HTTP 重定向到 HTTPS。[自动 HTTPS 说明](https://caddyserver.com/docs/automatic-https)

**配置站点**

生成管理员密码哈希，按提示输入密码：

```bash
caddy hash-password
```

将下面的配置保存到 `/etc/caddy/Caddyfile`，替换域名、管理员用户名 `admin` 和 `REPLACE_WITH_CADDY_PASSWORD_HASH`。已有其他站点时，将这个站点块加入现有配置。仓库中的 [Caddyfile.example](Caddyfile.example) 提供相同示例。

```caddyfile
# Replace the domain, username, and password hash before use.
# Generate the hash with: caddy hash-password
# Runtime USER_URL must match sharebox.example.com.
sharebox.example.com {
	# Public page, Framework loader requests, downloads and page assets.
	@public_app path /public /public/* /public.data /assets/* /__manifest /favicon.ico /favicon.svg
	handle @public_app {
		reverse_proxy 127.0.0.1:8123
	}

	# Authenticate all remaining routes, including the management loader and uploads.
	handle {
		basic_auth {
			admin REPLACE_WITH_CADDY_PASSWORD_HASH
		}
		reverse_proxy 127.0.0.1:8123
	}
}
```

公开路由单独代理，剩余请求先执行 Basic Auth 再代理到应用：

| 路由 | 访问方式 |
| --- | --- |
| `/public`、`/public.data` | 匿名浏览公开页和读取目录数据 |
| `/public/download` | 匿名下载文件 |
| `/assets/*`、`/__manifest`、图标 | 匿名加载页面资源和路由信息 |
| `/`、`/index.data`、`/uploads` 及其他路由 | 必须提供管理员凭据 |

浏览器访问管理页时显示原生用户名和密码提示。应用没有单独的登录页；管理员密码只在 Caddy 中维护，配置保存哈希，不保存明文。[Basic Auth 说明](https://caddyserver.com/docs/caddyfile/directives/basic_auth)

**加载与验证**

首次启动：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
```

服务已经运行时，修改配置后先验证再加载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

检查后端、公开页与管理认证：

```bash
curl -I http://127.0.0.1:8123/public
curl -I https://sharebox.example.com/public
curl -I https://sharebox.example.com/
curl -I https://sharebox.example.com/index.data
curl -I https://sharebox.example.com/uploads
```

正常情况下前两项返回 `200`，后三项在没有凭据时返回 `401`。然后用浏览器登录管理页，上传文件，确认 `/public` 和复制的下载链接可匿名获取完整内容。

出现 `502` 时先检查应用容器是否运行、本机 `8123` 是否可访问。证书申请失败时检查 DNS、端口可达性和 Caddy 日志；公开页能打开但目录跳转失败时，确认 `/public.data` 和 `/__manifest` 的代理规则未被移除。

```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 100 --no-pager
```

### 配置项

Compose 在 `environment` 下配置，Quadlet 使用 `[Container]` 下的 `Environment=`。应用直接读取进程环境变量，不主动加载 `.env` 文件。

| 配置 | 说明 |
| --- | --- |
| `USER_URL` | 生产环境必填，站点主机名，可包含端口，不含协议或路径 |
| `STATE_DIR` | 状态根目录；镜像默认 `/var/lib/sharebox`，与 volume 挂载目标一致 |
| `MAX_UPLOAD_BYTES` | 单文件大小上限，默认 `10737418240`（10 GiB），必须为正安全整数 |
| `LOGGER_LEVEL` | 日志级别，默认 `info` |

同一个状态 volume 只供一个应用实例使用。旧的 `DATA_DIR`、`UPLOAD_TMP_DIR` 已被忽略，迁移时将原文件和上传数据分别放入状态 volume 的 `data/`、`tmp/` 中。

## 源码构建

使用 Node.js 24 和 npm：

```bash
git clone https://github.com/qw0er/ShareBox.git
cd ShareBox
npm ci
```

本地开发：

```bash
npm run dev
```

打开终端显示的本地地址，管理页为 `/`，公开页为 `/public`。开发数据存放在项目的 `tmp/` 下，开发日志通过 `pino-pretty` 管道美化；本地开发服务不经过 Caddy 认证。

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

生产启动输出 JSON 日志，仍需配置 Caddy 提供 HTTPS 和认证。

从源码构建容器镜像：

```bash
docker build -f packages/Dockerfile -t sharebox:local .
# 使用 Podman 时执行：
podman build -f packages/Dockerfile -t localhost/sharebox:local .
```

构建后，将 Compose 的 `image` 改为 `sharebox:local`，或将 Quadlet 的 `Image` 改为 `localhost/sharebox:local`。rootless Podman 镜像应由运行服务的独立用户构建或导入。
