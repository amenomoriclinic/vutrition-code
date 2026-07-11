const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Never let the browser cache the HTML document or the (self-destructing)
    // service worker script, so every visit fetches the latest deploy from the
    // server. Hashed assets under /_next/static keep their default immutable
    // caching — their URLs change on each deploy, so they are always fresh.
    const noStore = {
      key: 'Cache-Control',
      value: 'no-cache, no-store, must-revalidate',
    };
    return [
      {
        source: '/',
        headers: [noStore],
      },
      {
        source: '/sw.js',
        headers: [noStore, { key: 'Service-Worker-Allowed', value: '/' }],
      },
    ];
  },
};

export default nextConfig;
