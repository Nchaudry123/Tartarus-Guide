const form = document.getElementById("chatForm");
const input = document.getElementById("questionInput");
const messages = document.getElementById("messages");
const categoryList = document.getElementById("categoryList");
const recentList = document.getElementById("recentList");
const menuToggle = document.getElementById("menuToggle");
const sidePanel = document.getElementById("sidePanel");
const clearChat = document.getElementById("clearChat");
const entranceScreen = document.getElementById("entranceScreen");
const enterApp = document.getElementById("enterApp");
const memorySummary = document.getElementById("memorySummary");
const appShell = document.querySelector(".app-shell");
const chatApiUrl = window.TARTARUS_API_URL || "/api/chat";
const sendButton = form?.querySelector('button[type="submit"]');
const chatHistoryKey = "tartarusChatHistoryV2";
const exactAnswerCacheKey = "tartarusExactAnswerCacheV1";
const playerProfileKey = "tartarusPlayerProfileV2";
const savedAnswersKey = "tartarusSavedAnswersV1";
const currentTaskKey = "tartarusCurrentTaskV1";
const defaultInputPlaceholder = input?.placeholder || "Ask anything about Persona 3 Reload...";
const maxQueuedQuestions = 5;
const maxCachedExactAnswers = 24;
const maxSavedAnswers = 30;
const exactAnswerCacheTtlMs = 1000 * 60 * 30;

const recent = [];
const chatHistory = loadChatHistory();
const exactAnswerCache = loadExactAnswerCache();
const savedAnswers = loadSavedAnswers();
let currentTask = loadCurrentTask();
let playerProfile = loadPlayerProfile();
let isSending = false;
let isProcessingQueue = false;
let activeRequestController = null;
let activeQuestion = "";
let queuedQuestionId = 0;
const chatQueue = [];
let inputHintTimer = null;
let streamTokenBuffer = "";
let streamFlushTimer = null;
let chatScrollTimer = null;
let dashboardRefreshTimer = null;
let scrollFrame = 0;

const latestButton = document.createElement("button");
latestButton.type = "button";
latestButton.className = "jump-to-latest";
latestButton.setAttribute("aria-label", "Jump to the latest message");
latestButton.innerHTML = `<span>Latest</span><strong aria-hidden="true">↓</strong>`;
messages.parentElement?.appendChild(latestButton);
const currentTaskCard = document.createElement("aside");
currentTaskCard.className = "current-task-card";
currentTaskCard.setAttribute("aria-live", "polite");
currentTaskCard.setAttribute("aria-label", "Current conversation task");
messages.parentElement?.insertBefore(currentTaskCard, messages);
let dashboardRefreshController = null;

let apiAvailable = false;
let autoStickToBottom = true;
let stableMobileHeight = window.innerHeight;

