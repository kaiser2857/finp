/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Prevent bundler from resolving optional Node-only 'canvas' module used by vega-canvas
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false }
    return config
  },
}

export default nextConfig
