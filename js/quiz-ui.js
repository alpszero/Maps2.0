// Oberfläche des Quiz: Wo ist das?

import { makeRound, MODES } from './quiz.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function setupQuiz({ map, button, panel, closeOthers, onToggle, toast, timeline }) {
  const ui = {
    close: $('.panel-close', panel),
    mode: $('#qz-mode', panel),
    modeNote: $('#qz-mode-note', panel),
    start: $('#qz-start', panel),
    answers: $('#qz-answers', panel),
    feedback: $('#qz-feedback', panel),
    score: $('#qz-score', panel),
    status: $('#qz-status', panel),
    next: $('#qz-next', panel),
  };
  const state = { open: false, round: null, answered: false, correct: 0, total: 0, controller: null };

  for (const m of MODES) {
    const o = document.createElement('option');
    o.value = m.key; o.textContent = m.label;
    ui.mode.appendChild(o);
  }
  const syncNote = () => { ui.modeNote.textContent = MODES.find((m) => m.key === ui.mode.value)?.note || ''; };
  ui.mode.addEventListener('change', syncNote);
  syncNote();

  function open() {
    closeOthers();
    state.open = true;
    panel.hidden = false;
    document.body.classList.add('is-quiz');
    button.setAttribute('aria-expanded', 'true');
    onToggle?.();
  }
  function close() {
    state.open = false;
    panel.hidden = true;
    document.body.classList.remove('is-quiz');
    button.setAttribute('aria-expanded', 'false');
    state.controller?.abort();
    onToggle?.();
  }
  button.addEventListener('click', () => (state.open ? close() : open()));
  ui.close.addEventListener('click', close);

  function renderScore() {
    ui.score.textContent = state.total ? `${state.correct} von ${state.total} richtig` : '';
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
      // Neuster Jahrgang, damit das Bild aktuell ist
      if (timeline) timeline.show(timeline.length - 1);
      const t = round.target;
      if (t.bbox) {
        map.fitBounds([[t.bbox[0], t.bbox[1]], [t.bbox[2], t.bbox[3]]], { padding: 24, duration: 900, maxZoom: 15 });
      } else {
        map.flyTo({ center: [t.lng, t.lat], zoom: 13, duration: 900 });
      }
      ui.status.textContent = round.mode === 'see' ? 'Welcher See ist das?' : 'Welche Gemeinde ist das?';
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
    ui.feedback.textContent = ok ? `Richtig! Das ist ${state.round.target.name}.` : `Leider nein. Das ist ${state.round.target.name}.`;
    ui.feedback.className = `qz-feedback ${ok ? 'is-ok' : 'is-bad'}`;
    ui.status.textContent = '';
    ui.next.hidden = false;
    renderScore();
  }

  ui.start.addEventListener('click', newRound);
  ui.next.addEventListener('click', newRound);
  renderScore();

  return { open, close, isOpen: () => state.open };
}
