const HOST_NAME = "com.openinbrave.host";
const MENU_LINK_ID = "open-link-in-brave";
const MENU_PAGE_ID = "open-tab-in-brave";
const TIMEOUT_MS = 4000;

// Deteksi browser tempat extension berjalan, lalu target = browser lawannya.
// Di Brave -> buka di Arc; di browser lain (Arc/Chrome/Edge) -> buka di Brave.
function isRunningInBrave() {
  if (typeof navigator.brave !== "undefined") return true;
  const brands = navigator.userAgentData?.brands || [];
  return brands.some((b) => /brave/i.test(b.brand));
}

const TARGET = isRunningInBrave()
  ? { id: "arc", label: "Arc" }
  : { id: "brave", label: "Brave" };

console.log("[Open in Brave] target browser:", TARGET.id);

chrome.action.setTitle({ title: "Open in " + TARGET.label });

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_LINK_ID,
      title: "Open link in " + TARGET.label,
      contexts: ["link"]
    });
    chrome.contextMenus.create({
      id: MENU_PAGE_ID,
      title: "Open this tab in " + TARGET.label,
      contexts: ["page"]
    });
  });
});

function reportError(message) {
  console.error("[Open in Brave]", message);
  chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  chrome.action.setBadgeText({ text: "ERR" });
  chrome.tabs.create({
    url: chrome.runtime.getURL("error.html") + "#" + encodeURIComponent(message)
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("[Open in Brave] menu clicked:", info.menuItemId);

  if (info.menuItemId === MENU_LINK_ID) {
    if (!info.linkUrl) {
      reportError("Menu clicked but linkUrl is empty.");
      return;
    }
    openUrlInTarget(info.linkUrl);
    return;
  }

  if (info.menuItemId === MENU_PAGE_ID) {
    // info.pageUrl sudah berisi URL tab aktif, tanpa perlu permission tabs.
    // Fallback ke tab aktif bila pageUrl kosong (mis. chrome:// atau edge case).
    const url = info.pageUrl || tab?.url || (await getActiveTabUrl());
    if (!url) {
      reportError("Could not determine the current tab URL.");
      return;
    }
    openUrlInTarget(url);
    return;
  }
});

// Klik ikon toolbar = buka tab aktif di browser target.
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab?.url || (await getActiveTabUrl());
  if (!url) {
    reportError("Could not determine the current tab URL.");
    return;
  }
  openUrlInTarget(url);
});

async function getActiveTabUrl() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return activeTab?.url || null;
  } catch (e) {
    console.error("[Open in Brave] getActiveTabUrl failed:", e);
    return null;
  }
}

function openUrlInTarget(url) {
  console.log("[Open in Brave] opening in", TARGET.id + ":", url);

  chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  chrome.action.setBadgeText({ text: "..." });

  let settled = false;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reportError(
      "Native host did not respond within " + TIMEOUT_MS + " ms. " +
      "This browser may not support native messaging."
    );
  }, TIMEOUT_MS);

  chrome.runtime.sendNativeMessage(HOST_NAME, { url, target: TARGET.id }, (response) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);

    const err = chrome.runtime.lastError;
    if (err) {
      reportError("sendNativeMessage failed: " + err.message);
      return;
    }

    console.log("[Open in Brave] host response:", response);
    if (!response || response.status !== "ok") {
      reportError("Host returned an error: " + JSON.stringify(response));
      return;
    }

    chrome.action.setBadgeBackgroundColor({ color: "#188038" });
    chrome.action.setBadgeText({ text: "OK" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
  });
}
