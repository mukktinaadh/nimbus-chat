/**
 * Optional /about route: explains the architecture this demo is showing.
 * It is plain JSX with no data access, so it costs nothing at runtime.
 */
export default function About({ meta, onBack }) {
  return (
    <article className="about">
      <h1>How Nimbus is put together</h1>
      <p>
        A small, complete example of a modern chat app: a React UI, a server that owns the
        provider key, and a streamed response that lands in the UI as it is generated.
      </p>

      <ol className="flow">
        <li>Browser · React chat UI (Vite)</li>
        <li>POST /api/chat · Express, same origin</li>
        <li>Validation + limits · server/lib/validation.js</li>
        <li>Provider call · server/providers/*</li>
        <li>Server-Sent Events · delta / done / error</li>
        <li>UI updates the assistant turn per chunk</li>
      </ol>

      <h2>Why the key lives on the server</h2>
      <p>
        Anything shipped to the browser is public. The provider API key is read from{' '}
        <code>.env</code> by the server only, and the browser never calls the model vendor
        directly. That also lets the server validate requests, cap message size, abort upstream
        work when a tab closes, and translate provider failures into readable messages.
      </p>

      <h2>Current provider</h2>
      <p>
        {meta ? (
          <>
            <code>{meta.provider}</code> · <code>{meta.model}</code>
          </>
        ) : (
          'Loading…'
        )}
      </p>
      <p>
        Swapping providers is a <code>.env</code> change: <code>LLM_PROVIDER=nvidia</code> or{' '}
        <code>LLM_PROVIDER=ollama</code>. No application code changes, because both implement the
        same tiny interface.
      </p>

      <button type="button" className="btn about__back" onClick={onBack}>
        Back to chat
      </button>
    </article>
  );
}
