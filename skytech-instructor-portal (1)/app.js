// SkyTech Academy instructor portal.
// Content lives in /data/*.json — edit those files on GitHub to post updates.

// SHA-256 of the instructor passcode. To change it, open tools/passcode.html,
// type the new passcode, and paste the result here.
const PASSCODE_HASH = "9f066eb330154fc41bb438c9b8130bc92e056f336cd9ac4073dda99dcdf4c047";

const NEW_ANNOUNCEMENT_DAYS = 7;
const NEW_FORM_DAYS = 14;
const STORE_KEY = "sta-portal-key";

const $ = (s) => document.querySelector(s);

// ---------- helpers ----------
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function daysAgo(s) {
  return Math.round((today() - parseDate(s)) / 86400000);
}
function fmt(s, opts = { month: "short", day: "numeric", year: "numeric" }) {
  return parseDate(s).toLocaleDateString("en-US", opts);
}
function fmtRange(a, b) {
  const A = parseDate(a), B = parseDate(b);
  const m = (d) => d.toLocaleDateString("en-US", { month: "short" });
  if (A.getMonth() === B.getMonth()) return `${m(A)} ${A.getDate()}–${B.getDate()}`;
  return `${m(A)} ${A.getDate()} – ${m(B)} ${B.getDate()}`;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function store(get, val) {
  try { return get ? localStorage.getItem(STORE_KEY) : val === null ? localStorage.removeItem(STORE_KEY) : localStorage.setItem(STORE_KEY, val); }
  catch { return null; }
}
async function load(name) {
  const r = await fetch(`data/${name}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn't load data/${name}.json (${r.status})`);
  return r.json();
}

// ---------- gate ----------
async function unlock() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  try {
    const [ann, forms, sched] = await Promise.all([load("announcements"), load("forms"), load("schedule")]);
    renderAnnouncements(ann);
    renderForms(forms);
    renderSchedule(sched);
  } catch (e) {
    $("#rope").innerHTML = `<li class="empty">${esc(e.message)}. Check the file on GitHub for a missing comma or quote.</li>`;
  }
}

$("#gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hash = await sha256($("#passcode").value.trim());
  if (hash === PASSCODE_HASH) {
    store(false, hash);
    unlock();
  } else {
    $("#gate-error").hidden = false;
    $("#passcode").select();
  }
});

$("#lock").addEventListener("click", () => {
  store(false, null);
  location.reload();
});

if (store(true) === PASSCODE_HASH) unlock();

