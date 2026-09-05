// Oberfläche des Quiz: Wo ist das? Kompakt, die Karte bleibt frei.
//
// Damit nichts verraten wird: kein Kameraflug (die Karte springt direkt zum
// Ausschnitt), und während einer Runde ist Herauszoomen und Weitwandern gesperrt.

import { makeRound, MODES } from './quiz.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupQuiz({ map, button, panel, closeOthers, onToggle, toast, timeline }) {
  const ui = {
    close: $('.panel-close', panel),
    mode: $('#qz-mode', panel),
    start: $('#qz-start', panel),
    answers: $('#qz-answers', panel),
    feedback: $('#qz-feedback', panel),
    score: $('#qz-score', panel),
    status: $('#qz-status', panel),
    next: $('#qz-next', panel),
  };
  const state = { open: false, round: null, answered: false, correct: 0, total: 0, controller: null, saved: null };

  for (const m of MODES) {
    const o = document.createElement('option');
    o.value = m.key; o.textContent = m.label;
    ui.mode.appendChild(o);
  }

  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    document.body.classList.add('is-quiz');
    button.setAttribute('aria-expanded', 'true');
    ui.status.textContent = 'Modus wählen und «Start» drücken.';
    onToggle?.();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    document.body.classList.remove('is-quiz');
    button.setAttribute('aria-expanded', 'false');
    state.controller?.abort();
    unlockMap();
    onToggle?.();
  }
  button.addEventListener('click', () => (state.open ? close() : open()));
  ui.close.addEventListener('click', close);

  // Kartenbewegung während der Runde begrenzen: nicht herauszoomen, nicht wegwandern.
  function lockMap(bbox) {
    if (!state.saved) state.saved = { minZoom: map.getMinZoom(), maxBounds: map.getMaxBounds() };
    const z = map.getZoom();
    map.setMinZoom(Math.max(state.saved.minZoom, z - 0.2));
    const dx = (bbox[2] - bbox[0]) * 0.6, dy = (bbox[3] - bbox[1]) * 0.6;
    map.setMaxBounds([[bbox[0] - dx, bbox[1] - dy], [bbox[2] + dx, bbox[3] + dy]]);
  }
  function unlockMap() {
    if (!state.saved) return;
    map.setMinZoom(state.saved.minZoom);
    map.setMaxBounds(state.saved.maxBounds);
    state.saved = null;
  }

  function renderScore() {
    ui.score.textContent = state.total ? `${state.correct} / ${state.total}` : '';
  }

  async function newRound() {
    state.controller?.abort();
    state.controller = new AbortController();
    ui.start.disabled = true;
    ui.next.hidden = true;
    ui.answers.innerHTML = '';
    ui.feedback.textContent = '';
    ui.feedback.className = 'qz-feedback';
    ui.status.textContent = 'Suche einen Ort …';
    try {
      const round = await makeRound({ mode: ui.mode.value, signal: state.controller.signal });
      state.round = round;
      state.answered = false;
      if (timeline) timeline.show(timeline.length - 1);
      unlockMap();
      const t = round.target;
      const bbox = t.bbox || [t.lng - 0.03, t.lat - 0.02, t.lng + 0.03, t.lat + 0.02];
      // Ohne Flug: direkt hinspringen, damit die Lage in der Schweiz nicht sichtbar wird.
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 12, duration: 0, maxZoom: 15 });
      lockMap(bbox);
      ui.status.textContent = round.mode === 'see' ? 'Welcher See?' : 'Welche Gemeinde?';
      round.options.forEach((name, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qz-answer';
        b.textContent = name;
        b.addEventListener('click', () => answer(i));
        ui.answers.appendChild(b);
      });
    } catch (err) {
      if (err?.name !== 'AbortError') {
        ui.status.textContent = '';
        toast(err.message || 'Runde konnte nicht erstellt werden.');
      }
    } finally {
      ui.start.disabled = false;
      ui.start.textContent = 'Neu';
    }
  }

  function answer(i) {
    if (state.answered || !state.round) return;
    state.answered = true;
    state.total++;
    const ok = i === state.round.correct;
    if (ok) state.correct++;
    [...ui.answers.children].forEach((b, k) => {
      b.disabled = true;
      if (k === state.round.correct) b.classList.add('is-correct');
      else if (k === i) b.classList.add('is-wrong');
    });
    ui.feedback.textContent = ok ? `Richtig: ${state.round.target.name}.` : `Nein, das ist ${state.round.target.name}.`;
    ui.feedback.className = `qz-feedback ${ok ? 'is-ok' : 'is-bad'}`;
    ui.status.textContent = '';
    ui.next.hidden = false;
    unlockMap(); // nach der Antwort darf man sich frei umsehen
    renderScore();
  }

  ui.start.addEventListener('click', newRound);
  ui.next.addEventListener('click', newRound);
  renderScore();

  return { open, close, isOpen: () => state.open };
}
