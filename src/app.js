import "./styles.css";

const API_URL = "https://live.worldcubeassociation.org/api";
const state = {
  competition: null,
  rounds: [],
  selectedRound: null,
  roundData: null,
  settings: {
    mode: "leaderboard",
    resultFlow: "top",
    position: "bottom-left",
    interval: 10,
    pageDuration: 8,
    rows: 6,
    scale: 1,
    tableWidth: 760,
    fontSize: 15,
    rowPadding: 9,
    transition: "fade",
    theme: "dark",
    title: true,
    attempts: true,
    best: true,
    average: true,
    country: true,
    records: true,
    transparent: true,
    highlightAdvancing: true,
    vsA: "",
    vsB: "",
  },
};

const app = document.querySelector("#app");

function params() {
  return new URLSearchParams(window.location.search);
}

function encodeSettings(settings) {
  const data = new URLSearchParams();
  Object.entries(settings).forEach(([key, value]) => data.set(key, String(value)));
  return data;
}

function readOverlaySettings(search) {
  const defaults = { ...state.settings };
  for (const [key, value] of search.entries()) {
    if (value === "true" || value === "false") defaults[key] = value === "true";
    else if (
      [
        "interval",
        "pageDuration",
        "rows",
        "scale",
        "tableWidth",
        "fontSize",
        "rowPadding",
      ].includes(key)
    )
      defaults[key] = Number(value);
    else defaults[key] = value;
  }
  return defaults;
}

async function gql(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`WCA Live respondio ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  return payload.data;
}

async function searchCompetitions(filter) {
  const data = await gql(
    `query Competitions($filter: String!) {
      competitions(filter: $filter, limit: 12) { id wcaId name }
    }`,
    { filter },
  );
  return data.competitions ?? [];
}

async function loadCompetition(id) {
  const data = await gql(
    `query Competition($id: ID!) {
      competition(id: $id) {
        id
        wcaId
        name
        competitionEvents {
          id
          event { id name }
          rounds { id name active open finished number }
        }
      }
    }`,
    { id },
  );
  return data.competition;
}

async function loadCompetitionResults(idOrWcaId) {
  const response = await fetch(`${API_URL}/competitions/${idOrWcaId}/results`);
  if (!response.ok) throw new Error(`WCA Live respondio ${response.status}`);
  return response.json();
}

async function loadRound(roundId) {
  const data = await gql(
    `query Round($id: ID!) {
      round(id: $id) {
        id
        name
        finished
        active
        competitionEvent { event { id name } }
        format { id numberOfAttempts sortBy }
        advancementCondition { level type }
        results {
          id
          ranking
          advancing
          advancingQuestionable
          attempts { result }
          best
          average
          singleRecordTag
          averageRecordTag
          person { id name country { iso2 name } }
        }
      }
    }`,
    { id: roundId },
  );
  return data.round;
}

function roundLabel(item) {
  return `${item.event.name} - ${item.round.name}${item.round.active ? " (activa)" : ""}`;
}

function flattenRounds(competition) {
  return (competition?.competitionEvents ?? []).flatMap((event) =>
    event.rounds.map((round) => ({ event: event.event, round })),
  );
}

function byRanking(a, b) {
  const ar = a.ranking || 9999;
  const br = b.ranking || 9999;
  return ar - br || a.person.name.localeCompare(b.person.name);
}

function resultValue(result, field, eventId) {
  const value = result[field];
  if (value == null || value === 0) return "";
  return formatResult(value, eventId);
}

function formatResult(value, eventId) {
  if (value === -1) return "DNF";
  if (value === -2) return "DNS";
  if (!value) return "";
  if (eventId === "333fm") return value >= 100 ? (value / 100).toFixed(2) : String(value);
  if (eventId === "333mbf") return String(value);
  const total = Math.floor(value / 100);
  const centis = String(Math.abs(value % 100)).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(minutes ? 2 : 1, "0");
  return minutes ? `${minutes}:${seconds}.${centis}` : `${seconds}.${centis}`;
}

function attemptValues(result, eventId, maxAttempts) {
  const attempts = result.attempts.map((attempt) => formatResult(attempt.result, eventId));
  while (attempts.length < maxAttempts) attempts.push("");
  return attempts;
}

function countryBadge(code) {
  const normalized = String(code || "").toLowerCase();
  const image = /^[a-z]{2}$/.test(normalized)
    ? `<img class="flag" src="https://flagcdn.com/32x24/${normalized}.png" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : "";
  return `<span class="country-badge">${image}<span>${code || ""}</span></span>`;
}

