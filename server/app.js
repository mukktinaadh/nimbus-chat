import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createProvider } from './providers/index.js';
import { createChatRouter } from './routes/chat.js';

/**
 * Builds the Express app. Kept separate from the listen() call in index.js so
 * tests can mount it on an ephemeral port without a real server running.
 */
export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: config.limits.maxBodyBytes }));

  // Provider/model the UI displays. Never includes keys or endpoints.
  app.get('/api/meta', (req, res) => {
    const provider = createProvider(config);
    res.json({
      provider: provider.id,
      providerLabel: provider.label,
      model: provider.model,
      limits: {
        maxMessageChars: config.limits.maxMessageChars,
        maxContextChars: config.limits.maxContextChars,
        maxMessages: config.limits.maxMessages,
      },
    });
  });

  app.get('/api/health', (req, res) => {
    const provider = createProvider(config);
    res.json({ status: 'ok', provider: provider.id, model: provider.model });
  });

  app.use('/api/chat', createChatRouter(config));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'bad_request', message: 'Unknown API route.' } });
  });

  // In production the API and the built SPA share one origin.
  if (config.isProduction) {
    const distDir = path.join(config.projectRoot, 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error(`dist/ not found at ${distDir}. Run "npm run build" first.`);
    }
    app.use(express.static(distDir));
    app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  // Malformed JSON, oversized bodies, and anything else that reaches Express.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'bad_request', message: 'Malformed JSON body.' } });
    }
    if (error?.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'bad_request', message: 'Request body is too large.' } });
    }

    console.error('[server] unhandled error:', error);
    return res.status(500).json({ error: { code: 'unknown', message: 'Something went wrong.' } });
  });

  return app;
}
