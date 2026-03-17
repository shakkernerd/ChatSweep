(function () {
  const requestEvent = "mc:page-fetch:request";
  const responseEvent = "mc:page-fetch:response";
  const readyEvent = "mc:page-fetch:ready";
  const readyAttr = "data-mc-page-bridge-ready";
  const captureHeaderNames = [
    "authorization",
    "oai-client-build-number",
    "oai-client-version",
    "oai-device-id",
    "oai-language",
    "oai-session-id"
  ];

  if (window.__chatSweepPageBridgeInjected) {
    document.documentElement?.setAttribute(readyAttr, "true");
    window.dispatchEvent(new CustomEvent(readyEvent));
    return;
  }

  window.__chatSweepPageBridgeInjected = true;
  window.__chatSweepCapturedHeaders = window.__chatSweepCapturedHeaders || {};

  const nativeFetch = window.fetch.bind(window);

  function normalizeUrl(input) {
    try {
      if (typeof input === "string") {
        return new URL(input, window.location.origin);
      }
      if (input instanceof URL) {
        return input;
      }
      if (input instanceof Request) {
        return new URL(input.url, window.location.origin);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function collectHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    return headers;
  }

  function maybeCaptureHeaders(input, init) {
    const url = normalizeUrl(input);
    if (!url || url.origin !== window.location.origin) {
      return;
    }

    if (!url.pathname.startsWith("/backend-api/conversations") && !url.pathname.startsWith("/backend-api/conversation/")) {
      return;
    }

    const headers = collectHeaders(input, init);
    for (const name of captureHeaderNames) {
      const value = headers.get(name);
      if (value) {
        window.__chatSweepCapturedHeaders[name] = value;
      }
    }
  }

  window.fetch = function manageChatsFetchProxy(input, init) {
    maybeCaptureHeaders(input, init);
    return nativeFetch(input, init);
  };

  function buildTargetRoute(pathname) {
    if (pathname === "/backend-api/conversations") {
      return "/backend-api/conversations";
    }
    if (pathname.startsWith("/backend-api/conversation/")) {
      return "/backend-api/conversation/{conversation_id}";
    }
    return pathname;
  }

  window.addEventListener(requestEvent, async (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || typeof detail.id !== "string" || typeof detail.path !== "string") {
      return;
    }

    try {
      const url = new URL(detail.path, window.location.origin);
      const capturedHeaders = window.__chatSweepCapturedHeaders || {};
      const headers = new Headers({
        Accept: "*/*"
      });

      for (const [name, value] of Object.entries(capturedHeaders)) {
        if (value) {
          headers.set(name, value);
        }
      }

      if (!headers.get("authorization")) {
        throw new Error("ChatGPT auth headers are not ready yet. Refresh the ChatGPT page and try again.");
      }

      headers.set("x-openai-target-path", url.pathname);
      headers.set("x-openai-target-route", buildTargetRoute(url.pathname));

      const init = {
        method: detail.method || "GET",
        credentials: "include",
        headers
      };

      if (detail.body != null) {
        headers.set("Content-Type", "application/json");
        init.body = JSON.stringify(detail.body);
      }

      const response = await nativeFetch(detail.path, init);
      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch (error) {
        data = { raw: text };
      }

      window.dispatchEvent(
        new CustomEvent(responseEvent, {
          detail: {
            id: detail.id,
            ok: response.ok,
            status: response.status,
            data
          }
        })
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent(responseEvent, {
          detail: {
            id: detail.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          }
        })
      );
    }
  });

  document.documentElement?.setAttribute(readyAttr, "true");
  window.dispatchEvent(new CustomEvent(readyEvent));
})();
