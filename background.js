const HOST_NAME = "com.openinbrowser.host";
const TIMEOUT_MS = 4000;

// Dipakai bila native host belum terpasang / tidak membalas `list`.
const KNOWN_BROWSERS = {
  brave: "Brave",
  arc: "Arc",
  chrome: "Chrome",
  edge: "Edge",
  vivaldi: "Vivaldi",
  opera: "Opera",
  chromium: "Chromium",
  firefox: "Firefox",
  safari: "Safari"
};

// Urutan pilihan otomatis. Di Brave -> Arc dulu; di browser lain -> Brave dulu.
const AUTO_ORDER = ["brave", "arc", "chrome", "edge", "vivaldi", "opera", "firefox", "safari", "chromium"];
const AUTO_ORDER_IN_BRAVE = ["arc", "chrome", "edge", "vivaldi", "opera", "firefox", "safari", "chromium"];

// Storage (chrome.storage.local, per browser):
//   detected: { browsers: [{id,label}] | null, current: id | null }  <- dari host
//   settings: { targets: [id], defaultTarget: id }                   <- dari Options;
//             tidak ada = mode otomatis (1 tujuan, menu datar)

function log(...args) {
  console.log("[Send to Browser]", ...args);
}

// ---------------------------------------------------------------------------
// Native host

function sendNative(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(
        "Native host did not respond within " + TIMEOUT_MS + " ms. " +
        "This browser may not support native messaging."
      ));
    }, TIMEOUT_MS);

    chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error("sendNativeMessage failed: " + err.message));
        return;
      }
      if (!response || response.status !== "ok") {
        reject(new Error("Host returned an error: " + JSON.stringify(response)));
        return;
      }
      resolve(response);
    });
  });
}

// ---------------------------------------------------------------------------
// Deteksi

// Tebakan dari sisi extension. Arc melapor sebagai "Google Chrome", jadi di
// macOS hasil host (proses induk) lebih dipercaya bila tersedia.
function detectFromExtension() {
  if (typeof navigator.brave !== "undefined") return "brave";
  const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand);
  if (brands.some((b) => /brave/i.test(b))) return "brave";
  if (brands.some((b) => /edge/i.test(b))) return "edge";
  if (brands.some((b) => /opera/i.test(b))) return "opera";
  if (brands.some((b) => /google chrome/i.test(b))) return "chrome";
  return null;
}

async function refreshDetection() {
  let detected;
  try {
    const res = await sendNative({ action: "list" });
    detected = { browsers: res.browsers || [], current: res.current || null, hostOk: true };
  } catch (e) {
    log("host list failed:", e.message);
    detected = { browsers: null, current: null, hostOk: false, hostError: e.message };
  }
  await chrome.storage.local.set({ detected });
  return detected;
}

async function getState() {
  const { detected, settings } = await chrome.storage.local.get(["detected", "settings"]);
  const det = detected || { browsers: null, current: null, hostOk: false };
  const current = det.current || detectFromExtension();

  // Tanpa daftar dari host, anggap semua browser yang dikenal tersedia.
  const installed = det.browsers ||
    Object.entries(KNOWN_BROWSERS).map(([id, label]) => ({ id, label }));
  const available = installed.filter((b) => b.id !== current);
  const byId = Object.fromEntries(available.map((b) => [b.id, b]));

  let targetIds = [];
  let defaultTarget = null;

  if (settings?.targets?.length) {
    targetIds = settings.targets.filter((id) => byId[id]);
    defaultTarget = targetIds.includes(settings.defaultTarget)
      ? settings.defaultTarget
      : targetIds[0] || null;
  }

  // Mode otomatis (atau pilihan user sudah tidak terpasang): satu tujuan.
  if (!targetIds.length) {
    const order = current === "brave" ? AUTO_ORDER_IN_BRAVE : AUTO_ORDER;
    defaultTarget = order.find((id) => byId[id]) || available[0]?.id || null;
    targetIds = defaultTarget ? [defaultTarget] : [];
  }

  // Default selalu paling atas.
  targetIds = [defaultTarget, ...targetIds.filter((id) => id !== defaultTarget)].filter(Boolean);

  return {
    current,
    hostOk: det.hostOk,
    hostError: det.hostError || null,
    available,
    settings: settings || null,
    targets: targetIds.map((id) => byId[id]),
    defaultTarget
  };
}

