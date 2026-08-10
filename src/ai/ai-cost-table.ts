// Approximate $/1M-token pricing, keyed by "provider:model". Used only to
// estimate cost for the admin usage dashboard — not billing-accurate.
// Prices drift; update when a provider changes theirs.
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  'anthropic:claude-opus-5': { input: 5, output: 25 },
  'anthropic:claude-sonnet-5': { input: 3, output: 15 },
  'anthropic:claude-haiku-4-5': { input: 1, output: 5 },
  'openai:gpt-4o': { input: 2.5, output: 10 },
  'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
  'deepseek:deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek:deepseek-reasoner': { input: 0.55, output: 2.19 },
  'qwen:qwen-plus': { input: 0.4, output: 1.2 },
  'qwen:qwen-turbo': { input: 0.05, output: 0.2 },
  'qwen:qwen-max': { input: 1.6, output: 6.4 },
};

export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICE_PER_MILLION[`${provider}:${model}`];
  if (!price) return 0;
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
