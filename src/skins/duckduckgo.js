// Lychee Search skin script for DuckDuckGo pages.
// Runs in an isolated world (shares the DOM, invisible to the site's own scripts).
// - renames DuckDuckGo / Duck.ai to Lychee Search / Lychee AI in visible text, labels and the title
// - tells the CSS how tall the header is, so the image sidebar starts right under it
// Results are still DuckDuckGo's; that's credited in Lychee's Settings > About.
(() => {
  if (window.__lycheeSkin) return;
  window.__lycheeSkin = true;

  const RULES = [
    [/ at DuckDuckGo$/, ' - Lychee Search'],
    [/DuckDuckGo/g, 'Lychee Search'],
    [/Duck\.ai/g, 'Lychee AI'],
  ];
  const HIT = /DuckDuckGo|Duck\.ai/;
  const fix = (s) => RULES.reduce((o, [re, to]) => o.replace(re, to), s);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  function fixText(node) {
    if (node.nodeValue && HIT.test(node.nodeValue)) node.nodeValue = fix(node.nodeValue);
  }
  function fixTree(root) {
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) fixText(n);
    const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[aria-label],[title],[alt]')] : [];
    for (const el of els) {
      for (const a of ATTRS) {
        const v = el.getAttribute && el.getAttribute(a);
        if (v && HIT.test(v)) el.setAttribute(a, fix(v));
      }
    }
  }
  function fixTitle() {
    if (HIT.test(document.title)) document.title = fix(document.title);
  }
  // the image sidebar starts right under the header, or at the very top once the header scrolls away
  let last = -1;
  function headerHeight() {
    const h = document.querySelector('#header_wrapper');
    const bottom = h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 0;
    if (bottom !== last) { last = bottom; document.documentElement.style.setProperty('--lychee-header-h', bottom + 'px'); }
  }
  window.addEventListener('scroll', headerHeight, { passive: true });

  fixTree(document.body);
  fixTitle();
  headerHeight();
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') fixText(m.target);
      else if (m.type === 'attributes') fixTree(m.target);
      else for (const n of m.addedNodes) fixTree(n);
    }
    fixTitle();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  window.addEventListener('resize', headerHeight);
  setTimeout(headerHeight, 800);
})();
