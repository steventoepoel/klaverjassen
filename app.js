(() => {
  "use strict";

  const TOTAL = 162;
  const ROUNDS = 16;
  const APP_VERSION = "20260219-4";

  const GAME_KEY = "rene_telraam_game_v18";
  const HIST_KEY = "rene_telraam_history_v7";

  const $ = (id) => document.getElementById(id);

  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
      d.getHours()
    )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[c]);

  const isStandaloneMode = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  const hapticError = () => {
    try {
      navigator.vibrate?.(80);
    } catch {}
  };

  const normalizeSpecial = (v) => {
    v = String(v ?? "").trim();
    if (!v) return "";
    const c = v[0];
    if (c === "n" || c === "N") return "N";
    if (c === "p" || c === "P") return "P";
    return v;
  };

  const isNumericLike = (s) => s !== "" && s != null && !isNaN(String(s).trim());
  const clampInt = (n, min, max) => Math.max(min, Math.min(max, n));

  // N (Nat): team 0 punten
  // P (Pit): team 162 punten
  const pointsValueFromDisplay = (raw) => {
    const v = normalizeSpecial(raw);
    if (v === "N") return 0;
    if (v === "P") return TOTAL;
    if (isNumericLike(v)) return clampInt(parseInt(v, 10), 0, TOTAL);
    return null;
  };

  const loadJSON = (k, fallback) => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- DOM refs ---------- */
  const installBtn = $("installBtn");

  const w1 = $("w1"),
    w2 = $("w2"),
    z1 = $("z1"),
    z2 = $("z2");
  const tWij = $("tWij"),
    tZij = $("tZij");
  const rows = $("rows");

  const namesLineSticky = $("namesLineSticky");
  const pointsLineSticky = $("pointsLineSticky");

  const puntenWijEl = $("puntenWij");
  const puntenZijEl = $("puntenZij");
  const roemWijEl = $("roemWij");
  const roemZijEl = $("roemZij");
  const totalWijEl = $("totalWij");
  const totalZijEl = $("totalZij");

  const winnerEl = $("winner");
  const newGameBtn = $("newGameBtn");

  const exportBtn = $("exportBtn");
  const importBtn = $("importBtn");
  const importFile = $("importFile");

  const highscoresEl = $("highscores");
  const historyEl = $("history");

  const toastEl = $("toast");

  const npBar = $("npBar");
  const npHint = $("npHint");
  const npNat = $("npNat");
  const npPit = $("npPit");
  const npClear = $("npClear");

  const roemBar = $("roemBar");
  const roemHint = $("roemHint");
  const roem20 = $("roem20");
  const roem50 = $("roem50");
  const roemClear = $("roemClear");

  const pdfOverlay = $("pdfOverlay");
  const pdfBack = $("pdfBack");
  const pdfShareBtn = $("pdfPrint"); // hergebruikt als WhatsApp-knop (in HTML heet die nog pdfPrint)
  const pdfFrame = $("pdfFrame");
  const pdfTitle = $("pdfTitle");

  /* ---------- state ---------- */
  let suppress = false;
  let lastWinnerKey = null;
  let gameStartedAt = null;
  let gameEndedAt = null;

  let focusedPointsInput = null;
  let focusedRoemInput = null;

  /* ---------- helpers ---------- */
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2600);
  };

  const teamWijNaam = () => {
    const a = (w1.value || "Wij").trim();
    const b = (w2.value || "").trim();
    return b ? `${a} & ${b}` : a;
  };
  const teamZijNaam = () => {
    const a = (z1.value || "Zij").trim();
    const b = (z2.value || "").trim();
    return b ? `${a} & ${b}` : a;
  };

  const updateNames = () => {
    const wij = teamWijNaam();
    const zij = teamZijNaam();
    tWij.textContent = wij;
    tZij.textContent = zij;
    namesLineSticky.textContent = `${wij} - ${zij}`;
  };

  const q = (t, r) => document.querySelector(`[data-t="${t}"][data-r="${r}"]`);

  const clearRoundError = (r) => {
    const a = q("w", r);
    const b = q("z", r);
    if (a) a.classList.remove("inputError");
    if (b) b.classList.remove("inputError");
  };
  const setRoundError = (r) => {
    const a = q("w", r);
    const b = q("z", r);
    if (a) a.classList.add("inputError");
    if (b) b.classList.add("inputError");
  };

  /* ---------- Roem rules ---------- */
  function parseRoem(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return { ok: true, value: 0 };
    if (!isNumericLike(s)) return { ok: false, value: 0 };
    const n = parseInt(s, 10);
    if (n < 0) return { ok: false, value: 0 };
    if (n % 10 !== 0) return { ok: false, value: 0 };
    return { ok: true, value: n };
  }

  // notify ONLY on blur/enter
  function validateRoemField(inp, { notify } = { notify: false }) {
    const { ok } = parseRoem(inp.value);
    if (!ok) {
      inp.classList.add("inputError");
      if (notify) {
        hapticError();
        showToast("Dit aantal roem kan helemaal niet! 😡");
      }
      return false;
    }
    inp.classList.remove("inputError");
    return true;
  }

  const readRoemOk = (inp) => {
    const pr = parseRoem(inp.value);
    return pr.ok ? pr.value : 0; // invalid telt als 0
  };

  /* ---------- Pit bonus (+100 roem) ---------- */
  const setPitBonus = (team, round, apply) => {
    const ptsEl = q(team, round);
    const roemEl = team === "w" ? q("rw", round) : q("rz", round);
    if (!ptsEl || !roemEl) return;

    const had = ptsEl.dataset.pbonus === "1";

    if (apply && !had) {
      const cur = parseInt(roemEl.value, 10) || 0;
      roemEl.value = String(cur + 100);
      ptsEl.dataset.pbonus = "1";
      validateRoemField(roemEl, { notify: false });
    }
    if (!apply && had) {
      const cur = parseInt(roemEl.value, 10) || 0;
      roemEl.value = String(Math.max(0, cur - 100));
      ptsEl.dataset.pbonus = "0";
      validateRoemField(roemEl, { notify: false });
    }
  };

  /* ---------- 81-81 rule ---------- */
  const validateNoEqualRound = (r) => {
    const wEl = q("w", r);
    const zEl = q("z", r);
    const rwEl = q("rw", r);
    const rzEl = q("rz", r);
    if (!wEl || !zEl || !rwEl || !rzEl) return true;

    const wPts = pointsValueFromDisplay(wEl.value);
    const zPts = pointsValueFromDisplay(zEl.value);
    if (wPts === null || zPts === null) {
      clearRoundError(r);
      return true;
    }

    if (wPts === 81 && zPts === 81) {
      const rwVal = readRoemOk(rwEl);
      const rzVal = readRoemOk(rzEl);
      if (rwVal === rzVal) {
        setRoundError(r);
        showToast("Wakker worden! Je kunt niet evenveel punten krijgen in een ronde. 😊");
        return false;
      }
    }
    clearRoundError(r);
    return true;
  };

  /* ---------- Build table ---------- */
  rows.innerHTML = "";
  for (let r = 1; r <= ROUNDS; r++) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${r}</td>` +
      `<td><input class="inp-wij" data-t="w" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="characters" spellcheck="false"></td>` +
      `<td><input class="inp-wijroem" data-t="rw" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="off" spellcheck="false"></td>` +
      `<td><input class="inp-zij" data-t="z" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="characters" spellcheck="false"></td>` +
      `<td><input class="inp-zijroem" data-t="rz" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="off" spellcheck="false"></td>`;
    rows.appendChild(tr);

    if (r % 4 === 0 && r < ROUNDS) {
      const sep = document.createElement("tr");
      sep.className = "sepRow";
      sep.innerHTML = `<td colspan="5"><div class="sepLine"></div></td>`;
      rows.appendChild(sep);
    }
  }

  /* ---------- Enter => blur ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* ---------- PWA install ---------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandaloneMode()) installBtn.style.display = "block";
  });
  installBtn?.addEventListener("click", () => deferredPrompt?.prompt());
  if (isStandaloneMode() && installBtn) installBtn.style.display = "none";

  /* ---------- Herlaad-knop (update klaar) onderaan ---------- */
  let reloadBar = null;

  const keyboardHeight = () => {
    if (!window.visualViewport) return 0;
    const vv = window.visualViewport;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  };

  const adjustBars = () => {
    const kh = keyboardHeight();

    if (npBar.style.display === "block") npBar.style.bottom = `${10 + kh}px`;
    else npBar.style.bottom = "10px";

    const npOffset = npBar.style.display === "block" ? 74 : 0;
    if (roemBar.style.display === "block")
      roemBar.style.bottom = `${10 + kh + npOffset}px`;
    else roemBar.style.bottom = "10px";

    if (reloadBar && reloadBar.style.display === "block") {
      reloadBar.style.bottom = `${10 + kh}px`;
    }
  };

  const ensureReloadBar = () => {
    if (reloadBar) return reloadBar;

    const bar = document.createElement("div");
    bar.className = "bottomBar";
    bar.style.display = "none";
    bar.style.zIndex = "9996";
    bar.id = "reloadBar";

    const row = document.createElement("div");
    row.className = "row";

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Nieuwe versie klaar ✅";

    const btn = document.createElement("button");
    btn.textContent = "🔄 Herlaad";
    btn.addEventListener("click", () => location.reload());

    row.appendChild(hint);
    row.appendChild(btn);
    bar.appendChild(row);

    document.body.appendChild(bar);
    reloadBar = bar;
    return bar;
  };

  const showReloadBar = () => {
    const bar = ensureReloadBar();
    bar.style.display = "block";
    adjustBars();
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", adjustBars);
    window.visualViewport.addEventListener("scroll", adjustBars);
  }
  window.addEventListener("resize", adjustBars);

  /* ---------- Service Worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register(
          `./service-worker.js?v=${APP_VERSION}`
        );
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              showToast("Nieuwe versie klaar ✅");
              showReloadBar();
            }
          });
        });
      } catch (e) {
        console.log("SW register failed", e);
      }
    });
  }

  /* ---------- Nat/Pit bar ---------- */
  const showNPBarFor = (inp) => {
    focusedPointsInput = inp;
    npBar.style.display = "block";
    npHint.textContent = `Ronde ${inp.dataset.r} • ${
      inp.dataset.t === "w" ? "Wij" : "Zij"
    } punten`;
    adjustBars();
  };

  const hideNPBarIfNeeded = () => {
    setTimeout(() => {
      const a = document.activeElement;
      const isPoints = a && a.dataset && (a.dataset.t === "w" || a.dataset.t === "z");
      if (!isPoints) {
        focusedPointsInput = null;
        npBar.style.display = "none";
        npHint.textContent = "Selecteer een puntenvakje…";
        adjustBars();
      }
    }, 120);
  };

  const applyNP = (value) => {
    if (!focusedPointsInput) return;
    focusedPointsInput.value = value;
    focusedPointsInput.dispatchEvent(new Event("input", { bubbles: true }));
    focusedPointsInput.focus();
  };

  npNat.addEventListener("click", () => applyNP("N"));
  npPit.addEventListener("click", () => applyNP("P"));
  npClear.addEventListener("click", () => applyNP(""));

  /* ---------- Roem bar ---------- */
  const showRoemBarFor = (inp) => {
    focusedRoemInput = inp;
    roemBar.style.display = "block";
    roemHint.textContent = `Ronde ${inp.dataset.r} • ${
      inp.dataset.t === "rw" ? "Wij roem" : "Zij roem"
    }`;
    adjustBars();
  };

  const hideRoemBarIfNeeded = () => {
    setTimeout(() => {
      const a = document.activeElement;
      const isRoem = a && a.dataset && (a.dataset.t === "rw" || a.dataset.t === "rz");
      if (!isRoem) {
        focusedRoemInput = null;
        roemBar.style.display = "none";
        roemHint.textContent = "Selecteer een roemvakje…";
        adjustBars();
      }
    }, 120);
  };

  const applyRoemDelta = (delta) => {
    if (!focusedRoemInput) return;
    const cur = readRoemOk(focusedRoemInput);
    focusedRoemInput.value = String(cur + delta);
    validateRoemField(focusedRoemInput, { notify: false });
    focusedRoemInput.dispatchEvent(new Event("input", { bubbles: true }));
    focusedRoemInput.focus();
  };

  roem20.addEventListener("click", () => applyRoemDelta(20));
  roem50.addEventListener("click", () => applyRoemDelta(50));
  roemClear.addEventListener("click", () => {
    if (!focusedRoemInput) return;
    focusedRoemInput.value = "";
    focusedRoemInput.dispatchEvent(new Event("input", { bubbles: true }));
    focusedRoemInput.focus();
  });

  /* ---------- Visible roem transfer on Nat (N) ---------- */
  function applyNatRoemTransferVisual(team, round, prevNorm, nowNorm) {
    const ptsEl = q(team, round);
    const roemThis = team === "w" ? q("rw", round) : q("rz", round);
    const roemOther = team === "w" ? q("rz", round) : q("rw", round);
    if (!ptsEl || !roemThis || !roemOther) return;

    const prevWasN = prevNorm === "N";
    const nowIsN = nowNorm === "N";

    // From not-N to N: move roemThis -> roemOther (ONLY if roemThis is valid)
    if (!prevWasN && nowIsN) {
      const old = parseInt(ptsEl.dataset.nTransfer || "0", 10) || 0;
      if (old > 0) {
        const oth = readRoemOk(roemOther);
        roemOther.value = String(Math.max(0, oth - old));
        ptsEl.dataset.nTransfer = "0";
      }

      const pr = parseRoem(roemThis.value);
      if (!pr.ok) {
        ptsEl.dataset.nTransfer = "0";
        return;
      }

      const amount = pr.value;
      if (amount > 0) {
        const otherVal = readRoemOk(roemOther);
        roemOther.value = String(otherVal + amount);

        roemThis.value = "";
        ptsEl.dataset.nTransfer = String(amount);

        roemOther.dispatchEvent(new Event("input", { bubbles: true }));
        roemThis.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        ptsEl.dataset.nTransfer = "0";
      }
    }

    // From N to not-N: undo transfer
    if (prevWasN && !nowIsN) {
      const amount = parseInt(ptsEl.dataset.nTransfer || "0", 10) || 0;
      if (amount > 0) {
        const otherVal = readRoemOk(roemOther);
        roemOther.value = String(Math.max(0, otherVal - amount));

        const thisVal = readRoemOk(roemThis);
        if ((roemThis.value || "").trim() === "") roemThis.value = String(amount);
        else roemThis.value = String(thisVal + amount);

        ptsEl.dataset.nTransfer = "0";

        roemOther.dispatchEvent(new Event("input", { bubbles: true }));
        roemThis.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  /* ---------- recompute totals ---------- */
  const recompute = () => {
    let pw = 0,
      pz = 0;
    let rwSum = 0,
      rzSum = 0;

    let filled = true;
    let anyInvalid = false;

    let natW = 0,
      natZ = 0,
      pitW = 0,
      pitZ = 0;

    for (let r = 1; r <= ROUNDS; r++) {
      const wEl = q("w", r);
      const zEl = q("z", r);
      const rwInp = q("rw", r);
      const rzInp = q("rz", r);
      if (!wEl || !zEl || !rwInp || !rzInp) continue;

      const wRaw = (wEl.value || "").trim();
      const zRaw = (zEl.value || "").trim();
      const wNorm = normalizeSpecial(wRaw);
      const zNorm = normalizeSpecial(zRaw);

      const wIsN = wNorm === "N";
      const zIsN = zNorm === "N";
      const wIsP = wNorm === "P";
      const zIsP = zNorm === "P";

      if (wIsN) natW++;
      if (zIsN) natZ++;
      if (wIsP) pitW++;
      if (zIsP) pitZ++;

      // N + N tegelijk is fout
      if (wIsN && zIsN) {
        anyInvalid = true;
        wEl.classList.add("inputError");
        zEl.classList.add("inputError");
      } else {
        wEl.classList.remove("inputError");
        zEl.classList.remove("inputError");
      }

      const wPts = pointsValueFromDisplay(wRaw);
      const zPts = pointsValueFromDisplay(zRaw);
      if (wPts === null || zPts === null) filled = false;

      pw += wPts ?? 0;
      pz += zPts ?? 0;

      // roem validation (silent)
      const rwParsed = parseRoem(rwInp.value);
      const rzParsed = parseRoem(rzInp.value);

      if (!rwParsed.ok) {
        rwInp.classList.add("inputError");
        anyInvalid = true;
      } else {
        rwInp.classList.remove("inputError");
      }

      if (!rzParsed.ok) {
        rzInp.classList.add("inputError");
        anyInvalid = true;
      } else {
        rzInp.classList.remove("inputError");
      }

      rwSum += rwParsed.ok ? rwParsed.value : 0;
      rzSum += rzParsed.ok ? rzParsed.value : 0;

      if (!validateNoEqualRound(r)) anyInvalid = true;
    }

    const totW = pw + rwSum;
    const totZ = pz + rzSum;

    puntenWijEl.textContent = String(pw);
    puntenZijEl.textContent = String(pz);
    roemWijEl.textContent = String(rwSum);
    roemZijEl.textContent = String(rzSum);
    totalWijEl.textContent = String(totW);
    totalZijEl.textContent = String(totZ);

    pointsLineSticky.textContent = `${pw} - ${pz}`;

    document.body.dataset.natw = String(natW);
    document.body.dataset.natz = String(natZ);
    document.body.dataset.pitw = String(pitW);
    document.body.dataset.pitz = String(pitZ);

    if (filled && !anyInvalid) {
      if (!gameEndedAt) gameEndedAt = nowISO();
      showWinnerOnce(totW, totZ);
    } else {
      winnerEl.textContent = "";
      lastWinnerKey = null;
      gameEndedAt = null;
    }
  };

  /* ---------- winner ---------- */
  const showWinnerOnce = (tw, tz) => {
    if (tw === tz) {
      const key = `TIE|${tw}|${tz}`;
      winnerEl.textContent = "Dat is wel heel bijzonder! Een gelijkspel! 🤯";
      lastWinnerKey = key;
      return;
    }

    const name = tw > tz ? teamWijNaam() : teamZijNaam();
    const key = `${tw}|${tz}|${name}`;
    winnerEl.textContent = `🏆 Winnaar: ${name} 🏆`;
    lastWinnerKey = key;
  };

  /* ---------- persistence ---------- */
  const saveGame = () => {
    const d = {
      w1: w1.value,
      w2: w2.value,
      z1: z1.value,
      z2: z2.value,
      gameStartedAt,
      gameEndedAt,
      lastWinnerKey,
    };

    const inputs = document.querySelectorAll("input[data-t]");
    for (const inp of inputs) {
      const k = inp.dataset.t + inp.dataset.r;
      d[k] = inp.value;

      if (inp.dataset.t === "w" || inp.dataset.t === "z") {
        d[k + "_pbonus"] = inp.dataset.pbonus || "0";
        d[k + "_prev"] = inp.dataset.prevNorm || normalizeSpecial(inp.value);
        d[k + "_ntr"] = inp.dataset.nTransfer || "0";
      }
    }

    saveJSON(GAME_KEY, d);
  };

  const loadGame = () => {
    const d = loadJSON(GAME_KEY, {});
    w1.value = d.w1 || "";
    w2.value = d.w2 || "";
    z1.value = d.z1 || "";
    z2.value = d.z2 || "";

    gameStartedAt = d.gameStartedAt || null;
    gameEndedAt = d.gameEndedAt || null;
    lastWinnerKey = d.lastWinnerKey || null;

    const inputs = document.querySelectorAll("input[data-t]");
    for (const inp of inputs) {
      const k = inp.dataset.t + inp.dataset.r;
      if (d[k] !== undefined) inp.value = d[k];

      if (inp.dataset.t === "w" || inp.dataset.t === "z") {
        inp.dataset.pbonus = d[k + "_pbonus"] || "0";
        inp.dataset.prevNorm = d[k + "_prev"] || normalizeSpecial(inp.value);
        inp.dataset.nTransfer = d[k + "_ntr"] || "0";
      }
    }
  };

  /* ---------- history ---------- */
  const loadHistory = () => loadJSON(HIST_KEY, []);
  const saveHistory = (arr) => saveJSON(HIST_KEY, arr);

  const buildHistoryEntry = () => {
    const pw = parseInt(puntenWijEl.textContent, 10) || 0;
    const pz = parseInt(puntenZijEl.textContent, 10) || 0;
    const rw = parseInt(roemWijEl.textContent, 10) || 0;
    const rz = parseInt(roemZijEl.textContent, 10) || 0;

    const natW = parseInt(document.body.dataset.natw || "0", 10);
    const natZ = parseInt(document.body.dataset.natz || "0", 10);
    const pitW = parseInt(document.body.dataset.pitw || "0", 10);
    const pitZ = parseInt(document.body.dataset.pitz || "0", 10);

    const rounds = [];
    for (let r = 1; r <= ROUNDS; r++) {
      rounds.push({
        r,
        w: q("w", r).value,
        rw: q("rw", r).value,
        z: q("z", r).value,
        rz: q("rz", r).value,
      });
    }

    const wijTeam = teamWijNaam();
    const zijTeam = teamZijNaam();

    const totalWij = pw + rw;
    const totalZij = pz + rz;

    let winnerText = "";
    if (totalWij === totalZij) winnerText = "Dat is wel heel bijzonder! Een gelijkspel! 🤯";
    else winnerText = `🏆 Winnaar: ${totalWij > totalZij ? wijTeam : zijTeam} 🏆`;

    const id =
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return {
      id,
      startedAt: gameStartedAt,
      endedAt: gameEndedAt,
      wijTeam,
      zijTeam,
      pointsWij: pw,
      pointsZij: pz,
      roemWij: rw,
      roemZij: rz,
      totalWij,
      totalZij,
      natWij: natW,
      natZij: natZ,
      pitWij: pitW,
      pitZij: pitZ,
      winnerText,
      rounds,
    };
  };

  /* ---------- PDF overlay + WhatsApp ---------- */
  const pdfHTMLForEntry = (entry) => {
    let rowsHtml = "";
    for (const r of entry.rounds) {
      rowsHtml += `<tr><td>${r.r}</td><td>${escapeHTML(r.w)}</td><td>${escapeHTML(
        r.rw || ""
      )}</td><td>${escapeHTML(r.z)}</td><td>${escapeHTML(r.rz || "")}</td></tr>`;
    }

    return `<!doctype html><html lang="nl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>René’s Telraam - PDF</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111;}
