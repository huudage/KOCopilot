/**
 * KOCopilot — local history store.
 *
 * Why this file exists:
 *   The product needs a "我的人设" / "我的拆解项目" board on the workspace,
 *   plus a way to re-open / re-export an existing item. We keep the storage
 *   100% client-side (localStorage) for v1 — there is no auth and the personas
 *   are not sensitive enough to warrant a server table. If we ever add multi-
 *   device sync, this file becomes the single point that talks to a future
 *   backend; the rest of the app just calls KOCHistory.* and stays unchanged.
 *
 * Public surface (window.KOCHistory):
 *   - savePersonas(personas, inputs)   → returns the saved record (with id)
 *   - saveSkeleton(skeletonResp, transcriptPreview) → returns the saved record
 *   - listPersonas()  / listSkeletons()  → newest first, capped at MAX_ITEMS
 *   - removePersona(id) / removeSkeleton(id)
 *   - renderBoards()   → idempotent; safe to call on every page load
 *   - getKpis()        → { personasTotal, skeletonsTotal, skeletonsThisWeek, hoursSaved }
 *
 * Storage schema (LS keys):
 *   koc.personas.v1 = [{id, createdAt, inputs:{background,interests,resources}, personas:[...]}]
 *   koc.skeletons.v1 = [{id, createdAt, transcriptPreview, hook, body, cta, transferable_template, model_used}]
 *
 * Versioned key suffix (.v1) so we can migrate without nuking user data.
 */
