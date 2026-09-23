import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton.jsx';

/**
 * One conversation turn.
 *
 * Assistant text goes through react-markdown. No rehype-raw is registered, so
 * any HTML inside a model response is rendered as literal text - model output
 * is untrusted text and is never executed.
 *
 * User text is rendered as plain text, not markdown: what you typed is what
 * you see.
 */
export default function Message({ message, isStreaming }) {
  const isUser = message.role === 'user';
  const hasText = message.content.length > 0;

  return (
    <li className={`turn turn--${message.role}`}>
      <div className="turn__head">
        <span className="turn__label">{isUser ? 'You' : 'Nimbus'}</span>
        {!isUser && hasText && !isStreaming ? (
          <span className="turn__actions">
            <CopyButton text={message.content} />
          </span>
        ) : null}
      </div>

      <div className="turn__body">
        {isUser ? (
          message.content
        ) : hasText ? (
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {isStreaming ? <span className="caret" aria-hidden="true" /> : null}
          </div>
        ) : (
          <p className="prose">
            <span className="caret" aria-hidden="true" />
            <span className="sr-only">Generating response</span>
          </p>
        )}
      </div>
    </li>
  );
}