function copyText(text) {
  navigator.clipboard?.writeText(text);
}

function renderConfig() {
  app.className = "app-shell";
  app.innerHTML = `
    <section class="config-layout">
      <div class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">WCA Live + OBS</p>
            <h1>Overlay configurable</h1>
          </div>
          <a class="ghost-button" href="https://live.worldcubeassociation.org/" target="_blank" rel="noreferrer">WCA Live</a>
        </header>

        <section class="panel">
          <h2>Competencia y ronda</h2>
          <div class="field-row">
            <label>
              Buscar competencia
              <input id="competitionSearch" placeholder="Ej. FMC World 2026, Mexico, Latam..." autocomplete="off" />
            </label>
            <button id="searchBtn" class="primary-button">Buscar</button>
          </div>
          <div id="competitionResults" class="search-results"></div>
          <label>
            Ronda
            <select id="roundSelect" disabled>
              <option>Primero elige una competencia</option>
            </select>
          </label>
        </section>

        <section class="panel options-grid">
          <div>
            <h2>Contenido</h2>
            <div class="check-grid">
              ${checkbox("title", "Titulo")}
              ${checkbox("country", "Pais")}
              ${checkbox("attempts", "Intentos")}
              ${checkbox("best", "Mejor")}
              ${checkbox("average", "Promedio")}
              ${checkbox("records", "Records")}
              ${checkbox("highlightAdvancing", "Avanzan")}
              ${checkbox("transparent", "Fondo transparente")}
            </div>
          </div>
          <div>
            <h2>Presentacion</h2>
            <label>Modo
              <select id="mode">
                <option value="leaderboard">Tabla de resultados</option>
                <option value="fullscreen-table">Tabla pantalla completa</option>
                <option value="competition-summary">Resumen competencia</option>
                <option value="lower-third">Lower third</option>
                <option value="vs">Versus</option>
              </select>
            </label>
            <label>Resultados
              <select id="resultFlow">
                <option value="top">Primeras posiciones</option>
                <option value="pages">Todas por paginas</option>
                <option value="all">Todas juntas</option>
              </select>
            </label>
            <label>Posicion
              <select id="position">
                <option value="bottom-left">Abajo izquierda</option>
                <option value="bottom-right">Abajo derecha</option>
                <option value="top-left">Arriba izquierda</option>
                <option value="top-right">Arriba derecha</option>
                <option value="center">Centro</option>
              </select>
            </label>
            <div class="field-row compact">
              <label>Refresco (s)<input id="interval" type="number" min="3" max="120" /></label>
              <label>Pagina (s)<input id="pageDuration" type="number" min="2" max="60" /></label>
              <label>Filas<input id="rows" type="number" min="1" max="20" /></label>
            </div>
            <div class="field-row compact">
              <label>Escala<input id="scale" type="number" min="0.6" max="1.8" step="0.1" /></label>
              <label>Ancho<input id="tableWidth" type="number" min="420" max="1920" step="20" /></label>
              <label>Texto<input id="fontSize" type="number" min="10" max="32" /></label>
            </div>
            <div class="field-row compact">
              <label>Fila<input id="rowPadding" type="number" min="4" max="24" /></label>
              <label>Transicion
                <select id="transition">
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="pop">Pop</option>
                  <option value="none">Sin animacion</option>
                </select>
              </label>
            </div>
            <label>Tema
              <select id="theme">
                <option value="dark">Oscuro</option>
                <option value="light">Claro</option>
                <option value="broadcast">Broadcast rojo</option>
              </select>
            </label>
          </div>
        </section>

        <section class="panel vs-panel" id="vsPanel" hidden>
          <h2>Competidores VS</h2>
          <div class="field-row">
            <label>Competidor A<select id="vsA"></select></label>
            <label>Competidor B<select id="vsB"></select></label>
          </div>
        </section>

        <section class="panel output-panel">
          <h2>URL para OBS</h2>
          <div class="url-box" id="obsUrl">Elige competencia y ronda para generar la URL.</div>
          <div class="actions">
            <button id="copyBtn" class="primary-button">Copiar URL</button>
            <a id="openOverlay" class="ghost-button" href="#" target="_blank">Abrir overlay</a>
          </div>
        </section>
      </div>
      <aside class="preview-rail">
        <div class="mini-browser">
          <div class="mini-toolbar"></div>
          <div id="preview" class="preview-stage"></div>
        </div>
      </aside>
    </section>
  `;

  bindConfig();
  updateControls();
  updateUrl();
  renderPreview();
}

