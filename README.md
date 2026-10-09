# ShareBox

ShareBox 是一个面向个人服务器的轻量文件管理与分享工具。管理员通过网页上传、浏览和删除文件，访客通过公开域名浏览和下载文件。

## 部署

服务器需要安装 Docker 或 Podman，以及 Caddy。ShareBox 使用单个容器运行，Caddy 在宿主机负责 HTTPS、管理端认证和公开文件服务。

### Docker 部署

准备持久目录并启动容器，将 `admin.example.com` 替换为你的管理域名：

```bash
sudo install -d -o 1000 -g 1000 -m 0755 /var/lib/sharebox

docker run -d \
  --name sharebox \
  --restart unless-stopped \
  --init \
  --env USER_URL=admin.example.com \
  --publish 127.0.0.1:8123:8123 \
  --mount type=bind,src=/var/lib/sharebox,dst=/var/lib/sharebox \
  ghcr.io/qw0er/sharebox:latest
```

`USER_URL` 必须与管理端主机名一致，不含协议或路径，可包含端口，例如 `admin.example.com:8443`。修改管理域名后，使用新的配置重新创建容器。

容器以 UID/GID `1000:1000` 运行。以上权限设置适用于普通 rootful Docker；使用 rootless Docker 或用户命名空间映射时，需按映射后的宿主机 UID/GID 设置目录权限。已有文件也需允许容器用户读写。

程序会自动创建内部目录：

```text
/var/lib/sharebox/
├── data/  # 公开文件，供 Caddy 读取
└── tmp/   # 私有上传数据，权限 0700
```

确保 Caddy 可以读取 `data/` 及其中的文件。只公开 `data/`，不要将临时文件、配置、密码或备份放入其中。使用其他存储位置时，修改挂载的 `src` 并同步调整 Caddy 的文件路径。

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
Environment=USER_URL=admin.example.com
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

Caddy 的公开端路径需改为 `/home/用户名/.local/share/sharebox/data`，使用实际绝对路径。确保 Caddy 服务用户可穿过各级父目录并读取公开文件，且其 systemd `ProtectHome` 配置允许访问该路径；不要放宽私有 `tmp/` 的权限。

启用 SELinux 的主机还需配置允许容器写入、Caddy 读取公开目录的文件标签及策略。不要直接给整个共享状态目录添加 `:Z` 私有重标记，以免影响宿主机 Caddy 访问；按系统策略分别检查两端的访问权限。

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

应用自身不提供认证。请使用 [Caddyfile.example](Caddyfile.example) 配置管理端和公开端，替换两个域名、用户名及密码哈希。管理端认证必须覆盖全部接口，包括 `/uploads`。

生成密码哈希：

```bash
caddy hash-password
```

将修改后的配置保存到 `/etc/caddy/Caddyfile`，确认公开端路径：Docker 使用 `/var/lib/sharebox/data`，rootless Quadlet 使用 `/home/用户名/.local/share/sharebox/data`。然后验证并加载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

两个域名的 DNS 应指向服务器，并开放 HTTP/HTTPS 端口供 Caddy 提供服务和自动管理证书。配置中的 `index ""` 用于保持目录浏览；不要向公开目录放入符号链接。

完成后，通过管理域名登录 ShareBox，通过 `https://files.example.com/public` 浏览和下载文件。公开页使用 React Router 服务端 loader 读取当前目录，下载入口为 `/public/download?path=...`，由应用流式传输并支持 HEAD 和单段 Range。

公开域名仅将 `/public`、`/public/*`、`/public.data`、`/assets/*`、`/__manifest` 和图标请求代理到应用，不代理管理页面及上传接口。`/public.data` 是 Framework 的 loader 数据入口，`/__manifest` 用于路由发现。原来的公开文件地址和 Caddy 目录浏览继续保留，应用停止时这些旧入口仍可使用；新 `/public` 页面和下载入口需要应用运行。

部署后检查：匿名打开 `/public`、进入子目录后刷新、下载中文文件名和空文件、发送 HEAD/Range 请求，并确认公开域名不能调用管理端上传和删除接口。

### 配置项

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

重新执行前面的 `docker run` 命令，检查启动日志和两个域名的访问结果。状态目录中的文件和上传数据会保留，不要删除该目录或让多个实例同时使用它。回滚时，将启动命令中的镜像替换为保留的旧镜像标签。

从旧部署迁移时，先停止原服务并备份，将公开文件和完整上传临时目录分别放入状态根目录的 `data/` 和 `tmp/`，核对内容及权限后再启动。旧的 `DATA_DIR`、`UPLOAD_TMP_DIR` 配置需改为 `STATE_DIR`；若原来使用 systemd 管理 ShareBox，还需停止并禁用 `sharebox.service`。
