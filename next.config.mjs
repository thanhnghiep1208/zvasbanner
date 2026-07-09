// Clerk's Frontend API host is embedded (base64) in the publishable key, so
// CSP tracks whatever key is actually configured instead of a hardcoded domain.
function getClerkFapiHost() {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const encoded = key?.split("_")[2];
  if (!encoded) return null;
  try {
    return `https://${Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "")}`;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV !== "production";
const clerkFapiHost = getClerkFapiHost();

const csp = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline'",
    isDev && "'unsafe-eval'",
    clerkFapiHost,
    "https://challenges.cloudflare.com",
    "https://va.vercel-scripts.com",
  ]
    .filter(Boolean)
    .join(" "),
  ["connect-src 'self'", clerkFapiHost, "https://vitals.vercel-insights.com"]
    .filter(Boolean)
    .join(" "),
  "img-src 'self' data: blob: https://img.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

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
          // Restrict where scripts/styles/connections/frames may load from (Clerk + Cloudflare Turnstile + Vercel Analytics).
          { key: "Content-Security-Policy", value: csp },
          // Force HTTPS for a year, including subdomains, once a browser has seen this header.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
