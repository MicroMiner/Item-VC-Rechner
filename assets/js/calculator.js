"use strict";

// Kompakter Taschenrechner ohne eval; Operatorpriorität und Klammern unterstützt.
(function () {
  const inp = document.getElementById("calcInput"),
    feedback = document.getElementById("calcFeedback");
  function calculate(expression) {
    const raw = expression
      .replace(/,/g, ".")
      .replace(/[×x]/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-");
    const tokens = raw.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+*/()\-]/g) || [];
    if (tokens.join("") !== raw.replace(/\s+/g, ""))
      throw Error("Ungültige Eingabe");
    if (!tokens.length) throw Error("Bitte Rechnung eingeben");
    let i = 0;
    function atom() {
      let t = tokens[i++];
      if (t === "+") return atom();
      if (t === "-") return -atom();
      if (t === "(") {
        let v = add();
        if (tokens[i++] !== ")") throw Error("Klammer fehlt");
        return v;
      }
      if (t === undefined || !/^((\d+\.?\d*)|(\.\d+))$/.test(t))
        throw Error("Ungültige Rechnung");
      return Number(t);
    }
    function multiply() {
      let v = atom();
      while (tokens[i] === "*" || tokens[i] === "/") {
        const op = tokens[i++],
          w = atom();
        if (op === "/" && w === 0) throw Error("Division durch null");
        v = op === "*" ? v * w : v / w;
      }
      return v;
    }
    function add() {
      let v = multiply();
      while (tokens[i] === "+" || tokens[i] === "-") {
        const op = tokens[i++],
          w = multiply();
        v = op === "+" ? v + w : v - w;
      }
      return v;
    }
    const result = add();
    if (i !== tokens.length || !Number.isFinite(result))
      throw Error("Ungültige Rechnung");
    return result;
  }
  function solve() {
    try {
      const x = calculate(inp.value);
      inp.value = Number(x.toPrecision(12)).toString();
      feedback.textContent =
        "Ergebnis: " +
        new Intl.NumberFormat("de-CH", { maximumFractionDigits: 10 }).format(x);
      feedback.classList.remove("is-error");
      feedback.classList.add("is-success");
    } catch (e) {
      feedback.textContent = e.message;
      feedback.classList.remove("is-success");
      feedback.classList.add("is-error");
    }
  }
  document.getElementById("calcKeys").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === "=") solve();
    else {
      inp.value += key;
      feedback.textContent = "";
      inp.focus();
    }
  });
  document.getElementById("calcClear").addEventListener("click", () => {
    inp.value = "";
    feedback.textContent = "Rechner geleert";
    feedback.classList.remove("is-success", "is-error");
    inp.focus();
  });
  document.getElementById("calcBackspace").addEventListener("click", () => {
    const start = inp.selectionStart ?? inp.value.length;
    const end = inp.selectionEnd ?? start;
    const removeFrom = start === end ? Math.max(0, start - 1) : start;
    inp.setRangeText("", removeFrom, end, "end");
    feedback.textContent = "";
    feedback.classList.remove("is-success", "is-error");
    inp.focus();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      solve();
    }
  });
})();

// Non-modal calculator: stays open while using the converter.
(() => {
  const panel = document.getElementById('calculatorWindow');
  const opener = document.getElementById('openCalculator');
  const close = document.getElementById('closeCalculator');
  const handle = document.getElementById('calculatorTitle');
  let positioned = false, drag = null;
  const isOpen = () => panel.matches(':popover-open');
  function position(left, top) {
    const bounds = panel.getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    panel.style.left = Math.max(8, Math.min(left, innerWidth - bounds.width - 8)) / scale + 'px';
    panel.style.top = Math.max(8, Math.min(top, innerHeight - bounds.height - 8)) / scale + 'px';
  }
  opener.addEventListener('click', () => {
    if (!isOpen()) panel.showPopover();
    opener.setAttribute('aria-expanded', 'true');
    const bounds = panel.getBoundingClientRect(), anchor = opener.getBoundingClientRect();
    position(positioned ? bounds.left : anchor.right - bounds.width,
      positioned ? bounds.top : anchor.bottom + 12);
    positioned = true;
    document.getElementById('calcInput').focus({ preventScroll: true });
  });
  function hide() {
    if (!isOpen()) return;
    panel.hidePopover();
    opener.setAttribute('aria-expanded', 'false');
    drag = null;
    opener.focus({ preventScroll: true });
  }
  close.addEventListener('click', hide);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
  });
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (drag && drag.id === event.pointerId) position(event.clientX - drag.x, event.clientY - drag.y);
  });
  function stop() { drag = null; handle.classList.remove('is-dragging'); }
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('lostpointercapture', stop);
  handle.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const bounds = panel.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
    position(bounds.left + move[0] * step, bounds.top + move[1] * step);
  });
  window.addEventListener('resize', () => {
    if (isOpen()) { const bounds = panel.getBoundingClientRect(); position(bounds.left, bounds.top); }
  });
})();