function syncDeviceLayout() {
  const isMobile =
    window.matchMedia("(max-width: 760px)").matches ||
    (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900);
  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportOffsetTop = viewport?.offsetTop || 0;
  const keyboardOffset = isMobile
    ? Math.max(0, window.innerHeight - viewportHeight - viewportOffsetTop)
    : 0;
  const keyboardOpen = isMobile && document.activeElement === input && keyboardOffset > 120;

  if (isMobile && !keyboardOpen) {
    stableMobileHeight = window.innerHeight;
  }

  document.documentElement.classList.toggle("is-mobile", isMobile);
  document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
  const appHeight = keyboardOpen ? viewportHeight : isMobile ? stableMobileHeight : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${appHeight}px`);
  document.documentElement.style.setProperty("--keyboard-offset", `${keyboardOffset}px`);

  if (isMobile) window.scrollTo(0, 0);
}

syncDeviceLayout();
window.addEventListener("resize", syncDeviceLayout);
window.visualViewport?.addEventListener("resize", syncDeviceLayout);
window.visualViewport?.addEventListener("scroll", syncDeviceLayout);
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => {
    stableMobileHeight = window.innerHeight;
    syncDeviceLayout();
  }, 260);
});

function loadPlayerProfile() {
  try {
    const saved =
      window.localStorage.getItem(playerProfileKey) ||
      window.sessionStorage.getItem("tartarusPlayerProfile") ||
      "{}";
    const profile = JSON.parse(saved);
    return cleanProfile({
      ...profile,
      activeParty: cleanCombatParty(profile.activeParty),
    });
  } catch {
    return {};
  }
}

function loadChatHistory() {
  try {
    const history = JSON.parse(window.sessionStorage.getItem(chatHistoryKey) || "[]");
    return Array.isArray(history)
      ? history
          .filter(
            (message) =>
              message &&
              (message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string" &&
              message.content.trim(),
          )
          .slice(-24)
      : [];
  } catch {
    return [];
  }
}

function loadExactAnswerCache() {
  try {
    const entries = JSON.parse(window.sessionStorage.getItem(exactAnswerCacheKey) || "[]");
    const now = Date.now();
    return Array.isArray(entries)
      ? entries.filter(
          (entry) =>
            entry &&
            typeof entry.key === "string" &&
            entry.response &&
            now - Number(entry.createdAt || 0) < exactAnswerCacheTtlMs,
        )
      : [];
  } catch {
    return [];
  }
}

function loadSavedAnswers() {
  try {
    const entries = JSON.parse(window.localStorage.getItem(savedAnswersKey) || "[]");
    return Array.isArray(entries)
      ? entries
          .filter(
            (entry) =>
              entry &&
              typeof entry.id === "string" &&
              typeof entry.question === "string" &&
              typeof entry.answer === "string",
          )
          .slice(0, maxSavedAnswers)
      : [];
  } catch {
    return [];
  }
}

function loadCurrentTask() {
  try {
    const task = JSON.parse(window.sessionStorage.getItem(currentTaskKey) || "null");
    return task && typeof task.title === "string" ? task : null;
  } catch {
    return null;
  }
}

function saveChatHistory() {
  window.sessionStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));
}

function saveExactAnswerCache() {
  try {
    window.sessionStorage.setItem(exactAnswerCacheKey, JSON.stringify(exactAnswerCache.slice(-maxCachedExactAnswers)));
  } catch {
    // Session storage can be unavailable in private browsing; caching is optional.
  }
}

function saveSavedAnswers() {
  try {
    window.localStorage.setItem(savedAnswersKey, JSON.stringify(savedAnswers.slice(0, maxSavedAnswers)));
  } catch {
    showInputHint("Recent chats are unavailable in this browser.");
  }
}

function saveCurrentTask() {
  try {
    if (currentTask) window.sessionStorage.setItem(currentTaskKey, JSON.stringify(currentTask));
    else window.sessionStorage.removeItem(currentTaskKey);
  } catch {
    // Current-task UI is a convenience layer; ignore storage failures.
  }
}

function savePlayerProfile(options = {}) {
  window.localStorage.setItem(playerProfileKey, JSON.stringify(playerProfile));
  window.sessionStorage.removeItem("tartarusPlayerProfile");
  renderMemorySummary();
  if (options.refreshDashboard) scheduleDashboardRefresh();
}

function taskTargetFromQuestion(question) {
  const text = String(question || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:how\s+(?:do|can)\s+i\s+)?(?:fuse|make|create)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z0-9' -]{1,36})(?=[?.!,]|$)/i,
    /\b(?:possible\s+)?(?:fusions?|recipes?|routes?)\s+(?:for|to)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z0-9' -]{1,36})(?=[?.!,]|$)/i,
    /\b(?:beat|fight|defeat|prepare for)\s+(?:the\s+)?([a-z][a-z0-9' -]{2,36})(?=[?.!,]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]?.trim();
    if (match) return titleizeTaskText(match);
  }
  return "";
}

function titleizeTaskText(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

function dlcTaskLabel(dlcMode = playerProfile.dlcOwnership) {
  if (dlcMode === "all") return "DLC enabled";
  if (dlcMode === "none") return "No DLC";
  return "DLC not set";
}

function taskFromQuestion(question, status = "Working") {
  const text = String(question || "").toLowerCase();
  const target = taskTargetFromQuestion(question);
  if (/\b(fuse|fusion|recipe|recipes|routes?|make|create)\b/.test(text)) {
    return {
      type: "fusion",
      title: target ? `Fusing ${target}` : "Fusion route",
      status,
      meta: [dlcTaskLabel(), "Checking recipes"].filter(Boolean),
    };
  }
  if (/\bwhat should i do today|what do i do today|today|schedule|priorit/i.test(text)) {
    return {
      type: "dashboard",
      title: "Planning today",
      status,
      meta: [playerProfile.currentDate || playerProfile.currentMonth || "Player Memory", "Priorities"].filter(Boolean),
    };
  }
  if (/\b(best|recommend|should i use|which)\b/.test(text)) {
    return {
      type: "recommendation",
      title: target ? `Choosing ${target}` : "Choosing a recommendation",
      status,
      meta: [playerProfile.currentLevel ? `Lv ${playerProfile.currentLevel}` : "", playerProfile.playstyle].filter(Boolean),
    };
  }
  if (/\b(weak|weakness|resist|null|drain|repel)\b/.test(text)) {
    return {
      type: "exact",
      title: target ? `Checking ${target}` : "Checking exact facts",
      status,
      meta: ["Guide-backed", "Exact answer"].filter(Boolean),
    };
  }
  return {
    type: "general",
    title: compactTitle(question, 42) || "Guide conversation",
    status,
    meta: ["Conversation"].filter(Boolean),
  };
}

function taskFromResponse(question, response) {
  if (response?.fusionWorkshop?.target) {
    const needsIngredients = (response.fusionWorkshop.recipes || []).some((recipe) => !recipe.ready);
    return {
      type: "fusion",
      title: `Fusing ${response.fusionWorkshop.target}`,
      status: needsIngredients ? "Need ingredients" : "Ready route found",
      meta: [dlcTaskLabel(response.fusionWorkshop.dlcMode), `${response.fusionWorkshop.recipes.length} route${response.fusionWorkshop.recipes.length === 1 ? "" : "s"}`],
    };
  }
  if (response?.dailyDashboard?.date) {
    const urgent = (response.dailyDashboard.items || []).filter((item) => item.priority === "urgent").length;
    return {
      type: "dashboard",
      title: "Planning today",
      status: urgent ? `${urgent} urgent` : "Priorities ready",
      meta: [response.dailyDashboard.date, response.dailyDashboard.weekday].filter(Boolean),
    };
  }
  if (response?.recommendation?.primary?.name) {
    return {
      type: "recommendation",
      title: response.recommendation.title || "Choosing a recommendation",
      status: response.recommendation.primary.name,
      meta: ["Navigator pick", response.recommendation.nextStep ? "Next move ready" : ""].filter(Boolean),
    };
  }
  const missing = response?.missing && !/no additional detail/i.test(response.missing);
  const fallback = taskFromQuestion(question, missing ? "Needs detail" : "Answered");
  return {
    ...fallback,
    status: missing ? "Needs detail" : "Answered",
    meta: missing ? [...fallback.meta.slice(0, 1), "One more detail"] : fallback.meta,
  };
}

function setCurrentTask(task) {
  currentTask = task;
  saveCurrentTask();
  renderCurrentTask();
}

function clearCurrentTask() {
  currentTask = null;
  saveCurrentTask();
  renderCurrentTask();
}

function renderCurrentTask() {
  if (!currentTaskCard) return;
  if (!currentTask?.title) {
    currentTaskCard.classList.remove("is-visible");
    currentTaskCard.innerHTML = "";
    return;
  }
  const meta = (currentTask.meta || [])
    .filter(Boolean)
    .slice(0, 3)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
  currentTaskCard.className = `current-task-card is-visible task-${escapeHtml(currentTask.type || "general")}`;
  currentTaskCard.innerHTML = `
    <div>
      <small>Current Task</small>
      <strong>${escapeHtml(currentTask.title)}</strong>
    </div>
    <p>${escapeHtml(currentTask.status || "Working")}</p>
    ${meta ? `<footer>${meta}</footer>` : ""}
  `;
}

function rememberTurn(role, content) {
  chatHistory.push({ role, content });
  chatHistory.splice(0, Math.max(0, chatHistory.length - 24));
  saveChatHistory();
}

function makeId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function compactTitle(value, maxLength = 58) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function formatSavedDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Recent";
  }
}

function normalizeResponseForSave(response) {
  return {
    answer: response.answer || "",
    sections: response.sections || [],
    table: response.table || null,
    bossPrep: response.bossPrep || null,
    fusionWorkshop: response.fusionWorkshop || null,
    dailyDashboard: response.dailyDashboard || null,
    recommendation: response.recommendation || null,
    missing: response.missing,
    confidence: response.confidence,
    retrievalMode: response.retrievalMode || "rag",
    companion: response.companion
      ? { suggestedPrompts: response.companion.suggestedPrompts || [] }
      : undefined,
    sources: response.sources || [],
  };
}

function renderRecentAnswers() {
  if (!recentList) return;
  if (!savedAnswers.length) {
    recentList.innerHTML = "<p>Recent chats stay saved on this device.</p>";
    return;
  }
  recentList.innerHTML = savedAnswers
    .slice(0, 6)
    .map(
      (item) => `
        <article class="recent-item">
          <button type="button" data-open-recent="${escapeHtml(item.id)}">
            <strong>${escapeHtml(compactTitle(item.question))}</strong>
            <span>${escapeHtml(formatSavedDate(item.savedAt))}</span>
          </button>
        </article>
      `,
    )
    .join("");
}

function saveAnswerSnapshot(payload) {
  if (!payload?.question || !payload.response?.answer) return null;
  const normalizedQuestion = normalizeQueuedQuestion(payload.question);
  const existingIndex = savedAnswers.findIndex((item) => normalizeQueuedQuestion(item.question) === normalizedQuestion);
  const saved = {
    id: existingIndex >= 0 ? savedAnswers[existingIndex].id : makeId("saved"),
    question: payload.question,
    answer: payload.response.answer,
    response: normalizeResponseForSave(payload.response),
    savedAt: new Date().toISOString(),
  };
  if (existingIndex >= 0) savedAnswers.splice(existingIndex, 1);
  savedAnswers.unshift(saved);
  savedAnswers.splice(maxSavedAnswers);
  saveSavedAnswers();
  renderRecentAnswers();
  return saved;
}

async function openSavedAnswer(id) {
  const saved = savedAnswers.find((item) => item.id === id);
  if (!saved) return;
  clearEmpty();
  addUserMessage(saved.question);
  await addAssistantMessage(saved.response, {
    question: saved.question,
    skipRemember: true,
  });
  setMenu(false);
}

function buildPackedHistory() {
  return chatHistory
    .filter((message) => message?.content?.trim() && (message.role === "user" || message.role === "assistant"))
    .slice(-24);
}

function mergeProfileUpdates(updates, options = {}) {
  if (!updates || typeof updates !== "object") return;
  const before = JSON.stringify(playerProfile);
  const mergedSocialStats = cleanProfile({
    ...(playerProfile.socialStats || {}),
    ...(updates.socialStats || {}),
  });
  playerProfile = cleanProfile({
    ...playerProfile,
    ...updates,
    activeParty: cleanCombatParty(
      Array.isArray(updates.activeParty) && updates.activeParty.length
        ? updates.activeParty
        : playerProfile.activeParty,
    ),
    currentSocialLinks:
      Array.isArray(updates.currentSocialLinks) && updates.currentSocialLinks.length
        ? [...new Set(updates.currentSocialLinks)]
        : playerProfile.currentSocialLinks,
    activeRequests:
      Array.isArray(updates.activeRequests) && updates.activeRequests.length
        ? [...new Set(updates.activeRequests)]
        : playerProfile.activeRequests,
    ownedPersonas:
      Array.isArray(updates.ownedPersonas) && updates.ownedPersonas.length
        ? [...new Set([...(playerProfile.ownedPersonas || []), ...updates.ownedPersonas])].slice(0, 24)
        : playerProfile.ownedPersonas,
    socialStats: Object.keys(mergedSocialStats).length ? mergedSocialStats : undefined,
  });
  savePlayerProfile({
    refreshDashboard:
      options.refreshDashboard && before !== JSON.stringify(playerProfile),
  });
}

function cleanCombatParty(members) {
  const allowed = new Map(
    ["Yukari", "Junpei", "Akihiko", "Mitsuru", "Aigis", "Koromaru", "Ken", "Shinjiro"]
      .map((name) => [name.toLowerCase(), name]),
  );
  const cleaned = [...new Set(
    (Array.isArray(members) ? members : [])
      .map((name) => allowed.get(String(name).trim().toLowerCase()))
      .filter(Boolean),
  )].slice(0, 3);
  return cleaned.length ? cleaned : undefined;
}

function cleanProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile || {}).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const items = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
        return items.length ? [[key, items]] : [];
      }
      if (value && typeof value === "object") {
        const nested = cleanProfile(value);
        return Object.keys(nested).length ? [[key, nested]] : [];
      }
      const text = value === undefined || value === null ? "" : String(value).trim();
      return text ? [[key, text]] : [];
    }),
  );
}

function renderMemorySummary() {
  if (!memorySummary) return;
  const tartarusProgress = [playerProfile.tartarusBlock, playerProfile.tartarusFloor].filter(Boolean).join(" ");
  const details = [
    playerProfile.currentDate,
    playerProfile.currentMonth,
    playerProfile.currentLevel ? `Lv ${playerProfile.currentLevel}` : "",
    playerProfile.difficulty,
    tartarusProgress,
    playerProfile.spoilerPreference === "open"
      ? "Spoilers open"
      : playerProfile.spoilerPreference === "progress-aware"
        ? "Progress-aware"
        : "Spoiler-safe",
    playerProfile.activeParty?.length ? playerProfile.activeParty.join(", ") : "",
    playerProfile.currentSocialLinks?.length
      ? `${playerProfile.currentSocialLinks.length} active link${playerProfile.currentSocialLinks.length === 1 ? "" : "s"}`
      : "",
    playerProfile.activeRequests?.length
      ? `${playerProfile.activeRequests.length} active request${playerProfile.activeRequests.length === 1 ? "" : "s"}`
      : "",
    playerProfile.dlcOwnership === "all"
      ? "Persona DLC on"
      : playerProfile.dlcOwnership === "none"
        ? "No Persona DLC"
        : "",
    playerProfile.currentGoal ? `Goal: ${playerProfile.currentGoal}` : "",
  ].filter(Boolean);
  memorySummary.textContent = details.length ? details.join(" · ") : "No profile saved";
}

function populateMemoryForm() {
  const memoryForm = document.getElementById("memoryForm");
  if (!memoryForm) return;
  const fields = memoryForm.elements;
  fields.currentMonth.value = playerProfile.currentMonth || "";
  fields.currentDate.value = playerProfile.currentDate || "";
  fields.currentLevel.value = playerProfile.currentLevel || "";
  fields.difficulty.value = playerProfile.difficulty || "";
  fields.playstyle.value = playerProfile.playstyle || "";
  fields.tartarusBlock.value = playerProfile.tartarusBlock || "";
  fields.tartarusFloor.value = playerProfile.tartarusFloor || "";
  fields.spoilerPreference.value = playerProfile.spoilerPreference || "strict";
  fields.activeParty.value = playerProfile.activeParty?.join(", ") || "";
  fields.ownedPersonas.value = playerProfile.ownedPersonas?.join(", ") || "";
  fields.currentSocialLinks.value = playerProfile.currentSocialLinks?.join(", ") || "";
  fields.activeRequests.value = playerProfile.activeRequests?.join(", ") || "";
  fields.dlcOwnership.value = playerProfile.dlcOwnership || "";
  fields.academics.value = playerProfile.socialStats?.academics || "";
  fields.charm.value = playerProfile.socialStats?.charm || "";
  fields.courage.value = playerProfile.socialStats?.courage || "";
  fields.currentGoal.value = playerProfile.currentGoal || "";
}

function openMemoryDialog() {
  const memoryDialog = document.getElementById("memoryDialog");
  if (!memoryDialog) return;
  populateMemoryForm();
  if (typeof memoryDialog.showModal === "function") memoryDialog.showModal();
  else memoryDialog.setAttribute("open", "");
}

function closeMemoryDialog() {
  const memoryDialog = document.getElementById("memoryDialog");
  if (!memoryDialog) return;
  if (typeof memoryDialog.close === "function") memoryDialog.close();
  else memoryDialog.removeAttribute("open");
}

renderMemorySummary();
renderRecentAnswers();
renderCurrentTask();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function promptLabel(prompt) {
  const text = String(prompt || "").trim();
  const normalized = text.toLowerCase();

  const compact = text.replace(/[?!.]+$/g, "").replace(/^(what|which|where|when|who|how|do you|are you|is it)\s+/i, "");
  return compact.length > 42 ? `${compact.slice(0, 39).trim()}...` : compact;
}

function renderText(value) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderBossPrepCard(card) {
  if (!card || !card.boss) return "";
  const rows = [
    ["Weakness", card.weakness],
    ["Avoid", card.avoid],
    ["Level", card.recommendedLevel],
    ["Party", card.party],
    ["Danger", card.danger],
    ["Plan", card.plan],
  ].filter(([, value]) => value);
  if (!rows.length) return "";
  return `
    <aside class="boss-prep-card" aria-label="${escapeHtml(card.boss)} boss prep card">
      <div class="boss-prep-head">
        <span>Boss Prep</span>
        <strong>${escapeHtml(card.boss)}</strong>
      </div>
      <dl>
        ${rows
          .map(
            ([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${escapeHtml(value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </aside>
  `;
}

function renderFusionWorkshop(workshop) {
  if (!workshop?.target || !Array.isArray(workshop.recipes) || !workshop.recipes.length) {
    return "";
  }
  const modeLabel = workshop.dlcMode === "all" ? "Persona DLC enabled" : "Base game";
  const recipes = workshop.recipes
    .slice(0, 2)
    .map((recipe, index) => {
      const ingredients = (recipe.ingredients || [])
        .map(
          (ingredient) => `
            <li class="${ingredient.owned ? "is-owned" : "is-missing"}">
              <span class="fusion-owned-mark" aria-hidden="true">${ingredient.owned ? "✓" : "!"}</span>
              <div>
                <strong>${escapeHtml(ingredient.name)}</strong>
                <small>${ingredient.owned ? "In Player Memory" : "Missing ingredient"}</small>
              </div>
              ${
                ingredient.owned
                  ? ""
                  : `<button type="button" data-prompt="How do I fuse ${escapeHtml(ingredient.name)}?">Build this first</button>`
              }
            </li>
          `,
        )
        .join("");
      const pair = (recipe.ingredients || []).map((ingredient) => ingredient.name).join(" and ");
      return `
        <article class="fusion-recipe-card ${recipe.ready ? "is-ready" : ""}">
          <header>
            <span>Route ${index + 1}</span>
            <strong>${recipe.ready ? "Ready to fuse" : recipe.special ? "Special fusion" : "Recipe"}</strong>
          </header>
          <ul>${ingredients}</ul>
          <button class="fusion-route-action" type="button" data-prompt="I have ${escapeHtml(pair)}">
            ${recipe.ready ? "Use this route" : "I have this pair"}
          </button>
        </article>
      `;
    })
    .join("");
  return `
    <aside class="fusion-workshop" aria-label="${escapeHtml(workshop.target)} fusion workshop">
      <div class="fusion-workshop-head">
        <div>
          <span>Fusion Workshop</span>
          <h3>${escapeHtml(workshop.target)}</h3>
        </div>
        <small>${escapeHtml(modeLabel)}</small>
      </div>
      <div class="fusion-recipe-grid">${recipes}</div>
    </aside>
  `;
}

function renderDailyDashboard(dashboard) {
  if (!dashboard?.date || !Array.isArray(dashboard.items) || !dashboard.items.length) {
    return "";
  }
  const priorityLabels = {
    urgent: "Do first",
    recommended: "Recommended",
    optional: "If time allows",
  };
  const items = dashboard.items
    .map(
      (item) => `
        <article class="daily-plan-item priority-${escapeHtml(item.priority || "optional")}">
          <header>
            <span>${escapeHtml(priorityLabels[item.priority] || "Plan")}</span>
            <small>${escapeHtml(item.category || "Activity")}</small>
          </header>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.detail)}</p>
          ${item.timing ? `<time>${escapeHtml(item.timing)}</time>` : ""}
        </article>
      `,
    )
    .join("");
  return `
    <aside class="daily-dashboard" aria-label="Game-day plan for ${escapeHtml(dashboard.date)}" aria-live="polite">
      <div class="daily-dashboard-head">
        <div>
          <span>Game-Day Dashboard</span>
          <h3>${escapeHtml(dashboard.weekday)}</h3>
        </div>
        <strong>${escapeHtml(dashboard.date)}</strong>
      </div>
      <div class="daily-plan-grid">${items}</div>
    </aside>
  `;
}

function renderRecommendationCard(recommendation) {
  if (!recommendation?.primary?.name || !recommendation.primary.reason) return "";
  const alternatives = (recommendation.alternatives || [])
    .slice(0, 2)
    .map(
      (alternative) => `
        <li>
          <strong>${escapeHtml(alternative.name)}</strong>
          <span>${escapeHtml(alternative.tradeoff)}</span>
        </li>
      `,
    )
    .join("");
  return `
    <aside class="recommendation-card" aria-label="${escapeHtml(recommendation.title || "Recommendation")}">
      <header>
        <span>Navigator Pick</span>
        <small>${escapeHtml(recommendation.title || "Recommendation")}</small>
      </header>
      <div class="recommendation-primary">
        <strong>${escapeHtml(recommendation.primary.name)}</strong>
        <p>${escapeHtml(recommendation.primary.reason)}</p>
      </div>
      ${alternatives ? `<ul>${alternatives}</ul>` : ""}
      ${recommendation.decidingFactor ? `<p class="recommendation-factor"><b>Deciding factor</b>${escapeHtml(recommendation.decidingFactor)}</p>` : ""}
      ${recommendation.nextStep ? `<p class="recommendation-next"><b>Next move</b>${escapeHtml(recommendation.nextStep)}</p>` : ""}
    </aside>
  `;
}

function needsMoreDetail(response) {
  return Boolean(
    response?.missing &&
      !/^(?:no additional detail is needed|no missing information reported)\.?$/i.test(String(response.missing).trim()),
  );
}

function renderAnswerStatus(response) {
  const hasSources = Array.isArray(response.sources) && response.sources.length > 0;
  const needsDetail = needsMoreDetail(response);
  const mode = response.retrievalMode || "mock";
  const status = needsDetail
    ? {
        tone: "needs-detail",
        label: "Needs One Detail",
        detail: response.missing,
      }
    : hasSources && mode === "rag"
      ? {
          tone: "verified",
          label: "Guide-Checked",
          detail: `${response.sources.length} trusted source${response.sources.length === 1 ? "" : "s"} used.`,
        }
      : mode === "error"
        ? {
            tone: "offline",
            label: "Connection Check",
            detail: "The guide connection dropped, but the conversation is still saved.",
          }
        : {
            tone: "draft",
            label: "Companion Note",
            detail: "Helpful guidance, with exact details checked when source support is available.",
          };
  return `
    <aside class="answer-status answer-status-${escapeHtml(status.tone)}" aria-label="${escapeHtml(status.label)}">
      <span>${escapeHtml(status.label)}</span>
      <p>${escapeHtml(status.detail)}</p>
    </aside>
  `;
}

function renderResponseExtras(response) {
  const sections = (response.sections || [])
    .map(([title, content]) => `<section><h3>${escapeHtml(title)}</h3>${renderText(content)}</section>`)
    .join("");
  const table = response.table?.length
    ? `<div class="table-wrap"><table><tbody>${response.table
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`
    : "";
  const sourceLinks = (response.sources || [])
    .map(
      (item) =>
        `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.domain)}</span></a>`,
    )
    .join("");
  const sourceFooter = sourceLinks
    ? `<details class="source-drawer">
        <summary><span>Sources</span><strong>${(response.sources || []).length}</strong></summary>
        <footer>${sourceLinks}</footer>
      </details>`
    : "";
  const prompts = (response.companion?.suggestedPrompts || [])
    .slice(0, 3)
    .map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}" title="${escapeHtml(prompt)}">${escapeHtml(promptLabel(prompt))}</button>`)
    .join("");
  return `
    ${renderAnswerStatus(response)}
    ${renderBossPrepCard(response.bossPrep)}
    ${renderFusionWorkshop(response.fusionWorkshop)}
    ${renderDailyDashboard(response.dailyDashboard)}
    ${renderRecommendationCard(response.recommendation)}
    ${sections ? `<div class="section-grid">${sections}</div>` : ""}
    ${table}
    ${sourceFooter}
    ${prompts ? `<div class="followups">${prompts}</div>` : ""}
  `;
}

function latestDashboardMessage() {
  return [...messages.querySelectorAll(".assistant-message")]
    .reverse()
    .find(
      (message) =>
        message.dataset.dashboardHost === "true" ||
        message.querySelector(".daily-dashboard"),
    );
}

async function requestDashboardRefresh(signal) {
  if (!apiAvailable) return null;
  const response = await fetch(chatApiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      question: "What should I do today?",
      history: buildPackedHistory(),
      playerProfile,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error("Dashboard refresh failed.");
  return normalizeApiResponse(await response.json());
}

async function refreshVisibleDashboard() {
  const message = latestDashboardMessage();
  if (!message) return;
  if (isSending) {
    scheduleDashboardRefresh(700);
    return;
  }

  dashboardRefreshController?.abort();
  const controller = new AbortController();
  dashboardRefreshController = controller;
  message.classList.add("is-dashboard-refreshing");
  message.setAttribute("aria-busy", "true");

  try {
    const response = await requestDashboardRefresh(controller.signal);
    if (!response || controller.signal.aborted) return;
    const answer = message.querySelector(".answer");
    const extra = message.querySelector(".message-extra");
    if (answer) answer.innerHTML = renderText(response.answer);
    if (extra) extra.innerHTML = renderResponseExtras(response);
    message.className = `message assistant-message mode-${escapeHtml(response.retrievalMode || "rag")} is-dashboard-updated`;
    message.removeAttribute("aria-busy");
    setCurrentTask(taskFromResponse("What should I do today?", response));
    saveAnswerSnapshot({
      question: "What should I do today?",
      response,
    });
    window.setTimeout(() => message.classList.remove("is-dashboard-updated"), 1100);
    scrollMessagesToBottom();
  } catch (error) {
    if (error?.name !== "AbortError") {
      showInputHint("Profile saved. Dashboard refresh will retry next change.");
    }
  } finally {
    if (dashboardRefreshController === controller) dashboardRefreshController = null;
    message.classList.remove("is-dashboard-refreshing");
    message.removeAttribute("aria-busy");
  }
}

function scheduleDashboardRefresh(delay = 180) {
  window.clearTimeout(dashboardRefreshTimer);
  dashboardRefreshTimer = window.setTimeout(() => {
    dashboardRefreshTimer = null;
    void refreshVisibleDashboard();
  }, delay);
}

function motionEnabled() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function typeText(node, value) {
  const text = String(value || "");
  if (!motionEnabled() || text.length > 1200) {
    node.textContent = text;
    scrollMessagesToBottom({ behavior: "auto" });
    return;
  }

  node.textContent = "";
  const chunkSize = text.length > 420 ? 4 : 2;
  for (let index = 0; index < text.length; index += chunkSize) {
    node.textContent += text.slice(index, index + chunkSize);
    if (index % 36 === 0) scrollMessagesToBottom({ behavior: "auto" });
    await new Promise((resolve) => window.setTimeout(resolve, 10));
  }
}

function mockAnswer(question) {
  const normalized = question.toLowerCase();
  if (normalized.includes("dancing hand") || normalized.includes("weak")) {
    return {
      answer: "Preview mode: the UI is ready, but live guide mode is not connected in this static page. The real answer will check exact weakness facts first, then confirm with trusted guide notes.",
      sections: [
        ["Battle Read", "Ask for an enemy by name and the backend will return weakness, resistances, location notes, and a short practical opener."],
        ["Player Advice", "Once weakness is confirmed, knock the shadow down, chain All-Out Attacks, and conserve SP if you are deep in Tartarus."],
      ],
      table: [["Dancing Hand", "Connect live guide mode to confirm", "Mock preview"]],
      missing: "Live guide facts are not connected in this static preview.",
      confidence: "42%",
      retrievalMode: "mock",
      sources: [
        {
          title: "Persona 3 Reload Guide Preview",
          domain: "local preview",
          url: "https://game8.co/games/Persona-3-Reload",
        },
      ],
    };
  }
  if (normalized.includes("priestess") || normalized.includes("boss")) {
    return {
      answer: "Boss answers will prioritize sourced mechanics and practical turn priorities. Unsupported party advice should be marked clearly.",
      sections: [
        ["Strategy Flow", "Identify the boss, pull supported mechanics, call out dangerous turns, then give a short step plan."],
        ["Party Check", "Recommended party cards appear only when the source directly supports them or when uncertainty is labeled."],
      ],
      missing: "Live boss facts are not active in this static preview.",
      confidence: "45%",
      retrievalMode: "mock",
      sources: [
        {
          title: "Persona 3 Reload Guide Preview",
          domain: "local preview",
          url: "https://game8.co/games/Persona-3-Reload",
        },
      ],
    };
  }
  if (normalized.includes("fusion") || normalized.includes("jack frost")) {
    return {
      answer: "Fusion help is wired as a first-class response type. The live guide should avoid guessing recipes unless a trusted fusion fact is available.",
      sections: [["Fusion Rule", "Exact recipes, skill inheritance, and unlock conditions should come from structured facts. If the guide index is missing them, the answer should say so."]],
      missing: "Live guide mode is not available in this preview.",
      confidence: "40%",
      retrievalMode: "mock",
      sources: [
        {
          title: "Persona 3 Reload Guide Preview",
          domain: "local preview",
          url: "https://game8.co/games/Persona-3-Reload",
        },
      ],
    };
  }
  return {
    answer: "This is the frontend preview for Tartarus Guide. The interface is ready for natural Persona 3 Reload questions; live guide answers will appear when the chat service is available.",
    sections: [
      ["What Works Now", "The chat UI, suggested prompts, loading state, source display, quick menu, and mock response format are in place."],
      ["Next Connection", "Start the Next chat service or use the deployed site for live source-backed answers."],
    ],
    missing: "Live retrieval is not enabled yet.",
    confidence: "50%",
    retrievalMode: "mock",
    sources: [
      {
        title: "Persona 3 Reload Guide Preview",
        domain: "local preview",
        url: "https://game8.co/games/Persona-3-Reload",
      },
    ],
  };
}

function addUserMessage(text, options = {}) {
  clearEmpty();
  const node = document.createElement("article");
  node.className = `message user-message${options.queued ? " is-queued" : ""}`;
  node.innerHTML = `
    <div class="bubble">
      <span class="message-text">${escapeHtml(text)}</span>
      <span class="queue-label">Queued</span>
    </div>
  `;
  messages.appendChild(node);
  autoStickToBottom = true;
  updateLatestButton();
  scrollMessagesToBottom({ force: true });
  return node;
}

function setUserMessageQueued(node, queued) {
  if (!node) return;
  node.classList.toggle("is-queued", queued);
  const label = node.querySelector(".queue-label");
  if (label) label.textContent = queued ? "Queued" : "";
}

function updateQueuedLabels() {
  chatQueue.forEach((item, index) => {
    const label = item.node?.querySelector(".queue-label");
    if (label) label.textContent = `Queued ${index + 1}/${chatQueue.length}`;
  });
}

function normalizeQueuedQuestion(question) {
  return String(question || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function exactAnswerCacheKeyFor(question) {
  return normalizeQueuedQuestion(question).replace(/[?!.]+$/g, "");
}

function isExactLookupQuestion(question) {
  const text = normalizeQueuedQuestion(question);
  return (
    /\b(?:weak to|weakness|weaknesses|resist|resists|null|drain|repel)\b/.test(text) ||
    /\b(?:classroom|quiz|exam|answer)\b/.test(text) ||
    /\b(?:elizabeth|request|pine resin|juzumaru|kouha)\b/.test(text)
  );
}

function getCachedExactAnswer(question) {
  if (!isExactLookupQuestion(question)) return null;
  const key = exactAnswerCacheKeyFor(question);
  const now = Date.now();
  const entry = exactAnswerCache.find((item) => item.key === key && now - item.createdAt < exactAnswerCacheTtlMs);
  if (!entry) return null;
  return {
    ...entry.response,
    companion: {
      ...(entry.response.companion || {}),
      suggestedPrompts: entry.response.companion?.suggestedPrompts || [],
    },
  };
}

function rememberExactAnswer(question, response) {
  if (!isExactLookupQuestion(question)) return;
  if (!response?.answer || response.retrievalMode === "error" || response.retrievalMode === "mock") return;
  if (!Array.isArray(response.sources) || response.sources.length === 0) return;
  const key = exactAnswerCacheKeyFor(question);
  const cachedResponse = {
    answer: response.answer,
    sections: response.sections || [],
    table: response.table || null,
    fusionWorkshop: response.fusionWorkshop || null,
    dailyDashboard: response.dailyDashboard || null,
    missing: response.missing,
    confidence: response.confidence,
    retrievalMode: response.retrievalMode,
    companion: response.companion
      ? { suggestedPrompts: response.companion.suggestedPrompts || [] }
      : undefined,
    sources: response.sources || [],
  };
  const existingIndex = exactAnswerCache.findIndex((entry) => entry.key === key);
  if (existingIndex >= 0) exactAnswerCache.splice(existingIndex, 1);
  exactAnswerCache.push({ key, createdAt: Date.now(), response: cachedResponse });
  exactAnswerCache.splice(0, Math.max(0, exactAnswerCache.length - maxCachedExactAnswers));
  saveExactAnswerCache();
}

function showInputHint(message) {
  if (!input) return;
  window.clearTimeout(inputHintTimer);
  input.placeholder = message;
  input.classList.add("has-input-hint");
  inputHintTimer = window.setTimeout(() => {
    input.placeholder = defaultInputPlaceholder;
    input.classList.remove("has-input-hint");
  }, 2200);
}

function addLoading() {
  const node = document.createElement("div");
  node.className = "loading";
  node.id = "loading";
  node.innerHTML = `
    <span class="assistant-avatar"><img src="./assets/sees-portrait-seal.png" alt="" /></span>
    <div class="bubble typing" role="status" aria-live="polite">
      <span class="loading-status">Understanding your question...</span>
      <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    </div>
  `;
  messages.appendChild(node);
  updateLatestButton();
  scrollMessagesToBottom({ force: true });
}

function updateLoadingStatus(message) {
  const status = document.querySelector("#loading .loading-status");
  if (!status || !message) return;
  status.textContent = message;
  scrollMessagesToBottom();
}

function ensureStreamingMessage() {
  document.getElementById("loading")?.remove();
  let node = document.getElementById("streamingAssistant");
  if (!node) {
    node = document.createElement("article");
    node.id = "streamingAssistant";
    node.className = "message assistant-message mode-rag is-streaming";
    node.innerHTML = `
      <span class="assistant-avatar"><img src="./assets/sees-portrait-seal.png" alt="" /></span>
      <div class="bubble">
        <span class="assistant-name">SEES Navigator</span>
        <div class="answer is-typing" aria-live="polite"></div>
      </div>
    `;
    messages.appendChild(node);
  }
  return node;
}

function flushStreamTokens() {
  if (!streamTokenBuffer) return;
  const node = ensureStreamingMessage();
  const answer = node.querySelector(".answer");
  if (answer) answer.textContent += streamTokenBuffer;
  streamTokenBuffer = "";
  scrollMessagesToBottom({ behavior: "auto" });
}

function resetStreamBuffer() {
  if (streamFlushTimer) window.clearTimeout(streamFlushTimer);
  streamFlushTimer = null;
  streamTokenBuffer = "";
}

function appendStreamToken(delta) {
  if (!delta) return;
  streamTokenBuffer += delta;
  if (streamFlushTimer) return;
  streamFlushTimer = window.setTimeout(() => {
    streamFlushTimer = null;
    flushStreamTokens();
  }, 40);
}

async function addAssistantMessage(response, options = {}) {
  flushStreamTokens();
  resetStreamBuffer();
  document.getElementById("loading")?.remove();
  setApiStatus(response.retrievalMode || "mock");
  mergeProfileUpdates(response.companion?.profileUpdates, {
    refreshDashboard: !response.dailyDashboard,
  });
  let node = document.getElementById("streamingAssistant");
  const streamed = Boolean(node);
  if (!node) node = document.createElement("article");
  node.removeAttribute("id");
  node.className = `message assistant-message mode-${escapeHtml(response.retrievalMode || "mock")}`;
  if (response.dailyDashboard) node.dataset.dashboardHost = "true";
  node.innerHTML = `
    <span class="assistant-avatar"><img src="./assets/sees-portrait-seal.png" alt="" /></span>
    <div class="bubble">
      <span class="assistant-name">SEES Navigator</span>
      <div class="answer is-typing"></div>
      <div class="message-extra is-pending">
        ${renderResponseExtras(response)}
      </div>
    </div>
  `;
  if (!streamed) messages.appendChild(node);
  const answerNode = node.querySelector(".answer");
  if (answerNode) {
    if (!streamed) await typeText(answerNode, response.answer);
    answerNode.classList.remove("is-typing");
    answerNode.innerHTML = renderText(response.answer);
  }
  node.querySelector(".message-extra")?.classList.remove("is-pending");
  if (!options.skipRemember) {
    rememberTurn("assistant", response.answer);
    setCurrentTask(taskFromResponse(options.question || activeQuestion || response.answer, response));
    saveAnswerSnapshot({
      question: options.question || activeQuestion || "Recent guide answer",
      response,
    });
  }
  updateLatestButton();
  scrollMessagesToBottom();
}

function isNearMessagesBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 180;
}

function scrollMessagesToBottom(options = {}) {
  const { force = false, behavior = "smooth" } = options;
  if (!force && !autoStickToBottom && !isNearMessagesBottom()) return;
  window.cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior: motionEnabled() ? behavior : "auto",
    });
    updateLatestButton();
  });
}

