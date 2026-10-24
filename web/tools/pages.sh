#!/usr/bin/env bash
# Publish the web UI to GitHub Pages (gh-pages branch of this repo).
#
#   tools/pages.sh preview <name>      build, then replace only /preview/<name>/ on gh-pages
#   tools/pages.sh live --owner-ok     build, then replace the live root (keeps /preview/)
#   tools/pages.sh list                show the previews currently published
#
# Previews live at https://harshjha15335.github.io/RootCause/preview/<name>/ and never touch the
# live site. The live root is only rebuilt with --owner-ok, after the owner has approved a preview.
# Options: --no-build (publish the existing dist/), --no-push (commit locally, print the path).
set -euo pipefail

cd "$(dirname "$0")/.."
WEB="$PWD"
REPO="$(git rev-parse --show-toplevel)"
SITE="https://harshjha15335.github.io/RootCause"

cmd="${1:-}"; shift || true
name=""; owner_ok=0; build=1; push=1
for a in "$@"; do
  case "$a" in
    --owner-ok) owner_ok=1 ;;
    --no-build) build=0 ;;
    --no-push) push=0 ;;
    -*) echo "unknown option $a" >&2; exit 2 ;;
    *) name="$a" ;;
  esac
done

case "$cmd" in
  preview)
    [[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,39}$ ]] || { echo "preview name: lowercase letters, digits, dashes (e.g. shell, autopsy)" >&2; exit 2; } ;;
  live)
    [[ $owner_ok == 1 ]] || { echo "refusing to touch the live site without --owner-ok (the owner must approve a preview first)" >&2; exit 2; } ;;
  list) ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac

# gh-pages in a throwaway worktree, so the current checkout is never switched
for i in 1 2 3 4; do git -C "$REPO" fetch --depth 1 origin gh-pages && break; sleep $((2 ** i)); done
WT="$(mktemp -d)/gh-pages"
git -C "$REPO" worktree add --detach "$WT" FETCH_HEAD >/dev/null
trap 'git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

if [[ "$cmd" == list ]]; then
  ls -1 "$WT/preview" 2>/dev/null | sed "s|.*|$SITE/preview/&/|" || echo "no previews yet"
  exit 0
fi

if [[ $build == 1 ]]; then
  # relative base: the same build works at the root and under /preview/<name>/
  node tools/library.mjs
  npx tsc -b
  npx vite build --base ./
fi
[[ -f dist/index.html ]] || { echo "no dist/ to publish" >&2; exit 1; }

src="$(git -C "$REPO" rev-parse --short HEAD)$(git -C "$REPO" diff --quiet HEAD -- web || echo '+dirty')"
branch="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
if [[ "$cmd" == preview ]]; then
  dest="$WT/preview/$name"
  rm -rf "$dest"; mkdir -p "$dest"
  cp -R dist/. "$dest/"
  url="$SITE/preview/$name/"
  msg="Preview $name from $branch $src"
else
  # everything at the root is replaced except the previews
  find "$WT" -mindepth 1 -maxdepth 1 ! -name .git ! -name preview -exec rm -rf {} +
  cp -R dist/. "$WT/"
  url="$SITE/"
  msg="Rebuild Pages from $branch $src"
fi
touch "$WT/.nojekyll"

git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then echo "nothing changed: $url"; exit 0; fi
git -C "$WT" commit -q -m "$msg"
if [[ $push == 1 ]]; then
  # other threads publish their own previews too: on a race, replay this commit on top of theirs
  ok=0
  for i in 1 2 3 4; do
    if git -C "$WT" push origin HEAD:gh-pages; then ok=1; break; fi
    sleep $((2 ** i))
    git -C "$WT" fetch --depth 20 origin gh-pages && git -C "$WT" rebase -q FETCH_HEAD
  done
  [[ $ok == 1 ]] || { echo "push failed" >&2; exit 1; }
  echo "published: $url"
else
  echo "committed locally (not pushed) in $WT: $url"; trap - EXIT
fi
