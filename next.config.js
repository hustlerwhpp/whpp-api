/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  reactStrictMode: true,
  // Dev пишет в отдельный каталог, чтобы не конфликтовать с production-сборкой.
  // Production (в т.ч. Vercel) обязан использовать стандартный ".next",
  // иначе Vercel падает с NEXT_OUTPUT_DIR_MISSING.
  ...(isDev ? { distDir: '.next-dev' } : {}),
  // Убираем баннер "Next.js is outdated" в dev-оверлее
  devIndicators: {
    buildActivity: false,
    buildActivityPosition: 'bottom-right',
  },
}

module.exports = nextConfig