function updateLatestButton() {
  const shouldShow = messages.scrollHeight > messages.clientHeight && !isNearMessagesBottom();
  latestButton.classList.toggle("is-visible", shouldShow);
  latestButton.setAttribute("aria-hidden", String(!shouldShow));
  latestButton.tabIndex = shouldShow ? 0 : -1;
}

function setSending(sending) {
  isSending = sending;
  form?.classList.toggle("is-sending", sending);
  form?.setAttribute("aria-busy", String(sending));
  updateSendButtonState();
}

function updateSendButtonState() {
  if (sendButton) {
    const hasDraft = Boolean(input?.value.trim());
    sendButton.disabled = false;
    sendButton.classList.toggle("is-stop", isSending && !hasDraft);
    sendButton.classList.toggle("is-queue", isSending && hasDraft);
    sendButton.textContent = isSending ? (hasDraft ? "Queue" : "■") : "➜";
    sendButton.setAttribute("aria-label", isSending ? (hasDraft ? "Queue question" : "Stop generating") : "Send question");
    sendButton.title = isSending ? (hasDraft ? "Queue question" : "Stop generating") : "Send question";
  }
}

function normalizeApiResponse(data) {
  return {
    answer: data.answer || "The chat API returned no answer.",
    sections: (data.sections || []).map((section) => [section.title, section.content]),
    table: data.tables?.[0]?.rows,
    bossPrep: data.bossPrep || null,
    fusionWorkshop: data.fusionWorkshop || null,
    dailyDashboard: data.dailyDashboard || null,
    recommendation: data.recommendation || null,
    missing: data.missingInfo || "No missing information reported.",
    confidence: data.confidence,
    retrievalMode: data.retrievalMode || "mock",
    companion: data.companion,
    sources: data.sources || [],
  };
}

