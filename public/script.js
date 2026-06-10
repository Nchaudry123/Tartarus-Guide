const form = document.getElementById("chatForm");
const input = document.getElementById("questionInput");
const messages = document.getElementById("messages");
const categoryList = document.getElementById("categoryList");
const recentList = document.getElementById("recentList");
const menuToggle = document.getElementById("menuToggle");
const sidePanel = document.getElementById("sidePanel");
const clearChat = document.getElementById("clearChat");
const ragStatus = document.getElementById("ragStatus");
const chatModeLabel = document.getElementById("chatModeLabel");
const modeCardText = document.getElementById("modeCardText");
const entranceScreen = document.getElementById("entranceScreen");
const enterApp = document.getElementById("enterApp");
const memorySummary = document.getElementById("memorySummary");
const appShell = document.querySelector(".app-shell");
const chatApiUrl = window.TARTARUS_API_URL || "/api/chat";
const sendButton = form?.querySelector('button[type="submit"]');
const chatHistoryKey = "tartarusChatHistoryV2";
const playerProfileKey = "tartarusPlayerProfileV2";

const recent = [];
const chatHistory = loadChatHistory();
let playerProfile = loadPlayerProfile();
let isSending = false;
let activeRequestController = null;

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
    return JSON.parse(saved);
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
          .slice(-12)
      : [];
  } catch {
    return [];
  }
}

function saveChatHistory() {
  window.sessionStorage.setItem(chatHistoryKey, JSON.stringify(chatHistory));
}

function savePlayerProfile() {
  window.localStorage.setItem(playerProfileKey, JSON.stringify(playerProfile));
  window.sessionStorage.removeItem("tartarusPlayerProfile");
  renderMemorySummary();
}

function rememberTurn(role, content) {
  chatHistory.push({ role, content });
  chatHistory.splice(0, Math.max(0, chatHistory.length - 12));
  saveChatHistory();
}

function mergeProfileUpdates(updates) {
  if (!updates || typeof updates !== "object") return;
  playerProfile = {
    ...playerProfile,
    ...updates,
    activeParty: Array.isArray(updates.activeParty) && updates.activeParty.length ? [...new Set(updates.activeParty)] : playerProfile.activeParty,
    currentSocialLinks:
      Array.isArray(updates.currentSocialLinks) && updates.currentSocialLinks.length
        ? [...new Set(updates.currentSocialLinks)]
        : playerProfile.currentSocialLinks,
  };
  savePlayerProfile();
}

function cleanProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile || {}).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null && String(value).trim() !== "";
    }),
  );
}

function renderMemorySummary() {
  if (!memorySummary) return;
  const details = [
    playerProfile.currentMonth,
    playerProfile.currentLevel ? `Lv ${playerProfile.currentLevel}` : "",
    playerProfile.difficulty,
    playerProfile.activeParty?.length ? playerProfile.activeParty.join(", ") : "",
  ].filter(Boolean);
  memorySummary.textContent = details.length ? details.join(" · ") : "No profile saved";
}

