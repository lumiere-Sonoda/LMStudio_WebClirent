type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
  createdAt: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface Settings {
  apiBaseUrl: string;
  modelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number | null;
}

interface ChatCompletionResponse {
  choices: {
    message: {
      role: Role;
      content: string;
    };
  }[];
}

const SETTINGS_KEY = "lmstudio_webchat_settings_v1";
const SESSIONS_KEY = "lmstudio_webchat_sessions_v1";

const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: "http://localhost:1234/v1",
  modelId: "mistralai/ministral-3-3b",
  systemPrompt: "あなたは日本語で丁寧に回答するアシスタントです。",
  temperature: 0.7,
  maxTokens: null,
};

let settings: Settings = { ...DEFAULT_SETTINGS };
let sessions: ChatSession[] = [];
let currentSessionId: string | null = null;
let isSending = false;

// DOM Elements
let newChatBtnEl: HTMLButtonElement;
let chatListEl: HTMLElement;
let currentChatTitleEl: HTMLElement| null;
let modelLabelEl: HTMLElement;
let connectionDotEl: HTMLElement;
let connectionTextEl: HTMLElement;
let settingsToggleBtnEl: HTMLButtonElement;
let settingsPanelEl: HTMLElement;
let apiBaseUrlInputEl: HTMLInputElement;
let modelIdInputEl: HTMLInputElement;
let temperatureInputEl: HTMLInputElement;
let maxTokensInputEl: HTMLInputElement;
let systemPromptInputEl: HTMLTextAreaElement;
let saveSettingsBtnEl: HTMLButtonElement;
let testConnectionBtnEl: HTMLButtonElement;
let settingsStatusEl: HTMLElement;
let chatMessagesEl: HTMLElement;
let userInputEl: HTMLTextAreaElement;
let sendBtnEl: HTMLButtonElement;

function loadSettings(): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      settings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSessions(): void {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      sessions = parsed;
    }
  } catch {
    sessions = [];
  }
  if (sessions.length === 0) {
    const s = createNewSession("新しいチャット");
    currentSessionId = s.id;
  } else {
    // 一番最近更新されたセッションを開く
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    currentSessionId = sessions[0].id;
  }
}

