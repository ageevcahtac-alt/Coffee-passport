/** @type {import('next').NextConfig} */
const supabaseUrl = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vodmmtzclvqemcujwmdf.supabase.co'
);

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(':', ''),
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
      },
    ],
  },
};

module.exports = nextConfig;
