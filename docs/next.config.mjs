import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();
const basePath = '/docs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath,
};

export default withMDX(nextConfig);
