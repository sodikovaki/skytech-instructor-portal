// SkyTech Academy portal (encrypted).
// Everything the portal shows is encrypted in data/*.bin and vault/*.bin. The passcode unlocks it
// in the browser; nothing readable is stored on the server. Built by tools/build_site.py.

const GROUPS = [
  { id: "instructors", label: "Instructors" },
  { id: "office", label: "SkyTech office" },
];

const NEW_ANNOUNCEMENT_DAYS = 7;
const NEW_FILE_DAYS = 14;
const STORE_KEY = "sta-portal-session";
const PAGES_SHOWN = 4;

const $ = (s) => document.querySelector(s);
const state = { role: null, keys: {}, rawKeys: {}, sections: [], files: [], announcements: [], schedule: [], index: [], vault: {}, current: null };

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
function canSee(section) {
  return section && (section.group !== "office" || state.role === "office");
}
function sectionOf(file) {
  return state.sections.find((s) => s.id === file.section);
}
function isNew(file) {
  return file.added && daysAgo(file.added) <= NEW_FILE_DAYS;
}
function fileType(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return { pdf: "PDF", pptx: "PowerPoint", ppt: "PowerPoint", docx: "Word", doc: "Word", xlsx: "Excel", xls: "Excel", png: "Image", jpg: "Image", jpeg: "Image", svg: "Image" }[ext] || ext.toUpperCase();
}
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

// ---------- encryption ----------
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u8) => btoa(String.fromCharCode(...u8));

// Fetches a file from the site. (The preview replaces this with its built-in copies.)
async function getBytes(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Couldn't load ${path} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
async function decrypt(key, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
}
async function importKey(raw) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

// Turns a passcode into the content keys it unlocks. Returns null if it unlocks nothing.
async function keysForPasscode(passcode) {
  const lock = JSON.parse(new TextDecoder().decode(await getBytes("data/lock.json")));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode.trim()), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(lock.salt), iterations: lock.iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  for (const role of ["office", "instructors"]) {
    try {
      const raw = {};
      for (const [k, wrapped] of Object.entries(lock.roles[role])) raw[k] = toB64(await decrypt(kek, fromB64(wrapped)));
      return { role, raw };
    } catch {
      // wrong passcode for this role; try the next
    }
  }
  return null;
}

async function loadBundle(name) {
  const plain = await decrypt(state.keys[name], await getBytes(`data/${name}.bin`));
  return JSON.parse(new TextDecoder().decode(plain));
}

function saveSession(remember) {
  const val = JSON.stringify({ role: state.role, raw: state.rawKeys });
  try { sessionStorage.setItem(STORE_KEY, val); } catch {}
  try { remember ? localStorage.setItem(STORE_KEY, val) : localStorage.removeItem(STORE_KEY); } catch {}
}
function readSession() {
  for (const st of [() => sessionStorage, () => localStorage]) {
    try {
      const v = st().getItem(STORE_KEY);
      if (v) return JSON.parse(v);
    } catch {}
  }
  return null;
}
function clearSession() {
  try { sessionStorage.removeItem(STORE_KEY); } catch {}
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

// ---------- unlocking ----------
async function applyKeys(role, raw) {
  state.role = role;
  state.rawKeys = raw;
  for (const [k, v] of Object.entries(raw)) state.keys[k] = await importKey(fromB64(v));

  const inst = await loadBundle("instructors");
  const office = state.keys.office ? await loadBundle("office") : { files: [], index: [] };
  const files = [...inst.files, ...office.files];
  state.vault = {};
  for (const f of files) {
    const roleKey = inst.files.includes(f) ? "instructors" : "office";
    if (f.vault) state.vault[f.vault.id] = { ...f.vault, role: roleKey };
    if (f.altVault) state.vault[f.altVault.id] = { ...f.altVault, role: roleKey };
  }
  Object.assign(state, {
    sections: inst.sections, announcements: inst.announcements, schedule: inst.schedule,
    files, index: [...inst.index, ...office.index],
  });
}

function showApp() {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  $("#role-title").textContent = state.role === "office" ? "Office view" : "Instructor portal";
  renderNextClass();
  renderNav();
  route();
}

$("#gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#gate-form button[type=submit]");
  $("#gate-error").hidden = true;
  btn.disabled = true;
  btn.textContent = "Unlocking…";
  try {
    const found = await keysForPasscode($("#passcode").value);
    if (!found) {
      $("#gate-error").hidden = false;
      $("#passcode").select();
      return;
    }
    await applyKeys(found.role, found.raw);
    saveSession($("#remember").checked);
    $("#passcode").value = "";
    showApp();
  } catch (err) {
    $("#gate-error").textContent = `The portal couldn't load (${err.message}). Check your connection and try again.`;
    $("#gate-error").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Open portal";
  }
});

