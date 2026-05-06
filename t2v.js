/**
 * KOCopilot — Text-to-Video page (feature-5.html) interactions.
 *
 * Single Responsibility: only feature-5 page lives here. Why a separate file?
 *   - interactions.js is already 1450+ lines covering 6 modules; adding T2V
 *     state-machine logic (poll loop, stage switcher) would push it past 2k.
 *   - T2V interaction is the only place that needs a polling loop — keeping it
 *     localized makes the contract clear: this module owns *one* page.
 *
 * Stages (single source of truth for what's visible at any moment):
 *   "input"   → form for prompt / size / quality
 *   "loading" → task submitted, polling status
 *   "result"  → success, <video> + download
 *   "error"   → failure, retry button
 *
 * Polling design rationale:
 *   - 5s interval: CogVideoX P50 ≈ 30s, P95 ≈ 90s; polling more often wastes
 *     calls without lowering perceived latency.
 *   - 8 minute hard timeout: even a queued job in peak hours rarely exceeds
 *     this; if it does, the user can manually re-query later via task_id.
 *   - Single-flight: only one in-progress task per page (state.taskId). Users
 *     who want a second take must wait for the first or hit "重新生成".
 */
(function () {
  "use strict";

  // ---- Constants (per project rule: no magic numbers) ----
  const POLL_INTERVAL_MS = 5000;
  const POLL_HARD_TIMEOUT_MS = 8 * 60 * 1000; // 8 minutes
  const MAX_PROMPT_CHARS = 500; // mirrors backend t2v_max_prompt_chars
  const SS_KEY_LAST_SCRIPT = "koc.lastScriptForT2V";
  const ELAPSED_TICK_MS = 1000;
  const VISUAL_HINT_TAKE = 2; // how many scenes' visual hints to merge into auto prompt

  // ---- Page-level state ----
  const state = {
    taskId: null,
    pollAbort: null,
    elapsedTimerId: null,
    startedAt: 0,
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function showStage(name) {
    document.querySelectorAll("[data-koc-stage]").forEach((el) => {
      el.hidden = el.dataset.kocStage !== name;
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ============================================================================
  // Prompt seeding — default: original script `full_text` (same as「复制纯文本」).
  // Zhipu prompt hard cap = MAX_PROMPT_CHARS (500) — long scripts are head-truncated.
  // Legacy session payloads without `full_text` fall back to scene visuals + hook.
  // ============================================================================
  function buildPromptFromScript(scriptObj) {
    const out = { text: "", truncated: false };
    if (!scriptObj || typeof scriptObj !== "object") return out;

    const full = typeof scriptObj.full_text === "string" ? scriptObj.full_text.trim() : "";
    if (full) {
      out.truncated = full.length > MAX_PROMPT_CHARS;
      out.text = full.slice(0, MAX_PROMPT_CHARS);
      return out;
    }

    const scenes = Array.isArray(scriptObj.scenes) ? scriptObj.scenes : [];
    const visuals = scenes
      .map((s) => (s && typeof s.visual === "string") ? s.visual.trim() : "")
      .filter(Boolean)
      .slice(0, VISUAL_HINT_TAKE);
    if (visuals.length) {
      const joined = visuals.join("，");
      out.truncated = joined.length > MAX_PROMPT_CHARS;
      out.text = joined.slice(0, MAX_PROMPT_CHARS);
      return out;
    }
    const hook = typeof scriptObj.hook_narration === "string" ? scriptObj.hook_narration.trim() : "";
    out.truncated = hook.length > MAX_PROMPT_CHARS;
    out.text = hook.slice(0, MAX_PROMPT_CHARS);
    return out;
  }

  function readScriptFromSession() {
    try {
      const raw = sessionStorage.getItem(SS_KEY_LAST_SCRIPT);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ============================================================================
  // Form bindings (input stage)
  // ============================================================================
  function bindPromptForm() {
    const ta = $("#t2v-prompt");
    const counter = document.querySelector("[data-koc-prompt-counter]");
    const importBtn = document.querySelector('[data-koc-action="import-script"]');
    if (!ta) return;

    function updateCount() {
      const len = ta.value.length;
      if (!counter) return;
      counter.textContent = len + " / " + MAX_PROMPT_CHARS;
      counter.style.color = len > MAX_PROMPT_CHARS ? "var(--danger, #c0392b)" : "";
    }
    ta.addEventListener("input", updateCount);

    if (importBtn) {
      importBtn.addEventListener("click", () => {
        const obj = readScriptFromSession();
        if (!obj) {
          KOCApi.showToast(
            "没有可带入的脚本——请先在「爆款拆解」完成第 4 步生成原创脚本。",
            "error"
          );
          return;
        }
        const result = buildPromptFromScript(obj);
        ta.value = result.text;
        updateCount();
        if (result.truncated) {
          KOCApi.showToast(
            "原创脚本超过 " + MAX_PROMPT_CHARS + " 字，已截取前 " + MAX_PROMPT_CHARS + " 字作为视频提示词。",
            "info"
          );
        } else {
          KOCApi.showToast("已载入原创脚本全文作为提示词。", "success");
        }
      });
    }

    // Initial autofill: empty textarea + session payload → fill from script full_text.
    if (!ta.value) {
      const obj = readScriptFromSession();
      if (obj) {
        const result = buildPromptFromScript(obj);
        ta.value = result.text;
        if (result.truncated) {
          KOCApi.showToast(
            "原创脚本超过 " + MAX_PROMPT_CHARS + " 字，已截取前 " + MAX_PROMPT_CHARS + " 字作为视频提示词。",
            "info"
          );
        }
      }
    }
    updateCount();
  }

  // ============================================================================
  // Submit + Poll
  // ============================================================================
  async function startGenerate(submitBtn) {
    const ta = $("#t2v-prompt");
    const sizeSel = $("#t2v-size");
    const qualitySel = $("#t2v-quality");
    const audioCb = $("#t2v-with-audio");

    const prompt = (ta && ta.value || "").trim();
    if (!prompt) {
      KOCApi.showToast("请填写视频提示词。", "error");
      if (ta) ta.focus();
      return;
    }
    if (prompt.length < 4) {
      KOCApi.showToast("提示词太短（建议 ≥ 20 字）。", "error");
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      KOCApi.showToast(
        "提示词过长（" + prompt.length + " 字 > 上限 " + MAX_PROMPT_CHARS + " 字）",
        "error"
      );
      return;
    }

    showStage("loading");
    state.startedAt = Date.now();
    startElapsedTicker();
    KOCApi.setLoading(submitBtn, true, "提交中…");

    let submitResp;
    try {
      submitResp = await KOCApi.postJSON("/api/t2v/submit", {
        prompt: prompt,
        size: sizeSel ? sizeSel.value : "720x1280",
        quality: qualitySel ? qualitySel.value : "speed",
        with_audio: audioCb ? audioCb.checked : false,
      });
    } catch (e) {
      stopElapsedTicker();
      showError(e.message || "提交失败，请重试。");
      KOCApi.setLoading(submitBtn, false);
      return;
    }
    KOCApi.setLoading(submitBtn, false);

    state.taskId = submitResp.task_id;
    const idEl = document.querySelector("[data-koc-task-id]");
    const providerEl = document.querySelector("[data-koc-provider]");
    if (idEl) idEl.textContent = submitResp.task_id;
    if (providerEl) providerEl.textContent = submitResp.provider;
    KOCApi.showToast("任务已提交（" + submitResp.provider + "），正在生成…", "info");

    pollUntilDone();
  }

  async function pollUntilDone() {
    const taskId = state.taskId;
    if (!taskId) return;
    const path = "/api/t2v/query/" + encodeURIComponent(taskId);
    const deadline = Date.now() + POLL_HARD_TIMEOUT_MS;

    while (Date.now() < deadline) {
      // Single-task in-flight: if user hit "重新生成" mid-poll, taskId got nulled.
      if (state.taskId !== taskId) return;

      let resp;
      try {
        const r = await fetch(path, { cache: "no-store" });
        resp = await r.json();
        if (!r.ok) {
          throw new Error(resp && (resp.detail || resp.message) || ("HTTP " + r.status));
        }
      } catch (e) {
        // Transient error: log + sleep + retry. Don't fail the whole poll on a
        // single network hiccup — that would frustrate users on flaky networks.
        // After 3 consecutive errors we give up so we don't loop forever
        // against a permanently-broken endpoint.
        state._consecutiveErrors = (state._consecutiveErrors || 0) + 1;
        if (state._consecutiveErrors >= 3) {
          stopElapsedTicker();
          showError("查询多次失败：" + (e.message || "网络异常") + "。请稍后重试。");
          return;
        }
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      state._consecutiveErrors = 0;

      if (resp.status === "succeeded") {
        stopElapsedTicker();
        renderResult(resp);
        return;
      }
      if (resp.status === "failed") {
        stopElapsedTicker();
        showError(resp.fail_reason || "上游模型返回失败状态，未提供具体原因。");
        return;
      }
      // pending → continue polling
      await sleep(POLL_INTERVAL_MS);
    }

    // Hard timeout
    stopElapsedTicker();
    showError(
      "已等待 8 分钟仍未完成——任务可能在排队。task_id：" +
        taskId +
        "（你可以稍后用「查询任务」按钮重试或刷新本页）。"
    );
  }

  // ============================================================================
  // Result / Error rendering
  // ============================================================================
  function renderResult(resp) {
    showStage("result");
    const video = $("#t2v-result-video");
    const dl = document.querySelector('[data-koc-action="download-video"]');
    const taskIdEl = document.querySelector("[data-koc-result-task-id]");
    const promptEl = document.querySelector("[data-koc-result-prompt]");
    const usedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
    const durEl = document.querySelector("[data-koc-result-duration]");

    if (video && resp.video_url) {
      video.src = resp.video_url;
      if (resp.cover_image_url) video.poster = resp.cover_image_url;
    }
    if (dl && resp.video_url) {
      dl.href = resp.video_url;
      dl.download = "kocopilot-" + (resp.task_id || "video") + ".mp4";
      dl.style.display = "inline-block";
    }
    if (taskIdEl) taskIdEl.textContent = resp.task_id || "-";
    if (promptEl) {
      const promptVal = ($("#t2v-prompt") && $("#t2v-prompt").value) || "";
      promptEl.textContent = promptVal;
    }
    if (durEl) durEl.textContent = usedSeconds + " 秒";

    KOCApi.showToast("视频生成完成 · 用时 " + usedSeconds + " 秒", "success");
  }

  function showError(msg) {
    showStage("error");
    const errEl = document.querySelector("[data-koc-error]");
    if (errEl) errEl.textContent = msg;
    KOCApi.showToast(msg.length > 80 ? msg.slice(0, 80) + "…" : msg, "error");
  }

  // ============================================================================
  // Elapsed ticker (visual feedback during long polls)
  // ============================================================================
  function startElapsedTicker() {
    state.elapsedTimerId = setInterval(() => {
      const el = document.querySelector("[data-koc-elapsed]");
      if (!el) return;
      el.textContent = Math.round((Date.now() - state.startedAt) / 1000) + "s";
    }, ELAPSED_TICK_MS);
  }

  function stopElapsedTicker() {
    if (state.elapsedTimerId) {
      clearInterval(state.elapsedTimerId);
      state.elapsedTimerId = null;
    }
  }

  // ============================================================================
  // Event bindings
  // ============================================================================
  function bindGenerate() {
    const btn = document.querySelector('[data-koc-action="start-generate"]');
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      startGenerate(btn);
    });
  }

  function bindRegenerate() {
    document.querySelectorAll('[data-koc-action="regenerate"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        // Cancel any in-flight poll by null'ing taskId — pollUntilDone checks
        // `state.taskId !== taskId` and exits cleanly.
        state.taskId = null;
        state._consecutiveErrors = 0;
        stopElapsedTicker();
        showStage("input");
      });
    });
  }

  // ============================================================================
  // Boot
  // ============================================================================
  document.addEventListener("DOMContentLoaded", () => {
    bindPromptForm();
    bindGenerate();
    bindRegenerate();
    showStage("input");
  });
})();
