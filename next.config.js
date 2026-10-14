/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Pin the workspace root: this machine has other lockfiles above this
     directory, and Next otherwise infers a root outside the project. */
  outputFileTracingRoot: __dirname,
  /* Pages must revalidate. Next's default for a prerendered page is a one-year
     s-maxage, which lets any shared cache keep serving yesterday's build; a deploy
     swaps the whole build, so a cached page is a stale promise, not a saving. */
  async headers() {
    return [
      {
        source: "/:path((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
