import { EXAMPLE_PROMPTS } from '../constants/prompts.js';

export default function EmptyState({ onSelectPrompt }) {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 className="empty__title" id="empty-title">
        How can I help you today?
      </h2>
      <p className="empty__subtitle">
        Ask a question, paste some code, or start from one of these.
      </p>

      <div className="prompt-grid">
        {EXAMPLE_PROMPTS.map((example) => (
          <button
            key={example.label}
            type="button"
            className="prompt-card"
            onClick={() => onSelectPrompt(example.prompt)}
          >
            <span className="prompt-card__label">{example.label}</span>
            <span className="prompt-card__hint">{example.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
