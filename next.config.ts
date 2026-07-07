import type { NextConfig } from "next";

const allowedDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  devIndicators: false,
  // Required for mobile testing over LAN — without this, Next.js blocks
  // dev client assets when the page is opened via 192.168.x.x instead of localhost.
  // Set ALLOWED_DEV_ORIGINS in .env to your machine's LAN IP (see `bun run dev` → Network).
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