$("#lock").addEventListener("click", () => {
  clearSession();
  location.hash = "";
  location.reload();
});

(async () => {
  const saved = readSession();
  if (!saved) return;
  try {
    await applyKeys(saved.role, saved.raw);
    showApp();
  } catch {
    clearSession(); // keys from an older version of the portal; sign in again
  }
})();

// ---------- opening encrypted files ----------
// Encrypted files normally sit directly in vault/. Some were uploaded into subfolders,
// so look there too before giving up.
const VAULT_DIRS = ["vault", "vault/SkyTech_Vault_Fix_1of3", "vault/SkyTech_Vault_Fix_2of3", "vault/SkyTech_Vault_Fix_3of3"];
async function getVaultBytes(id) {
  let lastErr = null;
  for (const dir of VAULT_DIRS) {
    try {
      return await getBytes(`${dir}/${id}.bin`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
function fileLink(f, label, opts = {}) {
  const v = opts.alt ? f.altVault : f.vault;
  const href = opts.alt ? f.alt : f.file;
  if (v) {
    return `<a href="#" data-vault="${esc(v.id)}"${opts.page ? ` data-page="${opts.page}"` : ""}${opts.alt ? " data-download" : ""}${opts.cls ? ` class="${opts.cls}"` : ""}>${label}</a>`;
  }
  if (href && /^https?:/.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener"${opts.cls ? ` class="${opts.cls}"` : ""}>${label}</a>`;
  return `<span class="form-name">${label}</span>`;
}

document.addEventListener("click", async (e) => {
  const a = e.target.closest("a[data-vault]");
  if (!a) return;
  e.preventDefault();
  const meta = state.vault[a.dataset.vault];
  if (!meta) return;
  const viewable = /^(application\/pdf|image\/)/.test(meta.mime) && !a.hasAttribute("data-download");
  // Open the tab right away, while the browser still counts this as a click.
  const win = viewable ? window.open("", "_blank") : null;
  if (win) win.document.write(`<title>${esc(meta.name)}</title><p style="font:16px system-ui;padding:24px;color:#5B6779">Opening ${esc(meta.name)}…</p>`);
  a.classList.add("opening");
  try {
    const plain = await decrypt(state.keys[meta.role], await getVaultBytes(meta.id));
    const url = URL.createObjectURL(new Blob([plain], { type: meta.mime }));
    if (win) {
      win.location.href = url + (a.dataset.page ? `#page=${a.dataset.page}` : "");
    } else {
      const dl = document.createElement("a");
      dl.href = url;
      dl.download = meta.name;
      document.body.append(dl);
      dl.click();
      dl.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
  } catch (err) {
    if (win) win.close();
    toast(`Couldn't open ${meta.name}. Check your connection and try again.`);
  } finally {
    a.classList.remove("opening");
  }
});

// ---------- menu ----------
function sectionCount(s) {
  if (s.kind === "announcements") return state.announcements.length;
  if (s.kind === "schedule") return state.schedule.filter((c) => parseDate(c.end) >= today()).length;
  return state.files.filter((f) => f.section === s.id).length;
}
function sectionHasNew(s) {
  if (s.kind === "announcements") return state.announcements.some((a) => daysAgo(a.date) <= NEW_ANNOUNCEMENT_DAYS);
  if (s.kind === "files") return state.files.some((f) => f.section === s.id && isNew(f));
  return false;
}

function renderNav() {
  $("#nav-groups").innerHTML = GROUPS.map((g) => {
    const secs = state.sections.filter((s) => s.group === g.id);
    if (!secs.length) return "";
    const locked = g.id === "office" && state.role !== "office";
    return `
      <div class="nav-group${locked ? " locked" : ""}">
        <h2 class="nav-group-h">${esc(g.label)}</h2>
        ${locked ? `<p class="nav-locked">Office passcode needed. <button type="button" class="linklike" data-office-unlock>Unlock</button></p>` : ""}
        <ul>
          ${secs.map((s) => `
            <li>
              ${locked
                ? `<span class="nav-item disabled">${esc(s.label)}</span>`
                : `<a class="nav-item" href="#${esc(s.id)}" data-id="${esc(s.id)}">
                     <span>${esc(s.label)}</span>
                     <span class="nav-meta">${sectionHasNew(s) ? `<span class="dot" title="New items"></span>` : ""}<span class="count">${sectionCount(s)}</span></span>
                   </a>`}
            </li>`).join("")}
        </ul>
      </div>`;
  }).join("");
  markCurrent();
}
function markCurrent() {
  document.querySelectorAll(".nav-item[data-id]").forEach((a) => {
    a.toggleAttribute("aria-current", a.dataset.id === state.current);
  });
}

function openMenu(open) {
  document.body.classList.toggle("menu-open", open);
  $("#scrim").hidden = !open;
  $("#menu-open").setAttribute("aria-expanded", String(open));
}
$("#menu-open").addEventListener("click", () => openMenu(true));
$("#menu-close").addEventListener("click", () => openMenu(false));
$("#scrim").addEventListener("click", () => openMenu(false));
$("#nav").addEventListener("click", (e) => {
  const a = e.target.closest("a.nav-item");
  if (a) {
    openMenu(false);
    // clicking the section you're already on (e.g. while searching) still shows it
    if (a.dataset.id === decodeURIComponent(location.hash.slice(1))) { e.preventDefault(); route(); }
  }
  if (e.target.closest("[data-office-unlock]")) { openMenu(false); showOfficeUnlock(); }
});

// ---------- routing ----------
function route() {
  if (!state.sections.length) return;
  const id = decodeURIComponent(location.hash.slice(1));
  let s = state.sections.find((x) => x.id === id);
  if (s && !canSee(s)) { showOfficeUnlock(); return; }
  if (!s) s = state.sections.find((x) => canSee(x));
  state.current = s.id;
  if ($("#q").value.trim()) { $("#q").value = ""; $("#q-clear").hidden = true; }
  markCurrent();
  renderSection(s);
}
window.addEventListener("hashchange", route);

function header(s, extra = "") {
  const g = GROUPS.find((x) => x.id === s.group);
  return `
    <header class="view-head">
      <p class="crumb">${esc(g ? g.label : "")}</p>
      <h2>${esc(s.label)}</h2>
      ${s.blurb ? `<p class="blurb">${esc(s.blurb)}</p>` : ""}
      ${extra}
    </header>`;
}

function renderSection(s) {
  if (s.kind === "announcements") return renderAnnouncements(s);
  if (s.kind === "schedule") return renderSchedule(s);
  return renderFiles(s);
}

// ---------- office unlock (for someone signed in with the instructor passcode) ----------
function showOfficeUnlock() {
  state.current = null;
  markCurrent();
  $("#view").innerHTML = `
    <header class="view-head"><p class="crumb">SkyTech office</p><h2>Office files</h2>
      <p class="blurb">These sections are for the SkyTech office. Enter the office passcode to open them.</p></header>
    <form id="office-form" class="inline-gate" autocomplete="off">
      <label for="office-pass">Office passcode</label>
      <div class="finder-row">
        <input id="office-pass" type="password" required>
        <button type="submit" class="primary">Unlock</button>
      </div>
      <p id="office-error" class="gate-error" role="alert" hidden>That isn't the office passcode.</p>
    </form>`;
  $("#office-pass").focus();
  $("#office-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#office-form button");
    btn.disabled = true;
    btn.textContent = "Unlocking…";
    try {
      const found = await keysForPasscode($("#office-pass").value);
      if (!found || found.role !== "office") {
        $("#office-error").hidden = false;
        return;
      }
      const remembered = (() => { try { return !!localStorage.getItem(STORE_KEY); } catch { return false; } })();
      await applyKeys("office", found.raw);
      saveSession(remembered);
      $("#role-title").textContent = "Office view";
      renderNav();
      const wanted = state.sections.find((x) => x.id === decodeURIComponent(location.hash.slice(1)) && x.group === "office");
      const target = wanted || state.sections.find((x) => x.group === "office");
      if (target && location.hash !== `#${target.id}`) location.hash = target.id;
      else route();
    } catch (err) {
      $("#office-error").textContent = `Couldn't unlock (${err.message}).`;
      $("#office-error").hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  });

}

// ---------- announcements ----------
function renderAnnouncements(s) {
  const items = [...state.announcements].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const list = items.length
    ? items.map((a) => {
      const safety = a.priority === "safety";
      const fresh = daysAgo(a.date) <= NEW_ANNOUNCEMENT_DAYS;
      const body = String(a.body || "").split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("");
      return `
        <li class="note${safety ? " safety" : ""}">
          <article class="note-body">
            <div class="note-meta">
              <time datetime="${esc(a.date)}">${fmt(a.date)}</time>
              ${a.from ? `<span>${esc(a.from)}</span>` : ""}
              ${a.pinned ? `<span>Pinned</span>` : ""}
              ${fresh ? `<span class="tag tag-new">New</span>` : ""}
              ${safety ? `<span class="tag tag-safety">Safety critical</span>` : ""}
            </div>
            <h3>${esc(a.title)}</h3>
            ${body}
          </article>
        </li>`;
    }).join("")
    : `<li class="empty">No announcements yet. New posts from the office will show here.</li>`;
  $("#view").innerHTML = `${header(s)}<ol class="rope">${list}</ol>`;
}

// ---------- schedule ----------
function renderNextClass() {
  const t = today();
  const next = [...state.schedule].sort((a, b) => a.start.localeCompare(b.start)).find((c) => parseDate(c.end) >= t);
  $("#nextclass").innerHTML = next
    ? `<span class="nc-label">${parseDate(next.start) <= t ? "Class in session" : "Next class"}</span>
       <span class="nc-dates">${fmtRange(next.start, next.end)}</span>
       <span class="nc-detail">${esc(next.course)}${next.hours ? `, ${esc(next.hours)}` : ""}${next.instructors ? `. Instructors: ${esc(next.instructors)}` : ""}</span>`
    : `<span class="nc-label">Next class</span><span class="nc-detail">No upcoming classes on the schedule.</span>`;
}

function renderSchedule(s) {
  const t = today();
  const sorted = [...state.schedule].sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = sorted.filter((c) => parseDate(c.end) >= t);
  const past = sorted.filter((c) => parseDate(c.end) < t);
  const row = (c) => `
    <tr${parseDate(c.end) < t ? ' class="past"' : ""}>
      <td class="when">${fmtRange(c.start, c.end)}<span class="yr">, ${parseDate(c.start).getFullYear()}</span></td>
      <td>${esc(c.course)}${c.note ? `<span class="sub">${esc(c.note)}</span>` : ""}</td>
      <td>${esc(c.hours || "")}</td>
      <td>${esc(c.instructors || "Not assigned")}</td>
    </tr>`;
  $("#view").innerHTML = `
    ${header(s)}
    ${upcoming.length ? `
      <div class="table-wrap">
        <table class="sched-table">
          <thead><tr><th>Dates</th><th>Course</th><th>Hours</th><th>Instructors</th></tr></thead>
          <tbody>${upcoming.map(row).join("")}</tbody>
        </table>
      </div>` : `<p class="empty">No upcoming classes on the schedule.</p>`}
    ${past.length ? `<details class="past-classes"><summary>${past.length} past class${past.length === 1 ? "" : "es"}</summary>
      <div class="table-wrap"><table class="sched-table"><tbody>${past.reverse().map(row).join("")}</tbody></table></div></details>` : ""}`;
}

// ---------- file sections ----------
function fileItem(f, showSection = false) {
  const name = fileLink(f, esc(f.title));
  const sec = showSection ? sectionOf(f) : null;
  return `
    <li class="form-item">
      ${name} ${isNew(f) ? `<span class="tag tag-new">New</span>` : ""}
      <div class="form-sub">
        ${sec ? `<span>${esc(sec.label)}</span>` : ""}
        ${f.id ? `<span class="form-id">${esc(f.id)}</span>` : ""}
        ${f.rev ? `<span>Rev ${esc(f.rev)}</span>` : ""}
        ${f.file ? `<span>${esc(fileType(f.file))}</span><span>Added ${fmt(f.added, { month: "short", day: "numeric" })}</span>` : "<span>Paper copy at the office</span>"}
        ${f.alt ? fileLink(f, `Download ${esc(f.altLabel || fileType(f.alt))}`, { alt: true }) : ""}
      </div>
      ${f.note ? `<div class="form-sub">${esc(f.note)}</div>` : ""}
    </li>`;
}

function renderFiles(s) {
  const files = state.files.filter((f) => f.section === s.id).sort((a, b) => (b.added || "").localeCompare(a.added || "") || (a.id || "").localeCompare(b.id || ""));
  if (!files.length) {
    $("#view").innerHTML = `${header(s)}
      <div class="empty-box">
        <p><strong>Nothing here yet.</strong></p>
        ${state.role === "office" ? `<p>To add a file: upload it to the <code>${s.group === "office" ? "office" : "forms"}/</code> folder on GitHub, then add an entry to <code>data/forms.json</code> with <code>"section": "${esc(s.id)}"</code>. The README has a copy-paste example.</p>` : `<p>New files from the office will show up here.</p>`}
      </div>`;
    return;
  }
  const groups = {};
  files.forEach((f) => (groups[f.category || ""] ||= []).push(f));
  $("#view").innerHTML = `${header(s)}
    ${Object.entries(groups).map(([cat, fs]) => `
      <div class="form-group">
        ${cat ? `<h3>${esc(cat)}</h3>` : ""}
        <ul class="form-list">${fs.map((f) => fileItem(f)).join("")}</ul>
      </div>`).join("")}`;
}

// ---------- full-text search ----------
// data/search-index.json holds the text of each PDF page; GitHub rebuilds it automatically
// whenever a PDF is uploaded (see .github/workflows/search-index.yml).
let searchTimer = null;

async function getIndex() {
  return state.index;
}

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2013\u2014]/g, "-");
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
  $("#q-clear").hidden = !q;
  if (!ts.length) { route(); return; }

  state.current = null;
  markCurrent();
  const idx = await getIndex();
  const visible = state.files.filter((f) => canSee(sectionOf(f)));
  const byFile = Object.fromEntries(idx.map((d) => [d.file, d]));
  const docs = [];
  let pageHits = 0;

  for (const f of visible) {
    const d = f.file ? byFile[f.file] : null;
    const sec = sectionOf(f);
    const titleText = normalize(`${f.title} ${f.id || ""} ${f.category || ""} ${sec ? sec.label : ""}`);
    const titleHit = ts.every((t) => has(titleText, t));
    const pages = d ? d.pages.filter(([, text]) => ts.every((t) => has(normalize(text), t))) : [];
    if (!titleHit && !pages.length) continue;
    let score = (titleHit ? 1000 : 0) + pages.reduce((s, [, text]) => s + ts.reduce((n, t) => n + count(normalize(text), t), 0), 0);
    if (f.section === "archive") score *= 0.25; // current material ranks above superseded versions
    docs.push({ f, sec, pages, score });
    pageHits += pages.length;
  }
  docs.sort((a, b) => b.score - a.score);

  if (!docs.length) {
    $("#view").innerHTML = `<p class="results-summary">Nothing found for “${esc(q)}”. Try fewer or shorter words, like “anchor” instead of “anchors setup”.</p>`;
    return;
  }

  $("#view").innerHTML = `
    <p class="results-summary">${pageHits} matching page${pageHits === 1 ? "" : "s"} in ${docs.length} file${docs.length === 1 ? "" : "s"}</p>
    ${docs.map(({ f, sec, pages }, i) => `
      <article class="hit-doc">
        <div class="hit-doc-head">
          <h3>${fileLink(f, esc(f.title))}</h3>
          <div class="form-sub">
            ${sec ? `<a href="#${esc(sec.id)}">${esc(sec.label)}</a>` : ""}
            ${f.file ? `<span>${esc(fileType(f.file))}</span>` : "<span>Paper copy at the office</span>"}
            <span>${pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"} match` : "Name matches"}</span>
          </div>
        </div>
        ${pages.length ? `
          <ul class="hit-pages">
            ${pages.map(([n, text], j) => `
              <li class="hit-page"${j >= PAGES_SHOWN ? ` data-extra="${i}" hidden` : ""}>
                ${fileLink(f, `Page ${n}`, { page: n, cls: "pg" })}
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
$("#finder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  const q = $("#q").value;
  if (!terms(q).length) {
    runSearch(q); // empty box: go back to the section
    $("#q").focus();
    return;
  }
  await runSearch(q);
  $("#q").blur(); // closes the phone keyboard so the results are visible
  $("#view").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.target.value = ""; runSearch(""); }
});
$("#q-clear").addEventListener("click", () => {
  $("#q").value = "";
  runSearch("");
  $("#q").focus();
});
$("#view").addEventListener("click", (e) => {
  const b = e.target.closest("[data-more]");
  if (!b) return;
  document.querySelectorAll(`[data-extra="${b.dataset.more}"]`).forEach((li) => (li.hidden = false));
  b.remove();
});
