module.exports = {
  reactStrictMode: true,
  // Proxies browser calls to /api/* through to the API so the response's
  // Set-Cookie is attributed to THIS app's origin, not the API's. Split-domain
  // deploys (e.g. this web app on Vercel, the API on Railway) need that: a
  // cookie the API sets for its own domain never reaches this app's server at
  // all (cookies("").get() in a Server Component only sees cookies the
  // browser sent to this domain), which otherwise makes every server-side
  // "am I logged in" check see no session, regardless of SameSite/Secure.
  async rewrites() {
    const apiBase = process.env.API_INTERNAL_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiBase}/:path*` }];
  },
};
