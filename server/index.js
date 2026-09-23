import { config } from './config.js';
import { createApp } from './app.js';
import { createProvider } from './providers/index.js';

const app = createApp(config);

const server = app.listen(config.port, () => {
  const provider = createProvider(config);
  console.log(
    `[server] Nimbus Chat API on http://127.0.0.1:${config.port} (${config.isProduction ? 'production' : 'development'})`,
  );
  console.log(`[server] provider: ${provider.id} (${provider.label}) | model: ${provider.model}`);
  if (provider.id === 'nvidia' && !config.providers.nvidia.apiKey) {
    console.warn('[server] NVIDIA selected without NVIDIA_API_KEY. Requests will fail until it is set.');
  }
  if (provider.id === 'ollama') {
    console.log(
      `[server] local runtime expected at ${config.providers.ollama.baseUrl} - start it with "ollama serve".`,
    );
  }
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} received, closing.`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
