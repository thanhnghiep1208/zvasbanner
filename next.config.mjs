/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent this site from being embedded in any iframe.
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers from MIME-sniffing the response content type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Only send the origin (no path/query) in the Referer header when crossing origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable browser features not used by this app.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
