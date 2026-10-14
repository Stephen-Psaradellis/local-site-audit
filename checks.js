// Runs inside the audited page (injected on click via activeTab; never on its own).
// Returns a plain object: {url, host, title, checkedAt, defects:[{code, severity, what, why, evidence, fix}]}.
// Mirrors the outbound scanner's most common defects across 43,000 small-business sites.
(async () => {
  const defects = [];
  const add = (code, severity, what, why, evidence, fix) =>
    defects.push({ code, severity, what, why, evidence: evidence || [], fix: fix || "" });
  const doc = document;
  const loc = window.location;
  const year = new Date().getFullYear();
  const short = (s, n = 90) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

  // 1. Not HTTPS
  if (loc.protocol === "http:") {
    add("no_https", 4, "The site loads without HTTPS",
      "Browsers label it 'Not secure' next to the address, and search engines rank it lower.",
      [loc.href], "Install a free certificate (most hosts offer one-click Let's Encrypt) and redirect http to https.");
  }

  // 2. Mixed content on an https page
  if (loc.protocol === "https:") {
    const insecure = [...doc.querySelectorAll("img[src],script[src],link[rel=stylesheet][href],iframe[src],source[src]")]
      .map(el => el.getAttribute("src") || el.getAttribute("href"))
      .filter(u => u && /^http:\/\//i.test(u));
    if (insecure.length) {
      add("mixed_content", 3, `${insecure.length} file(s) load over plain http on a secure page`,
        "Browsers block them silently, so fonts, styling or widgets go missing for visitors.",
        insecure.slice(0, 5).map(u => short(u)), "Change those URLs to https:// (or protocol-relative) in the theme or page builder.");
    }
  }

  // 3. Mobile viewport
  if (!doc.querySelector('meta[name="viewport"]')) {
    add("no_viewport", 3, "No mobile viewport tag",
      "On phones the page renders as a shrunken desktop site that visitors have to pinch and zoom.",
      [], '<meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  // 4. Phone numbers that cannot be tapped
  const telLinks = [...doc.querySelectorAll('a[href^="tel:"]')];
  const telDigits = new Set(telLinks.map(a => a.getAttribute("href").replace(/\D/g, "").slice(-10)));
  const phoneRe = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g;
  const untappable = new Set();
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || node.nodeValue.length > 2000) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('a[href^="tel:"],script,style,noscript')) continue;
    for (const m of node.nodeValue.matchAll(phoneRe)) {
      const d = m[1] + m[2] + m[3];
      if (!telDigits.has(d)) untappable.add(m[0].trim());
    }
  }
  if (untappable.size) {
    add("phone_not_tappable", 3, `Phone number shown as plain text (${[...untappable].slice(0, 2).join(", ")})`,
      "Phone visitors cannot tap it to call; many give up rather than copy the number.",
      [...untappable].slice(0, 5), 'Wrap it in a link: <a href="tel:+1XXXXXXXXXX">(XXX) XXX-XXXX</a>');
  }

  // 5. Images without alt text
  const imgs = [...doc.querySelectorAll("img")].filter(i => i.offsetWidth > 24 && i.offsetHeight > 24);
  const noAlt = imgs.filter(i => !i.hasAttribute("alt") || !i.getAttribute("alt").trim());
  if (noAlt.length) {
    add("no_alt", 1, `${noAlt.length} of ${imgs.length} visible images have no alt text`,
      "Screen readers skip them and Google cannot tell what they show (image search, accessibility complaints).",
      noAlt.slice(0, 5).map(i => short(i.currentSrc || i.src)), "Add a short description to each image's alt attribute.");
  }

  // 6. Oversized images
  const big = [];
  for (const e of performance.getEntriesByType("resource")) {
    const size = e.encodedBodySize || e.transferSize || 0;
    if (e.initiatorType === "img" && size > 400 * 1024) big.push(`${short(e.name, 70)} (${Math.round(size / 1024)} KB)`);
  }
  for (const i of imgs) {
    if (i.naturalWidth > 2.5 * i.clientWidth && i.naturalWidth > 1600 && big.length < 8)
      big.push(`${short(i.currentSrc || i.src, 70)} (${i.naturalWidth}px shown at ${i.clientWidth}px)`);
  }
  if (big.length) {
    add("huge_images", 2, `${big.length} oversized image(s)`,
      "They slow the page on phones; visitors on mobile data leave before it loads.",
      [...new Set(big)].slice(0, 5), "Resize to the displayed width and compress (WebP), or enable the host's image optimisation.");
  }

  // 7. Meta description and title
  const md = doc.querySelector('meta[name="description"]');
  if (!md || !(md.getAttribute("content") || "").trim()) {
    add("no_meta_description", 1, "No meta description",
      "Google writes its own snippet under the result, usually a worse pitch than the owner would write.",
      [], '<meta name="description" content="One sentence on what you do and where.">');
  }
  if (!doc.title.trim()) {
    add("no_title", 2, "The page has no title", "Search results and browser tabs show the bare address instead of the business name.", [], "<title>Business name - service - city</title>");
  }

  // 8. WordPress version exposed
  const gen = doc.querySelector('meta[name="generator"]');
  const genTxt = gen ? gen.getAttribute("content") || "" : "";
  const wp = genTxt.match(/WordPress\s+([\d.]+)/i);
  if (wp) {
    add("wp_version_exposed", 2, `The exact WordPress version (${wp[1]}) is published in the page source`,
      "Attackers search for sites by version; an old one is an easy target.",
      [`<meta name="generator" content="${short(genTxt, 60)}">`], "Hide the generator tag and keep WordPress core updated.");
  }

  // 9. Stale copyright year
  const foot = (doc.querySelector("footer") || doc.body || doc.documentElement).innerText || "";
  const yrs = [...foot.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map(m => +m[1]);
  if (yrs.length && Math.max(...yrs) < year - 1) {
    add("stale_year", 1, `The footer still says © ${Math.max(...yrs)}`,
      "Visitors read an old year as 'closed or not maintained'.", [`© ${Math.max(...yrs)}`],
      "Make the year automatic (e.g. a [year] shortcode or a one-line script).");
  }

  // 10. Broken same-origin links (HEAD, at most 25, same origin only - no extra permissions)
  const links = [...new Set([...doc.querySelectorAll("a[href]")]
    .map(a => a.href.split("#")[0])
    .filter(h => { try { const u = new URL(h); return u.origin === loc.origin && h !== loc.href.split("#")[0]; } catch { return false; } }))].slice(0, 25);
  const broken = [];
  await Promise.all(links.map(async h => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      let r = await fetch(h, { method: "HEAD", redirect: "follow", signal: ctl.signal });
      if (r.status === 405) r = await fetch(h, { method: "GET", redirect: "follow", signal: ctl.signal });
      clearTimeout(t);
      if (r.status >= 400) broken.push(`${short(h, 70)} (${r.status})`);
    } catch { /* network/timeout: not proof of a broken link */ }
  }));
  if (broken.length) {
    add("broken_links", 2, `${broken.length} link(s) on this page lead to an error page`,
      "Visitors who click hit a dead end; Google counts it against the site.", broken.slice(0, 5), "Fix or remove each link.");
  }

  defects.sort((a, b) => b.severity - a.severity);
  return {
    url: loc.href, host: loc.hostname.replace(/^www\./, ""), title: doc.title.trim(),
    checkedAt: new Date().toISOString(), defects,
  };
})();
