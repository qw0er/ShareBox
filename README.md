# ShareBox

ShareBox 是一个面向个人服务器的轻量文件管理与分享工具。管理员通过网页上传、浏览和删除文件，访客通过公开页面浏览和下载文件。

## 部署

服务器需要安装 Docker 或 Podman，以及 Caddy。ShareBox 使用单个容器运行，Caddy 在宿主机负责 HTTPS、管理端认证和反向代理。

### Docker 部署

准备持久目录并启动容器，将 `sharebox.example.com` 替换为你的管理域名：

```bash
sudo install -d -o 1000 -g 1000 -m 0755 /var/lib/sharebox

docker run -d \
  --name sharebox \
  --restart unless-stopped \
  --init \
  --env USER_URL=sharebox.example.com \
  --publish 127.0.0.1:8123:8123 \
  --mount type=bind,src=/var/lib/sharebox,dst=/var/lib/sharebox \
  ghcr.io/qw0er/sharebox:latest
```

`USER_URL` 必须与管理端主机名一致，不含协议或路径，可包含端口，例如 `sharebox.example.com:8443`。修改管理域名后，使用新的配置重新创建容器。

容器以 UID/GID `1000:1000` 运行。以上权限设置适用于普通 rootful Docker；使用 rootless Docker 或用户命名空间映射时，需按映射后的宿主机 UID/GID 设置目录权限。已有文件也需允许容器用户读写。

程序会自动创建内部目录：

```text
/var/lib/sharebox/
├── data/  # 公开文件，供 Caddy 读取
└── tmp/   # 私有上传数据，权限 0700
```

文件由应用从 `data/` 读取。不要将临时文件、配置、密码或备份放入 `data/`。使用其他存储位置时，修改挂载的 `src`。

### Podman Quadlet（rootless）部署

也可以使用普通用户运行 Podman，由 systemd 用户服务管理容器。需要支持 Quadlet 的 Podman、cgroup v2，以及已配置 `/etc/subuid` 和 `/etc/subgid` 映射的用户。以下命令在该用户的登录会话中执行；`systemctl --user` 和 `podman` 不加 `sudo`。

新部署准备目录，并允许用户服务在开机后启动、退出登录后继续运行：

```bash
mkdir -p ~/.config/containers/systemd ~/.local/share/sharebox
sudo loginctl enable-linger "$(id -un)"
```

已有部署应先停止旧实例并备份，将完整状态目录迁移到 `~/.local/share/sharebox`，确保目录和文件归运行 Podman 的用户所有；不要同时运行 Docker 与 Quadlet 实例。

创建 `~/.config/containers/systemd/sharebox.container`，替换管理域名：

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
Volume=%h/.local/share/sharebox:/var/lib/sharebox
RunInit=true
LogDriver=journald

[Service]
Restart=on-failure
TimeoutStartSec=900

