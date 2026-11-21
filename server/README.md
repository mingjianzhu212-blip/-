# Sect helper service

The browser game remains playable without a server. This optional Node.js service enables cross-player breakthrough requests, assists, and reward claims.

## Run locally

From the project directory:

```powershell
node server/sect-server.js
```

The default endpoint is `http://127.0.0.1:8787`. In the game settings, use that address as the sect service URL. Set `SECT_HOST=0.0.0.0` to listen on a network interface and `SECT_PORT` to change the port. For a hosted frontend, list exact allowed origins in `SECT_ALLOWED_ORIGINS`, separated by commas.

Player and active-request state is stored in `server/data/sect.json`. Writes use a temporary file, flush it, and rename it into place. Keep this directory on persistent storage and include it in backups.

## Verify

```powershell
node --test server/sect-server.test.js
node verify.js
node verify_break.js
```

The service provides lightweight game coordination, not authoritative character accounts or anti-cheat. A public competitive deployment should move character state and breakthrough rolls to an authenticated game server.
