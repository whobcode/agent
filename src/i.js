import { MyAgent } from "./aiworker_js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || !url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === '/api/models') {
      return new Response(
        JSON.stringify([
          { id: 'deepseek-v3.1', label: 'DeepSeek v3.1', provider: 'AI Gateway' },
          { id: 'huggingface/zephyr-7b', label: 'Zephyr-7B', provider: 'HuggingFace' },
          { id: 'openrouter/mistral-7b', label: 'Mistral-7B', provider: 'OpenRouter' }
        ]),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname === '/api/chat') {
      const agent = new MyAgent({
        systemPrompt: env.DEFAULT_SYSTEM_PROMPT,
        model: env.DEFAULT_MODEL_ID,
        useOpenAI: false,
        openaiKey: env.OPENAI_API_KEY,
        gatewayEndpoint: env.AI_GATEWAY_ENDPOINT
      });

      return agent.handleRequest({ request, env });
    }

    return new Response('Not Found', { status: 404 });
  }
};