[Install]
WantedBy=default.target
```

`UserNS` 将宿主机当前用户映射到容器中的 `1000:1000`，因此持久目录应归该宿主机用户所有，无需将宿主机所有者设为 UID 1000。`%h` 表示该用户的 home，宿主机数据保存在 `~/.local/share/sharebox`。镜像已设置 `STATE_DIR=/var/lib/sharebox`，因此 Quadlet 无需重复指定；挂载目标保持这个容器内路径。

Caddy 通过本机 `127.0.0.1:8123` 代理应用，无需直接读取持久目录。启用 SELinux 的主机需配置允许容器读写该目录的标签和策略。

加载并启动用户服务：

```bash
systemctl --user daemon-reload
systemctl --user start sharebox.service
systemctl --user status sharebox.service
journalctl --user -u sharebox.service -n 100 --no-pager
curl -I http://127.0.0.1:8123/
```

开机启动由 `[Install]` 和 linger 配置实现，不需要对生成的服务运行 `systemctl --user enable`。修改 Quadlet 后执行 `daemon-reload` 和 `restart`。配置格式与用户服务机制见 [Podman Quadlet 官方文档](https://docs.podman.io/en/stable/markdown/podman-systemd.unit.5.html)。

更新前备份整个 `~/.local/share/sharebox` 并保留旧镜像，然后执行：

```bash
podman pull ghcr.io/qw0er/sharebox:latest
systemctl --user restart sharebox.service
```

回滚时，将 Quadlet 的 `Image` 改为保留的旧镜像标签，重新加载并重启服务。备份前使用 `systemctl --user stop sharebox.service` 停止服务，完成后再启动。

### 配置 Caddy

应用自身不提供认证。请使用 [Caddyfile.example](Caddyfile.example) 配置管理端和公开端，替换域名、用户名及密码哈希。`/public`、公开 loader、下载入口与页面静态资源允许匿名访问；其他路由均需 Basic Auth，包括管理页面、管理 loader 和 `/uploads`。

生成密码哈希：

```bash
caddy hash-password
```

将修改后的配置保存到 `/etc/caddy/Caddyfile`，然后验证并加载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

域名的 DNS 应指向服务器，并开放 HTTP/HTTPS 端口供 Caddy 提供服务和自动管理证书。`USER_URL` 必须与该域名一致。

管理页面位于 `https://sharebox.example.com/`，公开文件页位于 `https://sharebox.example.com/public`。管理页提供公开页入口；每个文件的“生成下载链接”按钮显示并复制同域名的完整下载地址。公开页点击文件整行下载，点击目录整行进入查看。

公开页使用 React Router 服务端 loader，下载入口 `/public/download?path=...` 由应用流式传输并支持 HEAD 和单段 Range。Caddy 仅代理公开路由、静态资源、图标和路由发现端点，其余请求均认证；公开页和下载入口需要应用运行。

部署后检查：匿名打开 `/public`、进入子目录后刷新、下载中文文件名和空文件，验证复制的链接可匿名下载；访问 `/`、`/index.data`、`/uploads` 时应要求认证。

### 配置项

应用配置和日志模块直接读取进程环境变量，不主动加载 `.env` 文件。

Docker 在镜像名称前添加 `--env 配置名=值`；Quadlet 在 `[Container]` 中添加 `Environment=配置名=值`：

| 配置 | 说明 |
| --- | --- |
| `USER_URL` | 生产环境必填，管理端主机名，可包含端口，不含协议或路径 |
| `STATE_DIR` | 状态根目录，Docker 镜像默认 `/var/lib/sharebox`；修改时需同步容器挂载目标 |
| `MAX_UPLOAD_BYTES` | 单文件大小上限，默认 `10737418240`（10 GiB），必须为正安全整数 |
| `LOGGER_LEVEL` | 日志级别，默认 `info` |

### 查看状态与日志

```bash
docker ps --filter name=sharebox
docker logs --tail 100 sharebox
curl -I http://127.0.0.1:8123/
```

### Docker 更新与备份

更新前备份整个 `/var/lib/sharebox`，并为当前镜像保留独立标签以便回滚。停止容器后备份，可以保持上传数据一致。

```bash
docker pull ghcr.io/qw0er/sharebox:latest
docker stop sharebox
docker rm sharebox
```

重新执行前面的 `docker run` 命令，检查启动日志和管理页和公开页的访问结果。状态目录中的文件和上传数据会保留，不要删除该目录或让多个实例同时使用它。回滚时，将启动命令中的镜像替换为保留的旧镜像标签。

从旧部署迁移时，先停止原服务并备份，将公开文件和完整上传临时目录分别放入状态根目录的 `data/` 和 `tmp/`，核对内容及权限后再启动。旧的 `DATA_DIR`、`UPLOAD_TMP_DIR` 配置被忽略，配置存储位置请使用 `STATE_DIR`；若原来使用 systemd 管理 ShareBox，还需停止并禁用 `sharebox.service`。
