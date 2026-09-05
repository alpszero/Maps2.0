// Ortssuche mit Vorschlägen über den SearchServer des Geoportals.

import { searchLocations, rangeForOrigin } from './geoadmin.js';

/**
 * @param els {form, input, clear, list}
 * @param onPick Rückruf ({lon, lat, range, label})
 */
export function setupSearch(els, onPick) {
  let controller = null;
  let timer = null;
  let results = [];
  let active = -1;

  const close = () => { els.list.hidden = true; els.list.innerHTML = ''; results = []; active = -1; };

  const render = () => {
    els.list.innerHTML = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.className = i === active ? 'active' : '';
      const main = document.createElement('span');
      main.className = 'label';
      main.textContent = r.label;
      li.appendChild(main);
      if (r.origin) {
        const kind = document.createElement('span');
        kind.className = 'kind';
        kind.textContent = kindLabel(r.origin);
        li.appendChild(kind);
      }
      li.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(r); });
      els.list.appendChild(li);
    });
    els.list.hidden = results.length === 0;
  };

  const pick = (r) => {
    els.input.value = r.label;
    close();
    els.input.blur();
    onPick({ lon: r.lon, lat: r.lat, range: rangeFor(r), label: r.label });
  };

  const query = async (text) => {
    controller?.abort();
    controller = new AbortController();
    try {
      results = await searchLocations(text, { signal: controller.signal });
      active = -1;
      render();
    } catch (err) {
      if (err?.name !== 'AbortError') { console.warn('Suche fehlgeschlagen', err); close(); }
    }
  };

  els.input.addEventListener('input', () => {
    const text = els.input.value.trim();
    els.clear.hidden = text.length === 0;
    clearTimeout(timer);
    if (text.length < 2) { close(); return; }
    timer = setTimeout(() => query(text), 220);
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; render(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Escape') { close(); els.input.blur(); }
  });

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (results.length) pick(results[active >= 0 ? active : 0]);
    else if (els.input.value.trim().length >= 2) query(els.input.value).then(() => { if (results.length) pick(results[0]); });
  });

  els.clear.addEventListener('click', () => {
    els.input.value = '';
    els.clear.hidden = true;
    close();
    els.input.focus();
  });

  els.input.addEventListener('blur', () => setTimeout(close, 150));
}

/** Kameradistanz aus der Ausdehnung des Treffers, sonst nach Art. */
function rangeFor(r) {
  if (r.bbox) {
    const [x1, y1, x2, y2] = r.bbox;
    const latMid = (y1 + y2) / 2;
    const dx = Math.abs(x2 - x1) * 111320 * Math.cos((latMid * Math.PI) / 180);
    const dy = Math.abs(y2 - y1) * 110540;
    const diag = Math.hypot(dx, dy);
    if (diag > 50) return Math.max(450, Math.min(120000, diag * 1.3));
  }
  return rangeForOrigin(r.origin);
}

function kindLabel(origin) {
  switch (origin) {
    case 'address': return 'Adresse';
    case 'parcel': return 'Parzelle';
    case 'haltestellen': return 'Haltestelle';
    case 'gazetteer': return 'Ort';
    case 'zipcode': return 'PLZ';
    case 'sn': return 'Name';
    case 'gg25': return 'Gemeinde';
    case 'district': return 'Bezirk';
    case 'kantone': return 'Kanton';
    default: return '';
  }
}
