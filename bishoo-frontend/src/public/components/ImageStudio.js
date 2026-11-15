import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Kentexa Image Studio.
 * Edits a local canvas copy; the original upload is never mutated.
 * Exported output is a new File that follows the existing /upload/images flow.
 */
const FORMATS = [
  { key: 'original', label: 'Asili', ratio: null },
  { key: 'square', label: 'Mraba', ratio: 1 },
  { key: 'portrait', label: 'Portrait 4:5', ratio: 4 / 5 },
  { key: 'landscape', label: 'Landscape', ratio: 16 / 9 },
  { key: 'story', label: 'Story 9:16', ratio: 9 / 16 },
];
const BACKGROUNDS = [
  { key: 'blur', label: 'Blur', color: '#e8edf3' },
  { key: 'light', label: 'Nyeupe', color: '#ffffff' },
  { key: 'dark', label: 'Nyeusi', color: '#111827' },
];

export default function ImageStudio({ photo, onClose, onSave }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const [format, setFormat] = useState('original');
  const [mode, setMode] = useState('fit');
  const [background, setBackground] = useState('blur');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = FORMATS.find((item) => item.key === format) || FORMATS[0];

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setReady(true);
    };
    image.onerror = () => active && setError('Picha haikuweza kufunguliwa. Jaribu picha nyingine.');
    image.crossOrigin = 'anonymous';
    image.src = photo.preview || photo.url;
    return () => { active = false; };
  }, [photo.preview, photo.url]);

  const dimensions = useCallback(() => {
    const image = imageRef.current;
    if (!image) return { width: 900, height: 675 };
    if (selected.ratio) {
      const width = 900;
      return { width, height: Math.round(width / selected.ratio) };
    }
    const rotated = rotation % 180 !== 0;
    const ratio = (rotated ? image.naturalHeight / image.naturalWidth : image.naturalWidth / image.naturalHeight) || 4 / 3;
    const bounded = Math.min(16 / 9, Math.max(9 / 16, ratio));
    const width = bounded < 1 ? 675 : 900;
    return { width, height: Math.round(width / bounded) };
  }, [selected.ratio, rotation]);

  const draw = useCallback((target, exporting = false) => {
    const image = imageRef.current;
    if (!image || !target) return;
    const { width, height } = dimensions();
    const ratio = exporting ? 1 : Math.min(1, 900 / width, 900 / height);
    const cw = Math.round(width * ratio);
    const ch = Math.round(height * ratio);
    target.width = cw;
    target.height = ch;
    const ctx = target.getContext('2d');
    const bg = BACKGROUNDS.find((item) => item.key === background);
    ctx.fillStyle = bg?.color || '#e8edf3';
    ctx.fillRect(0, 0, cw, ch);

    const rotated = rotation % 180 !== 0;
    const sourceWidth = rotated ? image.naturalHeight : image.naturalWidth;
    const sourceHeight = rotated ? image.naturalWidth : image.naturalHeight;
    const fitScale = mode === 'fit'
      ? Math.min(cw / sourceWidth, ch / sourceHeight)
      : Math.max(cw / sourceWidth, ch / sourceHeight);
    const scale = fitScale * zoom;
    const dx = offset.x * ratio;
    const dy = offset.y * ratio;

    if (background === 'blur') {
      ctx.save();
      ctx.filter = 'blur(22px) brightness(0.82)';
      const bgScale = Math.max(cw / sourceWidth, ch / sourceHeight) * 1.12;
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(image, -image.naturalWidth * bgScale / 2, -image.naturalHeight * bgScale / 2,
        image.naturalWidth * bgScale, image.naturalHeight * bgScale);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cw / 2 + dx, ch / 2 + dy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    ctx.restore();
  }, [dimensions, background, rotation, mode, zoom, offset.x, offset.y]);

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    try { draw(canvasRef.current); }
    catch { setError('Picha hii haiwezi kuhaririwa kwenye kifaa hiki.'); }
  }, [ready, draw]);

  const pointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  };
  const pointerMove = (event) => {
    if (!dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = canvasRef.current.width / rect.width;
    const sy = canvasRef.current.height / rect.height;
    setOffset({
      x: dragRef.current.offset.x + (event.clientX - dragRef.current.x) * sx,
      y: dragRef.current.offset.y + (event.clientY - dragRef.current.y) * sy,
    });
  };
  const pointerUp = () => { dragRef.current = null; };

  const save = () => {
    if (!canvasRef.current || saving) return;
    setSaving(true);
    try {
      const output = document.createElement('canvas');
      draw(output, true);
      output.toBlob((blob) => {
        if (!blob) {
          setError('Imeshindikana kuandaa picha. Jaribu tena.');
          setSaving(false);
          return;
        }
        const baseName = (photo.file?.name || 'kentexa-image').replace(/\.[^.]+$/, '');
        const file = new File([blob], baseName + '-kentexa.jpg', { type: 'image/jpeg', lastModified: Date.now() });
        const preview = URL.createObjectURL(file);
        onSave({ file, preview, width: output.width, height: output.height });
      }, 'image/jpeg', 0.92);
    } catch {
      setError('Imeshindikana kuhariri picha hii. Jaribu picha nyingine.');
      setSaving(false);
    }
  };

  const buttonStyle = (active) => ({
    minHeight: 40, padding: '8px 12px', borderRadius: 12, border: '1px solid ' + (active ? '#2563EB' : '#e5e7eb'),
    background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#374151',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });

  return (
    <div role="dialog" aria-modal="true" aria-label="Kentexa Image Studio" data-testid="image-studio"
      style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(8,15,28,.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <section style={{ width: '100%', maxWidth: 560, maxHeight: '96dvh', overflowY: 'auto', background: '#fff', color: '#0f1419',
        borderRadius: '22px 22px 0 0', padding: '12px 16px max(18px, env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Image Studio</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Tengeneza picha ionekane vizuri kabla ya kuchapisha</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Funga Image Studio"
            style={{ width: 40, height: 40, border: 0, borderRadius: 20, background: '#f1f5f9', fontSize: 24, cursor: 'pointer' }}>×</button>
        </header>

        <div style={{ background: '#111827', borderRadius: 16, minHeight: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          {!ready && !error && <span style={{ color: '#fff', fontSize: 13 }}>Inafungua picha…</span>}
          {ready && <canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
            aria-label="Buruta picha kuipanga" data-testid="image-studio-canvas"
            style={{ display: 'block', maxWidth: '100%', maxHeight: '48dvh', width: 'auto', height: 'auto', objectFit: 'contain', touchAction: 'none', borderRadius: 8, cursor: mode === 'crop' ? 'grab' : 'default' }} />}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', margin: '7px 2px 12px' }}>Buruta picha kuipanga. Chagua Fit ili picha nzima ionekane, au Crop kuijaza frame.</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" data-testid="image-fit" onClick={() => { setMode('fit'); setZoom(1); setOffset({ x: 0, y: 0 }); }} style={{ ...buttonStyle(mode === 'fit'), flex: 1 }}>Fit · picha nzima</button>
          <button type="button" data-testid="image-crop" onClick={() => { setMode('crop'); setZoom(1); setOffset({ x: 0, y: 0 }); }} style={{ ...buttonStyle(mode === 'crop'), flex: 1 }}>Crop · jaza frame</button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 7 }}>Muonekano</div>
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 12 }}>
          {FORMATS.map((item) => <button key={item.key} type="button" onClick={() => { setFormat(item.key); setZoom(1); setOffset({ x: 0, y: 0 }); }}
            aria-pressed={format === item.key} style={buttonStyle(format === item.key)}>{item.label}</button>)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Zoom</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>{zoom.toFixed(1)}×</span>
        </div>
        <input aria-label="Zoom" data-testid="image-zoom" type="range" min="1" max="3" step="0.1" value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))} style={{ width: '100%', accentColor: '#2563eb', margin: '0 0 12px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Background</span>
          {BACKGROUNDS.map((item) => <button key={item.key} type="button" aria-pressed={background === item.key}
            onClick={() => setBackground(item.key)} style={buttonStyle(background === item.key)}>{item.label}</button>)}
          <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} style={buttonStyle(false)}>↻ Zungusha</button>
        </div>

        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <footer style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ ...buttonStyle(false), flex: 1 }}>Ghairi</button>
          <button type="button" onClick={save} disabled={!ready || saving} data-testid="image-studio-save"
            style={{ ...buttonStyle(true), flex: 2, background: '#2563eb', color: '#fff', opacity: !ready || saving ? .55 : 1 }}>
            {saving ? 'Inaandaa…' : 'Tumia picha hii'}
          </button>
        </footer>
      </section>
    </div>
  );
}
