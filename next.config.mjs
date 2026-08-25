const nextConfig = {
  reactStrictMode: true,
  // Ensure the competitor-policy markdown is bundled into the serverless
  // function for the competitors route (otherwise readFileSync 500s on Vercel).
  outputFileTracingIncludes: {
    '/api/places/competitors': ['./COMPETITOR_ENGINE.md'],
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      ],
    }];
  },
};
export default nextConfig;