async function readEventStream(response, onStatus, onToken) {
  const reader = response.body?.getReader();
  if (!reader) return normalizeApiResponse(await response.json());

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "status") onStatus?.(event.message);
      if (event.type === "token") onToken?.(event.delta);
      if (event.type === "response") finalResponse = event.data;
    }

    if (done) break;
  }

  if (!finalResponse && buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.type === "token") onToken?.(event.delta);
    if (event.type === "response") finalResponse = event.data;
  }
  if (!finalResponse) throw new Error("The chat stream ended before an answer arrived.");
  return normalizeApiResponse(finalResponse);
}

async function requestAnswer(question, history = chatHistory.slice(-24), signal) {
  if (!apiAvailable) {
    return mockAnswer(question);
  }

  const cachedAnswer = getCachedExactAnswer(question);
  if (cachedAnswer) {
    updateLoadingStatus("Using the recent exact answer...");
    return cachedAnswer;
  }

  if (apiAvailable) {
    try {
      const response = await fetch(chatApiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          question,
          history,
          playerProfile,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error("No chat API available.");
      }

      const answer = await readEventStream(response, updateLoadingStatus, appendStreamToken);
      rememberExactAnswer(question, answer);
      return answer;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      setApiStatus("error");
    }
  }

  return {
    answer:
      "I lost the connection for a moment. Your message is still here, so try sending it once more and I’ll pick the conversation back up.",
    sections: [],
    sources: [],
    retrievalMode: "error",
    companion: {
      suggestedPrompts: [question],
    },
  };
}

