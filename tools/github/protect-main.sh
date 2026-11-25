#!/usr/bin/env bash
#
# rouh-core's main, protected so an outside change cannot merge without the owner (task 98, gap G11).
#
#   tools/github/protect-main.sh          say what main's rules are now, and what this would change
#   tools/github/protect-main.sh --apply  put main-ruleset.json beside this file on rouh-core
#
# What the ruleset says:
#   - a pull request needs one approving review, from a code owner (.github/CODEOWNERS names the
#     owner for everything), given after its last push, with the sign-off check and the pull
#     request tests passing;
#   - main cannot be deleted or forced;
#   - three may still push to main directly, so Rouh's own landings keep working:
#       * a deploy key: the Creator Rouh's protected core, which pushes a change only after its own
#         checks passed and it ran live (guard/rouh_guard/upstream.py), the way land.sh lands;
#       * GitHub Actions (app 15368): base.yml moving main to a tested base level;
#       * the repository's admins: the owner, and nobody else today.
#
# It needs an admin's GitHub access: from a run, the owner's grant (rouh-github-grant 8 on their
# Mac, then /code/bin/rouh-github setup), or the owner's own gh on their Mac. Nothing secret is
# printed. Running it again changes the one ruleset of this name, and adds no second one.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${ROUH_CORE_REPO:-rouh-land/rouh-core}"
RULES="$HERE/main-ruleset.json"
NAME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$RULES")"

existing="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$NAME\") | .id" 2>/dev/null || true)"
echo "Rulesets on $REPO now:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  \(.id)  \(.name)  (\(.enforcement))"' || {
  echo "Could not read the rulesets: this needs the owner's GitHub access (rouh-github-grant 8)." >&2; exit 2; }
echo "Rules that apply to main now:"
gh api "repos/$REPO/rules/branches/main" --jq '.[] | "  \(.type)"' || true

if [ "${1:-}" != "--apply" ]; then
  if [ -n "$existing" ]; then echo "Would update ruleset $existing to $RULES."; else echo "Would add $RULES as a new ruleset."; fi
  echo "Run with --apply to do it."
  exit 0
fi

if [ -n "$existing" ]; then
  gh api -X PUT "repos/$REPO/rulesets/$existing" --input "$RULES" --jq '"Updated ruleset \(.id): \(.name)"'
else
  gh api -X POST "repos/$REPO/rulesets" --input "$RULES" --jq '"Added ruleset \(.id): \(.name)"'
fi
echo "Rules that apply to main now:"
gh api "repos/$REPO/rules/branches/main" --jq '.[] | "  \(.type)"'
