#!/bin/sh
# Met le site en ligne sur le serveur : à lancer toutes les 5 minutes par une tâche cron
# de l'utilisateur Virtualmin du site (pcrgravier).
#
# Il regarde si la branche « deploy » du dépôt GitHub a changé (GitHub Actions y range
# le site construit). Si oui, il télécharge cette version et met public_html à jour.
# Sinon, il ne fait rien.
set -eu

REPO="cataras/pcrgravier"
BRANCH="deploy"
DEST="${DEST:-$HOME/public_html}"
STATE="${STATE:-$HOME/.deploy-version}"

# Une seule mise à jour à la fois (le téléchargement peut dépasser 5 minutes)
if command -v flock >/dev/null 2>&1 && [ -z "${DEPLOY_LOCKED:-}" ]; then
  DEPLOY_LOCKED=1 exec flock -n "$STATE.lock" "$0" "$@"
fi

version=$(curl -fsS --max-time 30 -H "Accept: application/vnd.github.sha" \
  "https://api.github.com/repos/$REPO/commits/$BRANCH")
case "$version" in
  *[!0-9a-f]*|"") echo "$(date '+%F %T') réponse inattendue de GitHub : $version" >&2; exit 1 ;;
esac
[ "$version" = "$(cat "$STATE" 2>/dev/null || true)" ] && exit 0

echo "$(date '+%F %T') nouvelle version $version, téléchargement…"
tmp=$(mktemp -d "$HOME/.deploy-XXXXXX")
trap 'rm -rf "$tmp"' EXIT INT TERM
curl -fsSL --max-time 1800 "https://codeload.github.com/$REPO/tar.gz/$version" \
  | tar -xzf - -C "$tmp" --strip-components=1

# Garde-fou : ne jamais vider public_html avec une archive incomplète
if [ ! -f "$tmp/index.html" ] || [ ! -f "$tmp/404.html" ]; then
  echo "$(date '+%F %T') archive incomplète, public_html n'est pas modifié" >&2
  exit 1
fi

# .well-known (Let's Encrypt) et les dossiers de Virtualmin ne sont pas touchés
rsync -a --delete \
  --exclude='/.well-known/' --exclude='/stats/' --exclude='/awstats*' --exclude='/cgi-bin/' \
  "$tmp/" "$DEST/"

echo "$version" > "$STATE"
echo "$(date '+%F %T') site à jour ($version)"
