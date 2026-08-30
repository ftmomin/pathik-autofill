// Runs in the page's MAIN world — exposes window.formAutofill
(function () {
  if (window.formAutofill) return;

  const pendingRequests = new Map();
  let _counter = 0;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "FA_CS_TO_INJECTED") return;

    const { id, success, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    if (success) {
      pending.resolve(event.data);
    } else {
      pending.reject(new Error(error ?? "Unknown error"));
    }
  });

  window.formAutofill = function (options) {
    return new Promise((resolve, reject) => {
      const id = `fa_${++_counter}_${Date.now()}`;
      pendingRequests.set(id, { resolve, reject });

      const timer = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error("Form FillBridge: request timed out"));
        }
      }, 10000);

      // Cancel timer on resolution
      const origResolve = resolve;
      const origReject = reject;
      pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timer); origResolve(v); },
        reject:  (e) => { clearTimeout(timer); origReject(e); },
      });

      window.postMessage(
        {
          source: "FA_INJECTED_TO_CS",
          type: "SAVE_ENTRY",
          id,
          data: options?.data ?? options,
        },
        location.origin
      );
    });
  };

  window.formAutofill.getEntries = function () {
    return new Promise((resolve, reject) => {
      const id = `fa_${++_counter}_${Date.now()}`;
      const timer = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error("Form FillBridge: getEntries timed out"));
        }
      }, 5000);
      pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject:  (e) => { clearTimeout(timer); reject(e); },
      });
      window.postMessage(
        { source: "FA_INJECTED_TO_CS", type: "GET_ENTRIES", id },
        location.origin
      );
    });
  };

  window.formAutofill.version = "1.0.0";
  window.formAutofill.isInstalled = true;
})();