async function checkApiStatus() {
  try {
    const response = await fetch(chatApiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "__status__" }),
    });
    const data = response.ok ? await response.json() : {};
    setApiStatus(response.ok ? data.retrievalMode || "mock" : "mock");
  } catch {
    setApiStatus("mock");
  }
}

function setApiStatus(mode) {
  apiAvailable = mode === "rag" || mode === "empty";
}

function clearEmpty() {
  messages.querySelector(".empty-state")?.remove();
  document.documentElement.classList.add("has-conversation");
}

function renderEmptyState() {
  document.documentElement.classList.remove("has-conversation");
  messages.innerHTML = `
    <div class="empty-state">
      <div class="seal"><img src="./assets/sees-portrait-seal.png" alt="" /></div>
      <h2>What do you need help with?</h2>
      <p>Try asking for a weakness, boss strategy, fusion route, Social Link choice, Elizabeth request, or daily-life tip.</p>
      <div class="empty-examples">
        <button type="button" data-prompt="What is Dancing Hand weak to?">Dancing Hand weakness</button>
        <button type="button" data-prompt="How do I beat Priestess?">Priestess boss plan</button>
        <button type="button" data-prompt="What should I do before the full moon?">Full moon prep</button>
      </div>
    </div>
  `;
  updateLatestButton();
}

