/**
 * KOCopilot — front-end interactions.
 *
 * Responsibilities:
 * - Glue: bind buttons/forms on each feature page to KOCApi calls and render results.
 * - Cosmetics: copy-to-clipboard, QA option toggling, drag-drop visuals, platform tabs.
 *
 * Keep business logic OUT of this file: prompts and field schemas live on the backend.
 */
(() => {
  "use strict";

  // ============================================================================
  // Cosmetics — copy buttons / QA option toggles / drop-zone affordances.
  // ============================================================================
  function bindCopyButtons() {
    const candidates = document.querySelectorAll(
      ".koc-reply button, .koc-output-card button, .btn-ghost.sm, .btn-primary.sm"
    );
    candidates.forEach((btn) => {
      const text = (btn.textContent || "").trim();
      const isCopy = /复制|采用|一键复制/.test(text) && !btn.dataset.kocBound;
      if (!isCopy) return;
      btn.dataset.kocBound = "1";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const original = text;
        btn.textContent = "已复制 ✓";
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1500);

        try {
          const card = btn.closest(".koc-reply, .koc-output-card");
          let payload = "";
          if (card) {
            const p = card.querySelector("p, .koc-output-card__text");
            payload = p ? p.textContent.trim() : "";
          }
          if (payload && navigator.clipboard) {
            navigator.clipboard.writeText(payload).catch(() => {});
          }
        } catch (_e) {
          /* file:// downgrade is fine */
        }
      });
    });
  }

  function bindQAOptions() {
    document.querySelectorAll(".koc-qa").forEach((qa) => {
      qa.querySelectorAll(".koc-qa__opts").forEach((group) => {
        group.addEventListener("click", (ev) => {
          const target = ev.target;
          if (!(target instanceof HTMLElement)) return;
          if (!target.classList.contains("koc-qa__opt")) return;
          group.querySelectorAll(".koc-qa__opt").forEach((opt) => {
            opt.classList.remove("is-selected");
          });
          target.classList.add("is-selected");
        });
      });
    });
  }

  function bindUploader() {
    const dropzone = document.getElementById("uploader");
    if (!dropzone) return;
    const stop = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    ["dragenter", "dragover"].forEach((type) =>
      dropzone.addEventListener(type, (ev) => {
        stop(ev);
        dropzone.classList.add("is-drag");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      dropzone.addEventListener(type, (ev) => {
        stop(ev);
        dropzone.classList.remove("is-drag");
      })
    );
    // The actual upload + ASR pipeline is wired up in asr-uploader.js;
    // this handler is purely for the drag-enter visual affordance.
  }

  // ============================================================================
  // Helpers
  // ============================================================================
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setBusy(container, message) {
    if (!container) return;
    container.innerHTML =
      '<div class="koc-loading">' + escapeHtml(message || "AI 思考中，约 5–60 秒…") + "</div>";
  }

  // ============================================================================
  // Module 2 — Persona generation
  // ============================================================================
  function bindPersonaForm() {
    const bg = document.getElementById("bg");
    const hobby = document.getElementById("hobby");
    const resource = document.getElementById("resource");
    const personasContainer = document.querySelector(".koc-personas");
    if (!bg || !hobby || !resource || !personasContainer) return;

    const generateBtn = Array.from(document.querySelectorAll(".btn-primary")).find(
      (b) => /生成.*人设|生成.*方案/.test((b.textContent || "").trim())
    );
    if (!generateBtn) return;

    generateBtn.addEventListener("click", async () => {
      const body = {
        background: (bg.value || "").trim(),
        interests: (hobby.value || "").trim(),
        resources: (resource.value || "").trim(),
      };
      if (!body.background || !body.interests || !body.resources) {
        KOCApi.showToast("请把三个字段都填一下：背景 / 兴趣 / 资源", "error");
        return;
      }

      KOCApi.setLoading(generateBtn, true, "生成中…");
      setBusy(personasContainer, "AI 正在分析你的输入并生成 3 个差异化人设…");
      try {
        const resp = await KOCApi.postJSON("/api/persona/generate", body);
        renderPersonas(personasContainer, resp.personas || []);
        // Persist into the workspace history board (best-effort; ignores if
        // KOCHistory is not loaded on this page or storage quota is full).
        if (window.KOCHistory && typeof window.KOCHistory.savePersonas === "function") {
          try { window.KOCHistory.savePersonas(resp.personas || [], body); } catch (_) {}
        }
        KOCApi.showToast(
          "已生成 " + (resp.personas || []).length + " 个方案 · 用时 " + resp.elapsed_ms + "ms · 已存入工作台",
          "success"
        );
      } catch (e) {
        renderError(personasContainer, e);
        KOCApi.showToast(e.message || "生成失败", "error");
      } finally {
        KOCApi.setLoading(generateBtn, false);
      }
    });
  }

  function renderPersonas(container, personas) {
    if (!personas.length) {
      container.innerHTML =
        '<div class="koc-loading">AI 没有返回任何方案，请尝试更具体的输入或刷新重试。</div>';
      return;
    }
    container.innerHTML = personas
      .map((p, idx) => {
        const stars = "★".repeat(Math.max(1, Math.min(5, p.score || 3)));
        const refs = (p.reference_accounts || []).join("、");
        return (
          '<article class="koc-persona">' +
          '<span class="koc-pill' +
          (idx === 0 ? '" style="align-self: flex-start;' : '') +
          '">推荐 ' + stars + '</span>' +
          '<h4>' + escapeHtml(p.name || "未命名方案") + '</h4>' +
          '<p class="koc-persona__why">' + escapeHtml(p.rationale || "") + "</p>" +
          "<dl>" +
          "<dt>差异化逻辑</dt><dd>" + escapeHtml(p.differentiation || "-") + "</dd>" +
          "<dt>对标账号</dt><dd>" + escapeHtml(refs || "-") + "</dd>" +
          "<dt>起号建议</dt><dd>" + escapeHtml(p.onboarding_advice || "-") + "</dd>" +
          "<dt>变现预判</dt><dd>" + escapeHtml(p.monetization_outlook || "-") + "</dd>" +
          "</dl></article>"
        );
      })
      .join("");
  }

  // ============================================================================
  // Module 1 — Skeleton extraction
  // ============================================================================
  function bindSkeletonForm() {
    const skeletonPanel = document.querySelector('article[aria-labelledby="step-skeleton"]');
    if (!skeletonPanel) return;

    // Inject a textarea + button into the upload panel so users can paste a transcript.
    const uploadPanel = document.querySelector('article[aria-labelledby="step-upload"]');
    if (uploadPanel && !uploadPanel.querySelector("[data-koc-transcript]")) {
      const block = document.createElement("div");
      block.style.marginTop = "0.8rem";
      block.innerHTML =
        '<label for="koc-transcript-input" style="display:block; font-size:0.85rem; color: var(--ink-muted); margin-bottom: 0.3rem;">' +
        "或直接把视频台词文本粘贴到下方（含 / 不含时间戳均可）。" +
        "</label>" +
        '<textarea id="koc-transcript-input" data-koc-transcript class="koc-comment-input" rows="6" ' +
        'placeholder="例如：[00:00] 90% 的人冰箱都用错了... [00:30] 三步法..."></textarea>' +
        '<div style="display:flex; gap:0.6rem; margin-top:0.6rem; flex-wrap: wrap;">' +
        '<button class="btn btn-primary" type="button" data-koc-action="extract-skeleton">用 AI 拆解骨架</button>' +
        '<span style="font-size:0.78rem; color: var(--ink-muted); align-self:center;">' +
        " · 文本长度 ≥ 20 字，建议 ≤ 5 分钟视频台词" +
        "</span></div>";
      uploadPanel.appendChild(block);
    }

    const btn = document.querySelector('[data-koc-action="extract-skeleton"]');
    const input = document.getElementById("koc-transcript-input");
    if (!btn || !input) return;

    btn.addEventListener("click", async () => {
      const transcript = (input.value || "").trim();
      if (transcript.length < 20) {
        KOCApi.showToast("请粘贴至少 20 字的视频台词。", "error");
        return;
      }

      KOCApi.setLoading(btn, true, "拆解中…");
      // Replace existing skeleton placeholders with a loading state.
      const oldSkeletons = skeletonPanel.querySelectorAll(".koc-skeleton");
      const placeholder = document.createElement("div");
      placeholder.className = "koc-loading";
      placeholder.dataset.kocPlaceholder = "1";
      placeholder.textContent = "AI 正在拆解骨架…";
      if (oldSkeletons.length) {
        oldSkeletons[0].parentNode.insertBefore(placeholder, oldSkeletons[0]);
        oldSkeletons.forEach((n) => n.remove());
      } else {
        skeletonPanel.appendChild(placeholder);
      }

      try {
        const resp = await KOCApi.postJSON("/api/skeleton/extract", { transcript: transcript });
        renderSkeleton(skeletonPanel, placeholder, resp);
        if (window.KOCHistory && typeof window.KOCHistory.saveSkeleton === "function") {
          try { window.KOCHistory.saveSkeleton(resp, transcript); } catch (_) {}
        }
        KOCApi.showToast("拆解完成 · 用时 " + resp.elapsed_ms + "ms · 已存入工作台", "success");
      } catch (e) {
        placeholder.classList.remove("koc-loading");
        placeholder.className = "koc-loading";
        placeholder.textContent = "拆解失败：" + (e.message || "请稍后重试");
        KOCApi.showToast(e.message || "拆解失败", "error");
      } finally {
        KOCApi.setLoading(btn, false);
      }
    });
  }

  function renderSkeleton(panel, placeholder, data) {
    const fragments = [];
    const hook = data.hook || {};
    fragments.push(
      '<div class="koc-skeleton">' +
        '<div class="koc-skeleton__time">0:00 起</div>' +
        '<div class="koc-skeleton__body">' +
        "<h4>Hook · " + escapeHtml(hook.strategy || "钩子") + "</h4>" +
        "<p>" + escapeHtml(hook.text || "") + "</p>" +
        "<em>" + escapeHtml(hook.explanation || "") + "</em>" +
        "</div></div>"
    );
    (data.body || []).forEach((beat) => {
      fragments.push(
        '<div class="koc-skeleton">' +
          '<div class="koc-skeleton__time">' + escapeHtml(beat.timestamp || "-") + "</div>" +
          '<div class="koc-skeleton__body">' +
          "<h4>" + escapeHtml(beat.title || "Body") + "</h4>" +
          "<p>" + escapeHtml(beat.description || "") + "</p>" +
          (beat.emotion_arc
            ? "<em>情绪：" + escapeHtml(beat.emotion_arc) + "</em>"
            : "") +
          "</div></div>"
      );
    });
    const cta = data.cta || {};
    fragments.push(
      '<div class="koc-skeleton">' +
        '<div class="koc-skeleton__time">结尾</div>' +
        '<div class="koc-skeleton__body">' +
        "<h4>CTA · " + escapeHtml(cta.strategy || "行动呼吁") + "</h4>" +
        "<p>" + escapeHtml(cta.text || "") + "</p>" +
        "<em>" + escapeHtml(cta.explanation || "") + "</em>" +
        "</div></div>"
    );
    if (data.transferable_template) {
      fragments.push(
        '<div class="koc-skeleton">' +
          '<div class="koc-skeleton__time">模板</div>' +
          '<div class="koc-skeleton__body">' +
          "<h4>可迁移模板</h4>" +
          '<p style="white-space: pre-wrap;">' +
          escapeHtml(data.transferable_template) +
          "</p></div></div>"
      );
    }
    placeholder.outerHTML = fragments.join("");
  }

  // ============================================================================
  // Module 3 — SEO titles
  // ============================================================================
  function bindSeoForm() {
    const textarea = document.querySelector('textarea.koc-comment-input[aria-label="脚本输入"]');
    if (!textarea) return;
    const generateBtn = Array.from(document.querySelectorAll(".btn-primary")).find(
      (b) => /生成发布元数据|生成元数据/.test((b.textContent || "").trim())
    );
    if (!generateBtn) return;

    const titlesContainer = document.querySelector(".koc-output-grid");
    const descSection = Array.from(document.querySelectorAll("h2.koc-sec-title")).find(
      (h) => /视频简介/.test(h.textContent || "")
    );
    const descPanel = descSection ? descSection.nextElementSibling : null;
    const tagsSection = Array.from(document.querySelectorAll("h2.koc-sec-title")).find(
      (h) => /标签矩阵/.test(h.textContent || "")
    );
    const tagsPanel = tagsSection ? tagsSection.nextElementSibling.nextElementSibling : null;
    // tagsSection -> sec-sub -> panel; we walk two siblings.

    generateBtn.addEventListener("click", async () => {
      const script = (textarea.value || "").trim();
      if (script.length < 20) {
        KOCApi.showToast("脚本至少 20 字。", "error");
        return;
      }
      // Platform is fixed to douyin in this version (the picker UI was
      // removed). The backend still accepts the field for forward-compat.
      const body = { script: script, platform: "douyin" };

      KOCApi.setLoading(generateBtn, true, "生成中…");
      if (titlesContainer) setBusy(titlesContainer, "AI 正在按抖音算法生成标题…");
      try {
        const resp = await KOCApi.postJSON("/api/seo/titles", body);
        renderSeoTitles(titlesContainer, resp.titles || []);
        renderSeoDescription(descPanel, resp.description || "");
        renderSeoTags(tagsPanel, resp.tags || {});
        KOCApi.showToast(
          "生成 " + (resp.titles || []).length + " 个标题 · 用时 " + resp.elapsed_ms + "ms",
          "success"
        );
      } catch (e) {
        if (titlesContainer) renderError(titlesContainer, e);
        KOCApi.showToast(e.message || "生成失败", "error");
      } finally {
        KOCApi.setLoading(generateBtn, false);
      }
    });
  }

  function renderSeoTitles(container, titles) {
    if (!container) return;
    if (!titles.length) {
      container.innerHTML = '<div class="koc-loading">未返回任何标题。</div>';
      return;
    }
    container.innerHTML = titles
      .map((t) => {
        const note = t.notes ? " · " + escapeHtml(t.notes) : "";
        return (
          '<article class="koc-output-card">' +
          '<span class="koc-output-card__type">' + escapeHtml(t.type || "其他") + "</span>" +
          '<p class="koc-output-card__text">' + escapeHtml(t.text || "") + "</p>" +
          '<div class="koc-output-card__bar">' +
          "<span>" + (t.char_count || 0) + " 字" + note + "</span>" +
          '<button class="btn btn-ghost sm" type="button">采用</button>' +
          "</div></article>"
        );
      })
      .join("");
    bindCopyButtons();
  }

  function renderSeoDescription(panel, description) {
    if (!panel) return;
    const p = panel.querySelector("p");
    if (!p) return;
    p.innerHTML = escapeHtml(description);
  }

  function renderSeoTags(panel, tags) {
    if (!panel) return;
    const cluster = panel.querySelector(".koc-tag-cluster");
    if (!cluster) return;
    const broad = (tags.broad_traffic || []).map((t) => '<span class="koc-tag">' + escapeHtml(t) + "</span>").join("");
    const longTail = (tags.long_tail || [])
      .map((t) => '<span class="koc-tag koc-tag--accent">' + escapeHtml(t) + "</span>")
      .join("");
    const challenge = (tags.challenge_topics || [])
      .map((t) => '<span class="koc-tag">' + escapeHtml(t) + "</span>")
      .join("");
    cluster.innerHTML =
      '<div class="koc-tag-cluster__row"><b>泛流量</b>' + broad + "</div>" +
      '<div class="koc-tag-cluster__row"><b>精准长尾</b>' + longTail + "</div>" +
      '<div class="koc-tag-cluster__row"><b>话题挑战</b>' + challenge + "</div>";
  }

  // ============================================================================
  // Module 4 — Comments classify
  // ============================================================================
  function bindCommentsForm() {
    const textarea = document.querySelector('textarea.koc-comment-input[aria-label="评论文本"]');
    if (!textarea) return;
    const startBtn = Array.from(document.querySelectorAll(".btn-primary")).find(
      (b) => (b.textContent || "").trim() === "开始分拣"
    );
    const bucket = document.querySelector(".koc-bucket");
    if (!startBtn || !bucket) return;

    const clearBtn = Array.from(document.querySelectorAll(".btn-ghost")).find(
      (b) => (b.textContent || "").trim() === "清空"
    );
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        textarea.value = "";
        textarea.focus();
      });
    }

    startBtn.addEventListener("click", async () => {
      const raw = (textarea.value || "").trim();
      if (raw.length < 10) {
        KOCApi.showToast("请粘贴至少 10 字的评论文本。", "error");
        return;
      }

      KOCApi.setLoading(startBtn, true, "分拣中…");
      setBusy(bucket, "AI 正在分拣评论并生成回复草案…");
      try {
        const resp = await KOCApi.postJSON("/api/comments/classify", { raw_text: raw });
        renderComments(bucket, resp);
        KOCApi.showToast(
          "高 " + (resp.high_value || []).length +
            " · 中 " + (resp.medium_value || []).length +
            " · 低 " + (resp.low_value_count || 0) +
            " · 用时 " + resp.elapsed_ms + "ms",
          "success"
        );
      } catch (e) {
        renderError(bucket, e);
        KOCApi.showToast(e.message || "分拣失败", "error");
      } finally {
        KOCApi.setLoading(startBtn, false);
      }
    });
  }

  function renderComments(bucket, data) {
    const high = data.high_value || [];
    const med = data.medium_value || [];
    const low = data.low_value_count || 0;

    function renderOne(item) {
      const replies = (item.replies || [])
        .map(
          (r) =>
            '<div class="koc-reply">' +
            "<h5>" + escapeHtml(r.tone || "回复") + "</h5>" +
            "<p>" + escapeHtml(r.text || "") + "</p>" +
            '<button type="button">复制</button>' +
            "</div>"
        )
        .join("");
      const cls = item.classification || "";
      const isWarn = cls === "敏感场";
      const pillCls = isWarn ? "koc-pill koc-pill--warn" : "koc-pill";
      return (
        '<article class="koc-comment">' +
        '<div class="koc-comment__meta">' +
        "<span><b>" + escapeHtml(item.author || "@匿名") + "</b> · " + escapeHtml(cls) + "</span>" +
        '<span class="' + pillCls + '">' + escapeHtml(cls || "高互动潜力") + "</span>" +
        "</div>" +
        '<p class="koc-comment__text">' + escapeHtml(item.text || "") + "</p>" +
        (replies ? '<div class="koc-replies">' + replies + "</div>" : "") +
        "</article>"
      );
    }

    bucket.innerHTML =
      "<details open>" +
      "<summary>高价值（" + high.length + '） · <span style="color: var(--primary-700);">建议优先回复</span></summary>' +
      high.map(renderOne).join("") +
      "</details>" +
      "<details" + (med.length ? "" : "") + ">" +
      "<summary>中价值（" + med.length + "） · 可选回复</summary>" +
      med.map(renderOne).join("") +
      "</details>" +
      "<details>" +
      "<summary>低价值灌水（" + low + "） · 默认隐藏</summary>" +
      '<p style="font-size: 0.85rem; color: var(--ink-muted); margin: 0.5rem 0;">共 ' + low +
      " 条灌水/无意义评论已被忽略。建议直接跳过或一键回复笑脸。</p>" +
      "</details>";

    bindCopyButtons();
  }

  // ============================================================================
  // Generic error renderer
  // ============================================================================
  function renderError(container, err) {
    container.innerHTML =
      '<div class="koc-loading" style="border-color: var(--danger); color: var(--danger);">' +
      escapeHtml((err && err.message) || "请求失败") +
      "</div>";
  }

  // ============================================================================
  // Input mode tabs (feature-1: 上传视频 vs 粘贴文本 — 二选一)
  //
  // Why a tab (not just collapsing both): users were confused by two parallel
  // inputs visible at once and wondered which one was authoritative. Locking the
  // UI into a binary choice (with the inactive pane fully hidden via [hidden])
  // also lets us hide the ffmpeg.wasm uploader entirely on browsers that don't
  // support cross-origin isolation — the user can fall back to text without
  // seeing a broken upload button.
  // ============================================================================
  function bindInputTabs() {
    const tabs = Array.from(document.querySelectorAll(".koc-input-tab[data-input-tab]"));
    const panes = Array.from(document.querySelectorAll(".koc-input-pane[data-input-pane]"));
    if (!tabs.length || !panes.length) return;

    function activate(targetKey) {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.inputTab === targetKey;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      panes.forEach((pane) => {
        const isActive = pane.dataset.inputPane === targetKey;
        pane.classList.toggle("is-active", isActive);
        if (isActive) {
          pane.removeAttribute("hidden");
        } else {
          pane.setAttribute("hidden", "");
        }
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab.dataset.inputTab));
    });

    // If cross-origin isolation is unavailable, ffmpeg.wasm cannot decode video
    // → silently default to the text-paste tab and hint the user.
    // (We still keep the video tab clickable so power users with a direct mp3
    //  can upload audio without ffmpeg.wasm — the uploader code paths handle
    //  audio inputs without invoking ffmpeg.)
    if (typeof window !== "undefined" && window.crossOriginIsolated === false) {
      const videoTab = tabs.find((t) => t.dataset.inputTab === "video");
      if (videoTab) {
        videoTab.title =
          "当前页面未启用 cross-origin isolation：mp4/mov 视频抽轨会失败，建议直接上传 mp3/m4a/wav 或切到右侧『粘贴台词文本』。";
      }
    }
  }

  // ============================================================================
  // Boot
  // ============================================================================
  document.addEventListener("DOMContentLoaded", () => {
    bindCopyButtons();
    bindQAOptions();
    bindUploader();
    bindInputTabs();

    bindPersonaForm();
    bindSkeletonForm();
    bindSeoForm();
    bindCommentsForm();
  });
})();
