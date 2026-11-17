/**
 * Writers & Contributors Programme, step B (#417, owner approved 2026-11-18): the plain rules of the
 * invitation tool, kept pure so they are tested on their own.
 *
 * - An admin adds each person by hand, reviews them, and presses send. Nothing is sent by itself.
 * - At most 50 invitations a day (Dar es Salaam day), and only while WRITER_OUTREACH_ENABLED=true.
 * - Never to an address that asked to stop (email_suppression), never twice to the same address.
 * - Every invitation says who sent it, why, and carries a one-press unsubscribe link.
 * - No promises of payment or readers.
 */
import { randomBytes } from 'crypto';

export const OUTREACH_RULES = Object.freeze({ dailyCap: 50, statuses: ['new', 'approved', 'rejected', 'sent', 'unsubscribed'] as const });
const EAT = 3 * 3600000;

export const outreachEnabled = (env: NodeJS.ProcessEnv = process.env) => String(env.WRITER_OUTREACH_ENABLED || '').trim().toLowerCase() === 'true';

export const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const validEmail = (v: unknown) => {
  const e = normEmail(v);
  return e.length <= 200 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(e);
};

/** Plain text for a field: no markup, trimmed, cut to max. */
export const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A public link (http/https) or nothing. */
export const cleanUrl = (v: unknown) => {
  const s = String(v ?? '').trim().slice(0, 300);
  return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : '';
};

export const newToken = () => randomBytes(18).toString('hex');

/** Start of today in Dar es Salaam, as a Date (UTC instant). */
export const startOfEatDay = (now: Date = new Date()) => {
  const local = new Date(now.getTime() + EAT);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - EAT);
};

export const leftToday = (sentToday: number, cap = OUTREACH_RULES.dailyCap) => Math.max(0, cap - Math.max(0, Number(sentToday) || 0));

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const inviteSubject = (name: string) => `${cleanText(name, 60) || 'Habari'}, tunakualika kuandika kwenye KenteXa`;

/**
 * The invitation (Swahili first, short English). Personal: their name and, if known, the topic they
 * write about. Footer: who sent it, why, contact (the sending address and kentexa.com), unsubscribe.
 */
export const inviteHtml = (p: { name: string; topic?: string | null }, opts: { frontend: string; joinUrl: string; unsubscribeUrl: string; contactEmail: string }) => {
  const name = esc(cleanText(p.name, 60)) || 'rafiki';
  const topic = p.topic ? esc(cleanText(p.topic, 80)) : '';
  const about = topic ? `Tumeona unaandika kuhusu <b>${topic}</b>. ` : '';
  const aboutEn = topic ? ` about ${topic}` : '';
  const contact = esc(opts.contactEmail || '');
  return `
  <div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6ecf0;">
      <div style="background:#0b1224;padding:20px 24px;">
        <div style="font-size:22px;font-weight:900;color:#ffffff;">Kente<span style="color:#60a5fa;">Xa</span></div>
        <div style="font-size:13px;color:#cfdcff;margin-top:4px;">Waandishi na wachangiaji</div>
      </div>
      <div style="padding:24px;font-size:15px;line-height:1.6;color:#334155;">
        <p style="margin:0 0 12px;">Habari ${name},</p>
        <p style="margin:0 0 12px;">${about}Tungependa kukualika uchapishe makala, uchambuzi au maoni yako kwenye KenteXa, jukwaa la Tanzania ambapo biashara, jumuiya na wasomaji hukutana.</p>
        <p style="margin:0 0 12px;">Utapata ukurasa wako wa mwandishi, mhariri wa makala, idadi ya wasomaji kwa kila makala, na nafasi ya kutambuliwa kama Mwandishi wa Wiki. Kujiunga ni bure, kwa Google au barua pepe.</p>
        <p style="margin:0 0 16px;">Kwa uwazi: kwa sasa hatulipi kwa makala na hatuahidi idadi fulani ya wasomaji.</p>
        <a href="${esc(opts.joinUrl)}" style="display:block;background:#0f1419;color:#ffffff;text-decoration:none;padding:14px;border-radius:999px;text-align:center;font-size:15px;font-weight:700;">Soma zaidi na anza kuandika</a>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b;"><b>English:</b> Hello ${name}, we would like to invite you to publish your articles${aboutEn} on KenteXa, a Tanzanian platform where businesses, communities and readers meet. It is free; we do not pay for articles or promise readers at present.</p>
      </div>
      <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;color:#64748b;line-height:1.6;">
        Barua hii imetumwa mara moja na timu ya KenteXa kwa sababu kazi yako ya uandishi iko wazi mtandaoni. Hatutakutumia tena bila wewe kujiunga.<br>
        Mawasiliano: ${contact} · <a href="${esc(opts.frontend)}" style="color:#64748b;">kentexa.com</a><br>
        <a href="${esc(opts.unsubscribeUrl)}" style="color:#64748b;">Usinitumie barua tena (unsubscribe)</a>
      </div>
    </div>
  </div>`;
};

/** The page shown by the unsubscribe link (a button, so link scanners do not unsubscribe people). */
export const unsubscribePage = (state: 'ask' | 'done', actionUrl: string) => `<!doctype html><html lang="sw"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>KenteXa</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f5f7fb;color:#0f1419;">
<div style="max-width:460px;margin:40px auto;padding:24px;background:#fff;border:1px solid #e6ecf0;border-radius:16px;">
<div style="font-size:22px;font-weight:900;">Kente<span style="color:#1d4ed8;">Xa</span></div>
${state === 'done'
    ? '<h1 style="font-size:20px;">Umeondolewa</h1><p style="color:#536471;line-height:1.6;">Hatutakutumia tena mialiko kwa barua pepe hii. You will not receive further invitations.</p>'
    : `<h1 style="font-size:20px;">Usitumiwe barua tena?</h1><p style="color:#536471;line-height:1.6;">Bonyeza kitufe hapa chini kuacha kupokea mialiko ya KenteXa. Press the button to stop KenteXa invitations.</p>
<form method="post" action="${esc(actionUrl)}"><button type="submit" style="height:42px;padding:0 20px;border:none;border-radius:21px;background:#0f1419;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Ndiyo, niondoe</button></form>`}
<p style="margin-top:20px;font-size:13px;"><a href="https://kentexa.com/" style="color:#1d4ed8;">kentexa.com</a></p>
</div></body></html>`;