function updateRecent(question) {
  recent.unshift(question);
  recent.splice(5);
}

function queueQuestion(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  const normalized = normalizeQueuedQuestion(trimmed);
  const lastQueued = chatQueue[chatQueue.length - 1];
  const isDuplicate =
    normalized &&
    (normalized === normalizeQueuedQuestion(activeQuestion) ||
      normalized === normalizeQueuedQuestion(lastQueued?.question));
  if (isDuplicate) {
    showInputHint("That question is already in progress.");
    return;
  }
  if ((isSending || isProcessingQueue) && chatQueue.length >= maxQueuedQuestions) {
    showInputHint(`Queue is full. Let one answer finish first.`);
    return;
  }
  const node = addUserMessage(trimmed, { queued: isSending || isProcessingQueue || chatQueue.length > 0 });
  chatQueue.push({
    id: ++queuedQuestionId,
    question: trimmed,
    node,
  });
  updateQueuedLabels();
  updateRecent(trimmed);
  input.value = "";
  input.style.height = "";
  updateSendButtonState();
  void processChatQueue();
}

async function processChatQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  try {
    while (chatQueue.length) {
      const item = chatQueue.shift();
      updateQueuedLabels();
      setUserMessageQueued(item.node, false);
      await askQueuedQuestion(item.question);
    }
  } finally {
    isProcessingQueue = false;
    setSending(false);
  }
}

