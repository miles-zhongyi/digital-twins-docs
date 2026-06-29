(function () {
  "use strict";

  const SKIP_ANCESTOR_SELECTORS =
    "script, style, pre, code, kbd, samp, a, .glossary-term, .glossary-tooltip, .math, mjx-container, .headerlink";
  const CONTENT_SELECTORS = "article.bd-article, .bd-content main, .article .content, main.bd-main #main-content";

  let terms = [];
  let patterns = [];
  let tooltipEl = null;
  let activeTerm = null;

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function shouldSkipNode(node) {
    let parent = node.parentElement;
    while (parent) {
      if (parent.matches(SKIP_ANCESTOR_SELECTORS)) {
        return true;
      }
      if (parent.classList && parent.classList.contains("glossary-index")) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  function buildPatterns(glossaryTerms) {
    const built = [];
    glossaryTerms.forEach((entry) => {
      entry.aliases.forEach((alias) => {
        const trimmed = alias.trim();
        if (!trimmed) {
          return;
        }
        built.push({
          alias: trimmed,
          regex: new RegExp(escapeRegex(trimmed), "gi"),
          id: entry.id,
          term: entry.term,
          definition: entry.definition,
        });
      });
    });
    built.sort((a, b) => b.alias.length - a.alias.length);
    return built;
  }

  function findNextMatch(text, startIndex) {
    let best = null;
    patterns.forEach((pattern) => {
      pattern.regex.lastIndex = startIndex;
      const match = pattern.regex.exec(text);
      if (!match) {
        return;
      }
      if (!best || match.index < best.index) {
        best = {
          index: match.index,
          length: match[0].length,
          text: match[0],
          pattern,
        };
      } else if (best && match.index === best.index && match[0].length > best.length) {
        best = {
          index: match.index,
          length: match[0].length,
          text: match[0],
          pattern,
        };
      }
    });
    return best;
  }

  function wrapTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) {
      return;
    }

    const fragments = [];
    let cursor = 0;

    while (cursor < text.length) {
      const match = findNextMatch(text, cursor);
      if (!match) {
        fragments.push(document.createTextNode(text.slice(cursor)));
        break;
      }

      if (match.index > cursor) {
        fragments.push(document.createTextNode(text.slice(cursor, match.index)));
      }

      const span = document.createElement("span");
      span.className = "glossary-term";
      span.setAttribute("data-glossary-id", match.pattern.id);
      span.setAttribute("tabindex", "0");
      span.setAttribute("role", "button");
      span.setAttribute("aria-label", `${match.pattern.term}: ${match.pattern.definition}`);
      span.textContent = match.text;
      fragments.push(span);

      cursor = match.index + match.length;
    }

    if (fragments.length <= 1 && fragments[0] && fragments[0].nodeType === Node.TEXT_NODE) {
      return;
    }

    const parent = textNode.parentNode;
    fragments.forEach((fragment) => parent.insertBefore(fragment, textNode));
    parent.removeChild(textNode);
  }

  function ensureTooltip() {
    if (tooltipEl) {
      return tooltipEl;
    }
    tooltipEl = document.createElement("div");
    tooltipEl.className = "glossary-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.hidden = true;
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function hideTooltip() {
    if (!tooltipEl) {
      return;
    }
    tooltipEl.hidden = true;
    if (activeTerm) {
      activeTerm.classList.remove("glossary-term-active");
      activeTerm = null;
    }
  }

  function showTooltip(target, pattern) {
    const tooltip = ensureTooltip();
    tooltip.innerHTML = `<span class="glossary-tooltip-title"></span><span class="glossary-tooltip-definition"></span>`;
    tooltip.querySelector(".glossary-tooltip-title").textContent = pattern.term;
    tooltip.querySelector(".glossary-tooltip-definition").textContent = pattern.definition;

    const rect = target.getBoundingClientRect();
    const margin = 10;
    let top = rect.bottom + margin;
    let left = rect.left;

    tooltip.hidden = false;
    const tooltipRect = tooltip.getBoundingClientRect();

    if (left + tooltipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - tooltipRect.width - margin;
    }
    if (left < margin) {
      left = margin;
    }
    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = rect.top - tooltipRect.height - margin;
    }

    tooltip.style.top = `${Math.max(margin, top)}px`;
    tooltip.style.left = `${Math.max(margin, left)}px`;

    if (activeTerm && activeTerm !== target) {
      activeTerm.classList.remove("glossary-term-active");
    }
    activeTerm = target;
    target.classList.add("glossary-term-active");
  }

  function patternForElement(element) {
    const id = element.getAttribute("data-glossary-id");
    const entry = terms.find((term) => term.id === id);
    if (!entry) {
      return null;
    }
    return {
      id: entry.id,
      term: entry.term,
      definition: entry.definition,
    };
  }

  function bindTooltipEvents(root) {
    root.addEventListener("mouseover", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        return;
      }
      const pattern = patternForElement(target);
      if (pattern) {
        showTooltip(target, pattern);
      }
    });

    root.addEventListener("mouseout", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target) {
        return;
      }
      const related = event.relatedTarget;
      if (related && (target.contains(related) || related.closest(".glossary-tooltip"))) {
        return;
      }
      hideTooltip();
    });

    root.addEventListener("focusin", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        return;
      }
      const pattern = patternForElement(target);
      if (pattern) {
        showTooltip(target, pattern);
      }
    });

    root.addEventListener("focusout", (event) => {
      const target = event.target.closest(".glossary-term");
      if (target) {
        hideTooltip();
      }
    });

    root.addEventListener("click", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        hideTooltip();
        return;
      }
      const pattern = patternForElement(target);
      if (!pattern) {
        return;
      }
      event.preventDefault();
      if (activeTerm === target && tooltipEl && !tooltipEl.hidden) {
        hideTooltip();
      } else {
        showTooltip(target, pattern);
      }
    });

    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    });
  }

  function highlightContent(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkipNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    textNodes.forEach(wrapTextNode);
  }

  function resolveTermsUrl() {
    const script = document.currentScript;
    if (script && script.src) {
      return new URL("glossary-terms.json", script.src).toString();
    }
    return "_static/glossary-terms.json";
  }

  async function init() {
    if (document.body.classList.contains("staticrypt-body")) {
      return;
    }

    const contentRoot =
      document.querySelector(CONTENT_SELECTORS) || document.querySelector("main") || document.body;

    try {
      const response = await fetch(resolveTermsUrl());
      if (!response.ok) {
        return;
      }
      terms = await response.json();
      patterns = buildPatterns(terms);
      highlightContent(contentRoot);
      bindTooltipEvents(document);
    } catch (error) {
      console.warn("Glossary highlighting unavailable:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
