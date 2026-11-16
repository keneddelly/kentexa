# Professional links: one-time Render setting (owner 2026-11-03)

KenteXa shares kentexa.com links: `/@handle`, `/product/42-name`, `/classified/7-name`,
`/service/3-name`, `/post/88`. For WhatsApp/Facebook to show the picture, title and price,
the website must ask the KenteXa server for these pages (share.controller.ts `html/*`).
The visitor stays on kentexa.com and gets the normal app.

Render dashboard -> the frontend static site -> **Redirects/Rewrites** -> add, ABOVE the existing
`/*  ->  /index.html` rule:

| Source | Destination | Action |
|---|---|---|
| `/product/*` | `https://api.kentexa.com/share/html/product/*` | Rewrite |
| `/classified/*` | `https://api.kentexa.com/share/html/classified/*` | Rewrite |
| `/service/*` | `https://api.kentexa.com/share/html/service/*` | Rewrite |
| `/post/*` | `https://api.kentexa.com/share/html/post/*` | Rewrite |
| `/@*` | `https://api.kentexa.com/share/html/u/*` | Rewrite |
| `/community/*` | `https://api.kentexa.com/share/html/community/*` | Rewrite |
| `/s/*` | `https://api.kentexa.com/share/html/s/*` | Rewrite |

Without these rules the links still open the right page; only the preview picture is missing.
If the server cannot read the app page it sends the visitor to `kentexa.com/?go=<path>`, which
opens the same page.


**Update 2026-11-16 (viral engine A2, issue #381):** two more rules, `/community/*` (community previews) and `/s/*` (short share links `kentexa.com/s/<code>`). Without the `/s/*` rule a short link still opens the right page (the app asks the server where it leads); only its preview is missing.