// ---------- announcements ----------
function renderAnnouncements(list) {
  const items = [...list].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  $("#board-count").textContent = items.length ? `${items.length} posted` : "";
  if (!items.length) {
    $("#rope").innerHTML = `<li class="empty">No announcements yet. New posts from the office will show here.</li>`;
    return;
  }
  $("#rope").innerHTML = items.map((a) => {
    const safety = a.priority === "safety";
    const isNew = daysAgo(a.date) <= NEW_ANNOUNCEMENT_DAYS;
    const body = String(a.body || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
    return `
      <li class="note${safety ? " safety" : ""}">
        <article class="note-body">
          <div class="note-meta">
            <time datetime="${esc(a.date)}">${fmt(a.date)}</time>
            ${a.from ? `<span>${esc(a.from)}</span>` : ""}
            ${a.pinned ? `<span>Pinned</span>` : ""}
            ${isNew ? `<span class="tag tag-new">New</span>` : ""}
            ${safety ? `<span class="tag tag-safety">Safety critical</span>` : ""}
          </div>
          <h3>${esc(a.title)}</h3>
          ${body}
        </article>
      </li>`;
  }).join("");
}

// ---------- forms ----------
let allForms = [];
function renderForms(list) {
  allForms = list;
  drawForms("");
}
function drawForms(q) {
  q = q.trim().toLowerCase();
  const hits = allForms.filter((f) => !q || `${f.title} ${f.id} ${f.category}`.toLowerCase().includes(q));
  if (!hits.length) {
    $("#forms").innerHTML = `<p class="empty">${q ? "No forms match that search." : "No forms posted yet."}</p>`;
    return;
  }
  const groups = {};
  hits.sort((a, b) => b.added.localeCompare(a.added)).forEach((f) => (groups[f.category || "Other"] ||= []).push(f));
  $("#forms").innerHTML = Object.entries(groups).map(([cat, fs]) => `
    <div class="form-group">
      <h3>${esc(cat)}</h3>
      <ul class="form-list">
        ${fs.map((f) => {
          const isNew = daysAgo(f.added) <= NEW_FORM_DAYS;
          const name = f.file
            ? `<a href="${esc(f.file)}" target="_blank" rel="noopener">${esc(f.title)}</a>`
            : `<span class="form-name">${esc(f.title)}</span>`;
          return `
          <li class="form-item">
            ${name} ${isNew ? `<span class="tag tag-new">New</span>` : ""}
            <div class="form-sub">
              ${f.id ? `<span class="form-id">${esc(f.id)}</span>` : ""}
              ${f.rev ? `<span>Rev ${esc(f.rev)}</span>` : ""}
              <span>${f.file ? `Added ${fmt(f.added, { month: "short", day: "numeric" })}` : "Paper copy at the office"}</span>
              ${f.alt ? `<a href="${esc(f.alt)}" download>Download ${esc(f.altLabel || "original")}</a>` : ""}
            </div>
            ${f.note ? `<div class="form-sub">${esc(f.note)}</div>` : ""}
          </li>`;
        }).join("")}
      </ul>
    </div>`).join("");
}

// ---------- schedule ----------
function renderSchedule(list) {
  const t = today();
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const next = sorted.find((c) => parseDate(c.end) >= t);

  $("#nextclass").innerHTML = next
    ? `<span class="nc-label">${parseDate(next.start) <= t ? "Class in session" : "Next class"}</span>
       <span class="nc-dates">${fmtRange(next.start, next.end)}</span>
       <span class="nc-detail">${esc(next.course)}${next.hours ? `, ${esc(next.hours)}` : ""}${next.instructors ? `. Instructors: ${esc(next.instructors)}` : ""}</span>`
    : `<span class="nc-label">Next class</span><span class="nc-detail">No upcoming classes on the schedule.</span>`;

  $("#schedule").innerHTML = sorted.filter((c) => parseDate(c.end) >= t).slice(0, 6).map((c) => `
    <li>
      <span class="when">${fmtRange(c.start, c.end)}</span>
      <span class="what">${esc(c.course)}${c.instructors ? `, ${esc(c.instructors)}` : ""}</span>
    </li>`).join("") || `<li class="empty">No classes scheduled.</li>`;
}

// ---------- full-text search across every PDF ----------
// data/search-index.json holds the text of each page; it is rebuilt automatically on GitHub
// whenever a PDF is uploaded (see .github/workflows/search-index.yml).
let searchIndex = null;
let searchTimer = null;
const PAGES_SHOWN = 4;

async function getIndex() {
  if (!searchIndex) {
    try {
      const r = await fetch("data/search-index.json", { cache: "no-store" });
      searchIndex = r.ok ? await r.json() : [];
    } catch {
      searchIndex = [];
    }
  }
  return searchIndex;
}

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-");
}
function terms(q) {
  return normalize(q).split(/\s+/).filter((t) => t.length > 1);
}
// "z-rig" also matches "z rig" and "zrig"
function variants(t) {
  return t.includes("-") ? [t, t.replace(/-/g, " "), t.replace(/-/g, "")] : [t];
}
function has(low, t) {
  return variants(t).some((v) => low.includes(v));
}
function count(low, t) {
  return variants(t).reduce((n, v) => n + low.split(v).length - 1, 0);
}
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippet(text, ts) {
  const flat = text.replace(/\s+/g, " ");
  const low = normalize(flat);
  let at = -1;
  for (const t of ts) {
    for (const v of variants(t)) { at = low.indexOf(v); if (at >= 0) break; }
    if (at >= 0) break;
  }
  const start = Math.max(0, at - 90);
  const end = Math.min(flat.length, (at < 0 ? 0 : at) + 190);
  let out = esc(flat.slice(start, end));
  ts.flatMap(variants).sort((a, b) => b.length - a.length).forEach((v) => {
    out = out.replace(new RegExp(`(?![^<]*>)(${escRe(esc(v))})`, "gi"), "<mark>$1</mark>");
  });
  return (start > 0 ? "…" : "") + out + (end < flat.length ? "…" : "");
}

