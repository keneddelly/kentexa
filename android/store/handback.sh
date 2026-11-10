#!/usr/bin/env bash
# Copies a build output to the android-builds branch under <kind>/<run number>/.
set -euo pipefail
src="$1"; kind="$2"; run="${GITHUB_RUN_NUMBER:-0}"
work="$(mktemp -d)"
git config --global user.name "kentexa-ci"; git config --global user.email "ci@kentexa.com"
if git ls-remote --exit-code --heads origin android-builds >/dev/null 2>&1; then
  git clone --depth 1 --branch android-builds "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "$work"
else
  git init -q "$work"; git -C "$work" checkout -q --orphan android-builds
  git -C "$work" remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi
mkdir -p "$work/$kind/$run"
cp -r "$src" "$work/$kind/$run/"
cd "$work"; git add -A; git commit -qm "$kind from run $run" || exit 0
for i in 1 2 3; do git pull -q --rebase origin android-builds 2>/dev/null || true; git push -q origin HEAD:android-builds && exit 0; sleep 5; done
exit 1
