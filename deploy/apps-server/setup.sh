#!/bin/bash
# Turns a fresh Ubuntu or Debian server into a Rouh apps server.
#
# Rouh serves this file at /apps/join/<code> with __ROUH_URL__ and __JOIN_CODE__ filled in, and the other
# files of deploy/apps-server/ written in between the BEGIN FILES and END FILES lines (CONTRACT.md, section 1).
# Run it as root:  curl -fsSL https://<rouh>/apps/join/<code> | sudo bash
# It is safe to run twice.
#
# Everything is inside functions and only the last line runs them, so a download cut short runs nothing,
# and nothing it starts can read the rest of the script from the pipe it came down.

ROUH_URL="__ROUH_URL__"
JOIN_CODE="__JOIN_CODE__"
SETUP_VERSION="1"

LOG=/var/log/rouh-apps-setup.log
STAGE=/var/lib/rouh-apps/setup-files
ETC=/etc/rouh-apps
STEP="starting"
OS_ID=""
OS_NAME=""

say() {
    printf '%s\n' "$*"
}

step() {
    STEP="$*"
    say "- $*"
}

fail() {
    say ""
    say "The apps server setup stopped while: ${STEP}."
    say "$*"
    say "Everything it printed is also in ${LOG}."
    say "It is safe to run the same line again once that is put right."
    exit 1
}

# put_file NAME [MODE] writes standard input to the setup folder under NAME, where install_files finds it.
# NAME is the file's name in deploy/apps-server/; a path is cut down to its last part.
put_file() {
    local name mode tmp
    name="${1##*/}"
    mode="${2:-0644}"
    [ -n "$name" ] || fail "A file in this script has no name."
    mkdir -p "$STAGE"
    chmod 700 "$STAGE"
    tmp="$(mktemp "${STAGE}/.${name}.XXXXXX")" || fail "Could not write ${name} into ${STAGE}."
    cat >"$tmp" || fail "Could not write ${name} into ${STAGE}."
    chmod "$mode" "$tmp"
    mv -f "$tmp" "${STAGE}/${name}"
}

write_files() {
# ---- BEGIN FILES ----
__FILES__
# ---- END FILES ----
    :
}

check_filled() {
    # Written in two halves, so that filling in the placeholders above does not fill in these as well.
    local url_mark="__ROUH""_URL__" code_mark="__JOIN""_CODE__"
    case "${ROUH_URL}${JOIN_CODE}" in
        *"$url_mark"*|*"$code_mark"*)
            say "This is the template of the setup script, not a script to run."
            say "Press Set up an apps server in Rouh and run the line it shows."
            exit 1
            ;;
    esac
}

check_root() {
    if [ "$(id -u)" != "0" ]; then
        say "This needs to run as root. Put sudo before bash, like this:"
        say "  curl -fsSL ${ROUH_URL}/apps/join/<code> | sudo bash"
        exit 1
    fi
}

start_log() {
    mkdir -p "$(dirname "$LOG")"
    touch "$LOG"
    chmod 600 "$LOG"
    exec > >(tee -a "$LOG") 2>&1
    exec </dev/null
    say ""
    say "Rouh apps server setup, $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
}

check_os() {
    step "Checking the operating system"
    [ -r /etc/os-release ] || fail "There is no /etc/os-release, so this does not look like Ubuntu or Debian."
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"
    OS_NAME="${PRETTY_NAME:-${ID:-unknown}}"
    if ! command -v apt-get >/dev/null 2>&1; then
        fail "This server has no apt-get. An apps server needs Ubuntu 24.04 or 22.04, or Debian 12."
    fi
    if ! command -v systemctl >/dev/null 2>&1; then
        fail "This server has no systemd. An apps server needs Ubuntu 24.04 or 22.04, or Debian 12."
    fi
    case "$OS_ID" in
        ubuntu|debian) ;;
        *)
            case " ${ID_LIKE:-} " in
                *" debian "*|*" ubuntu "*) say "  ${OS_NAME} is not Ubuntu or Debian itself, but it uses apt, so carrying on." ;;
                *) fail "${OS_NAME} is not one this works on. An apps server needs Ubuntu 24.04 or 22.04, or Debian 12." ;;
            esac
            ;;
    esac
    say "  ${OS_NAME}"
}

