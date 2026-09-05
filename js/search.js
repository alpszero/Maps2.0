// Ortssuche über das Adress- und Ortsverzeichnis des Bundes.
//
// Die Treffer sind echte Schaltflächen und reagieren auf «click»: Auf iOS werden
// Tipps auf nicht interaktive Elemente bei offener Tastatur oft nur zum
// Schliessen der Tastatur verwendet, so dass «nichts passiert».

import { searchLocations, zoomForOrigin } from './geoadmin.js';

export function setupSearch({ input, results, onSelect }) {
  let timer = null;
  let controller = null;
  let items = [];
  let cursor = -1;

  function close() {
    clearTimeout(timer);
    controller?.abort();
    results.hidden = true;
    results.innerHTML = '';
    items = [];
    cursor = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function render() {
    results.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'search-empty';
      li.textContent = 'Keine Treffer';
      results.appendChild(li);
    }
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'search-hit';
      b.setAttribute('role', 'option');
      b.dataset.index = String(i);
      const name = document.createElement('span');
      name.className = 'search-label';
      name.textContent = it.label;
      b.appendChild(name);
      if (it.detail && it.detail.toLowerCase() !== it.label.toLowerCase()) {
        const d = document.createElement('span');
        d.className = 'search-detail';
        d.textContent = it.detail;
        b.appendChild(d);
      }
      // Fokus im Eingabefeld lassen (kein Zucken der Tastatur), Auswahl per click.
      b.addEventListener('pointerdown', (ev) => ev.preventDefault());
      b.addEventListener('mousedown', (ev) => ev.preventDefault());
      b.addEventListener('click', () => choose(i));
      li.appendChild(b);
      results.appendChild(li);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    close();
    input.value = it.label;
    input.blur();
    onSelect({ ...it, zoom: zoomForOrigin(it.origin) });
  }

  async function run() {
    const q = input.value.trim();
    controller?.abort();
    if (q.length < 2) { close(); return; }
    controller = new AbortController();
    try {
      items = await searchLocations(q, { signal: controller.signal });
      cursor = -1;
      render();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.warn('Suche fehlgeschlagen', err);
      items = [];
      render();
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 250);
  });
  input.addEventListener('focus', () => { if (items.length) results.hidden = false; });
  input.addEventListener('keydown', (ev) => {
    if (results.hidden) {
      if (ev.key === 'Enter') { clearTimeout(timer); run(); }
      return;
    }
    const opts = results.querySelectorAll('[role=option]');
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!opts.length) return;
      cursor = ev.key === 'ArrowDown'
        ? (cursor + 1) % opts.length
        : (cursor - 1 + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-active', i === cursor));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      choose(cursor >= 0 ? cursor : 0);
    } else if (ev.key === 'Escape') {
      close();
    }
  });
  document.addEventListener('pointerdown', (ev) => {
    if (!results.contains(ev.target) && ev.target !== input) close();
  });

  return { close };
}