async function askQueuedQuestion(question) {
  const priorHistory = buildPackedHistory();
  const requestController = new AbortController();
  activeRequestController = requestController;
  activeQuestion = question;
  setCurrentTask(taskFromQuestion(question));
  setSending(true);
  setMenu(false);
  rememberTurn("user", question);
  addLoading();
  try {
    const response = await requestAnswer(question, priorHistory, requestController.signal);
    await addAssistantMessage(response, { question });
  } catch (error) {
    resetStreamBuffer();
    document.getElementById("loading")?.remove();
    document.getElementById("streamingAssistant")?.remove();
    if (error?.name !== "AbortError") {
      await addAssistantMessage({
        answer: "That request hit a snag. Try it once more and I’ll pick up from here.",
        sections: [],
        sources: [],
        retrievalMode: "error",
      });
    }
  } finally {
    if (activeRequestController === requestController) {
      activeRequestController = null;
      activeQuestion = "";
      setSending(chatQueue.length > 0);
      if (!document.documentElement.classList.contains("is-mobile")) input.focus();
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isSending && !input.value.trim()) {
    activeRequestController?.abort();
    return;
  }
  queueQuestion(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
  updateSendButtonState();
});

input.addEventListener("focus", () => {
  window.setTimeout(() => {
    syncDeviceLayout();
    scrollMessagesToBottom({ force: true, behavior: "auto" });
  }, 80);
});

input.addEventListener("blur", () => {
  document.documentElement.classList.remove("keyboard-open");
  window.setTimeout(syncDeviceLayout, 80);
});

messages.addEventListener("scroll", () => {
  autoStickToBottom = isNearMessagesBottom();
  updateLatestButton();
  document.documentElement.classList.add("is-chat-scrolling");
  window.clearTimeout(chatScrollTimer);
  chatScrollTimer = window.setTimeout(() => {
    document.documentElement.classList.remove("is-chat-scrolling");
  }, 140);
});

latestButton.addEventListener("click", () => {
  autoStickToBottom = true;
  scrollMessagesToBottom({ force: true });
});

new ResizeObserver(updateLatestButton).observe(messages);

categoryList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (button) queueQuestion(button.dataset.prompt);
});