// ---------------------------------------------------------------------------
// Menu

function createMenu(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      if (chrome.runtime.lastError) log("menu create:", chrome.runtime.lastError.message);
      resolve();
    });
  });
}

let rebuildChain = Promise.resolve();

// 1 tujuan -> item datar; 2+ tujuan -> submenu. Diserialkan supaya
// removeAll/create dari beberapa event tidak saling tumpang tindih.
function rebuildMenus() {
  rebuildChain = rebuildChain.then(async () => {
    const state = await getState();
    await chrome.contextMenus.removeAll();

    const defaultLabel = state.targets[0]?.label;
    chrome.action.setTitle({
      title: defaultLabel ? "Open in " + defaultLabel : "Open in… (choose a browser)"
    });

    if (!state.targets.length) {
      await createMenu({ id: "setup", title: "Open in… choose a browser", contexts: ["link", "page"] });
      return;
    }

    if (state.targets.length === 1) {
      const t = state.targets[0];
      await createMenu({ id: "link:" + t.id, title: "Open link in " + t.label, contexts: ["link"] });
      await createMenu({ id: "page:" + t.id, title: "Open this tab in " + t.label, contexts: ["page"] });
      return;
    }

    await createMenu({ id: "link-parent", title: "Open link in", contexts: ["link"] });
    await createMenu({ id: "page-parent", title: "Open this tab in", contexts: ["page"] });
    for (const t of state.targets) {
      await createMenu({ id: "link:" + t.id, parentId: "link-parent", title: t.label, contexts: ["link"] });
      await createMenu({ id: "page:" + t.id, parentId: "page-parent", title: t.label, contexts: ["page"] });
    }
  }).catch((e) => log("rebuildMenus failed:", e));
  return rebuildChain;
}

chrome.runtime.onInstalled.addListener(async () => {
  await rebuildMenus();
  await refreshDetection();
});

chrome.runtime.onStartup.addListener(() => {
  refreshDetection();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.detected || changes.settings)) rebuildMenus();
});

// Options page meminta state terbaru (deteksi ulang setiap kali dibuka).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getState") {
    refreshDetection().then(getState).then(sendResponse);
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Aksi

function reportError(message) {
  console.error("[Send to Browser]", message);
  chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  chrome.action.setBadgeText({ text: "ERR" });
  chrome.tabs.create({
    url: chrome.runtime.getURL("error.html") + "#" + encodeURIComponent(message)
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  log("menu clicked:", info.menuItemId);
  const [kind, target] = String(info.menuItemId).split(":");

  if (kind === "setup") {
    chrome.runtime.openOptionsPage();
    return;
  }

  if (kind === "link") {
    if (!info.linkUrl) {
      reportError("Menu clicked but linkUrl is empty.");
      return;
    }
    openUrlInTarget(info.linkUrl, target);
    return;
  }

  if (kind === "page") {
    // info.pageUrl sudah berisi URL tab aktif, tanpa perlu permission tabs.
    // Fallback ke tab aktif bila pageUrl kosong (mis. chrome:// atau edge case).
    const url = info.pageUrl || tab?.url || (await getActiveTabUrl());
    if (!url) {
      reportError("Could not determine the current tab URL.");
      return;
    }
    openUrlInTarget(url, target);
  }
});

// Klik ikon toolbar = buka tab aktif di browser default.
chrome.action.onClicked.addListener(async (tab) => {
  const { defaultTarget } = await getState();
  if (!defaultTarget) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const url = tab?.url || (await getActiveTabUrl());
  if (!url) {
    reportError("Could not determine the current tab URL.");
    return;
  }
  openUrlInTarget(url, defaultTarget);
});

async function getActiveTabUrl() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return activeTab?.url || null;
  } catch (e) {
    console.error("[Send to Browser] getActiveTabUrl failed:", e);
    return null;
  }
}

async function openUrlInTarget(url, target) {
  log("opening in", target + ":", url);

  chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  chrome.action.setBadgeText({ text: "..." });

  try {
    const response = await sendNative({ url, target });
    log("host response:", response);
  } catch (e) {
    reportError(e.message);
    return;
  }

  chrome.action.setBadgeBackgroundColor({ color: "#188038" });
  chrome.action.setBadgeText({ text: "OK" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}
