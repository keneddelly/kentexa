/**
 * Professional links (owner 2026-11-03: "post links, store links, product links all should be
 * professional to allow KenteXa organic growth"). Every share uses kentexa.com:
 *   person or business  https://kentexa.com/@bishoo
 *   product / tangazo / huduma  https://kentexa.com/product/42-simu-samsung-a15
 *   post  https://kentexa.com/post/88
 * The website host sends these addresses to the KenteXa server, which fills in the title and
 * picture for WhatsApp/Facebook (share.controller.ts html/*); the person stays on the address.
 */
export const siteOrigin = () => (typeof window !== 'undefined' && /kentexa\.com$/.test(window.location.hostname)
  ? window.location.origin : 'https://kentexa.com');

/** "Simu Samsung A15 (128GB)!" -> "simu-samsung-a15-128gb" (same rule as the server). */
export const slugify = (text) => String(text ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 60).replace(/-+$/g, '');

const itemLink = (segment, id, name) => {
  if (!/^\d+$/.test(String(id ?? ''))) return siteOrigin();
  const slug = slugify(name);
  return `${siteOrigin()}/${segment}/${id}${slug ? `-${slug}` : ''}`;
};

export const productLink = (id, name) => itemLink('product', id, name);
export const classifiedLink = (id, title) => itemLink('classified', id, title);
export const serviceLink = (id, title) => itemLink('service', id, title);
export const postLink = (id) => (/^\d+$/.test(String(id ?? '')) ? `${siteOrigin()}/post/${id}` : siteOrigin());

/** A person's or a business's page by its handle; without a handle, its profile page with the exact identity. */
export const profileLink = (username, ownerId, commerceProfileId) => {
  const handle = String(username || '').replace(/^@/, '');
  if (/^[a-z0-9_]{2,40}$/i.test(handle)) return `${siteOrigin()}/@${handle.toLowerCase()}`;
  if (/^\d+$/.test(String(ownerId ?? ''))) return `${siteOrigin()}/store/${ownerId}${commerceProfileId ? `?cp=${commerceProfileId}` : ''}`;
  return siteOrigin();
};
