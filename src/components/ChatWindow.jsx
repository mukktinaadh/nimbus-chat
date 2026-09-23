import EmptyState from './EmptyState.jsx';
import MessageList from './MessageList.jsx';

/**
 * Owns the conversation area: either the empty state or the transcript, plus
 * one polite live region so screen readers hear "generating" and "ready"
 * without every streamed token being announced.
 */
export default function ChatWindow({ messages, isGenerating, onSelectPrompt }) {
  const isEmpty = messages.length === 0;
  const status = isGenerating
    ? 'Generating a response.'
    : isEmpty
      ? 'No messages yet.'
      : 'Response complete.';

  return (
    <>
      {isEmpty ? (
        <div className="conversation conversation--empty">
          <EmptyState onSelectPrompt={onSelectPrompt} />
        </div>
      ) : (
        <MessageList messages={messages} isGenerating={isGenerating} />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </>
  );
}
