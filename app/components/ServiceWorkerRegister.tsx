"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      let hasRefreshed = false;

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hasRefreshed) return;
        hasRefreshed = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          const requestSkipWaiting = () => {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          };

          if (reg.waiting) {
            requestSkipWaiting();
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                requestSkipWaiting();
              }
            });
          });

          // Also poll once to detect updates for already-open sessions.
          reg.update().catch(() => {});
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
