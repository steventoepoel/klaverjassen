(() => {
  "use strict";

  const TOTAL = 162;
  const ROUNDS = 16;

  const APP_VERSION = "20260219"; // voor cache-busting & UI gedrag

  const GAME_KEY = "rene_telraam_game_v15";
  const HIST_KEY = "rene_telraam_history_v5";

  const $ = (id) => document.getElementById(id);

  const nowISO = () => new Date().toISOString();
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };
  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[c]);

  const isStandaloneMode = () =>
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  const hapticError = () => {
    try { navigator.vibrate?.(80); } catch {}
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

  const pointsValueFromDisplay = (raw) => {
    const v = normalizeSpecial(raw);
    if (v === "N" || v === "P") return 0;
    if (isNumericLike(v)) return clampInt(parseInt(v, 10), 0, TOTAL);
    return null;
  };

  const loadJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || "") ?? fallback; }
    catch { return fallback; }
  };
  const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // DOM refs
  const installBtn = $("installBtn");

  const w1 = $("w1"), w2 = $("w2"), z1 = $("z1"), z2 = $("z2");
  const tWij = $("tWij"), tZij = $("tZij");
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

  const pdfOverlay = $("pdfOverlay");
  const pdfBack = $("pdfBack");
  const pdfPrint = $("pdfPrint");
  const pdfFrame = $("pdfFrame");
  const pdfTitle = $("pdfTitle");

  const confettiCanvas = $("confetti");
  const confettiCtx = confettiCanvas.getContext("2d");

  // state
  let suppress = false;
  let lastWinnerKey = null;
  let gameStartedAt = null;
  let gameEndedAt = null;

  let focusedPointsInput = null;

  /* ---------- install button (PWA) ---------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandaloneMode()) installBtn.style.display = "block";
  });
  installBtn?.addEventListener("click", () => deferredPrompt?.prompt());
  if (isStandaloneMode() && installBtn) installBtn.style.display = "none";

  /* ---------- Service Worker: offline + update ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`);
        // Als er een nieuwe SW klaarstaat, forceer refresh prompt
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              // Nieuwe versie beschikbaar
              showToast("Nieuwe versie klaar ✅ Herlaad om te updaten.");
            }
          });
        });
      } catch (e) {
        // niet fatal
        console.log("SW register failed", e);
      }
    });
  }

  /* ---------- UI helpers ---------- */
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

  /* ---------- element helpers ---------- */
  const q = (t, r) => document.querySelector(`[data-t="${t}"][data-r="${r}"]`);

  const clearRoundError = (r) => {
    q("w", r).classList.remove("inputError");
    q("z", r).classList.remove("inputError");
  };
  const setRoundError = (r) => {
    q("w", r).classList.add("inputError");
    q("z", r).classList.add("inputError");
  };

  /* ---------- Roem validation ---------- */
  function parseRoem(raw){
    const s = String(raw ?? "").trim();
    if (!s) return { ok:true, value:0 };
    if (!isNumericLike(s)) return { ok:false, value:0 };
    const n = parseInt(s, 10);
    if (n < 0) return { ok:false, value:0 };
    if (n % 10 !== 0) return { ok:false, value:0 }; // alleen tientallen
    return { ok:true, value:n };
  }

  function validateRoemField(inp){
    const { ok } = parseRoem(inp.value);
    if (!ok){
      inp.classList.add("inputError");
      hapticError();
      showToast("Dit aantal roem kan helemaal niet! 😡");
      return false;
    }
    inp.classList.remove("inputError");
    return true;
  }

  /* ---------- Pit bonus (+100 roem) ---------- */
  const setPitBonus = (team, round, apply) => {
    const ptsEl = q(team, round);
    const roemEl = (team === "w") ? q("rw", round) : q("rz", round);
    const had = (ptsEl.dataset.pbonus === "1");

    if (apply && !had) {
      // +100 is ook een tiental -> ok
      const cur = parseInt(roemEl.value, 10) || 0;
      roemEl.value = String(cur + 100);
      ptsEl.dataset.pbonus = "1";
    }
    if (!apply && had) {
      const cur = parseInt(roemEl.value, 10) || 0;
      roemEl.value = String(Math.max(0, cur - 100));
      ptsEl.dataset.pbonus = "0";
    }
  };

  /* ---------- 81-81 rule ---------- */
  const validateNoEqualRound = (r) => {
    const wPts = pointsValueFromDisplay(q("w", r).value);
    const zPts = pointsValueFromDisplay(q("z", r).value);

    if (wPts === null || zPts === null) { clearRoundError(r); return true; }

    if (wPts === 81 && zPts === 81) {
      // roem gelijk of allebei 0 = niet toegestaan (jouw regel)
      const rw = parseRoem(q("rw", r).value);
      const rz = parseRoem(q("rz", r).value);

      const rwVal = rw.ok ? rw.value : 0;
      const rzVal = rz.ok ? rz.value : 0;

      if (rwVal === rzVal) {
        setRoundError(r);
        showToast("Wakker worden! Je kunt niet evenveel punten krijgen in een ronde. 😊");
        return false;
      }
    }

    clearRoundError(r);
    return true;
  };

  /* ---------- Build table rows (with roem +20/+50 buttons) ---------- */
  rows.innerHTML = "";
  for (let r = 1; r <= ROUNDS; r++) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${r}</td>` +
      `<td><input class="inp-wij" data-t="w" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="characters" spellcheck="false"></td>` +
      `<td>
        <div class="roemCell">
          <input class="inp-wijroem" data-t="rw" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="off" spellcheck="false">
          <div class="roemBtns">
            <button type="button" data-roembtn="20" data-team="rw" data-r="${r}">+20</button>
            <button type="button" data-roembtn="50" data-team="rw" data-r="${r}">+50</button>
          </div>
        </div>
      </td>` +
      `<td><input class="inp-zij" data-t="z" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="characters" spellcheck="false"></td>` +
      `<td>
        <div class="roemCell">
          <input class="inp-zijroem" data-t="rz" data-r="${r}" type="text" inputmode="numeric" pattern="[0-9]*" autocapitalize="off" spellcheck="false">
          <div class="roemBtns">
            <button type="button" data-roembtn="20" data-team="rz" data-r="${r}">+20</button>
            <button type="button" data-roembtn="50" data-team="rz" data-r="${r}">+50</button>
          </div>
        </div>
      </td>`;
    rows.appendChild(tr);

    if (r % 4 === 0 && r < ROUNDS) {
      const sep = document.createElement("tr");
      sep.className = "sepRow";
      sep.innerHTML = `<td colspan="5"><div class="sepLine"></div></td>`;
      rows.appendChild(sep);
    }
  }

  /* ---------- prevent iOS enter zoom behavior: Enter => blur ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* ---------- Nat/Pit bar above keyboard ---------- */
  const adjustNPBarForKeyboard = () => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    npBar.style.bottom = `${10 + keyboardHeight}px`;
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", adjustNPBarForKeyboard);
    window.visualViewport.addEventListener("scroll", adjustNPBarForKeyboard);
  }
  window.addEventListener("resize", adjustNPBarForKeyboard);

  const showNPBarFor = (inp) => {
    focusedPointsInput = inp;
    npBar.style.display = "block";
    const r = inp.dataset.r;
    const side = inp.dataset.t === "w" ? "Wij" : "Zij";
    npHint.textContent = `Ronde ${r} • ${side} punten`;
    adjustNPBarForKeyboard();
  };

  const hideNPBarIfNeeded = () => {
    setTimeout(() => {
      const a = document.activeElement;
      const isPoints = a && a.dataset && (a.dataset.t === "w" || a.dataset.t === "z");
      if (!isPoints) {
        focusedPointsInput = null;
        npBar.style.display = "none";
        npBar.style.bottom = "10px";
        npHint.textContent = "Selecteer een puntenvakje…";
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

  /* ---------- Confetti ---------- */
  const confetti = () => {
    confettiCanvas.width = innerWidth;
    confettiCanvas.height = innerHeight;

    const parts = Array.from({ length: 220 }, () => ({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height,
      r: Math.random() * 6 + 2,
      vy: Math.random() * 2 + 2
    }));

    const timer = setInterval(() => {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      for (const o of parts) {
        confettiCtx.beginPath();
        confettiCtx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        confettiCtx.fillStyle = `hsl(${Math.random() * 360},100%,50%)`;
        confettiCtx.fill();
        o.y += o.vy;
        if (o.y > confettiCanvas.height) o.y = 0;
      }
    }, 30);

    setTimeout(() => clearInterval(timer), 2600);
  };

  const showWinnerOnce = (tw, tz) => {
    const name = (tw > tz) ? teamWijNaam() : teamZijNaam();
    const key = `${tw}|${tz}|${name}`;
    winnerEl.textContent = `🏆 Winnaar: ${name} 🏆`;
    if (lastWinnerKey !== key) {
      lastWinnerKey = key;
      confetti();
    }
  };

  /* ---------- recompute totals (invalid roem NOT counted) ---------- */
  const recompute = () => {
    let pw = 0, pz = 0;
    let rwSum = 0, rzSum = 0;

    let filled = true;
    let anyInvalid = false;

    let natW = 0, natZ = 0, pitW = 0, pitZ = 0;

    for (let r = 1; r <= ROUNDS; r++) {
      // 81-81 rule
      if (!validateNoEqualRound(r)) anyInvalid = true;

      const wDisp = (q("w", r).value || "").trim();
      const zDisp = (q("z", r).value || "").trim();

      const wNorm = normalizeSpecial(wDisp);
      const zNorm = normalizeSpecial(zDisp);

      if (wNorm === "N") natW++;
      if (zNorm === "N") natZ++;
      if (wNorm === "P") pitW++;
      if (zNorm === "P") pitZ++;

      const wPts = pointsValueFromDisplay(wDisp);
      const zPts = pointsValueFromDisplay(zDisp);

      if (wPts === null || zPts === null) filled = false;

      pw += (wPts ?? 0);
      pz += (zPts ?? 0);

      // roem (alleen meetellen als valid tiental)
      const rw = parseRoem(q("rw", r).value);
      const rz = parseRoem(q("rz", r).value);

      if (rw.ok) {
        q("rw", r).classList.remove("inputError");
        rwSum += rw.value;
      } else {
        q("rw", r).classList.add("inputError");
        anyInvalid = true; // invalid roem blokkeert winnaar
      }

      if (rz.ok) {
        q("rz", r).classList.remove("inputError");
        rzSum += rz.value;
      } else {
        q("rz", r).classList.add("inputError");
        anyInvalid = true;
      }
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

  /* ---------- persistence ---------- */
  const saveGame = () => {
    const d = {
      w1: w1.value, w2: w2.value, z1: z1.value, z2: z2.value,
      gameStartedAt, gameEndedAt, lastWinnerKey
    };

    const inputs = document.querySelectorAll("input[data-t]");
    for (const inp of inputs) {
      const k = inp.dataset.t + inp.dataset.r;
      d[k] = inp.value;

      if (inp.dataset.t === "w" || inp.dataset.t === "z") {
        d[k + "_pbonus"] = inp.dataset.pbonus || "0";
        d[k + "_prev"] = inp.dataset.prevNorm || normalizeSpecial(inp.value);
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
    const winnerTeam = ((pw + rw) > (pz + rz)) ? wijTeam : zijTeam;

    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
      `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return {
      id,
      startedAt: gameStartedAt,
      endedAt: gameEndedAt,
      wijTeam, zijTeam,
      pointsWij: pw, pointsZij: pz,
      roemWij: rw, roemZij: rz,
      totalWij: pw + rw, totalZij: pz + rz,
      natWij: natW, natZij: natZ,
      pitWij: pitW, pitZij: pitZ,
      winnerText: `🏆 Winnaar: ${winnerTeam} 🏆`,
      rounds
    };
  };

  const renderHighscores = (hist) => {
    highscoresEl.innerHTML = "";

    const card = (title, html) => {
      const d = document.createElement("div");
      d.className = "badge";
      d.innerHTML = `<div style="font-weight:900; margin-bottom:6px;">${escapeHTML(title)}</div><div>${html}</div>`;
      highscoresEl.appendChild(d);
    };

    if (!hist.length) {
      card("Nog geen highscores", "Speel een potje en druk daarna op <b>Nieuw potje</b> om het op te slaan.");
      return;
    }

    const teamStats = new Map();
    const addTeam = (team, points, roem, nat, pit) => {
      const key = team || "Onbekend";
      if (!teamStats.has(key)) {
        teamStats.set(key, {
          team: key,
          bestPoints: -Infinity,
          worstPoints: Infinity,
          bestRoem: -Infinity,
          natTotal: 0,
          pitTotal: 0
        });
      }
      const s = teamStats.get(key);
      s.bestPoints = Math.max(s.bestPoints, points);
      s.worstPoints = Math.min(s.worstPoints, points);
      s.bestRoem = Math.max(s.bestRoem, roem);
      s.natTotal += nat;
      s.pitTotal += pit;
    };

    for (const g of hist) {
      addTeam(g.wijTeam, g.pointsWij, g.roemWij, g.natWij, g.pitWij);
      addTeam(g.zijTeam, g.pointsZij, g.roemZij, g.natZij, g.pitZij);
    }

    const arr = Array.from(teamStats.values());
    const top = (cmp) => arr.slice().sort(cmp)[0];

    const bestPoints = top((a,b)=>b.bestPoints - a.bestPoints);
    const worstPoints = top((a,b)=>a.worstPoints - b.worstPoints);
    const bestRoem = top((a,b)=>b.bestRoem - a.bestRoem);
    const mostNat = top((a,b)=>b.natTotal - a.natTotal);
    const mostPit = top((a,b)=>b.pitTotal - a.pitTotal);

    card("Hoogste punten (zonder roem)", `<b>${escapeHTML(bestPoints.team)}</b><br>${bestPoints.bestPoints} punten`);
    card("Laagste punten (zonder roem)", `<b>${escapeHTML(worstPoints.team)}</b><br>${worstPoints.worstPoints} punten`);
    card("Meeste roem", `<b>${escapeHTML(bestRoem.team)}</b><br>${bestRoem.bestRoem} roem`);
    card("Meeste Nat", `<b>${escapeHTML(mostNat.team)}</b><br>${mostNat.natTotal}× Nat`);
    card("Meeste Pit", `<b>${escapeHTML(mostPit.team)}</b><br>${mostPit.pitTotal}× Pit`);
  };

  const pdfHTMLForEntry = (entry) => {
    let rowsHtml = "";
    for (const r of entry.rounds) {
      rowsHtml += `<tr>
        <td>${r.r}</td>
        <td>${escapeHTML(r.w)}</td>
        <td>${escapeHTML(r.rw || "")}</td>
        <td>${escapeHTML(r.z)}</td>
        <td>${escapeHTML(r.rz || "")}</td>
      </tr>`;
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
<table>
<thead><tr><th>R</th><th>Wij</th><th>Roem Wij</th><th>Zij</th><th>Roem Zij</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</div>
</body></html>`;
  };

  const openPdfOverlay = (html, title) => {
    pdfTitle.textContent = title || "PDF";
    pdfFrame.srcdoc = html;
    pdfOverlay.style.display = "block";

    pdfPrint.onclick = () => {
      try { pdfFrame.contentWindow.focus(); pdfFrame.contentWindow.print(); } catch {}
    };
    pdfBack.onclick = () => {
      pdfOverlay.style.display = "none";
      pdfFrame.srcdoc = "";
    };
  };

  const printGameAsPDF = (entry) => {
    const html = pdfHTMLForEntry(entry);

    if (isStandaloneMode()) {
      openPdfOverlay(html, `${entry.wijTeam} - ${entry.zijTeam}`);
      return;
    }

    const w = window.open("", "_blank");
    if (!w) {
      openPdfOverlay(html, `${entry.wijTeam} - ${entry.zijTeam}`);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    try { w.print(); } catch {}
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

      const pdfBtn = document.createElement("button");
      pdfBtn.textContent = "📄 PDF";
      pdfBtn.onclick = () => printGameAsPDF(entry);

      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️ Verwijder";
      delBtn.className = "secondary";
      delBtn.onclick = () => {
        const next = loadHistory().filter(x => x.id !== entry.id);
        saveHistory(next);
        renderHistory();
        renderHighscores(next);
      };

      btns.appendChild(pdfBtn);
      btns.appendChild(delBtn);

      item.appendChild(meta);
      item.appendChild(btns);
      historyEl.appendChild(item);
    }

    renderHighscores(hist);
  };

  /* ---------- new game ---------- */
  const isGameCompleteAndValid = () => {
    for (let r = 1; r <= ROUNDS; r++) {
      const wPts = pointsValueFromDisplay(q("w", r).value);
      const zPts = pointsValueFromDisplay(q("z", r).value);
      if (wPts === null || zPts === null) return false;
      if (!validateNoEqualRound(r)) return false;

      // roem must be valid
      if (!parseRoem(q("rw", r).value).ok) return false;
      if (!parseRoem(q("rz", r).value).ok) return false;
    }
    return true;
  };

  const newGame = () => {
    if (winnerEl.textContent && gameStartedAt && gameEndedAt && isGameCompleteAndValid()) {
      const entry = buildHistoryEntry();
      const hist = loadHistory();
      hist.unshift(entry);
      saveHistory(hist);
    }
    localStorage.removeItem(GAME_KEY);
    location.reload();
  };

  /* ---------- core input logic ---------- */
  const onScoreInput = (e) => {
    if (suppress) return;

    if (!gameStartedAt) { gameStartedAt = nowISO(); gameEndedAt = null; }

    const el = e.target;
    const t = el.dataset.t;
    const r = parseInt(el.dataset.r, 10);

    // Roem: validate tiental, block counting if invalid (recompute handles it)
    if (t === "rw" || t === "rz") {
      validateRoemField(el);
      validateNoEqualRound(r);
      recompute();
      saveGame();
      return;
    }

    if (t !== "w" && t !== "z") return;

    const prevNorm = el.dataset.prevNorm || "";
    const valNorm = normalizeSpecial(el.value);

    const otherT = (t === "w") ? "z" : "w";
    const otherEl = q(otherT, r);

    suppress = true;

    if (valNorm === "") {
      otherEl.value = "";
    } else if (valNorm === "N" || valNorm === "P") {
      el.value = valNorm;            // letter zichtbaar
      otherEl.value = String(TOTAL); // ander 162
    } else if (isNumericLike(valNorm)) {
      const num = clampInt(parseInt(valNorm, 10), 0, TOTAL);
      el.value = String(num);
      otherEl.value = String(TOTAL - num);
    } else {
      el.value = "";
      otherEl.value = "";
    }

    // Pit bonus roem (+100)
    if (prevNorm === "P" && valNorm !== "P") setPitBonus(t, r, false);
    if (prevNorm !== "P" && valNorm === "P") setPitBonus(t, r, true);

    el.dataset.prevNorm = valNorm;

    suppress = false;

    validateNoEqualRound(r);
    recompute();
    saveGame();
  };

  /* ---------- roem +20/+50 buttons ---------- */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-roembtn]");
    if (!btn) return;

    const add = parseInt(btn.dataset.roembtn, 10);
    const team = btn.dataset.team; // rw or rz
    const r = parseInt(btn.dataset.r, 10);
    const inp = q(team, r);

    const curParsed = parseRoem(inp.value);
    const cur = (curParsed.ok ? curParsed.value : 0);

    inp.value = String(cur + add);
    validateRoemField(inp);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.focus();
  });

  /* ---------- export/import historie ---------- */
  exportBtn.addEventListener("click", () => {
    const hist = loadHistory();
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `renes-telraam-historie-${new Date().toISOString().slice(0,10)}.json`;
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

      if (!Array.isArray(incoming)) throw new Error("Niet het juiste formaat");

      // simpele merge op id
      const current = loadHistory();
      const byId = new Map(current.map(x => [x.id, x]));
      for (const entry of incoming) {
        if (entry && entry.id) byId.set(entry.id, entry);
      }
      const merged = Array.from(byId.values())
        .sort((a,b) => (b.endedAt || "").localeCompare(a.endedAt || ""));

      saveHistory(merged);
      renderHistory();
      showToast("Historie geïmporteerd ✅");
    } catch (e) {
      console.error(e);
      showToast("Import mislukt ❌ (geen geldig bestand)");
      hapticError();
    }
  });

  /* ---------- PDF overlay close by back button ---------- */
  // already wired in openPdfOverlay

  /* ---------- Hook events ---------- */
  document.querySelectorAll('input[data-t]').forEach(inp => inp.addEventListener("input", onScoreInput));

  // focus handling for Nat/Pit
  document.querySelectorAll('input[data-t="w"], input[data-t="z"]').forEach(inp => {
    inp.addEventListener("focus", () => showNPBarFor(inp));
    inp.addEventListener("blur", hideNPBarIfNeeded);
  });

  // name changes
  [w1,w2,z1,z2].forEach(inp => inp.addEventListener("input", () => {
    updateNames();
    saveGame();
  }));

  newGameBtn.addEventListener("click", newGame);

  /* ---------- Boot ---------- */
  loadGame();
  updateNames();
  recompute();
  renderHistory();
})();
