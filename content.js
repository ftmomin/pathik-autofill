// Runs in ISOLATED world
// Responsibilities:
//   1. Bridge window.pathikAutofill() calls → background storage
//   2. Fill form fields when background sends FILL_FORM after a submenu click

// Bridge: injected.js (MAIN world) → background.js
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "PATHIK_INJECTED_TO_CS") return;

  const { type, id, data } = event.data;
  if (type !== "SAVE_ENTRY") return;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "SAVE_ENTRY", data });
  } catch (err) {
    response = { success: false, error: err.message };
  }

  window.postMessage(
    {
      source: "PATHIK_CS_TO_INJECTED",
      id,
      success: response?.success ?? false,
      error:   response?.error   ?? null,
    },
    location.origin
  );
});

// Fill form when user picks an entry from the context submenu
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FILL_FORM") {
    const count = fillForm(message.entry);
    showToast(`Filled ${count} field${count !== 1 ? "s" : ""}`);
    sendResponse({ ok: true });
  }
  return false;
});

// Keys that are internal / non-form fields — skip when filling
const SKIP_KEYS = new Set(["other_guests", "action", "_savedAt"]);

function fillField(el, value) {
  if (!el || value === undefined || value === null) return false;

  const tag = el.tagName.toLowerCase();

  if (tag === "select") {
    const val = String(value).toLowerCase();
    const match = Array.from(el.options).find(
      (o) => o.value.toLowerCase() === val || o.text.toLowerCase() === val
    );
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  // React-aware: bypass synthetic event via native setter
  const proto  = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, String(value));
  else el.value = String(value);

  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// Find the first element matching any of the given selectors
function queryAny(...selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function fillForm(data) {
  let filled = 0;

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;

    // Match by name attribute (primary), then by id
    const el = queryAny(`[name="${key}"]`, `#${key}`);
    if (el && fillField(el, value)) filled++;
  }

  // Additional guest rows — field names use a _N suffix or bracket notation
  if (Array.isArray(data.other_guests)) {
    data.other_guests.forEach((guest, i) => {
      const n = i + 1;
      const pairs = [
        ["other_full_name",       guest.other_full_name],
        ["other_mobile_number",   guest.other_mobile_number],
        ["other_doc_type",        guest.other_doc_type],
        ["other_document_number", guest.other_document_number],
      ];
      pairs.forEach(([field, val]) => {
        const el = queryAny(
          `[name="${field}_${n}"]`,
          `[name="${field}[]"]`,
          `[name="other_guests[${i}][${field}]"]`
        );
        if (el && fillField(el, val)) filled++;
      });
    });
  }

  return filled;
}

// --- Toast ---

function showToast(msg) {
  document.querySelector(".pathik-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "pathik-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
