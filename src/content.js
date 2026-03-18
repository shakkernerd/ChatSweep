(function () {
  const ROOT_ID = "mc-root";
  const MODAL_ID = "mc-modal-root";
  const STORAGE_ENABLED_KEY = "chatSweepEnabled";
  const LEGACY_STORAGE_ENABLED_KEY = "manageChatsEnabled";
  const API_PAGE_SIZE = 28;
  const BRIDGE_SCRIPT_ID = "mc-page-bridge";
  const BRIDGE_REQUEST_EVENT = "mc:page-fetch:request";
  const BRIDGE_RESPONSE_EVENT = "mc:page-fetch:response";
  const BRIDGE_READY_EVENT = "mc:page-fetch:ready";
  const BRIDGE_READY_ATTR = "data-mc-page-bridge-ready";

  const selectedChats = new Map();
  const pageCache = new Map();
  const pendingBridgeRequests = new Map();
  const state = {
    busy: false,
    processed: 0,
    total: 0,
    pageOffset: 0,
    pageLimit: API_PAGE_SIZE,
    pageTotal: 0,
    pageItems: [],
    pageLoadedOnce: false,
    pageLoading: false,
    lastError: ""
  };

  let root;
  let modalRoot;
  let countEl;
  let statusEl;
  let progressEl;
  let deleteButton;
  let chooseButton;
  let clearButton;
  let modalMetaEl;
  let modalListEl;
  let modalEmptyEl;
  let modalPrevButton;
  let modalNextButton;
  let modalPageEl;
  let modalRefreshButton;
  let extensionEnabled = true;
  let bridgeRequestId = 0;

  init().catch((error) => {
    console.error("[ChatSweep] Failed to initialize content script", error);
  });

  async function init() {
    if (window.top !== window) {
      return;
    }

    attachBridgeListener();
    await injectPageBridge();
    extensionEnabled = await getEnabledState();
    attachStorageListener();
    if (!extensionEnabled) {
      return;
    }

    await waitForDocumentReady();
    activateUi();
  }

  function activateUi() {
    mountPanel();
    mountModal();
    renderPanel();
    renderModal();
  }

  function deactivateUi() {
    selectedChats.clear();
    resetState();
    removeMountedUi();
  }

  function resetState() {
    pageCache.clear();
    state.busy = false;
    state.processed = 0;
    state.total = 0;
    state.pageOffset = 0;
    state.pageLimit = API_PAGE_SIZE;
    state.pageTotal = 0;
    state.pageItems = [];
    state.pageLoadedOnce = false;
    state.pageLoading = false;
    state.lastError = "";
  }

  function removeMountedUi() {
    if (root) {
      root.remove();
      root = null;
    }
    if (modalRoot) {
      modalRoot.remove();
      modalRoot = null;
    }

    countEl = null;
    statusEl = null;
    progressEl = null;
    deleteButton = null;
    chooseButton = null;
    clearButton = null;
    modalMetaEl = null;
    modalListEl = null;
    modalEmptyEl = null;
    modalPrevButton = null;
    modalNextButton = null;
    modalPageEl = null;
    modalRefreshButton = null;
  }

  function mountPanel() {
    const existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      root = existingRoot;
      countEl = root.querySelector('[data-role="count"]');
      statusEl = root.querySelector('[data-role="status"]');
      progressEl = root.querySelector('[data-role="progress"]');
      deleteButton = root.querySelector('[data-role="delete"]');
      chooseButton = root.querySelector('[data-role="choose"]');
      clearButton = root.querySelector('[data-role="clear"]');
      return;
    }

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "mc-root";
    root.innerHTML = `
      <div class="mc-card">
        <div class="mc-header">
          <div class="mc-title">
            <strong>ChatSweep</strong>
            <span>Load chats from ChatGPT, then delete them in a batch.</span>
          </div>
          <div class="mc-count" data-role="count">0</div>
        </div>
        <div class="mc-body">
          <div class="mc-actions">
            <button class="mc-button mc-button-secondary" data-role="choose" type="button">Choose chats</button>
            <button class="mc-button mc-button-secondary" data-role="clear" type="button">Clear</button>
            <button class="mc-button mc-button-danger mc-button-wide" data-role="delete" type="button">Delete selected</button>
          </div>
          <div class="mc-status" data-role="status">Open the chooser to load chats from the ChatGPT API.</div>
          <div class="mc-progress">
            <div class="mc-progress-bar" data-role="progress"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    countEl = root.querySelector('[data-role="count"]');
    statusEl = root.querySelector('[data-role="status"]');
    progressEl = root.querySelector('[data-role="progress"]');
    deleteButton = root.querySelector('[data-role="delete"]');
    chooseButton = root.querySelector('[data-role="choose"]');
    clearButton = root.querySelector('[data-role="clear"]');

    chooseButton.addEventListener("click", openChooser);
    clearButton.addEventListener("click", clearSelection);
    deleteButton.addEventListener("click", onDeleteSelected);
  }

  function mountModal() {
    const existingModal = document.getElementById(MODAL_ID);
    if (existingModal) {
      modalRoot = existingModal;
      modalMetaEl = modalRoot.querySelector('[data-role="modal-meta"]');
      modalListEl = modalRoot.querySelector('[data-role="modal-list"]');
      modalEmptyEl = modalRoot.querySelector('[data-role="modal-empty"]');
      modalPrevButton = modalRoot.querySelector('[data-role="prev-page"]');
      modalNextButton = modalRoot.querySelector('[data-role="next-page"]');
      modalPageEl = modalRoot.querySelector('[data-role="page-label"]');
      modalRefreshButton = modalRoot.querySelector('[data-role="refresh-modal"]');
      return;
    }

    modalRoot = document.createElement("div");
    modalRoot.id = MODAL_ID;
    modalRoot.className = "mc-modal-root mc-hidden";
    modalRoot.innerHTML = `
      <div class="mc-modal-backdrop" data-role="close-modal"></div>
      <div class="mc-modal-card" role="dialog" aria-modal="true" aria-labelledby="mc-modal-title">
        <div class="mc-modal-header">
          <div class="mc-modal-title">
            <strong id="mc-modal-title">All Chats</strong>
            <span data-role="modal-meta">Load chats from the ChatGPT API.</span>
          </div>
          <button class="mc-button mc-button-secondary mc-button-compact" data-role="close-modal" type="button">Close</button>
        </div>
        <div class="mc-modal-toolbar">
          <button class="mc-button mc-button-secondary mc-button-compact" data-role="refresh-modal" type="button">Refresh</button>
          <div class="mc-modal-pagination">
            <button class="mc-button mc-button-secondary mc-button-compact" data-role="prev-page" type="button">Previous</button>
            <span class="mc-page-label" data-role="page-label">Page 1</span>
            <button class="mc-button mc-button-secondary mc-button-compact" data-role="next-page" type="button">Next</button>
          </div>
        </div>
        <div class="mc-modal-empty" data-role="modal-empty">No chats loaded yet.</div>
        <div class="mc-modal-list" data-role="modal-list"></div>
      </div>
    `;

    document.body.appendChild(modalRoot);

    modalMetaEl = modalRoot.querySelector('[data-role="modal-meta"]');
    modalListEl = modalRoot.querySelector('[data-role="modal-list"]');
    modalEmptyEl = modalRoot.querySelector('[data-role="modal-empty"]');
    modalPrevButton = modalRoot.querySelector('[data-role="prev-page"]');
    modalNextButton = modalRoot.querySelector('[data-role="next-page"]');
    modalPageEl = modalRoot.querySelector('[data-role="page-label"]');
    modalRefreshButton = modalRoot.querySelector('[data-role="refresh-modal"]');

    modalRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      switch (target.dataset.role) {
        case "close-modal":
          closeChooser();
          break;
        case "refresh-modal":
          void loadConversationPage(state.pageLoadedOnce ? state.pageOffset : 0, true, true);
          break;
        case "prev-page":
          if (state.pageOffset > 0 && !state.pageLoading && !state.busy) {
            void loadConversationPage(Math.max(0, state.pageOffset - state.pageLimit), true);
          }
          break;
        case "next-page":
          if (hasNextPage() && !state.pageLoading && !state.busy) {
            void loadConversationPage(state.pageOffset + state.pageLimit, true);
          }
          break;
        default:
          break;
      }
    });

    modalRoot.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.chatId == null) {
        return;
      }

      const chat = state.pageItems.find((item) => item.id === target.dataset.chatId);
      if (!chat) {
        return;
      }

      if (target.checked) {
        selectedChats.set(chat.id, chat);
      } else {
        selectedChats.delete(chat.id);
      }

      renderPanel();
      setStatus(`Selected ${selectedChats.size} chat${selectedChats.size === 1 ? "" : "s"}.`);
    });
  }

  async function openChooser() {
    if (state.busy) {
      return;
    }

    modalRoot?.classList.remove("mc-hidden");
    if (!state.pageLoadedOnce) {
      await loadConversationPage(0, true);
    } else {
      renderModal();
    }
  }

  function closeChooser() {
    modalRoot?.classList.add("mc-hidden");
  }

  async function loadConversationPage(offset, forceStatus, forceRefresh = false) {
    if (state.pageLoading || state.busy) {
      return;
    }

    const cacheKey = getPageCacheKey(offset, state.pageLimit);
    const cached = !forceRefresh ? pageCache.get(cacheKey) : null;

    if (cached) {
      applyConversationPage(cached);
      renderPanel();
      renderModal();

      if (forceStatus) {
        const start = state.pageTotal ? state.pageOffset + 1 : 0;
        const end = state.pageOffset + state.pageItems.length;
        setStatus(`Loaded ${start}-${end} of ${state.pageTotal} chats. ${selectedChats.size} selected.`);
      }
      return;
    }

    state.pageLoading = true;
    state.lastError = "";
    renderPanel();
    renderModal();

    if (forceStatus) {
      setStatus("Loading chats from ChatGPT...");
    }

    try {
      const data = await fetchConversationPage(offset, state.pageLimit);
      const normalizedPage = {
        items: normalizeConversations(data.items),
        offset: typeof data.offset === "number" ? data.offset : offset,
        limit: typeof data.limit === "number" && data.limit > 0 ? data.limit : API_PAGE_SIZE,
        total: typeof data.total === "number" ? data.total : 0
      };

      pageCache.set(getPageCacheKey(normalizedPage.offset, normalizedPage.limit), normalizedPage);
      applyConversationPage(normalizedPage);

      const start = state.pageTotal ? state.pageOffset + 1 : 0;
      const end = state.pageOffset + state.pageItems.length;
      setStatus(
        `Loaded ${start}-${end} of ${state.pageTotal} chats. ${selectedChats.size} selected.`
      );
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      setStatus(`Could not load chats: ${state.lastError}`);
    } finally {
      state.pageLoading = false;
      renderPanel();
      renderModal();
    }
  }

  function normalizeConversations(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item) => item && typeof item.id === "string")
      .map((item) => ({
        id: item.id,
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "Untitled chat",
        updateTime: item.update_time || item.create_time || "",
        createTime: item.create_time || "",
        isArchived: Boolean(item.is_archived)
      }));
  }

  async function fetchConversationPage(offset, limit) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      order: "updated",
      is_archived: "false",
      is_starred: "false"
    });

    return pageFetchJson(`/backend-api/conversations?${params.toString()}`, {
      method: "GET"
    });
  }

  function renderModal() {
    if (!modalRoot || !modalMetaEl || !modalListEl || !modalEmptyEl || !modalPrevButton || !modalNextButton || !modalPageEl || !modalRefreshButton) {
      return;
    }

    const totalPages = Math.max(1, Math.ceil((state.pageTotal || 0) / state.pageLimit));
    const currentPage = Math.floor(state.pageOffset / state.pageLimit) + 1;

    modalPrevButton.disabled = state.pageLoading || state.busy || state.pageOffset === 0;
    modalNextButton.disabled = state.pageLoading || state.busy || !hasNextPage();
    modalRefreshButton.disabled = state.pageLoading || state.busy;
    modalPageEl.textContent = `Page ${currentPage} of ${totalPages}`;

    if (state.pageLoading) {
      modalMetaEl.textContent = "Loading chats from ChatGPT...";
      modalEmptyEl.textContent = "Loading chats...";
      modalEmptyEl.classList.remove("mc-hidden");
      modalListEl.innerHTML = "";
      return;
    }

    if (state.lastError) {
      modalMetaEl.textContent = "Could not load chats.";
      modalEmptyEl.textContent = state.lastError;
      modalEmptyEl.classList.remove("mc-hidden");
      modalListEl.innerHTML = "";
      return;
    }

    if (!state.pageLoadedOnce) {
      modalMetaEl.textContent = "Load chats from the ChatGPT API.";
      modalEmptyEl.textContent = "No chats loaded yet.";
      modalEmptyEl.classList.remove("mc-hidden");
      modalListEl.innerHTML = "";
      return;
    }

    const start = state.pageTotal ? state.pageOffset + 1 : 0;
    const end = state.pageOffset + state.pageItems.length;
    modalMetaEl.textContent = `${start}-${end} of ${state.pageTotal} chats. ${selectedChats.size} selected.`;

    if (!state.pageItems.length) {
      modalEmptyEl.textContent = "No chats found for this page.";
      modalEmptyEl.classList.remove("mc-hidden");
      modalListEl.innerHTML = "";
      return;
    }

    modalEmptyEl.classList.add("mc-hidden");
    modalListEl.innerHTML = state.pageItems
      .map((chat) => {
        const checked = selectedChats.has(chat.id) ? " checked" : "";
        const timestamp = formatTimestamp(chat.updateTime);
        return `
          <label class="mc-chat-item">
            <input class="mc-chat-checkbox" type="checkbox" data-chat-id="${chat.id}"${checked} />
            <span class="mc-chat-text">
              <span class="mc-chat-title">${escapeHtml(chat.title)}</span>
              <span class="mc-chat-meta">${escapeHtml(timestamp)}</span>
            </span>
          </label>
        `;
      })
      .join("");
  }

  function hasNextPage() {
    return state.pageOffset + state.pageLimit < state.pageTotal;
  }

  function clearSelection() {
    if (state.busy) {
      return;
    }

    selectedChats.clear();
    renderPanel();
    renderModal();
    setStatus("Selection cleared.");
  }

  async function onDeleteSelected() {
    if (state.busy || selectedChats.size === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedChats.size} selected chat${selectedChats.size === 1 ? "" : "s"}? This uses ChatGPT's existing conversation visibility request and cannot be undone from this tool.`
    );
    if (!confirmed) {
      return;
    }

    const ids = Array.from(selectedChats.keys());
    const failures = [];

    closeChooser();
    state.busy = true;
    state.total = ids.length;
    state.processed = 0;
    renderPanel();

    for (const id of ids) {
      const chat = selectedChats.get(id);

      try {
        setStatus(`Deleting ${state.processed + 1} of ${state.total}...`);
        updateProgress(state.processed, state.total);
        await patchConversationVisibility(id, false);
        selectedChats.delete(id);
        removeChatFromCurrentPage(id);
        if (state.pageTotal > 0) {
          state.pageTotal -= 1;
        }
      } catch (error) {
        failures.push({
          id,
          title: chat ? chat.title : "Unknown chat",
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        state.processed += 1;
        updateProgress(state.processed, state.total);
        renderPanel();
        await sleep(180);
      }
    }

    state.busy = false;
    state.total = 0;
    state.processed = 0;
    updateProgress(0, 0);

    if (failures.length) {
      setStatus(
        `Deleted ${ids.length - failures.length} chat${ids.length - failures.length === 1 ? "" : "s"}, with ${failures.length} failure${failures.length === 1 ? "" : "s"}.`
      );
      console.warn("[ChatSweep] Failed delete requests:", failures);
    } else {
      setStatus(`Deleted ${ids.length} chat${ids.length === 1 ? "" : "s"}.`);
    }

    renderPanel();
    await refreshPageAfterDelete();
    renderModal();
  }

  async function patchConversationVisibility(conversationId, isVisible) {
    return pageFetchJson(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      body: {
        is_visible: isVisible
      }
    }).then((data) => {
    if (!data || data.success !== true) {
      throw new Error("ChatGPT did not confirm the delete request.");
    }
    });
  }

  async function refreshPageAfterDelete() {
    if (!state.pageLoadedOnce) {
      return;
    }

    pageCache.clear();
    const maxOffset = state.pageTotal > 0
      ? Math.floor((state.pageTotal - 1) / state.pageLimit) * state.pageLimit
      : 0;
    const nextOffset = Math.min(state.pageOffset, maxOffset);
    await loadConversationPage(nextOffset, false, true);
  }

  function removeChatFromCurrentPage(conversationId) {
    state.pageItems = state.pageItems.filter((item) => item.id !== conversationId);
  }

  function getPageCacheKey(offset, limit) {
    return `${offset}:${limit}`;
  }

  function applyConversationPage(page) {
    state.pageItems = Array.isArray(page.items) ? page.items.slice() : [];
    state.pageOffset = typeof page.offset === "number" ? page.offset : 0;
    state.pageLimit = typeof page.limit === "number" && page.limit > 0 ? page.limit : API_PAGE_SIZE;
    state.pageTotal = typeof page.total === "number" ? page.total : state.pageItems.length;
    state.pageLoadedOnce = true;
    state.lastError = "";
  }

  async function getEnabledState() {
    if (!chrome?.storage?.local) {
      return true;
    }

    try {
      const data = await chrome.storage.local.get({
        [STORAGE_ENABLED_KEY]: undefined,
        [LEGACY_STORAGE_ENABLED_KEY]: true
      });

      if (typeof data[STORAGE_ENABLED_KEY] === "boolean") {
        return data[STORAGE_ENABLED_KEY];
      }

      return Boolean(data[LEGACY_STORAGE_ENABLED_KEY]);
    } catch (error) {
      console.warn("[ChatSweep] Falling back to enabled state", error);
      return true;
    }
  }

  function attachStorageListener() {
    if (!chrome?.storage?.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      const nextValue = changes[STORAGE_ENABLED_KEY]?.newValue;
      const legacyValue = changes[LEGACY_STORAGE_ENABLED_KEY]?.newValue;
      if (typeof nextValue !== "boolean" && typeof legacyValue !== "boolean") {
        return;
      }

      extensionEnabled = typeof nextValue === "boolean" ? nextValue : Boolean(legacyValue);
      if (extensionEnabled) {
        activateUi();
      } else {
        deactivateUi();
      }
    });
  }

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = message;
    }
  }

  function renderPanel() {
    if (countEl) {
      countEl.textContent = String(selectedChats.size);
    }

    if (deleteButton) {
      deleteButton.disabled = state.busy || selectedChats.size === 0;
      deleteButton.textContent = state.busy ? "Deleting..." : "Delete selected";
    }

    if (chooseButton) {
      chooseButton.disabled = state.busy;
    }

    if (clearButton) {
      clearButton.disabled = state.busy || selectedChats.size === 0;
    }
  }

  function updateProgress(processed, total) {
    if (!progressEl) {
      return;
    }

    if (!total) {
      progressEl.style.width = "0%";
      return;
    }

    const value = Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
    progressEl.style.width = `${value}%`;
  }

  function formatTimestamp(value) {
    if (!value) {
      return "No recent activity time";
    }

    try {
      return new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch (error) {
      return value;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function waitForDocumentReady() {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      return;
    }

    await new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  async function pageFetchJson(path, options) {
    const payload = await pageFetch(path, options);
    if (!payload.ok) {
      throw new Error(`Request failed (${payload.status})`);
    }
    return payload.data;
  }

  function pageFetch(path, options) {
    return new Promise((resolve, reject) => {
      const id = `mc-${Date.now()}-${bridgeRequestId += 1}`;
      const timeoutId = window.setTimeout(() => {
        pendingBridgeRequests.delete(id);
        reject(new Error("Timed out waiting for the page request to complete."));
      }, 15000);

      pendingBridgeRequests.set(id, {
        resolve,
        reject,
        timeoutId
      });

      window.dispatchEvent(
        new CustomEvent(BRIDGE_REQUEST_EVENT, {
          detail: {
            id,
            path,
            method: options?.method || "GET",
            body: options?.body || null
          }
        })
      );
    });
  }

  function attachBridgeListener() {
    if (window.__chatSweepBridgeListenerAttached) {
      return;
    }

    window.__chatSweepBridgeListenerAttached = true;
    window.addEventListener(BRIDGE_RESPONSE_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail.id !== "string") {
        return;
      }

      const pending = pendingBridgeRequests.get(detail.id);
      if (!pending) {
        return;
      }

      window.clearTimeout(pending.timeoutId);
      pendingBridgeRequests.delete(detail.id);

      if (detail.ok) {
        pending.resolve(detail);
      } else {
        pending.reject(new Error(detail.error || "Unknown page request failure."));
      }
    });
  }

  async function injectPageBridge() {
    if (window.__chatSweepBridgeReady) {
      return;
    }

    const existingScript = document.getElementById(BRIDGE_SCRIPT_ID);
    if (existingScript) {
      await waitForBridgeReady();
      return;
    }

    const parent = document.head || document.documentElement || document.body;
    if (!parent) {
      throw new Error("Could not inject page bridge because the document is not ready.");
    }

    const script = document.createElement("script");
    script.id = BRIDGE_SCRIPT_ID;
    script.src = chrome.runtime.getURL("src/page-bridge.js");
    script.async = false;

    const readyPromise = waitForBridgeReady();
    const loadPromise = new Promise((resolve, reject) => {
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => {
        reject(new Error("Failed to load the page bridge script."));
      }, { once: true });
    });

    parent.appendChild(script);
    await loadPromise;
    await readyPromise;
  }

  function waitForBridgeReady() {
    if (window.__chatSweepBridgeReady || document.documentElement?.hasAttribute(BRIDGE_READY_ATTR)) {
      window.__chatSweepBridgeReady = true;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener(BRIDGE_READY_EVENT, onReady);
        reject(new Error("Timed out waiting for the page bridge to initialize."));
      }, 5000);

      function onReady() {
        window.__chatSweepBridgeReady = true;
        window.clearTimeout(timeoutId);
        window.removeEventListener(BRIDGE_READY_EVENT, onReady);
        resolve();
      }

      window.addEventListener(BRIDGE_READY_EVENT, onReady, { once: true });
    });
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
