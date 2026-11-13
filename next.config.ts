import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones and other devices on the local network use the dev server (e.g. opening
  // http://192.168.0.3:3000 on a phone). Next.js blocks their scripts by default, which
  // leaves the page visible but unresponsive. Private network ranges only; dev only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Hide the round "N" dev-tools button so it doesn't show during demos. Build and runtime
  // errors still appear on screen.
  devIndicators: false,
  // Browser hardening. No full script CSP: Next.js and the theme script use inline scripts.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
