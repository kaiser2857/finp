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
  async rewrites() {
    const origin = process.env.NEXT_PUBLIC_APP2_ORIGIN || 'http://127.0.0.1:5173'
    return [
      // Same-origin entry and all paths
      { source: '/app2', destination: `${origin}/` },
      { source: '/app2/:path*', destination: `${origin}/:path*` },

      // Vite dev assets that may be referenced absolutely by partner app
      { source: '/src/:path*', destination: `${origin}/src/:path*` },
      { source: '/node_modules/:path*', destination: `${origin}/node_modules/:path*` },
      { source: '/@vite/client', destination: `${origin}/@vite/client` },
      { source: '/@react-refresh', destination: `${origin}/@react-refresh` },
      { source: '/@vite/:path*', destination: `${origin}/@vite/:path*` },
      { source: '/@id/:path*', destination: `${origin}/@id/:path*` },
      { source: '/@fs/:path*', destination: `${origin}/@fs/:path*` },

      // Common static
      { source: '/assets/:path*', destination: `${origin}/assets/:path*` },
      { source: '/vite.svg', destination: `${origin}/vite.svg` },
    ]
  },
  async headers() {
    return [
      {
        source: '/app2',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/app2/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