function saveSessions(): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function createNewSession(title: string): ChatSession {
  const now = Date.now();
  const session: ChatSession = {
    id: `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  sessions.unshift(session);
  saveSessions();
  return session;
}

function getCurrentSession(): ChatSession | undefined {
  return sessions.find((s) => s.id === currentSessionId);
}

/* === Rendering === */

function renderSidebar(): void {
  chatListEl.innerHTML = "";

  sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((session) => {
      const item = document.createElement("div");
      item.className = "chat-list-item";
      if (session.id === currentSessionId) {
        item.classList.add("active");
      }
      item.dataset.sessionId = session.id;

      const icon = document.createElement("span");
      icon.className = "chat-list-item-icon";
      icon.textContent = "💬";

      const title = document.createElement("div");
      title.className = "chat-list-item-title";
      title.textContent = session.title || "無題のチャット";

      item.appendChild(icon);
      item.appendChild(title);
      item.addEventListener("click", () => {
        selectSession(session.id);
      });

      chatListEl.appendChild(item);
    });
}

function renderMessages(): void {
  const session = getCurrentSession();
  chatMessagesEl.innerHTML = "";

  if (!session) return;

  if (session.messages.length === 0) {
    const row = document.createElement("div");
    row.className = "message-row";
    const inner = document.createElement("div");
    inner.className = "message-inner";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent =
      "下の入力欄にメッセージを入力して会話を開始しましょう！";
    inner.appendChild(bubble);
    row.appendChild(inner);
    chatMessagesEl.appendChild(row);
    return;
  }

  session.messages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = "message-row";

    const inner = document.createElement("div");
    inner.className = "message-inner";

    const icon = document.createElement("div");
    icon.className = "message-icon " + msg.role;
    icon.textContent = msg.role === "user" ? "U" : "LM";

    const bubble = document.createElement("div");
    bubble.className =
      "message-bubble " + (msg.role === "user" ? "user" : "assistant");

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = msg.role === "user" ? "You" : "Assistant";

    const content = document.createElement("div");
    content.textContent = msg.content;

    bubble.appendChild(meta);
    bubble.appendChild(content);

    inner.appendChild(icon);
    inner.appendChild(bubble);
    row.appendChild(inner);
    chatMessagesEl.appendChild(row);
  });

  // 最後のメッセージまでスクロール
  const last = chatMessagesEl.lastElementChild;
  if (last) {
    (last as HTMLElement).scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }
}

function getModelDisplayName(): string {
  const raw = settings.modelId || "";
  if (!raw) return "未設定";

  // "mistralai/ministral-3-3b" → ["mistralai", "ministral-3-3b"]
  const parts = raw.split("/");
  const last = parts[parts.length - 1];

  return last || raw; // 念のため、空なら元の文字列
}

function renderHeader(): void {
  const session = getCurrentSession();
  if (currentSessionId && currentChatTitleEl) {
    currentChatTitleEl.textContent = session?.title ?? "新しいチャット";
  }
  const name = getModelDisplayName();
  modelLabelEl.textContent = `${name}`;
}

/* === Settings panel === */

function applySettingsToInputs(): void {
  apiBaseUrlInputEl.value = settings.apiBaseUrl;
  modelIdInputEl.value = settings.modelId;
  systemPromptInputEl.value = settings.systemPrompt;
  temperatureInputEl.value = settings.temperature.toString();
  maxTokensInputEl.value =
    settings.maxTokens === null ? "" : settings.maxTokens.toString();
}

function updateSettingsFromInputs(): void {
  settings.apiBaseUrl =
    apiBaseUrlInputEl.value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
  settings.modelId =
    modelIdInputEl.value.trim() || DEFAULT_SETTINGS.modelId;
  settings.systemPrompt =
    systemPromptInputEl.value.trim() || DEFAULT_SETTINGS.systemPrompt;

  const temp = parseFloat(temperatureInputEl.value);
  settings.temperature = Number.isNaN(temp)
    ? DEFAULT_SETTINGS.temperature
    : Math.max(0, Math.min(2, temp));

  const rawMax = maxTokensInputEl.value.trim();
  if (!rawMax) {
    settings.maxTokens = null;
  } else {
    const num = parseInt(rawMax, 10);
    settings.maxTokens = Number.isNaN(num) || num <= 0 ? null : num;
  }
}

/* === Session selection === */

function selectSession(id: string): void {
  if (currentSessionId === id) return;
  currentSessionId = id;
  renderSidebar();
  renderHeader();
  renderMessages();
}

/* === LM Studio API === */

function buildApiUrl(path: string): string {
  const base = settings.apiBaseUrl.replace(/\/$/, "");
  return base + path;
}

async function testConnection(): Promise<void> {
  settingsStatusEl.textContent = "接続テスト中…";
  connectionTextEl.textContent = "接続テスト中…";
  connectionDotEl.classList.remove("connected");
  try {
    const res = await fetch(buildApiUrl("/models"));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    settingsStatusEl.textContent = "LM Studio と通信できました。";
    connectionTextEl.textContent = "接続 OK";
    connectionDotEl.classList.add("connected");
  } catch (e) {
    console.error(e);
    settingsStatusEl.textContent =
      "LM Studio と通信できませんでした。設定と起動状態を確認してください。";
    connectionTextEl.textContent = "未接続";
    connectionDotEl.classList.remove("connected");
  }
}

async function sendToLmStudio(session: ChatSession): Promise<string> {
  const url = buildApiUrl("/chat/completions");

  const payload: any = {
    model: settings.modelId,
    messages: [
      {
        role: "system",
        content: settings.systemPrompt,
      },
      ...session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
    temperature: settings.temperature,
  };

  if (settings.maxTokens !== null) {
    payload.max_tokens = settings.maxTokens;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data: ChatCompletionResponse = await res.json();
  const text =
    data.choices?.[0]?.message?.content ??
    "（LM Studio からの応答が取得できませんでした）";
  return text;
}

/* === Sending message === */

async function handleSend(): Promise<void> {
  if (isSending) return;

  const session = getCurrentSession();
  if (!session) return;

  const text = userInputEl.value.trim();
  if (!text) return;

  // 新しいチャットでタイトル未設定なら先頭数文字からタイトル作成
  if (session.messages.length === 0) {
    const t = text.replace(/\s+/g, " ").slice(0, 30);
    session.title = t || "新しいチャット";
  }

  // ユーザーメッセージ追加
  const now = Date.now();
  session.messages.push({
    role: "user",
    content: text,
    createdAt: now,
  });
  session.updatedAt = now;
  userInputEl.value = "";

  renderSidebar();
  renderHeader();
  renderMessages();
  saveSessions();

  isSending = true;
  sendBtnEl.disabled = true;
  sendBtnEl.textContent = "送信中…";
  connectionTextEl.textContent = "応答生成中…";

  try {
    const reply = await sendToLmStudio(session);
    const t2 = Date.now();
    session.messages.push({
      role: "assistant",
      content: reply,
      createdAt: t2,
    });
    session.updatedAt = t2;
    renderMessages();
    saveSessions();
    connectionTextEl.textContent = "接続 OK";
  } catch (e) {
    console.error(e);
    const t2 = Date.now();
    session.messages.push({
      role: "assistant",
      content:
        "LM Studio へのリクエストでエラーが発生しました。\n" +
        "・LM Studio のサーバーが起動しているか\n" +
        "・「CORS を有効にする」が ON か\n" +
        "・API ベースURLとモデルIDが正しいか\nを確認してください。",
      createdAt: t2,
    });
    session.updatedAt = t2;
    renderMessages();
    saveSessions();
    connectionTextEl.textContent = "エラー";
    connectionDotEl.classList.remove("connected");
  } finally {
    isSending = false;
    sendBtnEl.disabled = false;
    sendBtnEl.textContent = "送信";
  }
}

/* === Event listeners === */

function setupEvents(): void {
  newChatBtnEl.addEventListener("click", () => {
    const newSession = createNewSession("新しいチャット");
    currentSessionId = newSession.id;
    renderSidebar();
    renderHeader();
    renderMessages();
  });

  settingsToggleBtnEl.addEventListener("click", () => {
    settingsPanelEl.classList.toggle("hidden");
  });

  saveSettingsBtnEl.addEventListener("click", () => {
    updateSettingsFromInputs();
    saveSettings();
    applySettingsToInputs();
    renderHeader();
    settingsStatusEl.textContent = "設定を保存しました。";
  });

  testConnectionBtnEl.addEventListener("click", () => {
    updateSettingsFromInputs();
    saveSettings();
    void testConnection();
  });

  sendBtnEl.addEventListener("click", () => {
    void handleSend();
  });

  userInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  });
}

/* === Init === */

window.addEventListener("DOMContentLoaded", () => {
  // Get elements
  newChatBtnEl = document.getElementById("newChatBtn") as HTMLButtonElement;
  chatListEl = document.getElementById("chatList") as HTMLElement;
  currentChatTitleEl = document.getElementById("currentChatTitle");
  modelLabelEl = document.getElementById("modelLabel") as HTMLElement;
  connectionDotEl = document.getElementById("connectionDot") as HTMLElement;
  connectionTextEl = document.getElementById("connectionText") as HTMLElement;
  settingsToggleBtnEl = document.getElementById(
    "settingsToggleBtn",
  ) as HTMLButtonElement;
  settingsPanelEl = document.getElementById("settingsPanel") as HTMLElement;

  apiBaseUrlInputEl = document.getElementById(
    "apiBaseUrlInput",
  ) as HTMLInputElement;
  modelIdInputEl = document.getElementById(
    "modelIdInput",
  ) as HTMLInputElement;
  temperatureInputEl = document.getElementById(
    "temperatureInput",
  ) as HTMLInputElement;
  maxTokensInputEl = document.getElementById(
    "maxTokensInput",
  ) as HTMLInputElement;
  systemPromptInputEl = document.getElementById(
    "systemPromptInput",
  ) as HTMLTextAreaElement;

  saveSettingsBtnEl = document.getElementById(
    "saveSettingsBtn",
  ) as HTMLButtonElement;
  testConnectionBtnEl = document.getElementById(
    "testConnectionBtn",
  ) as HTMLButtonElement;
  settingsStatusEl = document.getElementById("settingsStatus") as HTMLElement;

  chatMessagesEl = document.getElementById("chatMessages") as HTMLElement;
  userInputEl = document.getElementById("userInput") as HTMLTextAreaElement;
  sendBtnEl = document.getElementById("sendBtn") as HTMLButtonElement;

  // Init state
  loadSettings();
  applySettingsToInputs();
  loadSessions();

  renderSidebar();
  renderHeader();
  renderMessages();
  setupEvents();
  void testConnection();
});
