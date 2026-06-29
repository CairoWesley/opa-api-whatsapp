/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Saída standalone para imagem Docker enxuta (server.js + deps mínimas).
  output: "standalone",
  // Rotas de API usam runtime Node (crypto + service role); definido por rota.
  // Habilita src/instrumentation.ts (refresher do cache do dashboard em bg).
  experimental: { instrumentationHook: true },
};

module.exports = nextConfig;