(function () {
  "use strict";

  // ---- constants ----------------------------------------------------------
  // Cap to keep localStorage well under the ~5 MB quota even with long bodies.
  var MAX_ITEMS = 30;
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var HOURS_PER_SKELETON = 2; // rough estimate for the KPI card

  var LS_PERSONAS = "koc.personas.v1";
  var LS_SKELETONS = "koc.skeletons.v1";

  // ---- low-level storage --------------------------------------------------
  function readArray(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      // Corrupt JSON → fail-safe to empty list, never throw on UI hot path.
      return [];
    }
  }

  function writeArray(key, list) {
    try {
      window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_ITEMS)));
    } catch (_e) {
      // Quota exceeded or storage disabled — silently drop the write.
      // (Boards just won't update; no app-breaking error.)
    }
  }

  function newId() {
    // Short non-cryptographic id is fine — we only need uniqueness within
    // the user's own browser, never across users.
    return (
      Date.now().toString(36) + "-" + Math.floor(Math.random() * 0xffffffff).toString(36)
    );
  }

  // ---- save APIs ----------------------------------------------------------
  function savePersonas(personas, inputs) {
    if (!Array.isArray(personas) || personas.length === 0) return null;
    var record = {
      id: newId(),
      createdAt: Date.now(),
      inputs: inputs || {},
      personas: personas,
    };
    var list = [record].concat(readArray(LS_PERSONAS));
    writeArray(LS_PERSONAS, list);
    return record;
  }

  function saveSkeleton(resp, transcriptPreview) {
    if (!resp || !resp.hook) return null;
    var record = {
      id: newId(),
      createdAt: Date.now(),
      transcriptPreview: (transcriptPreview || "").slice(0, 80),
      hook: resp.hook,
      body: resp.body || [],
      cta: resp.cta,
      transferable_template: resp.transferable_template || "",
      model_used: resp.model_used || "",
    };
    var list = [record].concat(readArray(LS_SKELETONS));
    writeArray(LS_SKELETONS, list);
    return record;
  }

  function listPersonas() { return readArray(LS_PERSONAS); }
  function listSkeletons() { return readArray(LS_SKELETONS); }

  function removeBy(key, id) {
    var list = readArray(key).filter(function (item) { return item.id !== id; });
    writeArray(key, list);
  }
  function removePersona(id) { removeBy(LS_PERSONAS, id); }
  function removeSkeleton(id) { removeBy(LS_SKELETONS, id); }

  // ---- KPIs ---------------------------------------------------------------
  function getKpis() {
    var personas = listPersonas();
    var skeletons = listSkeletons();
    var weekAgo = Date.now() - WEEK_MS;
    var skeletonsThisWeek = skeletons.filter(function (s) {
      return s.createdAt >= weekAgo;
    }).length;
    return {
      personasTotal: personas.reduce(function (acc, r) {
        return acc + (Array.isArray(r.personas) ? r.personas.length : 0);
      }, 0),
      skeletonsTotal: skeletons.length,
      skeletonsThisWeek: skeletonsThisWeek,
      hoursSaved: skeletons.length * HOURS_PER_SKELETON,
    };
  }

  // ---- formatting helpers -------------------------------------------------
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return (
      d.getMonth() + 1 + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  // ---- rendering ----------------------------------------------------------
  function renderPersonasBoard(ul) {
    var list = listPersonas();
    if (list.length === 0) return; // keep the static empty-state copy
    ul.innerHTML = list
      .slice(0, 6)
      .map(function (rec) {
        var top = (rec.personas && rec.personas[0]) || {};
        var title = escapeHtml(top.name || "未命名人设");
        var meta = escapeHtml(
          [rec.inputs && rec.inputs.background, rec.inputs && rec.inputs.interests]
            .filter(Boolean)
            .join(" · ")
        );
        var pillTxt = "共 " + (rec.personas ? rec.personas.length : 0) + " 个 · " + fmtTime(rec.createdAt);
        return (
          "<li>" +
            "<b>" + title + "</b>" +
            "<span>" + (meta || "—") + "</span>" +
            '<span class="koc-pill">' + escapeHtml(pillTxt) + "</span>" +
            ' <button type="button" class="koc-history-del" data-kind="persona" data-id="' +
              escapeHtml(rec.id) +
            '" aria-label="删除">×</button>' +
          "</li>"
        );
      })
      .join("");
  }

  function renderSkeletonsBoard(ul) {
    var list = listSkeletons();
    if (list.length === 0) return;
    ul.innerHTML = list
      .slice(0, 6)
      .map(function (rec) {
        var hook = (rec.hook && rec.hook.text) || "—";
        var preview = rec.transcriptPreview || hook;
        var pillTxt = (rec.body ? rec.body.length : 0) + " 段 · " + fmtTime(rec.createdAt);
        return (
          "<li>" +
            "<b>" + escapeHtml(preview.slice(0, 28) + (preview.length > 28 ? "…" : "")) + "</b>" +
            "<span>" + escapeHtml(hook.slice(0, 60)) + "</span>" +
            '<span class="koc-pill">' + escapeHtml(pillTxt) + "</span>" +
            ' <button type="button" class="koc-history-del" data-kind="skeleton" data-id="' +
              escapeHtml(rec.id) +
            '" aria-label="删除">×</button>' +
          "</li>"
        );
      })
      .join("");
  }

  function bindDeleteButtons() {
    document.querySelectorAll(".koc-history-del").forEach(function (btn) {
      if (btn.dataset.kocBound === "1") return;
      btn.dataset.kocBound = "1";
      btn.addEventListener("click", function () {
        var kind = btn.dataset.kind;
        var id = btn.dataset.id;
        if (!confirm("确认删除这条本地记录吗？此操作不可撤销。")) return;
        if (kind === "persona") removePersona(id);
        else if (kind === "skeleton") removeSkeleton(id);
        renderBoards();
      });
    });
  }

  function renderKpis() {
    var kpis = getKpis();
    var fields = [
      ["skeletons-week", kpis.skeletonsThisWeek],
      ["personas-total", kpis.personasTotal],
      ["hours-saved", kpis.hoursSaved + "h"],
    ];
    fields.forEach(function (pair) {
      var el = document.querySelector('[data-kpi="' + pair[0] + '"]');
      if (el) el.textContent = pair[1] === 0 || pair[1] === "0h" ? String(pair[1]) : String(pair[1]);
    });
  }

  function renderBoards() {
    var pUl = document.querySelector('[data-history-list="personas"]');
    var sUl = document.querySelector('[data-history-list="skeletons"]');
    if (pUl) renderPersonasBoard(pUl);
    if (sUl) renderSkeletonsBoard(sUl);
    bindDeleteButtons();
    renderKpis();
  }

  // ---- public surface -----------------------------------------------------
  window.KOCHistory = {
    savePersonas: savePersonas,
    saveSkeleton: saveSkeleton,
    listPersonas: listPersonas,
    listSkeletons: listSkeletons,
    removePersona: removePersona,
    removeSkeleton: removeSkeleton,
    renderBoards: renderBoards,
    getKpis: getKpis,
  };

  document.addEventListener("DOMContentLoaded", renderBoards);
})();
