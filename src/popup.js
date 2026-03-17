const STORAGE_KEY = "chatSweepEnabled";
const LEGACY_STORAGE_KEY = "manageChatsEnabled";

const toggle = document.getElementById("enabled-toggle");
const status = document.getElementById("status");

init().catch((error) => {
  console.error("[ChatSweep] Popup failed to initialize", error);
  setStatus("Could not load settings.");
});

async function init() {
  const data = await chrome.storage.local.get({
    [STORAGE_KEY]: undefined,
    [LEGACY_STORAGE_KEY]: true
  });
  const enabled = typeof data[STORAGE_KEY] === "boolean"
    ? data[STORAGE_KEY]
    : Boolean(data[LEGACY_STORAGE_KEY]);
  toggle.checked = enabled;
  renderStatus(toggle.checked);

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({
      [STORAGE_KEY]: enabled,
      [LEGACY_STORAGE_KEY]: enabled
    });
    renderStatus(enabled);
  });
}

function renderStatus(enabled) {
  setStatus(
    enabled
      ? "ChatSweep is enabled. Open ChatGPT to use the cleanup panel."
      : "ChatSweep is disabled. The injected ChatGPT controls should stay hidden."
  );
}

function setStatus(message) {
  status.textContent = message;
}
