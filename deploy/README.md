# Deploy and ops

Everything needed to run this on a server, in the order it happens. Written down because the
server's state is part of the record: the season ledger cannot be recomputed from the code.

## What a deploy is

```bash
npm ci && npm run check && npm run build     # then: next start -H 127.0.0.1 -p 3230
```

On this project's own server that is a release directory plus a symlink:

```text
/srv/worm/releases/<UTC stamp>      the checkout and its build
/srv/worm/current -> releases/<...> switched only after `npm run check` passes
/etc/worm.env                       0600, root: WORM_DATA_DIR, WORM_RPC_URL, and the keys
```

Two things about the runtime are not optional:

- **Node 22.** On the system Node 20, `next/og`'s `ImageResponse` segfaults while the build
  prerenders the share card. The deployed unit uses a self-contained copy at `/opt/node22` because
  the service user cannot read `/root/.nvm`.
- **The data directory lives outside the release tree** (`WORM_DATA_DIR`). A deploy must never be
  able to take the season with it.

## The timers

| Unit | When | What it does |
| --- | --- | --- |
| `worm.service` | always | the site: one Node process, no cluster |
| `worm-backup.timer` | daily, 04:37 UTC | `deploy/backup.sh` -- the ledger, the board, the run records and the anchor manifest into `/var/backups/worm`, kept 14 days |
| `worm-watchdog.timer` | every 5 minutes | `deploy/watchdog.sh` -- one request to `/api/live`; three failures in a row restart the service and log to the journal |
| `worm-cert-renew.timer` | twice daily | renews this host's Let's Encrypt certificate and reloads Nginx |

Install them by copying the unit files next to the app and enabling the timers:

```bash
sudo install -m 644 deploy/worm-backup.service deploy/worm-backup.timer \
                    deploy/worm-watchdog.service deploy/worm-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now worm-backup.timer worm-watchdog.timer
```

## Cron, in UTC

The day boundary is UTC, so the jobs are too (`CRON_TZ=UTC` in `/etc/cron.d/worm`):

| When | Job |
| --- | --- |
| every 5 minutes | `curl /api/live`, so the server does its own work without waiting for a visitor |
| 22:05 UTC | `npm run post:daily` -- the day's post. **Dry run** until someone adds `--post` |
| 00:05 UTC | `npm run anchor` and `npm run anchor:board` for the day that just closed. **Dry run** until someone adds `--send` |

The anchors and the post are deliberately two commands with two flags: writing a commitment or
posting to X should be an act somebody chose, not something a timer drifted into.

## Watching it

```bash
systemctl status worm
journalctl -u worm -n 50              # the app
journalctl -t worm-watchdog           # health checks that failed, and restarts
cat /var/log/worm/cron.log            # the three cron jobs
ls -lt /var/backups/worm | head       # the daily record backups
curl -s http://127.0.0.1:3230/api/live | head -c 200
```

## Restoring

The backup is a tarball of `data/` plus the anchor manifest, so a restore is a copy back and a
restart. The commands are in the header of `deploy/backup.sh`. After restoring, the check that
matters is the same one the site makes: `npm run verify:anchors` recomputes each anchored day from
the code and fails if the restored ledger disagrees.

## What this does not cover

- **One host.** No failover, no cluster. A dead server is a dead season until it is restored from a
  backup -- and the backups live on the same disk, so a copy off the machine is still on the list.
- **No alerting.** The watchdog restarts the process and writes to the journal; it does not tell
  anyone. If nobody reads the journal, nobody knows.
- **`/api/run` is a compute endpoint** with no rate limit at the proxy. It is bounded (20,000 ticks,
  cached in process), but a public site should decide what it will spend before someone decides for
  it.
