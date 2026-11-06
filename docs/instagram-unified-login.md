# Kentexa Instagram Unified Login

This integration uses Meta's Instagram API with Unified Login (Facebook Login for Business configuration). It is intended for Instagram Professional accounts (Business or Creator) shared with Kentexa through the seller's business portfolio.

## Meta configuration

In the Kentexa Meta app, use the existing Instagram API (Unified Login) configuration. The configuration shown during setup is:

- Meta App ID: `2662750974163035`
- Instagram Unified Login configuration ID: `2184053165515259`
- Login configuration must remain Instagram Login Compatible.
- The configuration must include `instagram_basic` and `instagram_manage_messages`. Keep `instagram_manage_comments` and `instagram_content_publish` only if Kentexa will use those capabilities.
- Configure the exact redirect URI below in Meta's Facebook Login for Business / OAuth redirect settings.

Production redirect URI:

```
https://api.kentexa.com/business/instagram/callback
```

Do not use the example placeholder URL from Meta's dashboard.

## Render environment variables

Add these to the Kentexa API service in Render. Never commit the app secret or encryption key to GitHub.

| Variable | Value |
| --- | --- |
| `META_APP_ID` | `2662750974163035` |
| `META_APP_SECRET` | App Secret from Meta App Settings → Basic |
| `META_INSTAGRAM_CONFIG_ID` | `2184053165515259` |
| `META_INSTAGRAM_REDIRECT_URI` | `https://api.kentexa.com/business/instagram/callback` |
| `INSTAGRAM_TOKEN_ENCRYPTION_KEY` | A fresh 32-byte key encoded as 64 hexadecimal characters |

Generate the encryption key locally with:

```bash
openssl rand -hex 32
```

Keep the generated key private and stable. If it is lost or changed, previously stored Instagram access tokens cannot be decrypted and sellers will need to reconnect.

## API endpoints

All seller-facing endpoints require a Kentexa JWT:

- `GET /business/instagram/connect` — returns the Meta authorization URL for the authenticated seller.
- `GET /business/instagram/connections` — returns connected account metadata, never access tokens.
- `POST /business/instagram/disconnect?instagramUserId=<id>` — disconnect one account; omit the query parameter to disconnect all accounts owned by the seller.

Meta redirects to the public callback:

- `GET /business/instagram/callback?code=...&state=...` — validates the signed, ten-minute state, exchanges the authorization code, resolves the business portfolio and assigned Instagram professional accounts, then stores encrypted tokens.

## Security notes

- Tokens are encrypted with AES-256-GCM before database persistence.
- OAuth state is signed with the existing Kentexa JWT secret and expires after ten minutes.
- The callback does not accept a seller ID from the browser; the seller identity comes from the signed state.
- Access tokens and app secrets must never be returned by API responses or written to logs.
- The database migration must be applied before the new API is deployed.
- Meta App Review / Advanced Access and Live mode are required before sellers outside the app's tester roles can connect.

## Current scope

This stage completes the connection and token-storage foundation. Receiving Instagram DM webhooks, normalizing incoming messages into Kentexa conversations, sending replies, and subscribing each connected account to webhooks are separate integration stages.
