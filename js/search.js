// Ortssuche über das Adress- und Ortsverzeichnis des Bundes.

import { searchLocations, zoomForOrigin } from './geoadmin.js';

export function setupSearch({ input, results, onSelect }) {
  let timer = null;
  let controller = null;
  let items = [];
  let cursor = -1;

  function close() {
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
      li.setAttribute('role', 'option');
      li.dataset.index = String(i);
      const name = document.createElement('span');
      name.className = 'search-label';
      name.textContent = it.label;
      li.appendChild(name);
      if (it.detail && it.detail.toLowerCase() !== it.label.toLowerCase()) {
        const d = document.createElement('span');
        d.className = 'search-detail';
        d.textContent = it.detail;
        li.appendChild(d);
      }
      li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); choose(i); });
      results.appendChild(li);
    });
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    input.value = it.label;
    close();
    input.blur();
    onSelect({ ...it, zoom: zoomForOrigin(it.origin) });
  }

  async function run() {
    const q = input.value.trim();
    if (controller) controller.abort();
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
