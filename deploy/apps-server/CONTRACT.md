# The apps server and Rouh: the contract

The one place both sides read: Rouh's side (`rouh/apps_hosting.py`, `rouh/web/apps_hosting.py`) and the
apps server's side (this folder: `setup.sh`, `rouh-app`, `rouh-apps-agent`). Change both in one commit.

The apps server never takes a connection from Rouh. It calls Rouh, over HTTPS, every 30 seconds, says how it
is, and takes the commands waiting for it from a closed list. So it works behind any firewall, with any host,
and Rouh needs no SSH to it for the everyday work. Nothing Rouh sends is ever run as a shell command: a
command is a verb from the list below and an app's name, checked again on the server.

## 1. Joining (once)

The person presses Set up an apps server in Rouh. Rouh makes a join code (32 random bytes, url-safe base64,
good for 7 days, for one server) and shows one line:

    curl -fsSL https://<rouh>/apps/join/<code> | sudo bash

The same script is given to a host as its first-boot script: Hostinger's post-install script, Hetzner's
Cloud config, DigitalOcean's User data (each takes a bash script that starts with `#!/bin/bash`), as

    #!/bin/bash
    curl -fsSL https://<rouh>/apps/join/<code> | bash

- `GET /apps/join/<code>` answers `setup.sh` with `__ROUH_URL__` and `__JOIN_CODE__` filled in, and the
  files of this folder (`rouh-app`, `rouh-apps-agent`, the systemd units) inside it as here-documents
  between the lines `# ---- BEGIN FILES ----` and `# ---- END FILES ----`, which Rouh fills in
  (`__FILES__`). A spent or unknown code answers a script that only prints why and exits 1.
- Each file goes in as `put_file <name> <mode>` reading a here-document with a quoted delimiter, so
  nothing in it is expanded, and the delimiter must not be a line of the file:

      put_file rouh-app 0755 <<'ROUH_FILE_END'
      ...the file exactly...
      ROUH_FILE_END

  `<name>` is the file's name in this folder (`rouh-app`, `rouh-apps-agent`, `rouh-apps-agent.service`,
  `rouh-apps-backup.service`, `rouh-apps-backup.timer`); `setup.sh` puts each in its place and refuses to
  go on without all five. The marker lines sit inside a shell function, so the here-documents are only
  read, and the whole script only runs, once it has all come down the pipe.
- At its end the script calls

      POST /apps/join/<code>   Content-Type: application/json
      {"hostname": "...", "ip": "203.0.113.7", "os": "Ubuntu 24.04.1 LTS", "cpus": 2, "memory_mb": 7940,
       "disk_gb": 96, "version": "1", "ssh_host_keys": ["ssh-ed25519 AAAA... root@host"]}

  and Rouh answers 200

      {"server_id": 7, "name": "apps-1", "key": "<agent key, 43 chars>", "rouh": "https://<rouh>",
       "every": 30, "ssh_keys": ["ssh-ed25519 AAAA... rouh-jobs"]}

  The code is spent by that answer. The script writes `/etc/rouh-apps/agent.json`
  (`{"rouh": ..., "key": ..., "server_id": ..., "name": ...}`, mode 600, root) and starts the agent.
  Any other answer: the script prints Rouh's `error` and exits 1, leaving what it installed.

## 2. Every 30 seconds: the agent

    POST /api/apps/agent    Authorization: Bearer <key>    Content-Type: application/json
    {
      "version": "1",
      "system": {"os": "...", "cpus": 2, "memory_mb": 7940, "memory_free_mb": 5100, "disk_gb": 96,
                 "disk_free_gb": 80, "load": 0.12, "uptime_s": 86400},
      "apps": [ ...only in a full report, see below... ],
      "taken": [12],                       ids of commands started since the last call
      "results": [{"id": 11, "ok": true, "output": "last 20000 characters", "finished_at": 1764316800.0}]
    }

Rouh answers 200

    {"commands": [{"id": 13, "verb": "restart", "app": "notes", "args": {}}],
     "ssh_keys": ["..."], "every": 30, "full": false}

