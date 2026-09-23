import { useEffect, useRef } from 'react';
import Message from './Message.jsx';

const STICK_THRESHOLD_PX = 120;

/**
 * The scroll container. New output follows the bottom, but only while the
 * reader is already near the bottom, so scrolling up to re-read an older
 * answer is never yanked back down mid-stream.
 */
export default function MessageList({ messages, isGenerating }) {
  const containerRef = useRef(null);
  const stickRef = useRef(true);

  const handleScroll = () => {
    const element = containerRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickRef.current = distanceFromBottom < STICK_THRESHOLD_PX;
  };

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !stickRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  const lastMessageId = messages[messages.length - 1]?.id;

  return (
    <div className="conversation" ref={containerRef} onScroll={handleScroll} tabIndex={0} aria-label="Conversation">
      <ol className="transcript">
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            isStreaming={isGenerating && message.id === lastMessageId && message.role === 'assistant'}
          />
        ))}
      </ol>
    </div>
  );
}
