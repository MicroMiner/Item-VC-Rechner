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
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      solve();
    }
  });
})();