function populateMemoryForm() {
  const memoryForm = document.getElementById("memoryForm");
  if (!memoryForm) return;
  const fields = memoryForm.elements;
  fields.currentMonth.value = playerProfile.currentMonth || "";
  fields.currentLevel.value = playerProfile.currentLevel || "";
  fields.difficulty.value = playerProfile.difficulty || "";
  fields.playstyle.value = playerProfile.playstyle || "";
  fields.activeParty.value = playerProfile.activeParty?.join(", ") || "";
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
      missing: "Connect the RAG backend for exact Persona fusion recipes.",
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
    answer: "This is the frontend preview for Tartarus Guide. The interface is ready for natural Persona 3 Reload questions; connect the real RAG backend to replace this mock response.",
    sections: [
      ["What Works Now", "The chat UI, suggested prompts, loading state, source display, quick menu, and mock response format are in place."],
      ["Next Connection", "Point the Next `/api/chat` route at the Supabase retrieval pipeline or an external backend endpoint."],
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

function addUserMessage(text) {
  clearEmpty();
  const node = document.createElement("article");
  node.className = "message user-message";
  node.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  messages.appendChild(node);
  scrollMessagesToBottom({ force: true });
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
  scrollMessagesToBottom({ force: true });
}

function updateLoadingStatus(message) {
  const status = document.querySelector("#loading .loading-status");
  if (!status || !message) return;
  status.textContent = message;
  scrollMessagesToBottom();
}

async function addAssistantMessage(response) {
  document.getElementById("loading")?.remove();
  setApiStatus(response.retrievalMode || "mock");
  mergeProfileUpdates(response.companion?.profileUpdates);
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
        <footer>
          ${sourceLinks}
        </footer>
      </details>`
    : "";
  const prompts = (response.companion?.suggestedPrompts || [])
    .slice(0, 3)
    .map((prompt) => `<button type="button" data-prompt="${escapeHtml(prompt)}" title="${escapeHtml(prompt)}">${escapeHtml(promptLabel(prompt))}</button>`)
    .join("");
  const followUps = prompts ? `<div class="followups">${prompts}</div>` : "";
  const node = document.createElement("article");
  node.className = `message assistant-message mode-${escapeHtml(response.retrievalMode || "mock")}`;
  node.innerHTML = `
    <span class="assistant-avatar"><img src="./assets/sees-portrait-seal.png" alt="" /></span>
    <div class="bubble">
      <span class="assistant-name">SEES Navigator</span>
      <div class="answer is-typing"></div>
      <div class="message-extra is-pending">
        ${sections ? `<div class="section-grid">${sections}</div>` : ""}
        ${table}
        ${sourceFooter}
        ${followUps}
      </div>
    </div>
  `;
  messages.appendChild(node);
  const answerNode = node.querySelector(".answer");
  if (answerNode) {
    await typeText(answerNode, response.answer);
    answerNode.classList.remove("is-typing");
    answerNode.innerHTML = renderText(response.answer);
  }
  node.querySelector(".message-extra")?.classList.remove("is-pending");
  rememberTurn("assistant", response.answer);
  scrollMessagesToBottom();
}

function isNearMessagesBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 180;
}

function scrollMessagesToBottom(options = {}) {
  const { force = false, behavior = "smooth" } = options;
  if (!force && !autoStickToBottom && !isNearMessagesBottom()) return;
  requestAnimationFrame(() => {
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior: motionEnabled() ? behavior : "auto",
    });
  });
}

function setSending(sending) {
  isSending = sending;
  form?.classList.toggle("is-sending", sending);
  form?.setAttribute("aria-busy", String(sending));
  if (sendButton) {
    sendButton.disabled = false;
    sendButton.classList.toggle("is-stop", sending);
    sendButton.textContent = sending ? "■" : "➜";
    sendButton.setAttribute("aria-label", sending ? "Stop generating" : "Send question");
    sendButton.title = sending ? "Stop generating" : "Send question";
  }
}

function normalizeApiResponse(data) {
  return {
    answer: data.answer || "The chat API returned no answer.",
    sections: (data.sections || []).map((section) => [section.title, section.content]),
    table: data.tables?.[0]?.rows,
    missing: data.missingInfo || "No missing information reported.",
    retrievalMode: data.retrievalMode || "mock",
    companion: data.companion,
    sources: data.sources || [],
    confidence:
      typeof data.confidence === "number"
        ? `${Math.round(data.confidence * 100)}%`
        : "N/A",
  };
}

async function readEventStream(response, onStatus) {
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
      if (event.type === "response") finalResponse = event.data;
    }

    if (done) break;
  }

  if (!finalResponse && buffer.trim()) {
    const event = JSON.parse(buffer);
    if (event.type === "response") finalResponse = event.data;
  }
  if (!finalResponse) throw new Error("The chat stream ended before an answer arrived.");
  return normalizeApiResponse(finalResponse);
}

async function requestAnswer(question, history = chatHistory.slice(-8), signal) {
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

      return await readEventStream(response, updateLoadingStatus);
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
  apiAvailable = mode !== "mock";
  const isLive = mode === "rag";
  const isEmpty = mode === "empty";
  const isError = mode === "error";
  if (ragStatus) {
    ragStatus.classList.toggle("is-live", isLive);
    ragStatus.classList.toggle("is-error", isError);
    ragStatus.querySelector("strong").textContent = isLive ? "RAG Online" : isEmpty ? "RAG Connected" : isError ? "API Fallback" : "Preview Mode";
    ragStatus.querySelector("small").textContent = isLive
      ? "Live guide active"
      : isEmpty
        ? "No matching source yet"
        : isError
          ? "Mock fallback active"
          : "Mock responses active";
  }
  if (chatModeLabel) {
    chatModeLabel.textContent = isLive ? "RAG API" : isEmpty ? "No Match" : isError ? "Fallback" : "Mock API";
  }
  if (modeCardText) {
    modeCardText.textContent = isLive
      ? "Connected to live guide mode. Answers use your Persona 3 Reload guide index."
      : isEmpty
        ? "The API is connected, but this question did not match the current knowledge base."
        : isError
          ? "The API route responded, but retrieval failed and the terminal used a fallback answer."
          : "Static preview uses mock answers until the deployed API has live credentials.";
  }
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
}

function updateRecent(question) {
  recent.unshift(question);
  recent.splice(5);
  if (!recentList) return;
  recentList.innerHTML = "";
  recent.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item;
    button.addEventListener("click", () => ask(item));
    recentList.appendChild(button);
  });
}

async function ask(question) {
  const trimmed = question.trim();
  if (isSending) {
    activeRequestController?.abort();
    return;
  }
  if (!trimmed) return;
  const priorHistory = chatHistory.slice(-8);
  activeRequestController = new AbortController();
  setSending(true);
  setMenu(false);
  addUserMessage(trimmed);
  rememberTurn("user", trimmed);
  updateRecent(trimmed);
  input.value = "";
  input.style.height = "";
  addLoading();
  try {
    const response = await requestAnswer(trimmed, priorHistory, activeRequestController.signal);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await addAssistantMessage(response);
  } catch (error) {
    document.getElementById("loading")?.remove();
    if (error?.name !== "AbortError") {
      await addAssistantMessage({
        answer: "That request hit a snag. Try it once more and I’ll pick up from here.",
        sections: [],
        sources: [],
        retrievalMode: "error",
      });
    }
  } finally {
    activeRequestController = null;
    setSending(false);
    if (!document.documentElement.classList.contains("is-mobile")) input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (isSending) {
    activeRequestController?.abort();
    return;
  }
  ask(input.value);
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
});

categoryList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (button) ask(button.dataset.prompt);
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
  if (button) ask(button.dataset.prompt);
});

clearChat?.addEventListener("click", () => {
  recent.splice(0);
  chatHistory.splice(0);
  saveChatHistory();
  if (recentList) recentList.innerHTML = "<p>Your last questions will appear here.</p>";
  renderEmptyState();
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
  playerProfile = cleanProfile({
    ...playerProfile,
    currentMonth: data.get("currentMonth"),
    currentLevel: data.get("currentLevel"),
    difficulty: data.get("difficulty"),
    playstyle: data.get("playstyle"),
    activeParty: String(data.get("activeParty") || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 4),
    currentGoal: data.get("currentGoal"),
  });
  savePlayerProfile();
  closeMemoryDialog();
}, true);

document.addEventListener("click", (event) => {
  if (!event.target.closest("#clearMemory")) return;
  playerProfile = {};
  window.localStorage.removeItem(playerProfileKey);
  window.sessionStorage.removeItem("tartarusPlayerProfile");
  populateMemoryForm();
  renderMemorySummary();
}, true);

checkApiStatus();