function checkbox(key, label) {
  return `<label class="checkbox"><input type="checkbox" id="${key}" /> ${label}</label>`;
}

function bindConfig() {
  const searchInput = document.querySelector("#competitionSearch");
  const searchBtn = document.querySelector("#searchBtn");
  searchBtn.addEventListener("click", () => doSearch(searchInput.value));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doSearch(searchInput.value);
  });

  document.querySelector("#roundSelect").addEventListener("change", async (event) => {
    const selected = state.rounds.find((item) => item.round.id === event.target.value);
    state.selectedRound = selected ?? null;
    await refreshRoundForConfig();
    updateUrl();
    renderPreview();
  });

  Object.keys(state.settings).forEach((key) => {
    const el = document.querySelector(`#${key}`);
    if (!el) return;
    el.addEventListener("input", () => {
      if (el.type === "checkbox") state.settings[key] = el.checked;
      else if (
        [
          "interval",
          "pageDuration",
          "rows",
          "scale",
          "tableWidth",
          "fontSize",
          "rowPadding",
        ].includes(key)
      )
        state.settings[key] = Number(el.value);
      else state.settings[key] = el.value;
      document.querySelector("#vsPanel").hidden = state.settings.mode !== "vs";
      updateUrl();
      renderPreview();
    });
  });

  document.querySelector("#copyBtn").addEventListener("click", () => {
    const url = document.querySelector("#obsUrl").textContent;
    if (url.startsWith("http")) copyText(url);
  });
}

async function doSearch(term) {
  const holder = document.querySelector("#competitionResults");
  holder.innerHTML = `<p class="muted">Buscando...</p>`;
  try {
    const competitions = await searchCompetitions(term.trim());
    holder.innerHTML = competitions
      .map(
        (competition) =>
          `<button class="result-button" data-id="${competition.id}">
            <strong>${competition.name}</strong><span>${competition.wcaId ?? competition.id}</span>
          </button>`,
      )
      .join("") || `<p class="muted">No encontre competencias con ese texto.</p>`;
    holder.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => selectCompetition(button.dataset.id));
    });
  } catch (error) {
    holder.innerHTML = `<p class="error-text">${error.message}</p>`;
  }
}

async function selectCompetition(id) {
  const select = document.querySelector("#roundSelect");
  select.innerHTML = `<option>Cargando rondas...</option>`;
  select.disabled = true;
  state.competition = await loadCompetition(id);
  state.rounds = flattenRounds(state.competition);
  state.selectedRound = state.rounds.find((item) => item.round.active) ?? state.rounds[0] ?? null;
  select.innerHTML = state.rounds
    .map((item) => `<option value="${item.round.id}">${roundLabel(item)}</option>`)
    .join("");
  select.disabled = false;
  select.value = state.selectedRound?.round.id ?? "";
  await refreshRoundForConfig();
  updateUrl();
  renderPreview();
}

async function refreshRoundForConfig() {
  state.roundData = null;
  if (!state.selectedRound) return;
  try {
    state.roundData = await loadRound(state.selectedRound.round.id);
    fillVsOptions();
  } catch {
    fillVsOptions();
  }
}

