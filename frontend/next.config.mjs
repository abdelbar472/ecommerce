/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Auth Service (port 8004)
      { source: "/api/auth/:path*", destination: "http://localhost:8004/auth/:path*" },

      // Order Service (port 8001)
      { source: "/api/orders", destination: "http://localhost:8001/orders" },
      { source: "/api/orders/:path*", destination: "http://localhost:8001/orders/:path*" },

      // Notification Service (port 8002)
      { source: "/api/notifications", destination: "http://localhost:8002/notifications" },
      { source: "/api/notifications/:path*", destination: "http://localhost:8002/notifications/:path*" },

      // Analytics Service (port 8003)
      { source: "/api/analytics/:path*", destination: "http://localhost:8003/analytics/:path*" },

      // Health checks
      { source: "/api/health/auth", destination: "http://localhost:8004/health" },
      { source: "/api/health/order", destination: "http://localhost:8001/health" },
      { source: "/api/health/notification", destination: "http://localhost:8002/health" },
      { source: "/api/health/analytics", destination: "http://localhost:8003/health" },
      { source: "/api/health/client", destination: "http://localhost:8006/health" },
      { source: "/api/health/merchant", destination: "http://localhost:8007/health" },
      { source: "/api/health/admin", destination: "http://localhost:8008/health" },

      // Client/Merchant/Admin services
      { source: "/api/client/:path*", destination: "http://localhost:8006/client/:path*" },
      { source: "/api/merchant/:path*", destination: "http://localhost:8007/merchant/:path*" },
      { source: "/api/admin/:path*", destination: "http://localhost:8008/admin/:path*" },
    ];
  },
};

export default nextConfig;
