const $ = id => document.getElementById(id);
const store = chrome.storage.local;
const today = () => new Date().toISOString().slice(0, 10);
let state = { me: {}, license: "", usage: null, last: null, history: [] };

async function load() {
  state = Object.assign(state, await store.get(["me", "license", "usage", "last", "history"]));
  state.me = state.me || {};
  state.history = state.history || [];
  $("me_name").value = state.me.name || "";
  $("me_biz").value = state.me.biz || "";
  $("me_contact").value = state.me.contact || "";
  $("license").value = state.license || "";
  paintPlan();
}

function pro() { return LSA.validLicense(state.license); }

function paintPlan() {
  const left = LSA.quotaLeft(state.usage, today(), pro());
  $("plan").textContent = pro() ? "Pro" : `Free · ${left} left today`;
  $("getpro").href = LSA.proHref(state.me && state.me.contact);
  $("getpro_how").textContent = LSA.proHow();
  $("getpro").parentElement.hidden = pro();
  paintHistory();
}

function paintHistory() {
  const all = state.history, shown = LSA.visibleHistory(all, pro());
  $("hist_sum").textContent = `Audit history (${all.length})`;
  $("hist_list").replaceChildren(...shown.map(h => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = h.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = h.business;
    const m = document.createElement("div");
    m.className = "muted"; m.textContent = `${h.host} · ${h.issues} issue${h.issues === 1 ? "" : "s"} · ${h.date}${h.top ? ` · ${h.top}` : ""}`;
    li.append(a, m);
    return li;
  }));
  const hidden = all.length - shown.length;
  $("hist_more").hidden = hidden <= 0;
  $("hist_more").textContent = `${hidden} older audit${hidden === 1 ? "" : "s"} saved - Pro shows them all and exports the list.`;
  $("csv").textContent = pro() ? "Export CSV" : `Export CSV (Pro, ${LSA.PRO_PRICE} once)`;
}

function paint(audit) {
  $("result").hidden = false;
  const n = audit.defects.length;
  $("summary").textContent = n ? `${n} issue${n > 1 ? "s" : ""} on ${audit.host}` : `No issues found on ${audit.host}`;
  $("mailcheck").href = LSA.mailCheckUrl(audit.host);
  $("list").replaceChildren(...audit.defects.map(d => {
    const li = document.createElement("li");
    const s = document.createElement("span");
    s.className = `sev s${d.severity}`; s.textContent = d.severity;
    li.append(s, document.createTextNode(d.what));
    return li;
  }));
}

$("run").addEventListener("click", async () => {
  const left = LSA.quotaLeft(state.usage, today(), pro());
  if (left <= 0) { $("status").textContent = `Free limit reached for today. Pro (${LSA.PRO_PRICE} once) is unlimited - get a key under Your details.`; $("me_name").closest("details").open = true; return; }
  $("status").textContent = "Checking…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || "")) { $("status").textContent = "Open a website first."; return; }
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["checks.js"] });
    const audit = res && res.result;
    if (!audit) throw new Error("no result");
    state.last = audit;
    const u = state.usage && state.usage.day === today() ? state.usage : { day: today(), count: 0 };
    u.count += 1; state.usage = u;
    state.history = LSA.addHistory(state.history, LSA.historyEntry(audit));
    await store.set({ last: audit, usage: u, history: state.history });
    $("status").textContent = "";
    paint(audit); paintPlan();
  } catch (e) {
    $("status").textContent = "This page can't be checked (browser pages and web stores block extensions).";
  }
});

$("report").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("report.html") }));

$("pitch").addEventListener("click", async () => {
  if (!state.last) return;
  await navigator.clipboard.writeText(LSA.pitchEmail(state.last, state.me, state.me.price));
  $("status").textContent = "Pitch email copied - paste it into your mail app and attach the report.";
});

$("csv").addEventListener("click", () => {
  if (!pro()) { window.open(LSA.proHref(state.me && state.me.contact)); return; }
  if (!state.history.length) { $("status").textContent = "No audits saved yet."; return; }
  const url = URL.createObjectURL(new Blob([LSA.historyCsv(state.history)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `site-audits-${today()}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  $("status").textContent = `Exported ${state.history.length} audit${state.history.length === 1 ? "" : "s"}.`;
});

$("save").addEventListener("click", async () => {
  state.me = { name: $("me_name").value.trim(), biz: $("me_biz").value.trim(), contact: $("me_contact").value.trim() };
  state.license = $("license").value.trim();
  await store.set({ me: state.me, license: state.license });
  $("status").textContent = state.license && !pro() ? "Saved - but that license key is not valid." : "Saved.";
  paintPlan();
});

load().then(() => { if (state.last) paint(state.last); });
