#!/bin/bash
# Rouh's projector: turns a Raspberry Pi running Raspberry Pi OS Lite into a screen that shows the owner's
# Robot chat full screen, from power on, with nobody at a keyboard (`rouh/projector.py`, README.md here).
#
# Run as root by the setup file's first start (`user-data`), and again at every start until it has finished
# once (`rouh-projector-install.service`), so a first start without the network simply tries again.
# Reads what the setup file left in /etc/rouh-projector: url, key, and optionally wifi-ssid, wifi-psk,
# wifi-country. Safe to run again: every step checks before it changes anything.
set -u
CONF=/etc/rouh-projector
DONE=$CONF/installed
LOG=/var/log/rouh-projector-install.log
exec >>"$LOG" 2>&1
echo "== $(date -Is) install starts"

[ -f "$DONE" ] && { echo "already installed"; exit 0; }
[ -s "$CONF/url" ] && [ -s "$CONF/key" ] || { echo "no url or key in $CONF: nothing to show"; exit 1; }

# --- Wi-Fi: the country first (the Pi's Wi-Fi stays off until one is set), then the home network --------
country=$(tr -cd 'A-Z' < "$CONF/wifi-country" 2>/dev/null | head -c 2)
if [ -n "$country" ]; then
  raspi-config nonint do_wifi_country "$country" || iw reg set "$country" || true
fi
rfkill unblock wifi 2>/dev/null || true
mkdir -p /etc/NetworkManager/conf.d
# Power saving on the Pi 3's Wi-Fi is the commonest reason a kiosk drops off the network and stays off.
printf '[connection]\nwifi.powersave = 2\n' > /etc/NetworkManager/conf.d/rouh-projector-wifi.conf
if [ -s "$CONF/wifi-ssid" ] && ! nmcli -t -f NAME connection show | grep -qx rouh-home; then
  ssid=$(cat "$CONF/wifi-ssid")
  if [ -s "$CONF/wifi-psk" ]; then
    nmcli connection add type wifi ifname wlan0 con-name rouh-home ssid "$ssid" \
      wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$(cat "$CONF/wifi-psk")" \
      connection.autoconnect yes connection.autoconnect-retries 0
  else
    nmcli connection add type wifi ifname wlan0 con-name rouh-home ssid "$ssid" \
      connection.autoconnect yes connection.autoconnect-retries 0
  fi
fi
systemctl reload NetworkManager 2>/dev/null || true
nmcli connection up rouh-home 2>/dev/null || true

# --- wait for the internet, up to ten minutes, then let the next start try again ---------------------
for _ in $(seq 1 120); do
  getent hosts deb.debian.org >/dev/null && break
  sleep 5
done
getent hosts deb.debian.org >/dev/null || { echo "no internet yet: trying again at the next start"; exit 1; }

# --- the kiosk: cage (a compositor that shows one program full screen, no desktop) and Chromium -------
export DEBIAN_FRONTEND=noninteractive
for _ in 1 2 3; do
  apt-get update && break
  sleep 20
done
browser=chromium
apt-cache show chromium >/dev/null 2>&1 || browser=chromium-browser
apt-get install -y --no-install-recommends cage "$browser" fonts-dejavu-core curl ca-certificates \
  || { echo "install failed: trying again at the next start"; exit 1; }

id kiosk >/dev/null 2>&1 || useradd -m -s /usr/sbin/nologin kiosk
usermod -aG video,render,input,audio kiosk
passwd -l kiosk >/dev/null
chown root:kiosk "$CONF/url" "$CONF/key"
chmod 0640 "$CONF/url" "$CONF/key"
chmod 0600 "$CONF"/wifi-* 2>/dev/null || true

cat > /usr/local/bin/rouh-projector-browser <<'SH'
#!/bin/sh
# Waits until Rouh answers, then opens its projector view full screen. Run by cage, as kiosk.
URL=$(cat /etc/rouh-projector/url)
KEY=$(cat /etc/rouh-projector/key)
# -f: a gateway error while Rouh restarts (a 502 from the proxy) is not an answer; the wall would sit on that page.
until curl -fs -o /dev/null -m 10 "$URL/healthz"; do sleep 5; done
BROWSER=$(command -v chromium || command -v chromium-browser)
exec "$BROWSER" --kiosk --incognito --ozone-platform=wayland --force-dark-mode \
  --noerrdialogs --disable-infobars --no-first-run --password-store=basic \
  --disable-translate --disable-features=Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions \
  --disable-component-update --check-for-update-interval=31536000 --disable-pinch --overscroll-history-navigation=0 \
  --enable-low-end-device-mode --renderer-process-limit=2 --disable-site-isolation-trials \
  --disk-cache-dir=/tmp/rouh-projector-cache --disk-cache-size=33554432 \
  --autoplay-policy=no-user-gesture-required \
  "$URL/projector#key=$KEY"
SH
chmod 0755 /usr/local/bin/rouh-projector-browser

cat > /etc/pam.d/rouh-projector <<'PAM'
auth     required pam_unix.so nullok
account  required pam_unix.so
session  required pam_unix.so
session  required pam_systemd.so
PAM

cat > /etc/systemd/system/rouh-projector.service <<'UNIT'
[Unit]
Description=Rouh on the projector (cage and Chromium, full screen)
After=systemd-user-sessions.service plymouth-quit-wait.service network-online.target
Wants=network-online.target
Conflicts=getty@tty1.service
After=getty@tty1.service

[Service]
User=kiosk
PAMName=rouh-projector
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty-fail
StandardOutput=journal
StandardError=journal
UtmpIdentifier=tty1
UtmpMode=user
Environment=XDG_SESSION_TYPE=wayland
ExecStart=/usr/bin/cage -d -- /usr/local/bin/rouh-projector-browser
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
UNIT

# Once a night the browser starts afresh, so a week of pages never fills the Pi's 1 GB.
cat > /etc/systemd/system/rouh-projector-fresh.service <<'UNIT'
[Unit]
Description=Start Rouh's projector browser afresh
[Service]
Type=oneshot
ExecStart=/bin/systemctl restart rouh-projector.service
UNIT
cat > /etc/systemd/system/rouh-projector-fresh.timer <<'UNIT'
[Unit]
Description=Start Rouh's projector browser afresh every night
[Timer]
OnCalendar=*-*-* 04:30
Persistent=false
[Install]
WantedBy=timers.target
UNIT

# --- the screen never goes dark: no console blanking, and HDMI on even if the projector was off -------
CMDLINE=/boot/firmware/cmdline.txt
[ -f "$CMDLINE" ] || CMDLINE=/boot/cmdline.txt
if [ -f "$CMDLINE" ] && ! grep -q consoleblank=0 "$CMDLINE"; then
  sed -i '1 s/$/ consoleblank=0/' "$CMDLINE"
fi
# No first-start questions on the screen: the setup file made the only account the Pi needs.
systemctl disable userconfig.service 2>/dev/null || true
systemctl mask getty@tty1.service 2>/dev/null || true

systemctl daemon-reload
systemctl set-default graphical.target
systemctl enable rouh-projector.service rouh-projector-fresh.timer
systemctl disable rouh-projector-install.service 2>/dev/null || true
date -Is > "$DONE"
echo "== $(date -Is) installed: starting the projector view"
systemctl start rouh-projector.service rouh-projector-fresh.timer
