import { withWorkflow } from 'workflow/next';

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

const workflowConfig = withWorkflow(nextConfig);
export default async (phase, context) => {
  const config = await workflowConfig(phase, context);
  // The app is on Next 14. Translate the SDK's newer config names instead of
  // upgrading the app framework as part of adding timer notifications.
  config.experimental = {
    ...config.experimental,
    serverComponentsExternalPackages: [...new Set([
      ...(config.experimental?.serverComponentsExternalPackages ?? []),
      ...(config.serverExternalPackages ?? []),
      'pino', 'pino-pretty', 'thread-stream'
    ])]
  };
  delete config.serverExternalPackages;
  delete config.turbopack;
  if (config.compiler) delete config.compiler.runAfterProductionCompile;
  return config;
};
