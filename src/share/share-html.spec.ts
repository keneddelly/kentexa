import { injectMeta, parseRef, slugify } from './share-html';

// Owner 2026-11-03: professional links (kentexa.com/product/42-simu-samsung, /@handle, /post/88).
describe('share html', () => {
  it('readable link names', () => {
    expect(slugify('Simu Samsung A15 (128GB)!')).toBe('simu-samsung-a15-128gb');
    expect(slugify('Café  Mbezi — Dar')).toBe('cafe-mbezi-dar');
    expect(parseRef('42-simu-samsung')).toBe(42);
    expect(parseRef('42')).toBe(42);
    expect(parseRef('abc')).toBeNull();
  });

  it('the app page gets this page\'s title, description and picture instead of the generic ones', () => {
    const index = '<!doctype html><html><head><meta charset="utf-8"><title>KenteXa</title><meta name="description" content="generic"><meta property="og:title" content="g"></head><body><div id="root"></div><script src="/static/js/main.js"></script></body></html>';
    const out = injectMeta(index, { title: 'Simu "A15" · TZS 420,000', description: 'Duka la Asha', image: 'https://img/1.jpg', url: 'https://kentexa.com/product/42-simu', fallbackImage: 'x' });
    expect(out).toContain('<title>Simu &quot;A15&quot; · TZS 420,000</title>');
    expect(out).toContain('<meta property="og:image" content="https://img/1.jpg" />');
    expect(out).toContain('<link rel="canonical" href="https://kentexa.com/product/42-simu" />');
    expect(out).not.toContain('content="generic"');
    expect(out).not.toContain('<title>KenteXa</title>');
    expect(out).toContain('<script src="/static/js/main.js"></script>');
  });
});
