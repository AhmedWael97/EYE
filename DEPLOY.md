# Deploying EYE without GitHub Actions

GitHub Actions billing only affects **CI runner minutes** — pushing/pulling code
from GitHub and deploying to your server cost nothing. So we deploy directly.

Pick one of the three options below (Option 1 is recommended).

> The deploy steps themselves (pull → submodules → composer/migrate → rebuild
> Docker → nginx → health check) live in **`scripts/deploy.sh`**, extracted
> verbatim from the old `deploy.yml`. All three options run that script.

---

## Option 1 — One-command deploy from your machine (recommended)

No CI, no server-side setup beyond what you already have.

1. `cp scripts/.deploy.env.example scripts/.deploy.env` and fill in your server
   (`VPS_HOST`, `VPS_USER`, `VPS_PATH`, optional `VPS_SSH_KEY`/`VPS_PORT`).
   (`scripts/.deploy.env` is git-ignored.)
2. Make sure your SSH key is authorised on the server (same key the old Actions
   `VPS_SSH_KEY` used).
3. Deploy:
   ```bash
   ./scripts/remote-deploy.sh
   ```
   It SSHes in, pulls the latest `main` (+ submodules), and runs `scripts/deploy.sh`.

---

## Option 2 — `git push` to deploy

If you prefer `git push production main`:

On the server (in the existing repo checkout, e.g. `/srv/eye`):
```bash
git config receive.denyCurrentBranch updateInstead
cp scripts/post-receive .git/hooks/post-receive
chmod +x .git/hooks/post-receive
```
On your machine:
```bash
git remote add production ssh://USER@HOST:22/srv/eye
git push production main          # updates the server + auto-deploys
```

(Submodules are still fetched from GitHub during deploy, so the server needs read
access to the `backend`/`frontend` repos — the deploy keys you already have.)

---

## Option 3 — Keep GitHub Actions, but on a FREE self-hosted runner

If you want the old PR checks/auto-deploy back without paying for runner minutes:
self-hosted runners **don't consume billable minutes**.

1. GitHub → repo **Settings → Actions → Runners → New self-hosted runner**, follow
   the steps on your VPS (downloads + `./config.sh` + `./run.sh` or install as a service).
2. In `.github/workflows/*.yml`, change every `runs-on: ubuntu-latest` →
   `runs-on: self-hosted`.
3. Re-enable Actions. Jobs now run on your server, free.

> Note: if Actions is *hard-disabled* (unpaid bill, not just out of minutes),
> use Option 1 or 2 until billing is resolved — those don't touch Actions at all.

---

## Manual fallback (any option)
SSH in and run it yourself:
```bash
cd /srv/eye && bash scripts/deploy.sh
```

## What a deploy does (scripts/deploy.sh)
- `git pull` main + reset submodules (`backend`→main, `frontend`→master)
- `composer install` + `php artisan migrate --force` + config/route cache
- restart `php-fpm`, Horizon, scheduler, Reverb
- rebuild the Next.js (`node`) container + the `tracker-build` bundle
- restart nginx (restores HTTPS config if certs exist) + health check
