import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@partyradar/shared'],
  webpack: (config) => {
    // Disable webpack filesystem cache to avoid disk-space issues during build
    config.cache = false
    return config
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}

export default nextConfig
