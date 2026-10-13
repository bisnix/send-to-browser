const KNOWN_LABELS = {
  brave: "Brave", arc: "Arc", chrome: "Chrome", edge: "Edge", vivaldi: "Vivaldi",
  opera: "Opera", chromium: "Chromium", firefox: "Firefox", safari: "Safari"
};

const $ = (id) => document.getElementById(id);
let state = null;

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
}

async function load() {
  state = await chrome.runtime.sendMessage({ type: "getState" });
  render();
}

function render() {
  const currentLabel = KNOWN_LABELS[state.current];
  $("where").textContent = currentLabel
    ? "You're in " + currentLabel + "."
    : "Pick where links should open.";

  const warn = $("host-warn");
  warn.hidden = state.hostOk;
  if (!state.hostOk) {
    warn.replaceChildren(
      "Helper app not installed yet, so the browser list can't be checked. Run ",
      el("code", { textContent: "./install.sh" }),
      " (macOS) or ",
      el("code", { textContent: "install.ps1" }),
      " (Windows), then reopen this page."
    );
  }

  const auto = !state.settings;
  document.querySelector('input[name=mode][value=auto]').checked = auto;
  document.querySelector('input[name=mode][value=choose]').checked = !auto;
  $("auto-desc").textContent = auto && state.targets[0]
    ? "— opens in " + state.targets[0].label
    : "";

  const list = $("choose-list");
  list.hidden = auto;
  const enabled = new Set(state.targets.map((t) => t.id));
  list.replaceChildren(...state.available.map((b) => {
    const check = el("input", { type: "checkbox", checked: enabled.has(b.id) });
    check.addEventListener("change", () => toggle(b.id, check.checked));
    const def = el("input", {
      type: "radio", name: "default",
      checked: state.defaultTarget === b.id,
      disabled: !enabled.has(b.id)
    });
    def.addEventListener("change", () => setDefault(b.id));
    return el("div", { className: "row" }, [
      el("label", {}, [check, b.label]),
      el("label", { className: "def" }, [def, "default"])
    ]);
  }));
}

async function save(settings) {
  if (settings) {
    await chrome.storage.local.set({ settings });
  } else {
    await chrome.storage.local.remove("settings");
  }
  await load();
}

function currentChoice() {
  return {
    targets: state.targets.map((t) => t.id),
    defaultTarget: state.defaultTarget
  };
}

function toggle(id, on) {
  const s = currentChoice();
  s.targets = on ? [...s.targets, id] : s.targets.filter((t) => t !== id);
  if (!s.targets.length) {
    // Minimal satu tujuan; kosong = kembali otomatis.
    save(null);
    return;
  }
  if (!s.targets.includes(s.defaultTarget)) s.defaultTarget = s.targets[0];
  save(s);
}

function setDefault(id) {
  const s = currentChoice();
  s.defaultTarget = id;
  save(s);
}

document.querySelectorAll("input[name=mode]").forEach((radio) => {
  radio.addEventListener("change", () => {
    // Pindah ke "choose" mulai dari tujuan otomatis yang sekarang.
    save(radio.value === "auto" ? null : currentChoice());
  });
});

load();