function fillVsOptions() {
  const results = (state.roundData?.results ?? []).slice().sort(byRanking);
  ["vsA", "vsB"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    if (!select) return;
    select.innerHTML = `<option value="">Auto</option>${results
      .map((result) => `<option value="${result.person.id}">${result.person.name}</option>`)
      .join("")}`;
    select.value = state.settings[id] || "";
  });
}

function updateControls() {
  Object.entries(state.settings).forEach(([key, value]) => {
    const el = document.querySelector(`#${key}`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value;
  });
  document.querySelector("#vsPanel").hidden = state.settings.mode !== "vs";
}

function updateUrl() {
  const output = document.querySelector("#obsUrl");
  const link = document.querySelector("#openOverlay");
  if (!state.competition || !state.selectedRound) {
    link.removeAttribute("href");
    return;
  }
  const url = new URL(window.location.href);
  url.search = "";
  const query = encodeSettings(state.settings);
  query.set("view", "overlay");
  query.set("competition", state.competition.id);
  query.set("round", state.selectedRound.round.id);
  url.search = query.toString();
  output.textContent = url.toString();
  link.href = url.toString();
}

function renderPreview() {
  const preview = document.querySelector("#preview");
  if (!preview) return;
  if (state.settings.mode === "competition-summary") {
    preview.innerHTML = competitionSummaryMarkup(sampleCompetitionSummary(), state.settings, true);
    return;
  }
  const round = state.roundData ?? sampleRound();
  preview.innerHTML = overlayMarkup(round, state.settings, true);
}

function sampleCompetitionSummary() {
  const round = sampleRound();
  return {
    name: "Demo Open 2026",
    activeCount: 1,
    finishedCount: 2,
    totalCount: 4,
    rounds: [
      { eventName: "3x3x3 Cube", roundName: "Final", status: "active", podium: round.results.slice(0, 3), eventId: "333" },
      { eventName: "2x2x2 Cube", roundName: "Final", status: "finished", podium: round.results.slice(1, 4), eventId: "222" },
      { eventName: "Pyraminx", roundName: "First round", status: "finished", podium: round.results.slice(2, 5), eventId: "pyram" },
    ],
  };
}

function sampleRound() {
  return {
    name: "Final",
    active: true,
    competitionEvent: { event: { id: "333", name: "3x3x3 Cube" } },
    format: { numberOfAttempts: 5 },
    results: [
      sampleResult(1, "Max Park", "US", [512, 498, 621, 555, 487], 487, 521, "WR"),
      sampleResult(2, "Tymon Kolasinski", "PL", [603, 531, 548, 581, 599], 531, 576, "ER"),
      sampleResult(3, "Feliks Zemdegs", "AU", [627, 589, 602, 610, 571], 571, 600, ""),
      sampleResult(4, "Yiheng Wang", "CN", [617, 608, 590, 641, 611], 590, 612, "AsR"),
      sampleResult(5, "Matty Hiroto Inaba", "US", [622, 655, 619, 604, 638], 604, 626, ""),
      sampleResult(6, "Sean Patrick Villanueva", "PH", [681, 642, 623, 659, 670], 623, 657, ""),
      sampleResult(7, "Leo Borromeo", "PH", [702, 689, 665, 641, 674], 641, 676, ""),
      sampleResult(8, "Juliette Sebastien", "FR", [711, 692, 684, 700, 679], 679, 692, ""),
    ],
  };
}

function sampleResult(ranking, name, country, attempts, best, average, record) {
  return {
    ranking,
    attempts: attempts.map((result) => ({ result })),
    best,
    average,
    singleRecordTag: record,
    averageRecordTag: "",
    advancing: ranking <= 2,
    person: { id: String(ranking), name, country: { iso2: country, name: country } },
  };
}

function competitionSummary(competition, resultsPayload) {
  const persons = new Map((resultsPayload?.persons ?? []).map((person) => [person.id, person]));
  const resultEvents = new Map((resultsPayload?.events ?? []).map((event) => [event.eventId, event]));
  const latestRelevantRounds = (competition?.competitionEvents ?? []).flatMap((competitionEvent) => {
    const relevantRounds = competitionEvent.rounds
      .filter((round) => round.active || round.finished)
      .sort((a, b) => b.number - a.number);
    const round = relevantRounds[0];
    return round ? [{ event: competitionEvent.event, round }] : [];
  });
  const rounds = latestRelevantRounds.map(({ event, round }) => {
    const resultRound = resultEvents
      .get(event.id)
      ?.rounds?.find((candidate) => candidate.number === round.number);
    const podium = (resultRound?.results ?? [])
      .filter((result) => result.ranking > 0 && result.ranking <= 3)
      .sort(byRanking)
      .map((result) => {
        const person = persons.get(result.personId);
        return {
          ...result,
          attempts: (result.attempts ?? []).map((attempt) => ({ result: attempt })),
          person: {
            id: String(result.personId),
            name: person?.name ?? "Competidor",
            country: { iso2: person?.country ?? "", name: person?.country ?? "" },
          },
        };
      });
    const status = round.active ? "active" : round.finished ? "finished" : "waiting";
    return {
      eventId: event.id,
      eventName: event.name,
      roundName: round.name,
      status,
      podium,
    };
  });
  return {
    name: competition.name,
    activeCount: rounds.filter((round) => round.status === "active").length,
    finishedCount: rounds.filter((round) => round.status === "finished").length,
    totalCount: rounds.length,
    rounds,
  };
}

function statusLabel(status) {
  if (status === "active") return "Activa";
  if (status === "finished") return "Finalizada";
  return "Pendiente";
}

function competitionSummaryMarkup(summary, settings, preview = false, pageIndex = 0) {
  const classes = ["overlay-root", `pos-${settings.position}`, `theme-${settings.theme}`];
  if (preview) classes.push("preview-overlay");
  if (!settings.transparent) classes.push("solid-backdrop");
  const rounds = visibleResultsFor(summary.rounds, settings, pageIndex);
  const style = [
    `--overlay-scale:${settings.scale}`,
    `--table-width:${settings.tableWidth}px`,
    `--table-font:${settings.fontSize}px`,
    `--row-pad:${settings.rowPadding}px`,
  ].join(";");
  return `<div class="${classes.join(" ")}" style="${style}">
    <section class="competition-summary transition-${settings.transition}">
      <header>
        <div>
          <strong>${summary.name}</strong>
          <span>${summary.activeCount} activas · ${summary.finishedCount}/${summary.totalCount} finalizadas</span>
        </div>
        <em>${pageStatus(summary.rounds, settings, pageIndex) || "Resumen"}</em>
      </header>
      <div class="summary-list">
        ${rounds.map((round) => summaryRoundMarkup(round, settings)).join("")}
      </div>
    </section>
  </div>`;
}

function summaryRoundMarkup(round, settings) {
  const isFinal = /\bfinal\b/i.test(round.roundName);
  return `<article class="summary-round status-${round.status}">
    <div class="summary-round-head">
      <strong>${round.eventName}</strong>
      <span>${round.roundName} · ${statusLabel(round.status)}</span>
    </div>
    <div class="podium-list">
      ${round.podium.length ? round.podium.map((result) => podiumMarkup(result, round.eventId, settings, isFinal)).join("") : `<span class="muted">Sin resultados todavia</span>`}
    </div>
  </article>`;
}

function podiumBadge(ranking, isFinal) {
  if (!isFinal) return `<span class="medal">${ranking}</span>`;
  const names = { 1: "gold", 2: "silver", 3: "bronze" };
  const labels = { 1: "Oro", 2: "Plata", 3: "Bronce" };
  return `<span class="medal medal-${names[ranking] || "plain"}" title="${labels[ranking] || ranking}" aria-label="${labels[ranking] || ranking}"></span>`;
}

function podiumMarkup(result, eventId, settings, isFinal = false) {
  return `<div class="podium-row">
    ${podiumBadge(result.ranking, isFinal)}
    <strong>${settings.country ? countryBadge(result.person.country.iso2) : ""}${result.person.name}</strong>
    <span>${resultValue(result, "best", eventId)} · ${resultValue(result, "average", eventId)}</span>
  </div>`;
}

function visibleResultsFor(results, settings, pageIndex) {
  if (settings.resultFlow === "all") return results;
  if (settings.resultFlow === "pages") {
    const start = pageIndex * settings.rows;
    return results.slice(start, start + settings.rows);
  }
  return results.slice(0, settings.rows);
}

function pageStatus(results, settings, pageIndex) {
  if (settings.resultFlow !== "pages") return "";
  const pages = Math.max(Math.ceil(results.length / settings.rows), 1);
  return `Pagina ${Math.min(pageIndex + 1, pages)}/${pages}`;
}

function overlayMarkup(round, settings, preview = false, pageIndex = 0) {
  const eventId = round.competitionEvent.event.id;
  const results = (round.results ?? [])
    .filter((result) => result.attempts.some((attempt) => attempt.result))
    .sort(byRanking);
  const visible = visibleResultsFor(results, settings, pageIndex);
  const title = `${round.competitionEvent.event.name} - ${round.name}`;
  const classes = ["overlay-root", `pos-${settings.position}`, `theme-${settings.theme}`];
  const panelClasses = ["scoreboard", `transition-${settings.transition}`];
  if (settings.mode === "fullscreen-table") {
    classes.push("full-table-root");
    panelClasses.push("full-table");
  }
  if (preview) classes.push("preview-overlay");
  if (!settings.transparent) classes.push("solid-backdrop");
  const style = [
    `--overlay-scale:${settings.scale}`,
    `--table-width:${settings.tableWidth}px`,
    `--table-font:${settings.fontSize}px`,
    `--row-pad:${settings.rowPadding}px`,
  ].join(";");

  if (settings.mode === "lower-third") {
    const leader = visible[0];
    return `<div class="${classes.join(" ")}" style="${style}">
      <section class="lower-third transition-${settings.transition}">
        <div class="title-line">${settings.title ? `<p>${title}</p>` : ""}</div>
        <strong>${leader ? leader.person.name : "Sin resultados"}</strong>
        <span>${leader ? `#${leader.ranking} · Mejor ${resultValue(leader, "best", eventId)} · Prom ${resultValue(leader, "average", eventId)}` : "Esperando datos de WCA Live"}</span>
      </section>
    </div>`;
  }

  if (settings.mode === "vs") {
    const a = results.find((result) => result.person.id === settings.vsA) ?? results[0];
    const b = results.find((result) => result.person.id === settings.vsB) ?? results[1];
    return `<div class="${classes.join(" ")}" style="${style}">
      <section class="vs-card transition-${settings.transition}">
        <div class="title-line">${settings.title ? `<p>${title}</p>` : ""}</div>
        ${vsSide(a, eventId)}
        <div class="vs-divider">VS</div>
        ${vsSide(b, eventId)}
      </section>
    </div>`;
  }

  return `<div class="${classes.join(" ")}" style="${style}">
    <section class="${panelClasses.join(" ")}">
      ${settings.title ? `<header><div class="title-line"><strong>${title}</strong></div><span>${pageStatus(results, settings, pageIndex) || (round.active ? "LIVE" : "Resultados")}</span></header>` : ""}
      <table>
        <thead><tr>
          <th>#</th><th>Competidor</th>
          ${settings.country ? "<th>Pais</th>" : ""}
          ${settings.attempts ? "<th>Intentos</th>" : ""}
          ${settings.best ? "<th>Mejor</th>" : ""}
          ${settings.average ? "<th>Prom</th>" : ""}
        </tr></thead>
        <tbody>
          ${visible.map((result) => rowMarkup(result, eventId, round.format.numberOfAttempts, settings)).join("") ||
          `<tr><td colspan="6" class="empty-cell">Esperando resultados...</td></tr>`}
        </tbody>
      </table>
    </section>
  </div>`;
}

function rowMarkup(result, eventId, maxAttempts, settings) {
  const record = [result.singleRecordTag, result.averageRecordTag].filter(Boolean).join(" ");
  const rowClass = settings.highlightAdvancing && result.advancing ? "advancing-row" : "";
  return `<tr class="${rowClass}">
    <td>${result.ranking || ""}</td>
    <td><span class="name">${result.person.name}</span>${settings.records && record ? `<em>${record}</em>` : ""}</td>
    ${settings.country ? `<td>${countryBadge(result.person.country.iso2)}</td>` : ""}
    ${settings.attempts ? `<td class="attempts">${attemptValues(result, eventId, maxAttempts).join(" / ")}</td>` : ""}
    ${settings.best ? `<td>${resultValue(result, "best", eventId)}</td>` : ""}
    ${settings.average ? `<td>${resultValue(result, "average", eventId)}</td>` : ""}
  </tr>`;
}

function vsSide(result, eventId) {
  if (!result) return `<div class="vs-side"><strong>Sin competidor</strong><span>-</span></div>`;
  return `<div class="vs-side">
    <small>#${result.ranking || "-"}</small>
    <strong>${result.person.name}</strong>
    <span>${countryBadge(result.person.country.iso2)} · Mejor ${resultValue(result, "best", eventId)} · Prom ${resultValue(result, "average", eventId)}</span>
  </div>`;
}

async function renderOverlay() {
  const search = params();
  const settings = readOverlaySettings(search);
  const competitionId = search.get("competition");
  const roundId = search.get("round");
  let currentRound = null;
  let currentSummary = null;
  let pageIndex = 0;
  app.className = "overlay-page";
  document.documentElement.classList.add("overlay-document");
  document.body.classList.add("overlay-body");

  function paintSummary() {
    if (!currentSummary) return;
    document.body.className = `overlay-body ${settings.transparent ? "transparent" : "with-backdrop"}`;
    app.innerHTML = competitionSummaryMarkup(currentSummary, settings, false, pageIndex);
  }

  function maxSummaryPage() {
    const total = currentSummary?.rounds?.length || 0;
    return Math.max(Math.ceil(total / settings.rows), 1);
  }

  async function fetchAndPaintSummary() {
    try {
      const competition = await loadCompetition(competitionId);
      const results = await loadCompetitionResults(competition.wcaId ?? competition.id);
      currentSummary = competitionSummary(competition, results);
      if (pageIndex >= maxSummaryPage()) pageIndex = 0;
      paintSummary();
    } catch (error) {
      app.innerHTML = `<div class="overlay-root pos-center theme-dark"><section class="scoreboard error-board">No se pudo leer WCA Live: ${error.message}</section></div>`;
    }
  }

  if (settings.mode === "competition-summary") {
    await fetchAndPaintSummary();
    window.setInterval(fetchAndPaintSummary, Math.max(settings.interval || 10, 3) * 1000);
    if (settings.resultFlow === "pages") {
      window.setInterval(() => {
        pageIndex = (pageIndex + 1) % maxSummaryPage();
        paintSummary();
      }, Math.max(settings.pageDuration || 8, 2) * 1000);
    }
    return;
  }

  function maxPage() {
    const total = currentRound?.results?.filter((result) =>
      result.attempts.some((attempt) => attempt.result),
    ).length;
    return Math.max(Math.ceil((total || 0) / settings.rows), 1);
  }

  function paintCurrent() {
    if (!currentRound) return;
    document.body.className = `overlay-body ${settings.transparent ? "transparent" : "with-backdrop"}`;
    app.innerHTML = overlayMarkup(currentRound, settings, false, pageIndex);
  }

  async function fetchAndPaint() {
    try {
      currentRound = await loadRound(roundId);
      if (pageIndex >= maxPage()) pageIndex = 0;
      paintCurrent();
    } catch (error) {
      app.innerHTML = `<div class="overlay-root pos-center theme-dark"><section class="scoreboard error-board">No se pudo leer WCA Live: ${error.message}</section></div>`;
    }
  }

  await fetchAndPaint();
  window.setInterval(fetchAndPaint, Math.max(settings.interval || 10, 3) * 1000);
  if (settings.resultFlow === "pages") {
    window.setInterval(() => {
      pageIndex = (pageIndex + 1) % maxPage();
      paintCurrent();
    }, Math.max(settings.pageDuration || 8, 2) * 1000);
  }
}

if (params().get("view") === "overlay") {
  renderOverlay();
} else {
  renderConfig();
}