- `full: true` asks for a full report in the next call (Rouh asks every 5 minutes and after each command).
  A full report has `apps`, one per app:

      {"name": "notes", "kind": "python", "url": "https://notes.example.com",
       "test_url": "https://test-notes.example.com", "state": "running", "release": "20261128-071500-a1b2c3d",
       "released_at": 1764314100.0, "previous_release": "20261120-...", "repo": "git@github.com:o/notes.git",
       "branch": "main", "deploy_key": "ssh-ed25519 AAAA... app-notes", "memory_mb": 120,
       "memory_limit": "512M", "backup_at": 1764288000.0, "backup_ok": true,
       "restore_test_at": 1764288300.0, "restore_test_ok": true}

  `state` is one of running, stopped, failed, static, new (made, never deployed). `memory_limit` is null
  for a static site, `memory_mb` is null when nothing is running, and `last_error` is the reason the last
  deploy failed, or null.
- 401 means the key is no longer good (the server was removed in Rouh): the agent stops asking and says
  so in its log, once a minute.
- `ssh_keys` is the whole list of public keys that may log in as the `rouh` user; the agent writes them
  between `# rouh-apps managed: begin` and `# rouh-apps managed: end` in `/home/rouh/.ssh/authorized_keys`.

## 3. The commands

`verb` is one of these, and `app` is a name matching `^[a-z][a-z0-9-]{1,27}$` (empty for `check`): at most
28 characters, because the app's Linux user is `app-<name>` and Linux allows 32. The agent
runs `rouh-app <verb> <app>` with the args as `--name value` flags, with a time limit (deploy, update, new:
20 minutes; the rest: 5), and sends back its last 20,000 characters of output.

| verb | args | what `rouh-app` does |
|---|---|---|
| `new` | `kind` (python, static), `repo`, `branch`, `domain`, `memory`, `database` (true/false) | the app's Linux user, folders, database and login, services, its address in Caddy; prints its deploy key |
| `deploy` | `ref` (optional) | the code at ref to a new release, the test copy first, checked, then live; the old live stays if the check fails |
| `update` | none | `deploy` at the newest commit of its branch |
| `rollback` | none | live back to the release before, restarted and checked |
| `restart` | none | live restarted and checked |
| `logs` | `lines` (default 200) | the last lines of the live service's log |
| `backup` | none | the database and the app's files now |
| `restore-test` | none | the newest backup restored into a throwaway database, counted, dropped |
| `check` | none | a full report next call (the agent answers it itself, without `rouh-app`) |

A command the agent refuses (a verb not in this list, a bad name, a value that is not one it takes) is
reported as a result with `ok: false` and the reason. `remove` is not in the list on purpose: it is only
ever run by a person or a job logged in by SSH (`sudo rouh-app remove NAME --yes`).

## 4. Each app (the standard)

- Linux user `app-<name>`, home `/srv/apps/<name>`: `releases/<stamp>-<sha>/`, `live` and `test` (links to a
  release), `shared/` (its `.env`, uploads, the deploy key), `backups/`.
- A PostgreSQL database `app_<name>` with a login of its own (`app_<name>`, a random password in
  `shared/.env` as `DATABASE_URL`), when `database` is true.
- systemd services `app-<name>.service` (live) and `app-<name>-test.service`, each `User=app-<name>`,
  `MemoryMax=<memory>` (default 512M), `Restart=on-failure`, `NoNewPrivileges`, `ProtectSystem=strict`.
- Its address in Caddy (`/etc/caddy/apps/<name>.caddy`), with HTTPS by itself: the `domain` given, else
  `<name>.<ip with dashes>.sslip.io`, and `test-<name>.` before the same for the test copy.
- Its code is a git repository; `rouh-app.json` at its top says how it runs:
  `{"kind": "python", "start": "gunicorn -b 127.0.0.1:$PORT app:app", "migrate": "", "health": "/healthz",
  "memory": "512M", "database": true}`. Python apps pin their packages in `requirements.txt`; each release
  has its own virtual environment.
- The test copy runs the same release on its own port and address, with the same database and
  `shared/`: it proves the release starts and answers before live gets it, not a second set of data.
- Backups every night at 03:30 server time, 14 kept, each followed by a test restore.
