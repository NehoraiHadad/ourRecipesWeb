/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disable ESLint during production builds to avoid circular structure error
    // ESLint still runs during development and CI
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
        port: '',
        pathname: '/**',
      },
      {
        // Recipe images live in Vercel Blob (`image_url`, ARCHITECTURE §5).
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;