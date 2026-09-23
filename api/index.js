import http from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

/**
 * Vercel entry point for the Nimbus API.
 *
 * Vercel runs this file per request. We build the Express app once per lambda
 * instance and reuse it across invocations. Express never calls listen():
 * the app is mounted on an internal Node http.Server whose request handler
 * forwards the Vercel request/response pair. This keeps every Express feature
 * intact — SSE streaming, res.on('close') abort detection, JSON validation,
 * and the error handler.
 *
 * Static hosting is intentionally disabled here: on Vercel the CDN serves the
 * built UI from dist/ (see vercel.json), so the lambda must not require a
 * local dist/ directory. vercel.json routes /api/* to this function and
 * everything else to the static output.
 */
let appInstance = null;

function getApp() {
  if (!appInstance) {
    const config = loadConfig(process.env);
    // isProduction only toggles Express static hosting of dist/ inside
    // createApp(); overriding it changes nothing about API behavior.
    appInstance = createApp({ ...config, isProduction: false });
  }
  return appInstance;
}

let serverInstance = null;

function getServer() {
  if (!serverInstance) {
    serverInstance = http.createServer(getApp());
  }
  return serverInstance;
}

export default async function handler(req, res) {
  const server = getServer();
  // Emit the underlying Node req/res through the internal server. No port is
  // bound and nothing is ever accepted; this only wires the event chain
  // server.emit('request', ...) -> Express, exactly as a real server would.
  server.emit('request', req, res);
}
