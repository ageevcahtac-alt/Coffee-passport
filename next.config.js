/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vodmmtzclvqemcujwmdf.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;