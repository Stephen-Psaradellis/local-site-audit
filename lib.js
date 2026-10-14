// Pure helpers shared by popup.js and report.js; also loaded by tests/test_site_audit_ext.py via node.
(function (root) {
  const FREE_PER_DAY = 3;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // License keys: LSA-AAAA-BBBB-CCCC where CCCC is a checksum of AAAABBBB.
  // An offline check that stops guessing, not a DRM scheme; keys come from products/site-audit-ext/keys.py.
  function checksum(body) {
    let h = 2166136261;
    for (const ch of body + "lsa-v1") { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i++) { out += A[h % 32]; h = Math.floor(h / 32); }
    return out;
  }
  function validLicense(key) {
    const m = String(key || "").trim().toUpperCase().match(/^LSA-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
    return !!m && checksum(m[1] + m[2]) === m[3];
  }

  function quotaLeft(usage, today, pro) {
    if (pro) return Infinity;
    if (!usage || usage.day !== today) return FREE_PER_DAY;
    return Math.max(0, FREE_PER_DAY - (usage.count || 0));
  }

  function bizName(audit) {
    const t = (audit.title || "").split(/\s[|\-–—:]\s/)[0].trim();
    return t && t.length <= 60 ? t : audit.host;
  }

  // The pitch: specific, evidence-led, one free fix, a fixed price, no hype.
  function pitchEmail(audit, me, price) {
    const d = audit.defects || [];
    const name = bizName(audit);
    const top = d.slice(0, 3);
    const free = d.find(x => x.fix) || null;
    const lines = [];
    lines.push(`Subject: ${d.length ? `${d.length} thing${d.length > 1 ? "s" : ""} I noticed on the ${name} website` : `the ${name} website`}`);
    lines.push("");
    lines.push("Hi,");
    lines.push("");
    if (!d.length) {
      lines.push(`I looked over ${audit.host} and it is in good shape - nothing urgent to fix.`);
    } else {
      lines.push(`I looked over ${audit.host} today and found ${d.length === 1 ? "one thing" : "a few things"} that ${d.length === 1 ? "is" : "are"} likely costing you customers:`);
      lines.push("");
      top.forEach((x, i) => lines.push(`${i + 1}. ${x.what} - ${x.why}`));
      if (d.length > 3) lines.push(`(plus ${d.length - 3} smaller item${d.length - 3 > 1 ? "s" : ""} in the attached report)`);
      if (free) {
        lines.push("");
        lines.push(`Here is the fix for #${top.indexOf(free) + 1 || 1}, free, whether or not we work together: ${free.fix}`);
      }
      lines.push("");
      lines.push(`If you'd like me to take care of all of it, it's a fixed ${price || "$150"}, done within 2 business days, and you only pay once you've checked it.`);
    }
    lines.push("");
    lines.push(me.name || "");
    if (me.biz) lines.push(me.biz);
    if (me.contact) lines.push(me.contact);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  const SEV_LABEL = { 5: "Critical", 4: "High", 3: "High", 2: "Medium", 1: "Low" };

  function reportHtml(audit, me, pro) {
    const d = audit.defects || [];
    const rows = d.map((x, i) => `
      <section class="item s${x.severity}">
        <h3>${i + 1}. ${esc(x.what)} <span class="tag">${SEV_LABEL[x.severity] || ""}</span></h3>
        <p><b>Why it matters:</b> ${esc(x.why)}</p>
        ${x.evidence && x.evidence.length ? `<p><b>Evidence:</b></p><ul>${x.evidence.map(e => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
        ${x.fix ? `<p><b>Fix:</b> <code>${esc(x.fix)}</code></p>` : ""}
      </section>`).join("");
    const by = [me.name, me.biz].filter(Boolean).map(esc).join(", ");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Website check: ${esc(audit.host)}</title>
<style>body{font:15px/1.5 Georgia,serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1b1f23;background:#fff}
h1{font:600 26px system-ui,sans-serif;margin:0 0 4px}h3{font:600 16px system-ui,sans-serif;margin:0 0 6px}
.meta{color:#5b6670;font:13px system-ui,sans-serif}.item{border-left:4px solid #607d8b;padding:8px 14px;margin:16px 0;background:#f7f8f9}
.s5,.s4{border-color:#c62828}.s3{border-color:#ef6c00}.s2{border-color:#a07800}.tag{font:11px system-ui;color:#5b6670;margin-left:6px}
code{font-size:12px;word-break:break-all}footer{margin-top:28px;color:#5b6670;font:12px system-ui,sans-serif;border-top:1px solid #ddd;padding-top:10px}
@media print{body{margin:0}}</style></head><body>
<h1>Website check: ${esc(bizName(audit))}</h1>
<p class="meta">${esc(audit.url)} &middot; checked ${esc(audit.checkedAt.slice(0, 10))}${by ? ` &middot; prepared by ${by}` : ""}</p>
<p>${d.length ? `${d.length} issue${d.length > 1 ? "s" : ""} found, most important first.` : "No issues found on this page."}</p>
${rows}
<footer>${me.contact ? `Questions: ${esc(me.contact)}. ` : ""}${pro ? "" : "Made with Local Site Audit + Pitch (free edition)."}</footer>
</body></html>`;
  }

  // The free SPF/DMARC check (products/email-check); the extension itself checks no DNS.
  const MAIL_CHECK = "https://stephen-psaradellis.github.io/demos/email-forgery-check.html";
  function mailCheckUrl(host) {
    const d = String(host || "").toLowerCase().replace(/^www\./, "");
    return d ? `${MAIL_CHECK}?d=${encodeURIComponent(d)}` : MAIL_CHECK;
  }

  const api = { FREE_PER_DAY, MAIL_CHECK, mailCheckUrl, checksum, validLicense, quotaLeft, pitchEmail, reportHtml, bizName, esc };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LSA = api;
})(typeof self !== "undefined" ? self : this);
