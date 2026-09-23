import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../services/chatApi.js';

/** Seconds to wait before a send is allowed again after a rate-limit reply. */
const RATE_LIMIT_COOLDOWN_MS = 15000;

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * All conversation state for the app.
 *
 * Holds exactly the state the PRD calls for - messages, input, isGenerating,
 * error - plus a rate-limit cooldown. Nothing derived is stored: the empty
 * state, the send-button availability, and the character counter are all
 * computed from these values at render time.
 *
 * Requests are guarded three ways so one click cannot produce two upstream
 * generations: the generating flag, an in-flight ref, and the cooldown.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const messagesRef = useRef(messages);
  const abortRef = useRef(null);
  const inFlightRef = useRef(false);

  const commitMessages = useCallback((updater) => {
    setMessages((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Tick while a cooldown is running so the countdown re-renders.
  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && now >= cooldownUntil) setCooldownUntil(0);
  }, [now, cooldownUntil]);

  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
    : 0;

  const send = useCallback(
    async (rawText) => {
      const text = String(rawText ?? input).trim();

      if (!text) return; // empty messages never leave the client
      if (inFlightRef.current) return; // duplicate-submit guard
      if (Date.now() < cooldownUntil) return; // rate-limit guard

      const userMessage = { id: createId(), role: 'user', content: text };
      const assistantMessage = { id: createId(), role: 'assistant', content: '' };
      const history = [...messagesRef.current, userMessage].map(({ role, content }) => ({
        role,
        content,
      }));

      setError(null);
      setInput('');
      commitMessages([...messagesRef.current, userMessage, assistantMessage]);
      inFlightRef.current = true;
      setIsGenerating(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat({
          messages: history,
          signal: controller.signal,
          onDelta: (delta) => {
            commitMessages((previous) =>
              previous.map((message) =>
                message.id === assistantMessage.id
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
        });
      } catch (requestError) {
        const code = requestError?.code || 'unknown';

        if (code === 'aborted') {
          // Keep whatever text arrived before the user pressed Stop.
          commitMessages((previous) =>
            previous.filter(
              (message) => !(message.id === assistantMessage.id && message.content === ''),
            ),
          );
        } else {
          setError({ code, message: requestError.message });
          if (code === 'rate_limited') {
            setNow(Date.now());
            setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
          }
          // Drop the placeholder if nothing was generated, otherwise keep the
          // partial answer and show the error above it.
          commitMessages((previous) =>
            previous.filter(
              (message) => !(message.id === assistantMessage.id && message.content === ''),
            ),
          );
        }
      } finally {
        inFlightRef.current = false;
        abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [commitMessages, cooldownUntil, input],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    inFlightRef.current = false;
    commitMessages([]);
    setInput('');
    setError(null);
    setIsGenerating(false);
    setCooldownUntil(0);
  }, [commitMessages]);

  return {
    messages,
    input,
    setInput,
    isGenerating,
    error,
    cooldownSeconds,
    send,
    stop,
    newChat,
    dismissError: () => setError(null),
  };
}
