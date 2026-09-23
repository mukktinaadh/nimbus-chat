/**
 * Starter prompts for the empty state. Each card sends its `prompt` when
 * clicked, so the empty state is a working on-ramp rather than decoration.
 */
export const EXAMPLE_PROMPTS = [
  {
    label: 'Explain recursion simply',
    hint: 'Concept, plain language',
    prompt: 'Explain recursion simply, with one small example.',
  },
  {
    label: 'Write a Python function',
    hint: 'Code generation',
    prompt: 'Write a Python function that checks whether a string is a palindrome, with tests.',
  },
  {
    label: 'Help me design an API',
    hint: 'System design',
    prompt: 'Help me design a REST API for a small task manager. Outline the endpoints and payloads.',
  },
  {
    label: 'Explain how databases work',
    hint: 'Deep dive',
    prompt: 'Explain how relational databases store and find data, from B-trees to indexes.',
  },
];
