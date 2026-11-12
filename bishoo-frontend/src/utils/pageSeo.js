const SITE = 'https://kentexa.com';

const setMeta = (selector, attribute, value) => {
  if (!value) return;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    const [kind, name] = selector.match(/(name|property)="([^"]+)"/).slice(1);
    node.setAttribute(kind, name);
    document.head.appendChild(node);
  }
  node.setAttribute('content', String(value));
};

const setCanonical = (url) => {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', url);
};

export const applyPageSeo = ({ title, description, canonical, image, type = 'website', jsonLd }) => {
  if (typeof document === 'undefined') return () => {};
  const previousTitle = document.title;
  const selectors = [
    'meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]',
    'meta[property="og:url"]', 'meta[property="og:image"]', 'meta[property="og:type"]',
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'meta[name="twitter:image"]',
  ];
  const previousMeta = selectors.map(selector => [selector, document.head.querySelector(selector)?.getAttribute('content') ?? null]);
  const canonicalNode = document.head.querySelector('link[rel="canonical"]');
  const previousCanonical = canonicalNode?.getAttribute('href') ?? null;
  const previousJsonLd = document.getElementById('kentexa-page-jsonld');

  const shareImage = image || `${SITE}/og-image.png`;
  document.title = title;
  setMeta('meta[name="description"]', 'name', description);
  setMeta('meta[property="og:title"]', 'property', title);
  setMeta('meta[property="og:description"]', 'property', description);
  setMeta('meta[property="og:url"]', 'property', canonical);
  setMeta('meta[property="og:image"]', 'property', shareImage);
  setMeta('meta[property="og:type"]', 'property', type);
  setMeta('meta[name="twitter:title"]', 'name', title);
  setMeta('meta[name="twitter:description"]', 'name', description);
  setMeta('meta[name="twitter:image"]', 'name', shareImage);
  setCanonical(canonical);

  if (jsonLd) {
    previousJsonLd?.remove();
    const script = document.createElement('script');
    script.id = 'kentexa-page-jsonld';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  }

  return () => {
    document.title = previousTitle;
    previousMeta.forEach(([selector, content]) => {
      const node = document.head.querySelector(selector);
      if (node && content !== null) node.setAttribute('content', content);
      else if (node) node.removeAttribute('content');
    });
    const currentCanonical = document.head.querySelector('link[rel="canonical"]');
    if (currentCanonical && previousCanonical !== null) currentCanonical.setAttribute('href', previousCanonical);
    else if (currentCanonical) currentCanonical.removeAttribute('href');
    document.getElementById('kentexa-page-jsonld')?.remove();
    if (previousJsonLd) document.head.appendChild(previousJsonLd);
  };
};

export const absoluteImageUrl = (image) => {
  if (!image || typeof image !== 'string') return undefined;
  try { return new URL(image, SITE).href; } catch { return undefined; }
};
