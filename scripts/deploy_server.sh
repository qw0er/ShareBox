#!/bin/bash

set -Eeuo pipefail

service_name="${SHAREBOX_SERVICE_NAME:-sharebox}"
service_user="${SHAREBOX_USER:-sharebox}"
service_group="${SHAREBOX_GROUP:-$service_user}"
state_dir="${SHAREBOX_STATE_DIR:-/var/lib/sharebox}"
app_dir="${SHAREBOX_APP_DIR:-$state_dir/app}"
data_dir="${SHAREBOX_DATA_DIR:-$state_dir/data}"
listen_host="${SHAREBOX_HOST:-127.0.0.1}"
listen_port="${SHAREBOX_PORT:-8123}"
unit_file="/etc/systemd/system/${service_name}.service"

staging_root=""
staging_app=""
unit_candidate=""
unit_backup=""
previous_app="$state_dir/.app.previous"
old_unit_exists=false
old_service_active=false
old_service_enabled=false
app_switched=false
deployment_succeeded=false

die() {
	echo "Error: $*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage:
  sudo scripts/deploy_server.sh <sharebox-package.tar.gz>

Optional environment variables:
  SHAREBOX_USER             Service user (default: sharebox)
  SHAREBOX_GROUP            Service group (default: same as user)
  SHAREBOX_STATE_DIR        State root (default: /var/lib/sharebox)
  SHAREBOX_APP_DIR          Application directory (default: <state>/app)
  SHAREBOX_DATA_DIR         Persistent data directory (default: <state>/data)
  SHAREBOX_HOST             Listen address (default: 127.0.0.1)
  SHAREBOX_PORT             Listen port (default: 8123)
  SHAREBOX_SERVICE_NAME     systemd service name (default: sharebox)

The application directory is replaced on deployment. The data directory is
preserved. If the new service cannot start, the previous application and unit
file are restored automatically.
EOF
}

safe_remove_tree() {
	local target="$1"
	local expected="$2"
	[[ -n "$target" && "$target" == "$expected" ]] ||
		die "refusing to remove unexpected path: $target"
	rm -rf -- "$target"
}

rollback() {
	set +e
	echo "Deployment failed; restoring the previous installation..." >&2
	systemctl stop "$service_name.service" >/dev/null 2>&1

	if [[ -e "$app_dir" ]]; then
		safe_remove_tree "$app_dir" "$state_dir/app"
	fi
	if [[ -e "$previous_app" ]]; then
		mv -- "$previous_app" "$app_dir"
	fi

	if [[ "$old_unit_exists" == true && -n "$unit_backup" && -f "$unit_backup" ]]; then
		install -m 0644 -- "$unit_backup" "$unit_file"
	else
		rm -f -- "$unit_file"
	fi
	systemctl daemon-reload

	if [[ "$old_service_enabled" == true ]]; then
		systemctl enable "$service_name.service" >/dev/null 2>&1
	else
		systemctl disable "$service_name.service" >/dev/null 2>&1
	fi
	if [[ "$old_service_active" == true ]]; then
		systemctl start "$service_name.service"
	fi
}

cleanup() {
	local status=$?
	trap - EXIT
	if [[ "$deployment_succeeded" != true && "$app_switched" == true ]]; then
		rollback
	fi
	if [[ -n "$staging_root" && -d "$staging_root" ]]; then
		safe_remove_tree "$staging_root" "$staging_root"
	fi
	if [[ -n "$unit_candidate" ]]; then
		rm -f -- "$unit_candidate"
	fi
	if [[ -n "$unit_backup" ]]; then
		rm -f -- "$unit_backup"
	fi
	exit "$status"
}

trap cleanup EXIT

