"use client";

import { useEffect } from "react";

// This app no longer uses a service worker. The previous cache-first worker
// caused stale deploys to stick around until users manually cleared site
// data, so instead of registering one we now actively tear down any worker
// and cache left over from older versions on every load.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            void registration.unregister();
          });
        })
        .catch(() => {});
    }

    if (typeof window !== 'undefined' && 'caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }
  }, []);

  return null;
}
