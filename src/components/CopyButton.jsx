import { useEffect, useRef, useState } from 'react';

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context or denied permission): stay quiet.
    }
  };

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={copy}
      aria-label={copied ? 'Answer copied' : 'Copy answer'}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
