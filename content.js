// Runs in ISOLATED world
// Responsibilities:
//   1. Bridge window.pathikAutofill() calls → background storage
//   2. Fill form fields when background sends FILL_FORM after a submenu click

// Bridge: injected.js (MAIN world) → background.js
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'PATHIK_INJECTED_TO_CS') return;

  const { type, id, data } = event.data;

  if (type === 'GET_ENTRIES') {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'GET_ENTRIES' });
    } catch (err) {
      response = { error: err.message };
    }
    window.postMessage(
      {
        source: 'PATHIK_CS_TO_INJECTED',
        id,
        success: !response?.error,
        entries: response?.entries ?? [],
        error: response?.error ?? null,
      },
      location.origin,
    );
    return;
  }

  if (type !== 'SAVE_ENTRY') return;

  // Reject save if any value doesn't match the actual page select options
  const invalid = invalidSelectField(data);
  if (invalid) {
    window.postMessage(
      {
        source: 'PATHIK_CS_TO_INJECTED',
        id,
        success: false,
        error: `"${invalid.value}" is not a valid option for "${invalid.field}"`,
      },
      location.origin,
    );
    return;
  }

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'SAVE_ENTRY', data });
  } catch (err) {
    response = { success: false, error: err.message };
  }

  window.postMessage(
    {
      source: 'PATHIK_CS_TO_INJECTED',
      id,
      success: response?.success ?? false,
      error: response?.error ?? null,
    },
    location.origin,
  );
});

// Fill form when user picks an entry from the context submenu
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FILL_FORM') {
    fillForm(message.entry).then((count) => {
      showToast(`Filled ${count} field${count !== 1 ? 's' : ''}`);
      sendResponse({ ok: true });
    });
    return true; // keep channel open for async response
  }
  return false;
});

// Keys that are internal / non-form fields — skip when filling
const SKIP_KEYS = new Set(['other_guests', 'action', '_savedAt']);

// Fields whose options load lazily on click — click first, wait, then fill
const LAZY_FIELDS = new Set(['country', 'state', 'doc_type']);

// Processing order for lazy fields: state depends on country being selected first
const LAZY_ORDER = ['country', 'state', 'doc_type'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns { field, value } if any data key maps to a <select> on the page
// and the supplied value isn't a valid option; otherwise returns null.
function invalidSelectField(data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    const el = document.querySelector(`[name="${key}"]`);
    if (!el || el.tagName.toLowerCase() !== 'select') continue;
    const val = String(value).toLowerCase().trim();
    const ok = Array.from(el.options).some(
      (o) =>
        o.value.toLowerCase() === val || o.text.toLowerCase().trim() === val,
    );
    if (!ok) return { field: key, value };
  }
  return null;
}

function fillField(el, value) {
  if (!el || value === undefined || value === null) return false;

  const tag = el.tagName.toLowerCase();

  if (tag === 'select') {
    const val = String(value).toLowerCase().trim();
    const match = Array.from(el.options).find(
      (o) =>
        o.value.toLowerCase() === val || o.text.toLowerCase().trim() === val,
    );
    if (!match) return false;

    // Bootstrap Select: if the custom <a> items are in the DOM, click the
    // matching one — BS handles setting the native value and firing change.
    const bsWrapper = el.closest('.bootstrap-select');
    if (bsWrapper) {
      const matchText = match.text.toLowerCase().trim();
      const optEl = Array.from(
        bsWrapper.querySelectorAll('.dropdown-menu a[role="option"]'),
      ).find((a) => {
        const text = (a.querySelector('.text')?.textContent ?? a.textContent)
          .trim()
          .toLowerCase();
        return text === val || text === matchText;
      });
      if (optEl) {
        optEl.click();
        return true;
      }
    }

    // Fallback for non-BS selects or BS with un-rendered dropdown items.
    // Only fire change when the value actually changed; avoids triggering
    // cascade AJAX (e.g. country → state reload) when already correct.
    const prev = el.value;
    el.value = match.value;
    if (el.value !== prev) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  // React-aware: bypass synthetic event via native setter
  const proto =
    tag === 'textarea'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, String(value));
  else el.value = String(value);

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Click the visible control to open the dropdown
function triggerOpen(el) {
  const bsWrapper = el.closest('.bootstrap-select');
  if (bsWrapper) {
    const btn = bsWrapper.querySelector('button.dropdown-toggle');
    if (btn) { btn.click(); return; }
  }
  el.click();
  el.dispatchEvent(new Event('focus', { bubbles: true }));
}

// Close the dropdown without selecting anything
function triggerClose(el) {
  const bsWrapper = el.closest('.bootstrap-select');
  if (bsWrapper) {
    const btn = bsWrapper.querySelector('button.dropdown-toggle');
    const isOpen = bsWrapper.classList.contains('open') || bsWrapper.classList.contains('show');
    if (btn && isOpen) { btn.click(); return; }
  }
  // Escape key on the focused element closes most dropdown libraries
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
  );
  // Final fallback: click outside to dismiss
  document.body.click();
}

// Open dropdown, type value into its search input, then click the first result
// if the filtered list has items; otherwise close the dropdown.
async function fillLazyField(el, value) {
  triggerOpen(el);
  await sleep(1000);

  const str = String(value);
  const bsWrapper = el.closest('.bootstrap-select');
  const container = bsWrapper ?? el.parentElement;

  const searchInput = container.querySelector(
    '.bs-searchbox input, .select2-search__field, input[type="search"]',
  );

  if (searchInput) {
    searchInput.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(searchInput, str);
    else searchInput.value = str;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    await sleep(500);

    const firstItem = container.querySelector('.dropdown-menu a[role="option"]:not(.disabled)');
    if (firstItem) {
      firstItem.click();
    } else {
      triggerClose(el);
    }
  } else {
    fillField(el, value);
  }
}

// Find the first element matching any of the given selectors
function queryAny(...selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function fillForm(data) {
  let filled = 0;
  const lazyMap = new Map(); // key → [el, value]

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;

    // Match by name attribute (primary), then by id
    const el = queryAny(`[name="${key}"]`, `#${key}`);
    if (!el) continue;

    if (LAZY_FIELDS.has(key)) {
      lazyMap.set(key, [el, value]);
    } else {
      if (fillField(el, value)) filled++;
    }
  }

  // Process in dependency order: country must be selected before state loads
  for (const key of LAZY_ORDER) {
    if (!lazyMap.has(key)) continue;
    const [el, value] = lazyMap.get(key);
    await fillLazyField(el, value);
    filled++;
  }

  // Additional guest rows — field names use a _N suffix or bracket notation
  if (Array.isArray(data.other_guests)) {
    data.other_guests.forEach((guest, i) => {
      const n = i + 1;
      const pairs = [
        ['other_full_name', guest.other_full_name],
        ['other_mobile_number', guest.other_mobile_number],
        ['other_doc_type', guest.other_doc_type],
        ['other_document_number', guest.other_document_number],
      ];
      pairs.forEach(([field, val]) => {
        const el = queryAny(
          `[name="${field}_${n}"]`,
          `[name="${field}[]"]`,
          `[name="other_guests[${i}][${field}]"]`,
        );
        if (el && fillField(el, val)) filled++;
      });
    });
  }

  return filled;
}

// --- Toast ---

function showToast(msg) {
  document.querySelector('.pathik-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'pathik-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
