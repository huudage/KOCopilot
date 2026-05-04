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

  // ============================================================================
  // Step 0 controller — Active Persona selector (feature-1.html only)
  //
  // 设计原因：
  //   爆款拆解 (feature-1) 的第 3、4 步严重依赖人设语气；早期版本默默取
  //   localStorage 里"最新一条" persona 记录的第一个方案，导致用户保存了多个
  //   人设之后被静默拿错。现在所有调用方（skeleton extract / qa next /
  //   script generate）都通过 KOCActivePersona.getHint() 拿到用户在第 0 步
  //   显式选中的方案，无选则传 null。
  //
  // 持久化：
  //   sessionStorage（同一会话内多次拆解保持一致；关 tab 即重置，避免老数据残留）。
  //   存的是「人设记录 id + 方案 idx + 关键字段冗余」三件套——不依赖 record 还在
  //   localStorage 里（用户清空历史后仍能用）。
  // ============================================================================
  const KOCActivePersona = (function () {
    const SS_KEY = "koc.activePersona";
    let cache = null; // { recordId, personaIdx, name, differentiation, rationale, score }

    function load() {
      if (cache) return cache;
      try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (raw) cache = JSON.parse(raw);
      } catch (_) { cache = null; }
      return cache;
    }

    function save(payload) {
      cache = payload;
      try {
        sessionStorage.setItem(SS_KEY, JSON.stringify(payload));
      } catch (_) { /* 隐私模式下 sessionStorage 可能写不进 —— 内存仍生效 */ }
    }

    function clear() {
      cache = null;
      try { sessionStorage.removeItem(SS_KEY); } catch (_) {}
    }

    /** 把已选人设转成给后端 prompt 用的纯文本上下文。 */
    function getHint() {
      const p = load();
      if (!p) return "";
      return [p.name, p.differentiation, p.rationale]
        .filter(Boolean)
        .join(" · ");
    }

    /** 把所有已保存的 persona 记录平铺成 [{ recordId, personaIdx, persona, createdAt, inputs }, ...]
        最新的记录在前；同一记录内按 score 降序，便于 modal 优先展示推荐度高的方案。 */
    function listAll() {
      try {
        const records = (window.KOCHistory && window.KOCHistory.listPersonas()) || [];
        const flat = [];
        records.forEach((rec) => {
          (rec.personas || []).forEach((persona, idx) => {
            flat.push({
              recordId: rec.id,
              personaIdx: idx,
              persona: persona,
              createdAt: rec.createdAt,
              inputs: rec.inputs || {},
            });
          });
        });
        return flat;
      } catch (_) { return []; }
    }

    function fmtScore(n) {
      const stars = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
      return "★".repeat(stars) + "☆".repeat(5 - stars);
    }

    function renderCard() {
      const card = document.querySelector("[data-koc-persona-card]");
      if (!card) return; // not on feature-1
      const emptyEl = card.querySelector("[data-koc-persona-empty]");
      const activeEl = card.querySelector("[data-koc-persona-active]");
      const openBtn = document.querySelector('[data-koc-action="persona-chooser-open"]');
      const all = listAll();
      const selected = load();

      if (all.length === 0) {
        // 没保存过任何人设 → empty CTA + 禁用「选择 / 切换」
        if (emptyEl) emptyEl.hidden = false;
        if (activeEl) activeEl.hidden = true;
        if (openBtn) openBtn.disabled = true;
        return;
      }
      if (openBtn) openBtn.disabled = false;

      if (!selected) {
        // 有可选但未选定 → 仍显示空状态，但 CTA 改成"现在去选"
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.querySelector("h4").textContent = "请先选择一个人设方案";
          emptyEl.querySelector("p").textContent =
            "你已保存 " + all.length + " 个方案，点击右上角「选择 / 切换」挑一个用本次拆解。";
          const cta = emptyEl.querySelector("a.btn");
          if (cta) {
            cta.textContent = "选择人设 →";
            cta.href = "javascript:void(0)";
            cta.onclick = openModal;
          }
        }
        if (activeEl) activeEl.hidden = true;
        return;
      }

      // 已选定 → 渲染摘要卡
      if (emptyEl) emptyEl.hidden = true;
      if (activeEl) {
        activeEl.hidden = false;
        const nameEl = activeEl.querySelector("[data-koc-persona-name]");
        const scoreEl = activeEl.querySelector("[data-koc-persona-score]");
        const metaEl = activeEl.querySelector("[data-koc-persona-meta]");
        const diffEl = activeEl.querySelector("[data-koc-persona-diff]");
        const ratEl = activeEl.querySelector("[data-koc-persona-rationale]");
        if (nameEl) nameEl.textContent = selected.name || "（未命名）";
        if (scoreEl) scoreEl.textContent = fmtScore(selected.score);
        if (metaEl) {
          // 把 persona 来源记录的 background / interests 简短展示，让用户记起这是哪批生成的
          const bg = (selected.inputs && (selected.inputs.background || selected.inputs.interests)) || "";
          metaEl.textContent = bg ? "来源 · " + bg.slice(0, 60) : "";
        }
        if (diffEl) diffEl.textContent = selected.differentiation
          ? "差异化 · " + selected.differentiation
          : "";
        if (ratEl) ratEl.textContent = selected.rationale
          ? "为何值得做 · " + selected.rationale
          : "";
      }
    }

    function openModal() {
      const modal = document.querySelector("[data-koc-persona-modal]");
      const listEl = document.querySelector("[data-koc-persona-list]");
      if (!modal || !listEl) return;
      const all = listAll();
      if (all.length === 0) {
        listEl.innerHTML =
          '<div class="koc-active-persona__empty">' +
          '<div class="koc-active-persona__icon">🎭</div>' +
          "<h4>还没有任何人设方案</h4>" +
          "<p>请先去人设生成页保存至少一个。</p>" +
          "</div>";
      } else {
        const selected = load();
        listEl.innerHTML = all
          .map((entry, i) => {
            const p = entry.persona || {};
            const isSel = selected
              && selected.recordId === entry.recordId
              && selected.personaIdx === entry.personaIdx;
            const refs = (p.reference_accounts || []).slice(0, 3).join(" / ");
            return (
              '<button type="button" class="koc-persona-option' +
                (isSel ? " is-selected" : "") +
                '" data-persona-flat-idx="' + i + '">' +
                '<div class="koc-persona-option__head">' +
                  '<b>' + escapeHtml(p.name || "未命名") + "</b>" +
                  '<span class="koc-persona-option__score">' + fmtScore(p.score) + "</span>" +
                "</div>" +
                '<p class="koc-persona-option__diff">' + escapeHtml(p.differentiation || "—") + "</p>" +
                (p.rationale
                  ? '<p class="koc-persona-option__rationale">为何值得做：' +
                      escapeHtml(p.rationale) + "</p>"
                  : "") +
                (refs
                  ? '<p class="koc-persona-option__refs">对标 · ' + escapeHtml(refs) + "</p>"
                  : "") +
              "</button>"
            );
          })
          .join("");
        listEl.querySelectorAll("[data-persona-flat-idx]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.personaFlatIdx, 10);
            const entry = all[idx];
            if (!entry) return;
            save({
              recordId: entry.recordId,
              personaIdx: entry.personaIdx,
              name: entry.persona.name || "",
              differentiation: entry.persona.differentiation || "",
              rationale: entry.persona.rationale || "",
              score: entry.persona.score || 0,
              inputs: entry.inputs || {},
            });
            closeModal();
            renderCard();
            KOCApi.showToast("已选定人设：" + (entry.persona.name || "未命名"), "success");
          });
        });
      }
      modal.hidden = false;
      // 锁页面滚动，避免 modal 背后还能滚走
      document.body.style.overflow = "hidden";
    }

    function closeModal() {
      const modal = document.querySelector("[data-koc-persona-modal]");
      if (modal) modal.hidden = true;
      document.body.style.overflow = "";
    }

    function bind() {
      // 仅在 feature-1（含 [data-koc-persona-card]）页面生效，其他页面静默退出
      if (!document.querySelector("[data-koc-persona-card]")) return;
      document.querySelectorAll('[data-koc-action="persona-chooser-open"]').forEach((el) => {
        el.addEventListener("click", openModal);
      });
      document.querySelectorAll('[data-koc-action="persona-chooser-close"]').forEach((el) => {
        el.addEventListener("click", closeModal);
      });
      // ESC 关闭 modal
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
      });
      renderCard();
    }

    /** 给 KOCHistory.saveScript 用：返回当前选中的人设原始对象（含 name / differentiation
        / rationale / score），不存在时返回 null。命名前缀 _ 表示这是"内部消费 API"，
        界面层应继续用 getHint() 拿到的纯文本上下文。 */
    function snapshot() {
      var p = load();
      if (!p) return null;
      return {
        name: p.name || "",
        differentiation: p.differentiation || "",
        rationale: p.rationale || "",
        score: p.score || 0,
      };
    }

    return { bind: bind, getHint: getHint, render: renderCard, clear: clear, _snapshot: snapshot };
  })();
  window.KOCActivePersona = KOCActivePersona;

  // ============================================================================
  // Module 5+6 — Guided Q&A flow + Final script generation
  //
  // State machine:
  //   IDLE (panel not yet activated; "等待第 2 步骨架完成")
  //     ↓  bindSkeletonForm 拆解成功后调用 KOCQAFlow.activate(skeleton, transcript)
  //   READY (按钮 enabled 显示「开始 3 轮单选问答」)
  //     ↓  用户点开始 → loadNextRound()
  //   ROUND_N (1..3) — 调 /api/qa/next，渲染问题 + 选项
  //     ↓  用户单击选项 → answers.push() → loadNextRound()
  //   后端 done=true 时直接进入 DONE → 自动调 /api/script/generate
  //   DONE — 第 4 步面板显示真实脚本，「复制纯文本」按钮启用
  //
  // 不开放 freeform 自由输入（避免对话发散，保 3 轮收敛）—— 所有选项都是
  // /api/qa/next 返回的 LLM 生成可朗读内容，用户单选即可推进。
  // ============================================================================
  const KOCQAFlow = (function () {
    const state = {
      skeleton: null,
      transcript: "",
      personaHint: "",
      answers: [], // [{round, question, choice}]
      latest: null, // 最近一次 /api/qa/next 响应
    };

    function $(sel) { return document.querySelector(sel); }

    function activate(skeleton, transcript) {
      state.skeleton = skeleton;
      state.transcript = transcript || "";
      // 单一来源：用户在第 0 步明确选定的人设；没选就传空字符串。
      // 早期版本曾"自动取最新一条人设记录的第一个方案"，导致用户保存多个人设后被静默拿错；
      // 现在所有 persona 上下文都必须经过用户在第 0 步显式确认。
      state.personaHint = (window.KOCActivePersona && window.KOCActivePersona.getHint()) || "";
      state.answers = [];
      state.latest = null;

      const startBtn = $('[data-koc-action="qa-start"]');
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "开始 3 轮单选问答 →";
        if (!startBtn.dataset.kocBound) {
          startBtn.addEventListener("click", () => loadNextRound());
          startBtn.dataset.kocBound = "1";
        }
      }
      // Reset visible UI to "ready, not started"
      const empty = $("[data-koc-qa-empty]");
      const current = $("[data-koc-qa-current]");
      const history = $("[data-koc-qa-history]");
      if (empty) empty.hidden = false;
      if (current) current.hidden = true;
      if (history) {
        history.hidden = true;
        const list = history.querySelector("[data-koc-qa-history-list]");
        if (list) list.innerHTML = "";
      }
      // Reset script panel back to empty state
      const scriptEmpty = $("[data-koc-script-empty]");
      const scriptOut = $("[data-koc-script-output]");
      if (scriptEmpty) scriptEmpty.hidden = false;
      if (scriptOut) {
        scriptOut.hidden = true;
        scriptOut.innerHTML = "";
      }
      const copyBtn = $('[data-koc-action="copy-script"]');
      if (copyBtn) copyBtn.disabled = true;
    }

    async function loadNextRound() {
      const empty = $("[data-koc-qa-empty]");
      const current = $("[data-koc-qa-current]");
      const questionEl = $("[data-koc-qa-question]");
      const rationaleEl = $("[data-koc-qa-rationale]");
      const optsEl = $("[data-koc-qa-opts]");
      if (empty) empty.hidden = true;
      if (current) current.hidden = false;
      if (questionEl) questionEl.textContent = "AI 正在出题…";
      if (rationaleEl) { rationaleEl.hidden = true; rationaleEl.textContent = ""; }
      if (optsEl) optsEl.innerHTML = '<div class="koc-loading">AI 正在出题…</div>';

      try {
        const resp = await KOCApi.postJSON("/api/qa/next", {
          skeleton: state.skeleton,
          transcript: state.transcript || null,
          persona_hint: state.personaHint || null,
          answers: state.answers,
        });
        state.latest = resp;
        if (resp.done) {
          if (current) current.hidden = true;
          KOCApi.showToast("3 轮问答完成 · AI 正在生成原创脚本…", "success");
          await generateScript();
          return;
        }
        renderRound(resp);
      } catch (e) {
        if (optsEl) optsEl.innerHTML = '<div class="koc-loading" style="color:var(--danger)">' +
          escapeHtml("出题失败：" + (e.message || "请重试")) + "</div>";
        KOCApi.showToast(e.message || "QA 失败", "error");
      }
    }

    function renderRound(resp) {
      const questionEl = $("[data-koc-qa-question]");
      const rationaleEl = $("[data-koc-qa-rationale]");
      const optsEl = $("[data-koc-qa-opts]");
      if (questionEl) questionEl.textContent = "第 " + resp.round + " 题 · " + (resp.question || "");
      if (rationaleEl) {
        if (resp.rationale) {
          rationaleEl.textContent = "💡 " + resp.rationale;
          rationaleEl.hidden = false;
        } else {
          rationaleEl.hidden = true;
          rationaleEl.textContent = "";
        }
      }
      // Update progress steps
      document.querySelectorAll(".koc-qa__progress-step").forEach((el) => {
        const step = parseInt(el.dataset.step, 10);
        el.classList.toggle("is-active", step === resp.round);
        el.classList.toggle("is-done", step < resp.round);
      });
      // Render options
      if (!optsEl) return;
      optsEl.innerHTML = "";
      (resp.options || []).forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "koc-qa__opt";
        btn.textContent = opt.label;
        btn.addEventListener("click", () => onPick(resp, opt.label, btn));
        optsEl.appendChild(btn);
      });
    }

    function onPick(roundResp, choiceLabel, clickedBtn) {
      // 立刻禁用所有选项防重复点击；高亮选中的那个
      const optsEl = $("[data-koc-qa-opts]");
      if (optsEl) {
        optsEl.querySelectorAll(".koc-qa__opt").forEach((b) => {
          b.disabled = true;
          b.classList.remove("is-selected");
        });
      }
      if (clickedBtn) clickedBtn.classList.add("is-selected");

      state.answers.push({
        round: roundResp.round,
        question: roundResp.question || "",
        choice: choiceLabel,
      });
      appendHistory(roundResp.round, roundResp.question, choiceLabel);
      // 紧接下一轮（loading by loadNextRound 自身）
      setTimeout(loadNextRound, 200);
    }

    function appendHistory(round, question, choice) {
      const history = $("[data-koc-qa-history]");
      const list = $("[data-koc-qa-history-list]");
      if (!history || !list) return;
      history.hidden = false;
      const li = document.createElement("li");
      li.innerHTML =
        '<b>第 ' + round + ' 题</b> · ' + escapeHtml(question || "") +
        '<br/><span class="koc-qa-history__choice">✓ ' + escapeHtml(choice) + '</span>';
      list.appendChild(li);
    }

    async function generateScript() {
      const scriptEmpty = $("[data-koc-script-empty]");
      const scriptOut = $("[data-koc-script-output]");
      const copyBtn = $('[data-koc-action="copy-script"]');
      if (scriptEmpty) scriptEmpty.hidden = true;
      if (scriptOut) {
        scriptOut.hidden = false;
        scriptOut.innerHTML = '<div class="koc-loading">AI 正在生成原创分镜脚本…</div>';
      }

      try {
        const resp = await KOCApi.postJSON("/api/script/generate", {
          skeleton: state.skeleton,
          answers: state.answers,
          persona_hint: state.personaHint || null,
          transcript: state.transcript || null,
        });
        renderScript(resp);
        if (copyBtn) {
          copyBtn.disabled = false;
          copyBtn.dataset.fullText = resp.full_text || "";
        }
        // 一次性把"完整项目"入库——只有走到这里说明用户真的产出了脚本，
        // 工作台「我的脚本项目」才会出现新条目。
        if (window.KOCHistory && typeof window.KOCHistory.saveScript === "function") {
          try {
            const activePersona = (window.KOCActivePersona && window.KOCActivePersona._snapshot)
              ? window.KOCActivePersona._snapshot()
              : null;
            window.KOCHistory.saveScript({
              persona: activePersona,
              transcript: state.transcript || "",
              skeleton: state.skeleton || null,
              answers: state.answers || [],
              script: resp,
            });
          } catch (e) {
            // 入库失败不阻断主流程；脚本仍正常显示
            console.warn("[KOCHistory.saveScript] failed:", e);
          }
        }
        // 同时把脚本 full_text 缓存进 sessionStorage，给同浏览器内的「标题车间」无缝带入。
        // feature-3.html 的 bindSeoForm 在加载时会检测这个 key 并自动填入 textarea。
        try {
          if (resp.full_text) {
            sessionStorage.setItem("koc.lastScriptForSeo", resp.full_text);
          }
        } catch (_) {}
        KOCApi.showToast("脚本生成完成 · 用时 " + resp.elapsed_ms + "ms · 已存入工作台", "success");
      } catch (e) {
        if (scriptOut) {
          scriptOut.innerHTML = '<div class="koc-loading" style="color:var(--danger)">' +
            escapeHtml("脚本生成失败：" + (e.message || "请重试")) + "</div>";
        }
        KOCApi.showToast(e.message || "脚本生成失败", "error");
      }
    }

    function renderScript(data) {
      const scriptOut = $("[data-koc-script-output]");
      if (!scriptOut) return;
      const parts = [];
      // Hook
      parts.push(
        '<div class="koc-skeleton">' +
          '<div class="koc-skeleton__time">0:00–0:03</div>' +
          '<div class="koc-skeleton__body">' +
          "<h4>Hook · 开场口播</h4>" +
          "<p>" + escapeHtml(data.hook_narration || "") + "</p>" +
          "</div></div>"
      );
      // Scenes
      (data.scenes || []).forEach((s) => {
        parts.push(
          '<div class="koc-skeleton">' +
            '<div class="koc-skeleton__time">' + escapeHtml(s.timestamp || "-") + "</div>" +
            '<div class="koc-skeleton__body">' +
            "<h4>" + escapeHtml(s.title || "Scene") + "</h4>" +
            "<p>" + escapeHtml(s.narration || "") + "</p>" +
            (s.visual ? "<em>📷 " + escapeHtml(s.visual) + "</em>" : "") +
            "</div></div>"
        );
      });
      // CTA
      parts.push(
        '<div class="koc-skeleton">' +
          '<div class="koc-skeleton__time">收尾</div>' +
          '<div class="koc-skeleton__body">' +
          "<h4>CTA · 行动呼吁</h4>" +
          "<p>" + escapeHtml(data.cta_narration || "") + "</p>" +
          "</div></div>"
      );
      scriptOut.innerHTML = parts.join("");
    }

    return { activate: activate };
  })();
  // Expose so asr-uploader (separate script) can also re-trigger if needed.
  window.KOCQAFlow = KOCQAFlow;

  function bindCopyScript() {
    const btn = document.querySelector('[data-koc-action="copy-script"]');
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const text = btn.dataset.fullText || "";
      if (!text) {
        KOCApi.showToast("还没有可复制的脚本，请先完成第 3 步问答。", "error");
        return;
      }
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for non-secure contexts (rare in production)
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        KOCApi.showToast("已复制脚本（" + text.length + " 字）到剪贴板", "success");
      } catch (e) {
        KOCApi.showToast("复制失败：" + (e.message || "浏览器拒绝"), "error");
      }
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
      // Clear three different things that may sit in the skeleton panel:
      //   1. the "等待拆解" empty-state block (initial page load)
      //   2. the previous AI-rendered skeletons (re-running on a new transcript)
      //   3. any leftover error placeholder from a previous failed attempt
      // Then drop in a single loading placeholder. renderSkeleton() will swap
      // this placeholder for the real Hook/Body/CTA fragments via outerHTML.
      const oldEmpty = skeletonPanel.querySelector("[data-koc-skeleton-empty]");
      const oldSkeletons = skeletonPanel.querySelectorAll(".koc-skeleton");
      const oldError = skeletonPanel.querySelector("[data-koc-placeholder]");
      const placeholder = document.createElement("div");
      placeholder.className = "koc-loading";
      placeholder.dataset.kocPlaceholder = "1";
      placeholder.textContent = "AI 正在拆解骨架…";
      if (oldError) oldError.remove();
      if (oldEmpty) {
        oldEmpty.parentNode.insertBefore(placeholder, oldEmpty);
        oldEmpty.remove();
      } else if (oldSkeletons.length) {
        oldSkeletons[0].parentNode.insertBefore(placeholder, oldSkeletons[0]);
        oldSkeletons.forEach((n) => n.remove());
      } else {
        skeletonPanel.appendChild(placeholder);
      }

      try {
        const personaHint = (window.KOCActivePersona && window.KOCActivePersona.getHint()) || null;
        const resp = await KOCApi.postJSON("/api/skeleton/extract", {
          transcript: transcript,
          persona_hint: personaHint,
        });
        renderSkeleton(skeletonPanel, placeholder, resp);
        // v0.7 起：拆解只是中间产物，不再单独保存。整个项目（人设 + 台词 + 骨架 +
        // 答案 + 脚本）由 KOCQAFlow.generateScript 在第 4 步成功后一次性入库。
        // 这样中途放弃就不会污染工作台。
        if (window.KOCQAFlow) {
          try { window.KOCQAFlow.activate(resp, transcript); } catch (_) {}
        }
        KOCApi.showToast("拆解完成 · 用时 " + resp.elapsed_ms + "ms · 进入第 3 步问答", "success");
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
  // Module 3 — SEO titles / description / tags
  //
  // feature-3 与 feature-1 的衔接：
  //   1) feature-1 第 4 步生成脚本后，把 full_text 写到 sessionStorage["koc.lastScriptForSeo"]
  //   2) 工作台「我的脚本项目」点「带入标题车间 →」也写同一个 key
  //   3) 用户进 feature-3 后，本函数检测该 key —— 有就把 textarea 内容替换为真实脚本
  //      并 toast 一行「已从拆解工坊带入」；没有就保留 HTML 自带的 demo 文本作为占位。
  //   4) 「从拆解工坊带入」按钮也走同一通道：手动触发一次检测；没有数据就提示用户去 feature-1。
  //
  // 输出区交互：
  //   - 每张「采用」按钮 → 复制该标题文本
  //   - 「复制简介」按钮 → 复制视频简介
  //   - 「换一版」按钮 → 重新触发主生成（调一次 /api/seo/titles）
  //   - 「一键复制全部标签」按钮 → 把 3 类标签拼接复制
  // ============================================================================
  const SEO_SS_KEY = "koc.lastScriptForSeo";

  function bindSeoForm() {
    const textarea = document.querySelector('textarea.koc-comment-input[aria-label="脚本输入"]');
    if (!textarea) return;
    const generateBtn = Array.from(document.querySelectorAll(".btn-primary")).find(
      (b) => /生成发布元数据|生成元数据/.test((b.textContent || "").trim())
    );
    if (!generateBtn) return;

    const bringInBtn = Array.from(document.querySelectorAll("button.btn-ghost")).find(
      (b) => /从拆解工坊带入/.test((b.textContent || "").trim())
    );
    const titlesContainer = document.querySelector(".koc-output-grid");
    const descSection = Array.from(document.querySelectorAll("h2.koc-sec-title")).find(
      (h) => /视频简介/.test(h.textContent || "")
    );
    const descPanel = descSection ? descSection.nextElementSibling : null;
    const tagsSection = Array.from(document.querySelectorAll("h2.koc-sec-title")).find(
      (h) => /标签矩阵/.test(h.textContent || "")
    );
    // tagsSection -> sec-sub -> panel; we walk two siblings.
    const tagsPanel = tagsSection ? tagsSection.nextElementSibling.nextElementSibling : null;

    // ---- 自动带入：进页面时检测 sessionStorage ----
    try {
      const cached = sessionStorage.getItem(SEO_SS_KEY);
      if (cached && cached.length >= 20) {
        textarea.value = cached;
        KOCApi.showToast("已从拆解工坊带入脚本（" + cached.length + " 字）", "success");
        // 一次性消费 key，避免下次再访问还重复 toast；用户如需再带入可点按钮
        sessionStorage.removeItem(SEO_SS_KEY);
      }
    } catch (_) {}

    // ---- 「从拆解工坊带入」按钮 ----
    if (bringInBtn) {
      bringInBtn.addEventListener("click", () => {
        try {
          const cached = sessionStorage.getItem(SEO_SS_KEY);
          if (cached && cached.length >= 20) {
            textarea.value = cached;
            sessionStorage.removeItem(SEO_SS_KEY);
            KOCApi.showToast("已带入脚本（" + cached.length + " 字）", "success");
            return;
          }
        } catch (_) {}
        // 没有缓存：去工作台找个已保存的脚本项目；都没有就引导去生成
        const scripts =
          (window.KOCHistory && typeof window.KOCHistory.listScripts === "function")
            ? window.KOCHistory.listScripts()
            : [];
        if (scripts.length === 0) {
          KOCApi.showToast(
            "本地还没有可用的脚本，请先去『爆款拆解』完成 4 步流程。",
            "error"
          );
          return;
        }
        // 用最新的一条
        const latest = scripts[0];
        if (latest && latest.script && latest.script.full_text) {
          textarea.value = latest.script.full_text;
          KOCApi.showToast("已带入最近的脚本项目（" + latest.script.full_text.length + " 字）", "success");
        } else {
          KOCApi.showToast("最近的脚本记录缺少 full_text，无法带入。", "error");
        }
      });
    }

    // 生成主流程：把渲染后的输出连同操作按钮一起绑定
    async function runGenerate() {
      const script = (textarea.value || "").trim();
      if (script.length < 20) {
        KOCApi.showToast("脚本至少 20 字。", "error");
        return;
      }
      // 当前版本只支持单一平台（去掉了多平台 tab）。后端 SEORequest.platform 字段
      // 名仍保留 "douyin" 这个 token 是历史 schema 兼容（旧前端发请求不会被 422
      // 拦），但用户可见文案统一表述为「短视频平台」。
      const body = { script: script, platform: "douyin" };

      KOCApi.setLoading(generateBtn, true, "生成中…");
      if (titlesContainer) setBusy(titlesContainer, "AI 正在按短视频平台算法生成标题…");
      try {
        const resp = await KOCApi.postJSON("/api/seo/titles", body);
        renderSeoTitles(titlesContainer, resp.titles || []);
        renderSeoDescription(descPanel, resp.description || "");
        renderSeoTags(tagsPanel, resp.tags || {});
        // 输出区按钮在每次生成后会被 innerHTML 重写，重新绑定一次
        bindSeoOutputActions(descPanel, tagsPanel, runGenerate);
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
    }
    generateBtn.addEventListener("click", runGenerate);

    // 首屏（demo 静态内容）也把按钮绑定起来——用户即使没生成也能体验复制
    bindSeoOutputActions(descPanel, tagsPanel, runGenerate);
  }

  /** 把简介区 / 标签区 / 已渲染的标题卡上的按钮绑定起来。重复绑定通过 dataset 锁防止。 */
  function bindSeoOutputActions(descPanel, tagsPanel, runGenerate) {
    // 「采用」= 复制该标题文本
    document.querySelectorAll(".koc-output-card").forEach((card) => {
      const btn = card.querySelector("button");
      if (!btn || btn.dataset.kocSeoBound === "1") return;
      btn.dataset.kocSeoBound = "1";
      btn.addEventListener("click", async () => {
        const txtEl = card.querySelector(".koc-output-card__text");
        const text = (txtEl && txtEl.textContent ? txtEl.textContent : "").trim();
        if (!text) return;
        await copyToClipboard(text);
        KOCApi.showToast("已复制：" + text.slice(0, 24) + (text.length > 24 ? "…" : ""), "success");
      });
    });

    // 「复制简介」/「换一版」
    if (descPanel) {
      descPanel.querySelectorAll("button").forEach((btn) => {
        if (btn.dataset.kocSeoBound === "1") return;
        btn.dataset.kocSeoBound = "1";
        const label = (btn.textContent || "").trim();
        btn.addEventListener("click", async () => {
          if (/复制简介/.test(label)) {
            const p = descPanel.querySelector("p");
            const text = (p && p.textContent ? p.textContent : "").trim();
            if (!text) {
              KOCApi.showToast("还没有简介内容可复制。", "error");
              return;
            }
            await copyToClipboard(text);
            KOCApi.showToast("已复制简介（" + text.length + " 字）", "success");
          } else if (/换一版/.test(label)) {
            // 重跑一次主生成（DeepSeek 每次输出会有变化，足以"换一版"）
            KOCApi.showToast("正在重新生成…", "info");
            runGenerate();
          }
        });
      });
    }

    // 「一键复制全部标签」
    if (tagsPanel) {
      tagsPanel.querySelectorAll("button").forEach((btn) => {
        if (btn.dataset.kocSeoBound === "1") return;
        btn.dataset.kocSeoBound = "1";
        const label = (btn.textContent || "").trim();
        if (!/一键复制全部标签|复制全部标签/.test(label)) return;
        btn.addEventListener("click", async () => {
          const tags = Array.from(tagsPanel.querySelectorAll(".koc-tag")).map((t) =>
            (t.textContent || "").trim()
          ).filter(Boolean);
          if (tags.length === 0) {
            KOCApi.showToast("当前还没有标签可复制。", "error");
            return;
          }
          const text = tags.join(" ");
          await copyToClipboard(text);
          KOCApi.showToast("已复制 " + tags.length + " 个标签", "success");
        });
      });
    }
  }

  /** 复制工具：优先用现代 Clipboard API；fallback 到 textarea + execCommand。 */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) { /* fall through */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
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
    bindCopyScript();
    bindUploader();
    bindInputTabs();

    // Step 0 必须在 bindSkeletonForm 之前 bind —— 后者在拆解前会读
    // KOCActivePersona.getHint() 把人设上下文塞进 /api/skeleton/extract 请求体。
    KOCActivePersona.bind();

    bindPersonaForm();
    bindSkeletonForm();
    bindSeoForm();
    bindCommentsForm();
  });
})();
