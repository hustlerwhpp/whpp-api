/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  reactStrictMode: true,
  // dev и production-сборка используют разные каталоги,
  // чтобы параллельные процессы не ломали webpack-runtime.js
  distDir: isDev ? '.next-dev' : '.next-build',
  // Убираем баннер "Next.js is outdated" в dev-оверлее
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
}

module.exports = nextConfig
