#!/usr/bin/env bash
#
# rouh-core's main, protected so an outside change cannot merge without the owner (task 98, gap G11).
#
#   tools/github/protect-main.sh          say what main's rules are now, and what this would change
#   tools/github/protect-main.sh --apply  do it
#
# What the rule set (main-ruleset.json beside this file) says:
#   - a pull request needs one approving review, from a code owner (.github/CODEOWNERS names the
#     owner for everything), given after its last push, with the sign-off check and the pull
#     request tests passing;
#   - main cannot be deleted or forced;
#   - two may still push to main directly, so Rouh's own landings keep working:
#       * a deploy key: the Creator Rouh's protected core, which pushes a change only after its own
#         checks passed and it ran live (guard/rouh_guard/upstream.py), the way land.sh lands; and
#         the workflows' own key, "rouh-core workflows: main", with which base.yml moves main to a
#         tested base level and code-release.yml writes CHANGELOG.md (tools/github/main-push-remote.sh);
#       * the repository's admins: the owner, and nobody else today.
#   GitHub Actions itself is not an exception: GitHub refuses it in a repository rule set (HTTP 422,
#   "Actor GitHub Actions integration must be part of the ruleset source or owner organization",
#   step 98-33), which is why the workflows push with a deploy key.
#
# --apply, in this order, each step skipped when it is already so:
#   0. refuse, changing nothing, while GitHub's main still has workflows that push to main as Actions;
#   1. the deploy key "rouh-core workflows: main" (write) and its private half as the Actions secret
#      MAIN_PUSH_KEY, made here and never printed or kept; both made again if either is missing;
#   2. the rule set, added or updated by its name;
#   3. the narrower rule set of 27 November 2026, "main: no deletion or force push", deleted: its two
#      rules are in this one;
#   4. the rules on main read back.
#
# It needs an admin's GitHub access: from a run, the owner's grant (rouh-github-grant 8 on their
# Mac, then /code/bin/rouh-github setup), or the owner's own gh on their Mac. Running it again
# changes nothing that is already right.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${ROUH_CORE_REPO:-rouh-land/rouh-core}"
RULES="$HERE/main-ruleset.json"
NAME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$RULES")"
OLD_NAME="main: no deletion or force push"
KEY_TITLE="rouh-core workflows: main"
SECRET="MAIN_PUSH_KEY"

ruleset_id() { gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$1\") | .id" 2>/dev/null || true; }

echo "Rulesets on $REPO now:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  \(.id)  \(.name)  (\(.enforcement))"' || {
  echo "Could not read the rulesets: this needs the owner's GitHub access (rouh-github-grant 8)." >&2; exit 2; }
echo "Rules that apply to main now:"
gh api "repos/$REPO/rules/branches/main" --jq '.[] | "  \(.type)"' || true

existing="$(ruleset_id "$NAME")"
old="$(ruleset_id "$OLD_NAME")"
key_id="$(gh api "repos/$REPO/keys" --jq ".[] | select(.title == \"$KEY_TITLE\") | .id" 2>/dev/null || true)"
have_secret=no
gh api "repos/$REPO/actions/secrets/$SECRET" >/dev/null 2>&1 && have_secret=yes

if [ "${1:-}" != "--apply" ]; then
  if [ -n "$key_id" ] && [ "$have_secret" = yes ]; then echo "The workflows' deploy key ($key_id) and $SECRET are there."
  else echo "Would make the deploy key \"$KEY_TITLE\" and the secret $SECRET."; fi
  if [ -n "$existing" ]; then echo "Would update ruleset $existing to $RULES."; else echo "Would add $RULES as a new ruleset."; fi
  [ -z "$old" ] || echo "Would then delete ruleset $old ($OLD_NAME), whose rules are in it."
  echo "Run with --apply to do it."
  exit 0
fi

# 0. The workflows on GitHub's main must already push to main with the deploy key; before they do,
#    the review rule would refuse base.yml's and code-release.yml's pushes.
for wf in base.yml code-release.yml; do
  gh api "repos/$REPO/contents/.github/workflows/$wf?ref=main" --jq .content | base64 -d | grep -q main-push-remote.sh || {
    echo "GitHub's main still has the $wf that pushes to main as GitHub Actions; this waits until the change that moves it to the deploy key is on main." >&2
    exit 3; }
done

# 1. The workflows' deploy key, before the rule that needs it.
if [ -z "$key_id" ] || [ "$have_secret" = no ]; then
  [ -z "$key_id" ] || gh api -X DELETE "repos/$REPO/keys/$key_id" >/dev/null
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  ssh-keygen -q -t ed25519 -N "" -C "$KEY_TITLE" -f "$tmp/key"
  key_id="$(gh api -X POST "repos/$REPO/keys" -f title="$KEY_TITLE" -f key="$(cat "$tmp/key.pub")" -F read_only=false --jq .id)"
  gh secret set "$SECRET" -R "$REPO" < "$tmp/key"
  rm -rf "$tmp"
  echo "Made the deploy key \"$KEY_TITLE\" ($key_id, write) and the secret $SECRET."
else
  echo "The workflows' deploy key ($key_id) and $SECRET are already there."
fi

# 2. The rule set.
if [ -n "$existing" ]; then
  gh api -X PUT "repos/$REPO/rulesets/$existing" --input "$RULES" --jq '"Updated ruleset \(.id): \(.name)"'
else
  gh api -X POST "repos/$REPO/rulesets" --input "$RULES" --jq '"Added ruleset \(.id): \(.name)"'
fi

# 3. The narrow one, once the whole one is on.
if [ -n "$old" ] && [ -n "$(ruleset_id "$NAME")" ]; then
  gh api -X DELETE "repos/$REPO/rulesets/$old" && echo "Deleted ruleset $old ($OLD_NAME): its rules are in \"$NAME\"."
fi

# 4. Read back.
echo "Rules that apply to main now:"
gh api "repos/$REPO/rules/branches/main" --jq '.[] | "  \(.type)  (ruleset \(.ruleset_id))"'
echo "May skip them:"
gh api "repos/$REPO/rulesets/$(ruleset_id "$NAME")" --jq '.bypass_actors[] | "  \(.actor_type) \(.actor_id // "")  \(.bypass_mode)"'