async function runSearch(q) {
  const ts = terms(q);
  const showHome = ts.length === 0;
  $("#home").hidden = !showHome;
  $("#results").hidden = showHome;
  $("#q-clear").hidden = !q;
  if (showHome) return;

  const idx = await getIndex();
  const docs = [];
  let pageHits = 0;
  for (const d of idx) {
    const titleText = normalize(`${d.title} ${d.category}`);
    const titleHit = ts.every((t) => has(titleText, t));
    const pages = d.pages.filter(([, text]) => {
      const low = normalize(text);
      return ts.every((t) => has(low, t));
    });
    if (titleHit || pages.length) {
      // more term occurrences rank higher
      const score = (titleHit ? 1000 : 0) + pages.reduce((s, [, text]) => {
        const low = normalize(text);
        return s + ts.reduce((n, t) => n + count(low, t), 0);
      }, 0);
      docs.push({ d, pages, score });
      pageHits += pages.length;
    }
  }
  // paper-only forms (no PDF) still match by name
  for (const f of allForms) {
    if (f.file) continue;
    const text = normalize(`${f.title} ${f.id} ${f.category}`);
    if (ts.every((t) => has(text, t))) docs.push({ d: { title: f.title, category: f.category, file: "", paper: true }, pages: [], score: 500 });
  }
  docs.sort((a, b) => b.score - a.score);

  if (!docs.length) {
    $("#results").innerHTML = `<p class="results-summary">Nothing found for “${esc(q)}”. Try fewer or shorter words, like “anchor” instead of “anchors setup”.</p>`;
    return;
  }

  $("#results").innerHTML = `
    <p class="results-summary">${pageHits} matching page${pageHits === 1 ? "" : "s"} in ${docs.length} document${docs.length === 1 ? "" : "s"}</p>
    ${docs.map(({ d, pages }, i) => `
      <article class="hit-doc">
        <div class="hit-doc-head">
          <h3>${d.file ? `<a href="${esc(d.file)}" target="_blank" rel="noopener">${esc(d.title)}</a>` : esc(d.title)}</h3>
          <div class="form-sub">
            <span>${esc(d.category || "")}</span>
            ${d.paper ? "<span>Paper copy at the office</span>" : `<span>${pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"} match` : "Title matches"}</span>`}
          </div>
        </div>
        ${pages.length ? `
          <ul class="hit-pages">
            ${pages.map(([n, text], j) => `
              <li class="hit-page"${j >= PAGES_SHOWN ? ` data-extra="${i}" hidden` : ""}>
                <a class="pg" href="${esc(d.file)}#page=${n}" target="_blank" rel="noopener">Page ${n}</a>
                <p>${snippet(text, ts)}</p>
              </li>`).join("")}
          </ul>
          ${pages.length > PAGES_SHOWN ? `<button class="hit-more" type="button" data-more="${i}">Show ${pages.length - PAGES_SHOWN} more page${pages.length - PAGES_SHOWN === 1 ? "" : "s"}</button>` : ""}
        ` : ""}
      </article>`).join("")}`;
}

$("#q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(e.target.value), 150);
});
$("#q").addEventListener("focus", getIndex, { once: true });
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.target.value = ""; runSearch(""); }
});
$("#q-clear").addEventListener("click", () => {
  $("#q").value = "";
  runSearch("");
  $("#q").focus();
});
$("#results").addEventListener("click", (e) => {
  const b = e.target.closest("[data-more]");
  if (!b) return;
  document.querySelectorAll(`[data-extra="${b.dataset.more}"]`).forEach((li) => (li.hidden = false));
  b.remove();
});
