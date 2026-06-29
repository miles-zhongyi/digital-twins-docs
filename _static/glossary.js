(function () {
  "use strict";

  let tooltipEl = null;
  let activeTerm = null;
  let eventsBound = false;

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

  function definitionForElement(element) {
    return {
      term: element.getAttribute("data-glossary-term") || element.textContent.trim(),
      definition: element.getAttribute("data-glossary-definition") || "",
    };
  }

  function showTooltip(target) {
    const info = definitionForElement(target);
    if (!info.definition) {
      return;
    }

    const tooltip = ensureTooltip();
    tooltip.innerHTML =
      '<span class="glossary-tooltip-title"></span><span class="glossary-tooltip-definition"></span>';
    tooltip.querySelector(".glossary-tooltip-title").textContent = info.term;
    tooltip.querySelector(".glossary-tooltip-definition").textContent = info.definition;

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

  function bindTooltipEvents() {
    if (eventsBound) {
      return;
    }
    eventsBound = true;

    document.addEventListener("mouseover", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        return;
      }
      showTooltip(target);
    });

    document.addEventListener("mouseout", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target) {
        return;
      }
      const related = event.relatedTarget;
      if (related && target.contains(related)) {
        return;
      }
      hideTooltip();
    });

    document.addEventListener("focusin", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        return;
      }
      showTooltip(target);
    });

    document.addEventListener("focusout", (event) => {
      if (event.target.closest(".glossary-term")) {
        hideTooltip();
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target.closest(".glossary-term");
      if (!target || target.closest(".glossary-index")) {
        hideTooltip();
        return;
      }
      event.preventDefault();
      if (activeTerm === target && tooltipEl && !tooltipEl.hidden) {
        hideTooltip();
      } else {
        showTooltip(target);
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

  function isPasswordGateOnly() {
    return Boolean(document.getElementById("staticrypt-form")) && !document.querySelector("article.bd-article");
  }

  function initGlossaryTooltips() {
    if (isPasswordGateOnly()) {
      return;
    }
    if (!document.querySelector(".glossary-term")) {
      return;
    }
    bindTooltipEvents();
  }

  window.__initGlossaryTooltips = initGlossaryTooltips;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlossaryTooltips);
  } else {
    initGlossaryTooltips();
  }
})();
