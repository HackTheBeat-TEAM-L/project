import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HYPEWAVE runs client-heavy (Web Audio, Spotify SDK). Server only proxies secrets.
  reactStrictMode: true,
};

export default nextConfig;