apt_quiet() {
    # A fresh cloud server often runs its own first upgrade for a minute or two: wait up to ten for it.
    DEBIAN_FRONTEND=noninteractive apt-get -y -q -o DPkg::Lock::Timeout=600 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"
}

caddy_available() {
    local candidate
    candidate="$(apt-cache policy caddy 2>/dev/null | sed -n 's/^ *Candidate: *//p')"
    [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

add_caddy_source() {
    # Ubuntu 22.04 has no caddy package of its own. Then the one place to get it is Caddy's own apt source.
    if [ "$OS_ID" = "ubuntu" ] && command -v add-apt-repository >/dev/null 2>&1; then
        add-apt-repository -y universe >/dev/null 2>&1 || true
        apt_quiet update >/dev/null || true
        caddy_available && return 0
    fi
    say "  This system has no caddy package of its own, so adding Caddy's own package source."
    mkdir -p /usr/share/keyrings
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
        || fail "Could not fetch the signing key of Caddy's package source."
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
        -o /etc/apt/sources.list.d/caddy-stable.list \
        || fail "Could not fetch the list of Caddy's package source."
    apt_quiet update >/dev/null || fail "apt-get update failed after adding Caddy's package source."
}

install_packages() {
    step "Installing the packages (Caddy, PostgreSQL, Python, git, the firewall), which takes a few minutes"
    apt_quiet update >/dev/null || fail "apt-get update failed. Is the server online?"
    apt_quiet install curl ca-certificates gnupg >/dev/null || fail "Could not install curl and ca-certificates."
    caddy_available || add_caddy_source
    apt_quiet install caddy postgresql python3 python3-venv python3-pip git \
        unattended-upgrades ufw openssh-client openssh-server sudo >/dev/null \
        || fail "Could not install the packages. The last lines of ${LOG} say why."
}

enable_security_upgrades() {
    step "Turning on automatic security updates"
    cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
    systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
}

add_swap() {
    local mem_kb
    mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
    if [ "${mem_kb:-0}" -lt 2000000 ] && [ -z "$(swapon --show --noheadings 2>/dev/null)" ]; then
        step "Adding 2 GB of swap, because this server has under 2 GB of memory"
        if [ ! -f /swapfile ]; then
            fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none \
                || fail "Could not make /swapfile."
            chmod 600 /swapfile
            mkswap /swapfile >/dev/null || fail "Could not format /swapfile as swap."
        fi
        swapon /swapfile || fail "Could not turn on /swapfile."
        grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
    fi
}

set_up_firewall() {
    step "Setting up the firewall: SSH, 80 and 443 open, everything else closed"
    local port
    # SSH first, on every port sshd listens on, so turning the firewall on can never lock anybody out.
    ufw allow OpenSSH >/dev/null 2>&1 || true
    ufw allow 22/tcp >/dev/null || fail "Could not open SSH in the firewall."
    for port in $(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}'); do
        ufw allow "${port}/tcp" >/dev/null || fail "Could not open SSH port ${port} in the firewall."
    done
    ufw allow 80/tcp >/dev/null || fail "Could not open port 80 in the firewall."
    ufw allow 443/tcp >/dev/null || fail "Could not open port 443 in the firewall."
    ufw --force enable >/dev/null || fail "Could not turn the firewall on."
}

set_up_postgres() {
    step "Starting PostgreSQL"
    systemctl enable --now postgresql >/dev/null 2>&1 || fail "PostgreSQL would not start."
}

set_up_caddy() {
    step "Setting up Caddy, which gives every app its HTTPS address"
    mkdir -p /etc/caddy/apps
    if [ ! -f /etc/caddy/apps/00-rouh-apps.caddy ]; then
        printf '# Each app has a file of its own here, written by rouh-app.\n' >/etc/caddy/apps/00-rouh-apps.caddy
    fi
    if [ -f /etc/caddy/Caddyfile ] && ! grep -q 'managed by rouh-apps' /etc/caddy/Caddyfile; then
        cp -n /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-rouh-apps
    fi
    cat >/etc/caddy/Caddyfile <<'EOF'
# managed by rouh-apps: each app's address is in /etc/caddy/apps/<name>.caddy
{
	admin localhost:2019
}

import /etc/caddy/apps/*.caddy
EOF
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
        || fail "Caddy does not accept /etc/caddy/Caddyfile."
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy || fail "Caddy would not start."
}

set_up_admin_user() {
    step "Making the user rouh, which Rouh's jobs log in as by SSH"
    if ! id rouh >/dev/null 2>&1; then
        useradd --create-home --shell /bin/bash --comment "Rouh apps" rouh || fail "Could not make the user rouh."
    fi
    # No password at all: the user logs in with the keys Rouh lists, and nothing else.
    usermod -p '*' rouh 2>/dev/null || true
    install -d -m 700 -o rouh -g rouh /home/rouh/.ssh
    touch /home/rouh/.ssh/authorized_keys
    chown rouh:rouh /home/rouh/.ssh/authorized_keys
    chmod 600 /home/rouh/.ssh/authorized_keys
    printf 'rouh ALL=(ALL) NOPASSWD:ALL\n' >/etc/sudoers.d/.rouh-apps.new
    chmod 440 /etc/sudoers.d/.rouh-apps.new
    visudo -cf /etc/sudoers.d/.rouh-apps.new >/dev/null || fail "sudo did not accept the rule for the user rouh."
    mv -f /etc/sudoers.d/.rouh-apps.new /etc/sudoers.d/rouh-apps
}

install_files() {
    step "Installing rouh-app and the agent that talks to Rouh"
    write_files
    local f
    for f in rouh-app rouh-apps-agent rouh-apps-agent.service rouh-apps-backup.service rouh-apps-backup.timer; do
        [ -s "${STAGE}/${f}" ] || fail "The script came without ${f}. Ask Rouh for a new line and run that."
    done
    python3 -I -c 'import ast, sys; [ast.parse(open(p).read(), p) for p in sys.argv[1:]]' \
        "${STAGE}/rouh-app" "${STAGE}/rouh-apps-agent" || fail "rouh-app or the agent came damaged."
    install -d -m 755 /usr/local/lib/rouh-apps
    install -m 755 "${STAGE}/rouh-app" /usr/local/bin/rouh-app
    install -m 755 "${STAGE}/rouh-apps-agent" /usr/local/lib/rouh-apps/rouh-apps-agent
    for f in rouh-apps-agent.service rouh-apps-backup.service rouh-apps-backup.timer; do
        install -m 644 "${STAGE}/${f}" "/etc/systemd/system/${f}"
    done
    install -d -m 755 "$ETC" "${ETC}/env" /srv/apps
    install -d -m 700 "${ETC}/apps" "${ETC}/removed"
    systemctl daemon-reload
    systemctl enable --now rouh-apps-backup.timer >/dev/null 2>&1 || fail "Could not turn on the nightly backups."
}

server_ip() {
    local ip
    ip="$(ip -4 -o route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
    case "$ip" in
        ""|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*|100.6[4-9].*|100.[7-9][0-9].*|100.1[01][0-9].*|100.12[0-7].*)
            # Behind the host's own address translation: ask what the world sees.
            ip="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || printf '%s' "$ip")"
            ;;
    esac
    printf '%s' "$ip"
}

write_server_facts() {
    local ip="$1"
    printf '{"ip": "%s"}\n' "$ip" >"${ETC}/server.json.tmp"
    chmod 644 "${ETC}/server.json.tmp"
    mv -f "${ETC}/server.json.tmp" "${ETC}/server.json"
}

join_rouh() {
    local ip
    ip="$(server_ip)"
    [ -n "$ip" ] || fail "Could not find this server's address."
    write_server_facts "$ip"
    if [ -s "${ETC}/agent.json" ]; then
        step "This server has already joined Rouh, so keeping its key"
        return 0
    fi
    step "Telling Rouh about this server"
    local cpus mem disk host body answer code why
    cpus="$(nproc 2>/dev/null || echo 1)"
    mem="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo)"
    disk="$(df -BG --output=size / 2>/dev/null | tail -n 1 | tr -dc '0-9')"
    host="$(hostname -f 2>/dev/null || hostname)"
    body="$(mktemp)"
    answer="$(mktemp)"
    python3 -I - "$host" "$ip" "$OS_NAME" "$cpus" "${mem:-0}" "${disk:-0}" "$SETUP_VERSION" >"$body" <<'PY' \
        || fail "Could not put together what to tell Rouh."
import glob, json, sys
host, ip, os_name, cpus, mem, disk, version = sys.argv[1:8]
keys = []
for path in sorted(glob.glob("/etc/ssh/ssh_host_*_key.pub")):
    try:
        with open(path) as f:
            line = f.read().strip()
    except OSError:
        continue
    if line:
        keys.append(line)
print(json.dumps({"hostname": host, "ip": ip, "os": os_name, "cpus": int(cpus or 1),
                  "memory_mb": int(mem or 0), "disk_gb": int(disk or 0), "version": version,
                  "ssh_host_keys": keys}))
PY
    code="$(curl -sS --max-time 60 -o "$answer" -w '%{http_code}' \
        -H 'Content-Type: application/json' --data-binary "@${body}" \
        "${ROUH_URL}/apps/join/${JOIN_CODE}")" || { rm -f "$body" "$answer"; fail "Could not reach Rouh at ${ROUH_URL}."; }
    rm -f "$body"
    if [ "$code" != "200" ]; then
        why="$(python3 -I -c 'import json, sys
try:
    print(json.load(open(sys.argv[1])).get("error") or "")
except Exception:
    print("")' "$answer")"
        rm -f "$answer"
        fail "Rouh did not take this server (it answered ${code}): ${why:-it gave no reason}"
    fi
    python3 -I - "$answer" "${ETC}/agent.json" <<'PY' || { rm -f "$answer"; fail "Rouh's answer could not be read."; }
import json, os, re, sys
answer = json.load(open(sys.argv[1]))
target = sys.argv[2]
config = {k: answer.get(k) for k in ("rouh", "key", "server_id", "name")}
if not isinstance(config["key"], str) or not config["key"] or not isinstance(config["rouh"], str):
    raise SystemExit("Rouh's answer has no key.")
tmp = target + ".tmp"
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(config, f)
os.replace(tmp, target)
os.chmod(target, 0o600)
pattern = re.compile(r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|"
                     r"sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]{16,}( [^\r\n]{0,200})?$")
keys = [k.strip() for k in answer.get("ssh_keys") or [] if isinstance(k, str) and pattern.match(k.strip())]
path = "/home/rouh/.ssh/authorized_keys"
try:
    old = open(path).read().splitlines()
except OSError:
    old = []
kept, inside = [], False
for line in old:
    if line.strip() == "# rouh-apps managed: begin":
        inside = True
    elif line.strip() == "# rouh-apps managed: end":
        inside = False
    elif not inside:
        kept.append(line)
with open(path + ".tmp", "w") as f:
    f.write("\n".join(kept + ["# rouh-apps managed: begin"] + keys + ["# rouh-apps managed: end"]) + "\n")
os.replace(path + ".tmp", path)
print("  Rouh named this server %s." % config["name"])
PY
    rm -f "$answer"
    chown rouh:rouh /home/rouh/.ssh/authorized_keys
    chmod 600 /home/rouh/.ssh/authorized_keys
}

start_agent() {
    step "Starting the agent, which checks in with Rouh every 30 seconds"
    systemctl enable rouh-apps-agent.service >/dev/null 2>&1 || fail "Could not turn the agent on."
    systemctl restart rouh-apps-agent.service || fail "The agent would not start."
}

main() {
    check_filled
    check_root
    start_log
    check_os
    install_packages
    enable_security_upgrades
    add_swap
    set_up_firewall
    set_up_postgres
    set_up_caddy
    set_up_admin_user
    install_files
    join_rouh
    start_agent
    say ""
    say "This apps server is ready."
    say "Rouh's page will show it within a minute, and Rouh can now put apps on it."
}

main "$@"
