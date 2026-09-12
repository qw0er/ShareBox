#!/bin/bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(dirname -- "$script_dir")"
build_dir="$project_dir/build"
package_json="$project_dir/package.json"
output_dir="$project_dir/dist"

if [[ ! -f "$package_json" ]]; then
  echo "Error: package.json not found: $package_json" >&2
  exit 1
fi

cd "$project_dir"

package_name="$(node -p "require('./package.json').name || ''")"
package_version="$(node -p "require('./package.json').version || ''")"

if [[ -z "$package_name" || -z "$package_version" ]]; then
  echo "Error: package.json must contain name and version fields." >&2
  exit 1
fi

package_file="$output_dir/${package_name}-${package_version}.tar.gz"

echo "Installing dependencies..."
npm ci

echo "Building project..."
npm run build

if [[ ! -d "$build_dir" ]]; then
  echo "Error: build directory was not generated: $build_dir" >&2
  exit 1
fi

echo "Creating package..."
mkdir -p "$output_dir"
tar -czf "$package_file" build package.json package-lock.json

echo "Package created: $package_file"

     
