const $ = id => document.getElementById(id);
const store = chrome.storage.local;
const today = () => new Date().toISOString().slice(0, 10);
let state = { me: {}, license: "", usage: null, last: null };

async function load() {
  state = Object.assign(state, await store.get(["me", "license", "usage", "last"]));
  state.me = state.me || {};
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
  $("getpro").href = LSA.proMailto(state.me && state.me.contact);
  $("getpro").parentElement.hidden = pro();
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
    await store.set({ last: audit, usage: u });
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

$("save").addEventListener("click", async () => {
  state.me = { name: $("me_name").value.trim(), biz: $("me_biz").value.trim(), contact: $("me_contact").value.trim() };
  state.license = $("license").value.trim();
  await store.set({ me: state.me, license: state.license });
  $("status").textContent = state.license && !pro() ? "Saved - but that license key is not valid." : "Saved.";
  paintPlan();
});

load().then(() => { if (state.last) paint(state.last); });
