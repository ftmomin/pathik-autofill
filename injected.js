// Runs in the page's MAIN world — exposes window.pathikAutofill
(function () {
  if (window.pathikAutofill) return;

  const pendingRequests = new Map();
  let _counter = 0;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "PATHIK_CS_TO_INJECTED") return;

    const { id, success, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    if (success) {
      pending.resolve({ success: true });
    } else {
      pending.reject(new Error(error ?? "Unknown error"));
    }
  });

  window.pathikAutofill = function (options) {
    return new Promise((resolve, reject) => {
      const id = `pathik_${++_counter}_${Date.now()}`;
      pendingRequests.set(id, { resolve, reject });

      const timer = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error("Pathik Autofill: request timed out"));
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
          source: "PATHIK_INJECTED_TO_CS",
          type: "SAVE_ENTRY",
          id,
          data: options?.data ?? options,
        },
        location.origin
      );
    });
  };

  window.pathikAutofill.version = "1.0.0";
})();
