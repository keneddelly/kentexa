// Shared words and styles for "Omba bei" (owner 2026-10-26): hire a whole vehicle, or
// ask offices for a price for large goods / a container.
export const VEHICLE_LABEL = {
  kirikuu: 'Kirikuu / Pickup',
  canter: 'Canter',
  fuso: 'Fuso / Lori',
  container_truck: 'Lori la kontena',
  bus: 'Basi',
};
export const GOODS_LABEL = { large: 'Mzigo mkubwa', container: 'Kontena' };
export const STATUS_LABEL = { open: 'Inasubiri bei', accepted: 'Umechagua', cancelled: 'Imeghairiwa' };

export const what = (r) => (r.kind === 'vehicle'
  ? `Gari zima · ${VEHICLE_LABEL[r.vehicleType] || r.vehicleType}`
  : GOODS_LABEL[r.goodsType] || 'Mzigo mkubwa');
export const tzs = (n) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
export const localPhone = (p) => {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.startsWith('255') && d.length === 12 ? `0${d.slice(3)}` : d;
};

export const INK = '#0f1419';
export const MUTED = '#536471';
export const LINE = '#eff3f4';
export const BLUE = '#1d4ed8';
export const page = { minHeight: '100vh', background: '#f7f9f9', color: INK, fontFamily: 'inherit' };
export const body = { maxWidth: 560, margin: '0 auto', padding: '16px 16px calc(124px + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' };
export const card = { background: '#ffffff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, marginBottom: 12 };
export const label = { display: 'block', fontSize: 15, fontWeight: 700, marginBottom: 6 };
export const input = { width: '100%', height: 48, boxSizing: 'border-box', border: '1px solid #cfd9de', borderRadius: 12,
  padding: '0 12px', fontSize: 16, fontFamily: 'inherit', background: '#ffffff', color: INK };
export const primary = { width: '100%', height: 48, borderRadius: 24, border: 'none', background: INK, color: '#ffffff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
export const outline = { height: 40, padding: '0 16px', borderRadius: 20, border: '1px solid #cfd9de', background: '#ffffff',
  color: INK, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
export const chip = (on) => ({ minHeight: 44, padding: '8px 14px', borderRadius: 22, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 15, fontWeight: on ? 700 : 400, border: `1px solid ${on ? INK : '#cfd9de'}`, background: on ? INK : '#ffffff', color: on ? '#ffffff' : INK });