h1{margin:0 0 8px;}
.box{border:1px solid #ddd;padding:12px;border-radius:10px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #ddd;padding:6px;text-align:center;}
th{background:#f3f3f3}
.small{font-size:12px;color:#333}
</style></head><body>
<h1>René’s Telraam</h1>
<div class="small">
<b>${escapeHTML(entry.wijTeam)}</b> - <b>${escapeHTML(entry.zijTeam)}</b><br>
Begin: ${fmtDateTime(entry.startedAt)}<br>
Einde: ${fmtDateTime(entry.endedAt)}
</div>
<div class="box">
<b>Scores</b><br>
Punten: ${entry.pointsWij} - ${entry.pointsZij}<br>
Roem: ${entry.roemWij} - ${entry.roemZij}<br>
Totaal: ${entry.totalWij} - ${entry.totalZij}<br>
Nat: ${entry.natWij} - ${entry.natZij} | Pit: ${entry.pitWij} - ${entry.pitZij}<br><br>
${escapeHTML(entry.winnerText)}
</div>
<div class="box">
<b>Rondes</b>
<table><thead><tr><th>R</th><th>Wij</th><th>Roem Wij</th><th>Zij</th><th>Roem Zij</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
</div>
</body></html>`;
  };

  const buildWhatsAppTextForEntry = (entry) => {
    const intro = "Hierbij de puntentelling van een memorabele pot!";
    const lines = [
      intro,
      "",
      `${entry.wijTeam} - ${entry.zijTeam}`,
      `Start: ${fmtDateTime(entry.startedAt)}`,
      `Eind: ${fmtDateTime(entry.endedAt)}`,
      "",
      `Punten: ${entry.pointsWij} - ${entry.pointsZij}`,
      `Roem: ${entry.roemWij} - ${entry.roemZij}`,
      `Totaal: ${entry.totalWij} - ${entry.totalZij}`,
      `Nat: ${entry.natWij} - ${entry.natZij} | Pit: ${entry.pitWij} - ${entry.pitZij}`,
      "",
      entry.winnerText,
    ];
    return lines.join("\n");
  };

  const shareToWhatsApp = (text) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const openPdfOverlay = (html, title, shareText) => {
    pdfTitle.textContent = title || "PDF";
    pdfFrame.srcdoc = html;
    pdfOverlay.style.display = "block";

    // In de overlay: geen print-knop, maar WhatsApp
    if (pdfShareBtn) {
      pdfShareBtn.textContent = "💬 WhatsApp";
      pdfShareBtn.onclick = () =>
        shareToWhatsApp(shareText || "Hierbij de puntentelling van een memorabele pot!");
    }

    pdfBack.onclick = () => {
      pdfOverlay.style.display = "none";
      pdfFrame.srcdoc = "";
    };
  };

  const openGameAsPDF = (entry) => {
    const html = pdfHTMLForEntry(entry);
    const shareText = buildWhatsAppTextForEntry(entry);
    openPdfOverlay(html, `${entry.wijTeam} - ${entry.zijTeam}`, shareText);
  };

  /* ---------- Highscores (incl. roem + datum) ---------- */
  const renderHighscores = (hist) => {
    highscoresEl.innerHTML = "";

    const card = (title, team, valueLine, dateIso, note = "") => {
      const d = document.createElement("div");
      d.className = "badge";
      const dateLine = dateIso ? `📅 ${escapeHTML(fmtDate(dateIso))}` : "";
      const noteLine = note ? `<div style="opacity:.85; margin-top:4px;">${note}</div>` : "";
      d.innerHTML = `
        <div style="font-weight:900; margin-bottom:6px;">${escapeHTML(title)}</div>
        <div><b>${escapeHTML(team)}</b></div>
        <div style="margin-top:2px;">${valueLine}</div>
        <div style="opacity:.85; margin-top:4px;">${dateLine}</div>
        ${noteLine}
      `;
      highscoresEl.appendChild(d);
    };

    if (!hist.length) {
      const d = document.createElement("div");
      d.className = "badge";
      d.innerHTML =
        `<div style="font-weight:900; margin-bottom:6px;">Nog geen highscores</div>` +
        `<div>Speel een potje en druk daarna op <b>Nieuw potje</b> om het op te slaan.</div>`;
      highscoresEl.appendChild(d);
      return;
    }

    const maxIso = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

    // per team stats
    const teamStats = new Map();
    const ensure = (team) => {
      const key = team || "Onbekend";
      if (!teamStats.has(key)) {
        teamStats.set(key, {
          team: key,

          bestTotal: -Infinity,
          bestTotalAt: null,

          worstTotal: Infinity,
          worstTotalAt: null,

          bestRoem: -Infinity,
          bestRoemAt: null,

          natTotal: 0,
          pitTotal: 0,
          lastSeenAt: null,
        });
      }
      return teamStats.get(key);
    };

    // update from each game: use endedAt as "datum"
    for (const g of hist) {
      const at = g.endedAt || g.startedAt || null;

      const a = ensure(g.wijTeam);
      a.lastSeenAt = maxIso(a.lastSeenAt, at);
      a.natTotal += g.natWij || 0;
      a.pitTotal += g.pitWij || 0;
      if (typeof g.totalWij === "number") {
        if (g.totalWij > a.bestTotal) {
          a.bestTotal = g.totalWij;
          a.bestTotalAt = at;
        }
        if (g.totalWij < a.worstTotal) {
          a.worstTotal = g.totalWij;
          a.worstTotalAt = at;
        }
      }
      if (typeof g.roemWij === "number" && g.roemWij > a.bestRoem) {
        a.bestRoem = g.roemWij;
        a.bestRoemAt = at;
      }

      const b = ensure(g.zijTeam);
      b.lastSeenAt = maxIso(b.lastSeenAt, at);
      b.natTotal += g.natZij || 0;
      b.pitTotal += g.pitZij || 0;
      if (typeof g.totalZij === "number") {
        if (g.totalZij > b.bestTotal) {
          b.bestTotal = g.totalZij;
          b.bestTotalAt = at;
        }
        if (g.totalZij < b.worstTotal) {
          b.worstTotal = g.totalZij;
          b.worstTotalAt = at;
        }
      }
      if (typeof g.roemZij === "number" && g.roemZij > b.bestRoem) {
        b.bestRoem = g.roemZij;
        b.bestRoemAt = at;
      }
    }

    const arr = Array.from(teamStats.values());
    const top = (cmp) => arr.slice().sort(cmp)[0];

    // ✅ Hoogste/laagste punten inclusief roem (= totaal)
    const bestTotal = top((a, b) => b.bestTotal - a.bestTotal);
    const worstTotal = top((a, b) => a.worstTotal - b.worstTotal);

    const bestRoem = top((a, b) => b.bestRoem - a.bestRoem);

    const mostNat = top((a, b) => b.natTotal - a.natTotal);
    const mostPit = top((a, b) => b.pitTotal - a.pitTotal);

    card(
      "Hoogste totaal (incl. roem)",
      bestTotal.team,
      `${bestTotal.bestTotal} totaal`,
      bestTotal.bestTotalAt
    );
    card(
      "Laagste totaal (incl. roem)",
      worstTotal.team,
      `${worstTotal.worstTotal} totaal`,
      worstTotal.worstTotalAt
    );
    card("Meeste roem (in 1 pot)", bestRoem.team, `${bestRoem.bestRoem} roem`, bestRoem.bestRoemAt);
    card(
      "Meeste Nat (opgeteld)",
      mostNat.team,
      `${mostNat.natTotal}× Nat`,
      mostNat.lastSeenAt,
      "Datum = laatste pot in historie"
    );
    card(
      "Meeste Pit (opgeteld)",
      mostPit.team,
      `${mostPit.pitTotal}× Pit`,
      mostPit.lastSeenAt,
      "Datum = laatste pot in historie"
    );
  };

  const renderHistory = () => {
    const hist = loadHistory();
    historyEl.innerHTML = "";

    for (const entry of hist) {
      const item = document.createElement("div");
      item.className = "histItem";

      const meta = document.createElement("div");
      meta.className = "histMeta";
      meta.innerHTML = `
        <div style="font-weight:900;">${escapeHTML(entry.wijTeam)} - ${escapeHTML(entry.zijTeam)}</div>
        <div style="opacity:.85; margin-top:2px;">
          Start: ${fmtDateTime(entry.startedAt)}<br>
          Eind: ${fmtDateTime(entry.endedAt)}
        </div>
        <div style="margin-top:6px;">
          Punten: <b>${entry.pointsWij}</b> - <b>${entry.pointsZij}</b> |
          Roem: <b>${entry.roemWij}</b> - <b>${entry.roemZij}</b> |
          Totaal: <b>${entry.totalWij}</b> - <b>${entry.totalZij}</b>
        </div>
        <div style="margin-top:4px; opacity:.9;">
          Nat: ${entry.natWij} - ${entry.natZij} | Pit: ${entry.pitWij} - ${entry.pitZij}
        </div>
        <div style="margin-top:6px;">${escapeHTML(entry.winnerText)}</div>
      `;

      const btns = document.createElement("div");
      btns.className = "histBtns";

      // ✅ PDF knop vervangen door "WhatsApp"
      const waBtn = document.createElement("button");
      waBtn.textContent = "💬 WhatsApp";
      waBtn.onclick = () => openGameAsPDF(entry);

      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️ Verwijder";
      delBtn.className = "secondary";
      delBtn.onclick = () => {
        const next = loadHistory().filter((x) => x.id !== entry.id);
        saveHistory(next);
        renderHistory();
        renderHighscores(next);
      };

      btns.appendChild(waBtn);
      btns.appendChild(delBtn);

      item.appendChild(meta);
      item.appendChild(btns);
      historyEl.appendChild(item);
    }

    renderHighscores(hist);
  };

  /* ---------- export/import ---------- */
  exportBtn.addEventListener("click", () => {
    const hist = loadHistory();
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `renes-telraam-historie-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Historie geëxporteerd ✅");
  });

  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;

    try {
      const txt = await file.text();
      const incoming = JSON.parse(txt);
      if (!Array.isArray(incoming)) throw new Error("bad format");

      const current = loadHistory();
      const byId = new Map(current.map((x) => [x.id, x]));
      for (const entry of incoming) if (entry && entry.id) byId.set(entry.id, entry);

      const merged = Array.from(byId.values()).sort((a, b) =>
        (b.endedAt || "").localeCompare(a.endedAt || "")
      );
      saveHistory(merged);
      renderHistory();
      showToast("Historie geïmporteerd ✅");
    } catch (e) {
      console.error(e);
      showToast("Import mislukt ❌ (geen geldig bestand)");
      hapticError();
    }
  });

  /* ---------- new game ---------- */
  const isGameCompleteAndValid = () => {
    for (let r = 1; r <= ROUNDS; r++) {
      const wPts = pointsValueFromDisplay(q("w", r).value);
      const zPts = pointsValueFromDisplay(q("z", r).value);
      if (wPts === null || zPts === null) return false;

      if (!validateNoEqualRound(r)) return false;

      if (!parseRoem(q("rw", r).value).ok) return false;
      if (!parseRoem(q("rz", r).value).ok) return false;

      const wN = normalizeSpecial(q("w", r).value) === "N";
      const zN = normalizeSpecial(q("z", r).value) === "N";
      if (wN && zN) return false;
    }
    return true;
  };

  // nieuw potje zonder page reload
  const resetGameInPlace = () => {
    suppress = true;

    w1.value = "";
    w2.value = "";
    z1.value = "";
    z2.value = "";

    document.querySelectorAll("input[data-t]").forEach((inp) => {
      inp.value = "";
      inp.classList.remove("inputError");

      if (inp.dataset.t === "w" || inp.dataset.t === "z") {
        inp.dataset.pbonus = "0";
        inp.dataset.prevNorm = "";
        inp.dataset.nTransfer = "0";
      }
    });

    lastWinnerKey = null;
    gameStartedAt = null;
    gameEndedAt = null;
    winnerEl.textContent = "";

    focusedPointsInput = null;
    focusedRoemInput = null;
    npBar.style.display = "none";
    roemBar.style.display = "none";

    localStorage.removeItem(GAME_KEY);

    suppress = false;

    updateNames();
    recompute();
    saveGame();
    adjustBars();
  };

  const newGame = () => {
    if (winnerEl.textContent && gameStartedAt && gameEndedAt && isGameCompleteAndValid()) {
      const entry = buildHistoryEntry();
      const hist = loadHistory();
      hist.unshift(entry);
      saveHistory(hist);
      renderHistory();
    }
    resetGameInPlace();
    showToast("Nieuw potje ✅");
  };

  /* ---------- input logic ---------- */
  const onScoreInput = (e) => {
    if (suppress) return;

    if (!gameStartedAt) {
      gameStartedAt = nowISO();
      gameEndedAt = null;
    }

    const el = e.target;
    const t = el.dataset.t;
    const r = parseInt(el.dataset.r, 10);

    // roem input: silent validate during typing
    if (t === "rw" || t === "rz") {
      validateRoemField(el, { notify: false });
      validateNoEqualRound(r);
      recompute();
      saveGame();
      return;
    }

    // points inputs
    if (t !== "w" && t !== "z") return;

    const prevNorm = el.dataset.prevNorm || "";
    const valNorm = normalizeSpecial(el.value);

    const otherT = t === "w" ? "z" : "w";
    const otherEl = q(otherT, r);

    suppress = true;

    if (valNorm === "") {
      otherEl.value = "";
    } else if (valNorm === "N") {
      // Nat: N blijft staan, team = 0, tegenstander = 162
      el.value = "N";
      otherEl.value = String(TOTAL);
    } else if (valNorm === "P") {
      // Pit: P blijft staan, team = 162, tegenstander = 0
      el.value = "P";
      otherEl.value = "0";
    } else if (isNumericLike(valNorm)) {
      const num = clampInt(parseInt(valNorm, 10), 0, TOTAL);
      el.value = String(num);
      otherEl.value = String(TOTAL - num);
    } else {
      el.value = "";
      otherEl.value = "";
    }

    // Pit bonus (+100 roem) blijft gelden
    if (prevNorm === "P" && valNorm !== "P") setPitBonus(t, r, false);
    if (prevNorm !== "P" && valNorm === "P") setPitBonus(t, r, true);

    // Nat roem transfer (alleen bij N; en alleen als roemThis geldig is)
    applyNatRoemTransferVisual(t, r, prevNorm, valNorm);

    el.dataset.prevNorm = valNorm;

    suppress = false;

    validateNoEqualRound(r);
    recompute();
    saveGame();
  };

  /* ---------- Hook events ---------- */
  document.querySelectorAll("input[data-t]").forEach((inp) =>
    inp.addEventListener("input", onScoreInput)
  );

  // points focus => npBar
  document.querySelectorAll('input[data-t="w"], input[data-t="z"]').forEach((inp) => {
    inp.addEventListener("focus", () => showNPBarFor(inp));
    inp.addEventListener("blur", hideNPBarIfNeeded);
  });

  // roem focus => roemBar + notify on blur
  document.querySelectorAll('input[data-t="rw"], input[data-t="rz"]').forEach((inp) => {
    inp.addEventListener("focus", () => showRoemBarFor(inp));
    inp.addEventListener("blur", () => {
      validateRoemField(inp, { notify: true });
      hideRoemBarIfNeeded();
    });
  });

  // names
  [w1, w2, z1, z2].forEach((inp) =>
    inp.addEventListener("input", () => {
      updateNames();
      saveGame();
    })
  );

  newGameBtn.addEventListener("click", newGame);

  /* ---------- Hard Refresh knop (helemaal onderaan) ---------- */
  const hardRefresh = async () => {
    showToast("Refresh… 🔄");
    try {
      // caches leeg (lijkt het meest op Ctrl+F5)
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // service workers unregister
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}

    // cache-busting reload
    try {
      const url = new URL(location.href);
      url.searchParams.set("r", String(Date.now()));
      location.replace(url.toString());
    } catch {
      location.reload();
    }
  };

  const injectHardRefreshButtonAtBottom = () => {
    if (document.getElementById("hardRefreshCard")) return;

    const card = document.createElement("div");
    card.className = "card";
    card.id = "hardRefreshCard";
    card.innerHTML = `
      <button id="hardRefreshBtn" class="primary">🔄 Refresh</button>
      <div class="smallNote">Doet een “Ctrl+F5”-achtige refresh (cache leeg + opnieuw laden).</div>
    `;
    document.body.appendChild(card);

    const btn = card.querySelector("#hardRefreshBtn");
    btn?.addEventListener("click", hardRefresh);
  };

  /* ---------- Boot ---------- */
  loadGame();
  updateNames();
  adjustBars();
  recompute();
  renderHistory();
  injectHardRefreshButtonAtBottom();
})();