import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

function getSupabaseImageHost(value?: string) {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      return null;
    }

    return url.hostname;
  } catch {
    return null;
  }
}

function isLocalSupabaseUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return (
      process.env.NODE_ENV === "development" &&
      url.protocol === "http:" &&
      url.port === "54321" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

const allowLocalSupabaseImages = isLocalSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const supabaseImageHost = getSupabaseImageHost(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const supabaseRemotePatterns = supabaseImageHost
  ? [
      {
        protocol: "https" as const,
        hostname: supabaseImageHost,
        pathname: "/storage/v1/object/public/**",
        search: "",
      },
    ]
  : [];

const isDevelopment = process.env.NODE_ENV === "development";
const localSupabaseSources = isDevelopment
  ? [
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
      "http://localhost:54321",
      "ws://localhost:54321",
    ]
  : [];
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  "https://va.vercel-scripts.com",
  "https://vitals.vercel-insights.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://www.clarity.ms",
  "https://scripts.clarity.ms",
  "https://static.hotjar.com",
  "https://script.hotjar.com",
  "https://challenges.cloudflare.com",
];
const connectSources = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://vitals.vercel-insights.com",
  "https://*.sentry.io",
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://analytics.google.com",
  "https://stats.g.doubleclick.net",
  "https://www.clarity.ms",
  "https://*.clarity.ms",
  "https://*.hotjar.com",
  "wss://*.hotjar.com",
  "https://challenges.cloudflare.com",
  ...localSupabaseSources,
];
const mediaSources = [
  "'self'",
  "blob:",
  "data:",
  "https://*.supabase.co",
  ...localSupabaseSources.filter((source) => source.startsWith("http")),
];
const imageSources = [
  "'self'",
  "data:",
  "blob:",
  "https:",
  ...localSupabaseSources.filter((source) => source.startsWith("http")),
];
const csp = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imageSources.join(" ")}`,
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  `media-src ${mediaSources.join(" ")}`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typescript: {
    tsconfigPath: "tsconfig.app.json",
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
  images: {
    dangerouslyAllowLocalIP: allowLocalSupabaseImages,
    deviceSizes: [360, 640, 828, 1080, 1200],
    imageSizes: [32, 48, 64, 96, 128, 180, 192, 256, 320],
    qualities: [75],
    formats: ["image/webp"],
    localPatterns: [
      { pathname: "/brand/**", search: "" },
    ],
    remotePatterns: [
      ...(allowLocalSupabaseImages
        ? [
            {
              protocol: "http" as const,
              hostname: "127.0.0.1",
              port: "54321",
              pathname: "/storage/v1/object/public/**",
              search: "",
            },
            {
              protocol: "http" as const,
              hostname: "localhost",
              port: "54321",
              pathname: "/storage/v1/object/public/**",
              search: "",
            },
          ]
        : []),
      ...supabaseRemotePatterns,
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