[[ $# -eq 1 ]] || {
	usage >&2
	exit 2
}
[[ $EUID -eq 0 ]] || die "run this script as root"

for command_name in chmod chown cp find getent grep groupadd id install journalctl mktemp mv node npm realpath rm runuser systemctl tar useradd usermod; do
	command -v "$command_name" >/dev/null 2>&1 ||
		die "required command is not installed: $command_name"
done

state_dir="$(realpath -m -- "$state_dir")"
app_dir="$(realpath -m -- "$app_dir")"
data_dir="$(realpath -m -- "$data_dir")"
previous_app="$state_dir/.app.previous"

archive_path="$(realpath -e -- "$1")" || die "package does not exist: $1"
[[ -f "$archive_path" ]] || die "package is not a regular file: $archive_path"
tar -tzf "$archive_path" >/dev/null || die "package is not a readable gzip tar archive"

while IFS= read -r archive_entry; do
	normalized_entry="/${archive_entry#./}/"
	if [[ "$archive_entry" == /* || "$normalized_entry" == *"/../"* ]]; then
		die "package contains an unsafe path: $archive_entry"
	fi
done < <(tar -tzf "$archive_path")

[[ "$state_dir" == /var/lib/* && "$state_dir" != /var/lib/ ]] ||
	die "SHAREBOX_STATE_DIR must be a directory below /var/lib"
[[ "$app_dir" == "$state_dir/app" ]] ||
	die "SHAREBOX_APP_DIR must be exactly <state directory>/app"
[[ "$data_dir" == "$state_dir/data" ]] ||
	die "SHAREBOX_DATA_DIR must be exactly <state directory>/data"
[[ "$service_name" =~ ^[a-zA-Z0-9_.@-]+$ ]] || die "invalid service name"
[[ "$service_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "invalid service user"
[[ "$service_group" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "invalid service group"
[[ "$state_dir" != *[[:space:]]* ]] || die "state directory must not contain whitespace"
[[ "$listen_host" != *[[:space:]]* ]] || die "listen address must not contain whitespace"
[[ "$listen_port" =~ ^[0-9]+$ ]] && ((listen_port >= 1 && listen_port <= 65535)) ||
	die "invalid listen port: $listen_port"
node_bin="$(command -v node)"
npm_bin="$(command -v npm)"
node_major="$($node_bin -p 'Number(process.versions.node.split(".")[0])')"
((node_major >= 22)) || die "Node.js 22 or newer is required"

nologin_shell="$(command -v nologin || true)"
[[ -n "$nologin_shell" ]] || die "nologin shell is not installed"

if ! getent group "$service_group" >/dev/null; then
	groupadd --system "$service_group"
fi

if id "$service_user" >/dev/null 2>&1; then
	[[ "$(id -u "$service_user")" -ne 0 ]] || die "service user must not be root"
	usermod --home "$state_dir" --shell "$nologin_shell" --gid "$service_group" "$service_user"
else
	useradd \
		--system \
		--gid "$service_group" \
		--home-dir "$state_dir" \
		--no-create-home \
		--shell "$nologin_shell" \
		"$service_user"
fi

install -d -m 0750 -o root -g "$service_group" "$state_dir"
install -d -m 0750 -o "$service_user" -g "$service_group" "$data_dir"
install -d -m 0750 -o "$service_user" -g "$service_group" "$state_dir/.npm-cache"

[[ ! -e "$previous_app" ]] ||
	die "previous deployment backup exists; inspect and remove it before deploying: $previous_app"

staging_root="$(mktemp -d "$state_dir/.deploy.XXXXXX")"
staging_app="$staging_root/app"
chown "root:$service_group" "$staging_root"
chmod 0750 "$staging_root"
install -d -m 0750 -o "$service_user" -g "$service_group" "$staging_app"
tar -xzf "$archive_path" -C "$staging_app" --no-same-owner --no-same-permissions

[[ -f "$staging_app/package.json" ]] || die "package.json is missing from the package"
[[ -f "$staging_app/package-lock.json" ]] || die "package-lock.json is missing from the package"
[[ -f "$staging_app/build/server/index.js" ]] || die "server build is missing from the package"
[[ -d "$staging_app/build/client" ]] || die "client build is missing from the package"
if find "$staging_app" -type l -print -quit | grep -q .; then
	die "package must not contain symbolic links"
fi

chown -R "$service_user:$service_group" "$staging_app"
echo "Installing production dependencies..."
runuser --user "$service_user" -- \
	env \
		HOME="$state_dir" \
		NPM_CONFIG_CACHE="$state_dir/.npm-cache" \
		"$npm_bin" --prefix "$staging_app" ci --omit=dev --no-audit --no-fund

echo "Validating the server build..."
runuser --user "$service_user" -- \
	env DATA_DIR="$data_dir" LOGGER_LEVEL=silent \
	"$node_bin" --input-type=module -e '
		import { pathToFileURL } from "node:url";
		const [buildPath] = process.argv.slice(1);
		const build = await import(pathToFileURL(buildPath).href);
		const origins = Array.isArray(build.allowedActionOrigins)
			? build.allowedActionOrigins.filter(Boolean)
			: [];
		if (origins.length === 0) {
			console.error("The package has no allowedActionOrigins. Check USER_URL in .env and rebuild it.");
			process.exit(1);
		}
		console.log(`Allowed action origins: ${origins.join(", ")}`);
	' "$staging_app/build/server/index.js"

chown -hR "root:$service_group" "$staging_app"
chmod -R u=rwX,g=rX,o= "$staging_app"

unit_candidate="$(mktemp /tmp/sharebox-service.XXXXXX)"
cat >"$unit_candidate" <<EOF
[Unit]
Description=ShareBox React Router Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_group
WorkingDirectory=$app_dir

Environment=NODE_ENV=production
Environment=HOST=$listen_host
Environment=PORT=$listen_port
Environment=DATA_DIR=$data_dir

ExecStart=$node_bin $app_dir/node_modules/@react-router/serve/dist/cli.js $app_dir/build/server/index.js

Restart=on-failure
RestartSec=3
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$data_dir

[Install]
WantedBy=multi-user.target
EOF

if [[ -f "$unit_file" ]]; then
	old_unit_exists=true
	unit_backup="$(mktemp /tmp/sharebox-service-backup.XXXXXX)"
	cp -- "$unit_file" "$unit_backup"
fi
if systemctl is-active --quiet "$service_name.service"; then
	old_service_active=true
fi
if systemctl is-enabled --quiet "$service_name.service"; then
	old_service_enabled=true
fi

echo "Stopping the existing service..."
systemctl stop "$service_name.service" 2>/dev/null || true
app_switched=true
if [[ -e "$app_dir" ]]; then
	mv -- "$app_dir" "$previous_app"
fi
mv -- "$staging_app" "$app_dir"
staging_app=""

install -m 0644 -- "$unit_candidate" "$unit_file"
systemctl daemon-reload

echo "Starting $service_name.service..."
if ! systemctl enable --now "$service_name.service"; then
	journalctl -u "$service_name.service" --no-pager -n 50 >&2 || true
	exit 1
fi
if ! systemctl is-active --quiet "$service_name.service"; then
	journalctl -u "$service_name.service" --no-pager -n 50 >&2 || true
	die "$service_name.service did not stay active"
fi

deployment_succeeded=true
if [[ -e "$previous_app" ]]; then
	safe_remove_tree "$previous_app" "$state_dir/.app.previous"
fi

echo "Deployment completed successfully."
echo "Service: $service_name.service"
echo "Application: $app_dir"
echo "Data: $data_dir"
echo "Listen: $listen_host:$listen_port"
