### Cryptowave Register Bot

Node.js automation that recreates the provided `curl` request using `blessed` for a TUI, `@faker-js/faker` for randomized account data, and HTTPS proxies for every request.

#### Setup
1. `cd fantastic-journey`
2. Install deps: `npm install`
3. Create `proxies.txt` in this folder with one proxy per line (`http://user:pass@host:port`). HTTPS and unauthenticated proxies are supported as well.

Optional environment overrides:
- `WORKERS` – concurrent registration workers (default `3`)
- `MIN_DELAY_MS` / `MAX_DELAY_MS` – inclusive cooldown range between requests (defaults `5000`/`15000`)
- `REQUEST_TIMEOUT_MS` – Axios timeout per request

#### Run
```bash
node register.js
```

Use `space` to pause/resume and `q`/`esc`/`Ctrl+C` to exit. Stats panel shows rolling success/failure counts plus the last proxy in use.

Every successful registration is appended to `accounts-success.csv` (email, password, display name, proxy).
