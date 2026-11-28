#!/usr/bin/env bash
# install.sh: the dropped-connections watch on the machine the Rouh stack runs on (task 197-04).
# Run as root from the folder that holds it and watch.py:
#
#   sudo bash install.sh                  # the watch, every minute
#   sudo bash install.sh --backfill 8     # and judge every drop of the last 8 days once
#
# What it does, and nothing else: watch.py into /usr/local/lib/rouh-model-drops, and
# rouh-model-drops.timer, every minute, as root. It reads; it writes only Rouh's two logs
# (model-drops.log, link-health.log in the core's rouh/logs) and its own state. Running it again
# changes nothing that is already right. To take it away: systemctl disable --now
# rouh-model-drops.timer, then delete the two units and the folder.
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
[ "$(id -u)" = 0 ] || { echo "Run it with sudo: sudo bash $0"; exit 1; }
[ -f "$HERE/watch.py" ] || { echo "watch.py is not beside this script. Nothing was changed."; exit 1; }
command -v iw >/dev/null || echo "Note: iw is not installed, so the wireless counters are left out."
install -d -o root -g root -m 0755 /usr/local/lib/rouh-model-drops
install -o root -g root -m 0755 "$HERE/watch.py" /usr/local/lib/rouh-model-drops/watch.py
install -d -o root -g root -m 0700 /var/lib/rouh-model-drops
cat > /etc/systemd/system/rouh-model-drops.service <<'UNIT'
[Unit]
Description=Rouh: dropped model connections put to their cause, and the links' health (task 197-04)
After=docker.service

[Service]
Type=oneshot
Nice=10
ExecStart=/usr/bin/python3 -I /usr/local/lib/rouh-model-drops/watch.py
UNIT
cat > /etc/systemd/system/rouh-model-drops.timer <<'UNIT'
[Unit]
Description=Rouh: dropped model connections and the links' health, every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now rouh-model-drops.timer >/dev/null
echo "rouh-model-drops.timer is on: every minute."
if [ "${1:-}" = "--backfill" ]; then
  /usr/bin/python3 -I /usr/local/lib/rouh-model-drops/watch.py backfill "${2:-8}"
fi
