import { useEffect, useRef } from 'react';

const MAX_TEXTAREA_PX = 220;

/**
 * The composer. Enter sends, Shift+Enter inserts a newline, and the send
 * button is disabled (with a hint) whenever a send would be rejected anyway:
 * empty text, a generation already running, or a rate-limit cooldown.
 */
export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isGenerating,
  cooldownSeconds,
  maxChars,
}) {
  const textareaRef = useRef(null);
  const isCoolingDown = cooldownSeconds > 0;
  const canSend = value.trim().length > 0 && !isGenerating && !isCoolingDown;
  const isNearLimit = maxChars > 0 && value.length > maxChars * 0.9;

  // Grow with content up to the CSS cap, then scroll internally.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isGenerating || isCoolingDown) return;
    if (!value.trim()) return;
    onSubmit();
  };

  const handleKeyDown = (event) => {
    // `isComposing` keeps Enter inside an IME candidate window from sending.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="composer-input">
        Message
      </label>
      <div className="composer__box">
        <textarea
          id="composer-input"
          ref={textareaRef}
          className="composer__input"
          value={value}
          rows={1}
          placeholder="Ask anything…"
          autoComplete="off"
          spellCheck="true"
          maxLength={maxChars || undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-describedby="composer-hint"
        />
        {isGenerating ? (
          <button type="button" className="btn btn--ghost" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={!canSend}>
            Send
          </button>
        )}
      </div>

      <div className="composer__foot" id="composer-hint">
        {isCoolingDown ? (
          <span className="composer__hint">
            Rate limited. You can send again in {cooldownSeconds}s.
          </span>
        ) : (
          <span className="composer__hint">
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
          </span>
        )}
        {isNearLimit ? (
          <span className={`composer__counter${value.length >= maxChars ? ' composer__counter--warn' : ''}`}>
            {value.length}/{maxChars}
          </span>
        ) : null}
      </div>
    </form>
  );
}