function setMenu(open) {
  sidePanel.classList.toggle("is-open", open);
  menuToggle.textContent = open ? "×" : "☰";
  menuToggle.setAttribute("aria-label", open ? "Close quick menu" : "Open quick menu");
  menuToggle.setAttribute("aria-expanded", String(open));
}

menuToggle.addEventListener("click", () => setMenu(!sidePanel.classList.contains("is-open")));

enterApp.addEventListener("click", () => {
  if (entranceScreen.classList.contains("is-exiting")) return;
  enterApp.disabled = true;
  entranceScreen.classList.add("is-exiting");
  appShell?.classList.add("is-entering");
  window.setTimeout(() => {
    entranceScreen.classList.add("is-hidden");
    input.focus();
  }, 720);
});

messages.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (button) queueQuestion(button.dataset.prompt);
});

recentList?.addEventListener("click", (event) => {
  const openButton = event.target.closest("button[data-open-recent]");
  if (openButton) {
    void openSavedAnswer(openButton.dataset.openRecent);
  }
});

clearChat?.addEventListener("click", () => {
  recent.splice(0);
  chatHistory.splice(0);
  savedAnswers.splice(0);
  saveChatHistory();
  saveSavedAnswers();
  renderRecentAnswers();
  renderEmptyState();
  clearCurrentTask();
  setMenu(false);
  input.focus();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#openMemory")) {
    openMemoryDialog();
    return;
  }
  if (event.target.closest("#closeMemory")) {
    closeMemoryDialog();
    return;
  }
  if (event.target.id === "memoryDialog") closeMemoryDialog();
}, true);

document.addEventListener("submit", (event) => {
  const memoryForm = event.target.closest("#memoryForm");
  if (!memoryForm) return;
  event.preventDefault();
  const data = new FormData(memoryForm);
  const profileWithoutEditableCollections = { ...playerProfile };
  for (const key of [
    "activeParty",
    "ownedPersonas",
    "currentSocialLinks",
    "activeRequests",
    "socialStats",
  ]) {
    delete profileWithoutEditableCollections[key];
  }
  playerProfile = cleanProfile({
    ...profileWithoutEditableCollections,
    currentMonth: data.get("currentMonth"),
    currentDate: data.get("currentDate"),
    currentLevel: data.get("currentLevel"),
    difficulty: data.get("difficulty"),
    playstyle: data.get("playstyle"),
    tartarusBlock: data.get("tartarusBlock"),
    tartarusFloor: data.get("tartarusFloor"),
    spoilerPreference: data.get("spoilerPreference"),
    activeParty: cleanCombatParty(
      String(data.get("activeParty") || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
    ownedPersonas: String(data.get("ownedPersonas") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 24),
    currentSocialLinks: String(data.get("currentSocialLinks") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 24),
    activeRequests: String(data.get("activeRequests") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 30),
    dlcOwnership: data.get("dlcOwnership"),
    socialStats: {
      academics: data.get("academics"),
      charm: data.get("charm"),
      courage: data.get("courage"),
    },
    currentGoal: data.get("currentGoal"),
  });
  savePlayerProfile({ refreshDashboard: true });
  closeMemoryDialog();
}, true);

document.addEventListener("click", (event) => {
  if (!event.target.closest("#clearMemory")) return;
  playerProfile = {};
  window.localStorage.removeItem(playerProfileKey);
  window.sessionStorage.removeItem("tartarusPlayerProfile");
  populateMemoryForm();
  renderMemorySummary();
  scheduleDashboardRefresh();
}, true);

window.addEventListener("storage", (event) => {
  if (event.key !== playerProfileKey) return;
  playerProfile = loadPlayerProfile();
  populateMemoryForm();
  renderMemorySummary();
  scheduleDashboardRefresh();
});

checkApiStatus();
