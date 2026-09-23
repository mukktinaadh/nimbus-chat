/**
 * Shows the server's user-facing message. Raw provider output, status codes
 * from upstream, and keys stay in the server logs; the client only ever sees
 * the code plus a human sentence.
 */
const CODE_LABELS = {
  bad_request: 'Request rejected',
  missing_api_key: 'Server not configured',
  invalid_api_key: 'Provider rejected the key',
  rate_limited: 'Rate limited',
  model_not_found: 'Model unavailable',
  provider_unavailable: 'AI service unavailable',
  network_error: 'Network problem',
  stream_interrupted: 'Response interrupted',
  unknown: 'Unexpected error',
};

export default function ErrorBanner({ error, onDismiss }) {
  const label = CODE_LABELS[error.code] || CODE_LABELS.unknown;

  return (
    <div className="banner" role="alert">
      <span className="banner__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
      </span>
      <div className="banner__text">
        {error.message}
        <span className="banner__code">
          {label} · {error.code}
        </span>
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
