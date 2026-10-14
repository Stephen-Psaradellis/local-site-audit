chrome.storage.local.get(["last", "me", "license"]).then(({ last, me, license }) => {
  if (!last) { document.getElementById("note").textContent = "Run an audit first."; return; }
  const html = LSA.reportHtml(last, me || {}, LSA.validLicense(license));
  const frame = document.getElementById("doc");
  frame.srcdoc = html;
  document.title = `Website check: ${last.host}`;
  document.getElementById("print").onclick = () => frame.contentWindow.print();
  document.getElementById("dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = `website-check-${last.host}.html`;
    a.click();
  };
});
