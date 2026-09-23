export default function Header({
  meta,
  theme,
  onToggleTheme,
  onNewChat,
  onNavigate,
  hasMessages,
}) {
  const modelLabel = meta ? `${meta.providerLabel} · ${meta.model}` : 'connecting…';

  return (
    <header className="header">
      <div className="header__inner">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            N
          </span>
          <div>
            <h1 className="brand__name">Nimbus</h1>
            <div className="brand__meta">general-purpose AI chat</div>
          </div>
        </div>

        <span className="model-chip" title={`Model: ${modelLabel}`}>
          <span className="model-chip__dot" aria-hidden="true" />
          {modelLabel}
        </span>

        <div className="header__actions">
          <a
            className="btn btn--ghost"
            href="/about"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/about');
            }}
          >
            About
          </a>
          <button
            type="button"
            className="btn btn--icon"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <SunIcon />
            ) : (
              <MoonIcon />
            )}
          </button>
          <button type="button" className="btn" onClick={onNewChat} disabled={!hasMessages}>
            New chat
          </button>
        </div>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z" />
    </svg>
  );
}
