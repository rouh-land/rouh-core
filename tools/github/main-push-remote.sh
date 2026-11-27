#!/usr/bin/env bash
#
# In a GitHub Actions job: the git remote "main-push", the only way a workflow moves rouh-core's main.
#
# main has a rule set (tools/github/main-ruleset.json): a change reaches it through a reviewed pull
# request, and only the admins and deploy keys may push straight to it. GitHub refuses GitHub Actions
# as an exception there (HTTP 422, step 98-33), so the two workflows that move main - base.yml (main
# to the tested base level) and code-release.yml (the CHANGELOG commit) - push with a deploy key of
# their own, "rouh-core workflows: main", whose private half is the repository secret MAIN_PUSH_KEY.
# tools/github/protect-main.sh --apply makes both.
#
#   MAIN_PUSH_KEY=${{ secrets.MAIN_PUSH_KEY }} tools/github/main-push-remote.sh
#   git push main-push HEAD:refs/heads/main
#
# Only pushes to "main-push" use the key; every other push of the job stays on GITHUB_TOKEN, which
# starts no workflow. A push with the key does start the workflows a push to main starts ("Tests on
# main"), which is why the CHANGELOG commit says [skip ci]. With no MAIN_PUSH_KEY (before the rule set
# is on) "main-push" is the checkout's own origin, so the workflows work the same either way.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?run this in a GitHub Actions job}"
git remote remove main-push 2>/dev/null || true
if [ -z "${MAIN_PUSH_KEY:-}" ]; then
  git remote add main-push "$(git remote get-url origin)"
  echo "main-push: no MAIN_PUSH_KEY, so the workflow's own token (works until main's review rule is on)"
  exit 0
fi

dir="${RUNNER_TEMP:-$(mktemp -d)}/main-push"
mkdir -p "$dir"; chmod 700 "$dir"
printf '%s\n' "$MAIN_PUSH_KEY" > "$dir/key"; chmod 600 "$dir/key"
# GitHub's published SSH host key (docs.github.com, "GitHub's SSH key fingerprints"), pinned, for
# port 22 and for ssh.github.com:443, the way round a network that closes 22.
hostkey="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl"
printf 'github.com %s\n[ssh.github.com]:443 %s\n' "$hostkey" "$hostkey" > "$dir/known_hosts"
git remote add main-push "git@github.com:$repo.git"
git config core.sshCommand "ssh -i $dir/key -o IdentitiesOnly=yes -o UserKnownHostsFile=$dir/known_hosts -o StrictHostKeyChecking=yes"
git ls-remote -q main-push refs/heads/main >/dev/null
echo "main-push: the deploy key \"rouh-core workflows: main\""
