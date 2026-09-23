import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import ChatInput from './components/ChatInput.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import About from './components/About.jsx';
import { useChat } from './hooks/useChat.js';
import { useTheme } from './hooks/useTheme.js';
import { fetchMeta } from './services/chatApi.js';

const DEFAULT_MAX_CHARS = 8000;

/**
 * App owns the conversation state and the two-way data flow:
 *
 *   App -> ChatWindow -> MessageList -> Message        (messages)
 *   ChatInput -> App (useChat.send) -> /api/chat       (input, sends)
 *
 * Components below this file render props and raise events. No component
 * except useChat knows that a network exists.
 */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    messages,
    input,
    setInput,
    isGenerating,
    error,
    cooldownSeconds,
    send,
    stop,
    newChat,
    dismissError,
  } = useChat();

  const [meta, setMeta] = useState(null);
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    let active = true;
    fetchMeta().then((data) => {
      if (active) setMeta(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handlePop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = useCallback((next) => {
    window.history.pushState({}, '', next);
    setPath(next);
  }, []);

  const isAbout = path === '/about';
  const maxChars = meta?.limits?.maxMessageChars ?? DEFAULT_MAX_CHARS;

  return (
    <div className="app">
      <a className="skip-link" href="#composer-input">
        Skip to message input
      </a>

      <Header
        meta={meta}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewChat={newChat}
        onNavigate={navigate}
        hasMessages={messages.length > 0}
      />

      {error && !isAbout ? <ErrorBanner error={error} onDismiss={dismissError} /> : null}

      <main className="app__main">
        {isAbout ? (
          <div className="shell">
            <div className="conversation">
              <About meta={meta} onBack={() => navigate('/')} />
            </div>
          </div>
        ) : (
          <div className="shell">
            <ChatWindow messages={messages} isGenerating={isGenerating} onSelectPrompt={send} />
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={send}
              onStop={stop}
              isGenerating={isGenerating}
              cooldownSeconds={cooldownSeconds}
              maxChars={maxChars}
            />
          </div>
        )}
      </main>
    </div>
  );
}
