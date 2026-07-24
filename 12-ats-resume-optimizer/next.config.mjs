/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep native/quirky CJS packages out of the webpack bundle so they load
    // correctly at runtime in the Node.js server environment.
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"],
  },
}

export default nextConfig
