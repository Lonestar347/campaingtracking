# Test deployment (Docker)

Runs the Campaign Tracker on a Linux server with Docker, reachable at your own
domain via HTTPS and protected by a shared password. Data (SQLite database and
uploaded reports) lives in the Docker volume `app-data` and survives updates.

> There is no real sign-in yet: behind the password, anyone can pick any user in
> the header ("Dev sign-in"). Use this for testing only, with sample data.

## Requirements
- Linux server (e.g. Ubuntu 24.04, 1 GB RAM or more) with Docker:
  `curl -fsSL https://get.docker.com | sh`
- A domain or subdomain whose DNS A record points to the server's IP
- Ports 80 and 443 open

## Install
```bash
git clone https://github.com/Lonestar347/campaingtracking.git
cd campaingtracking
cp .env.example .env
nano .env   # set DOMAIN and BASIC_AUTH_PASSWORD (uncomment the lines)
docker compose up -d --build
```
Open `https://<DOMAIN>`, sign in with user `josera` (or BASIC_AUTH_USER) and
the password. The first start loads the sample data (`SEED_SAMPLE_DATA=false`
in .env skips this).

## Update
```bash
git pull
docker compose up -d --build
```

## Back up / reset
```bash
docker compose cp app:/data ./backup-$(date +%F)       # backup
docker compose down -v && docker compose up -d --build  # reset to sample data (deletes everything)
```

## Logs
```bash
docker compose logs -f app
```
