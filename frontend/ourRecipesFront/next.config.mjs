/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate only the opt-in voice lab and its Workers. Other app routes keep
  // their existing embedding/opener behavior. Enables local WASM threads.
  async headers() {
    const headers = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
    ];
    return [{ source: '/voice-lab', headers }, { source: '/voice/:path*', headers }];
  },
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