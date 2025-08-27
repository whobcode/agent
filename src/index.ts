import { routeAgentRequest } from 'agents';
import { MyAgent, Env } from './agent';

// Export the agent class for wrangler to use
export { MyAgent };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle API calls to the agent.
    // This will match requests to /agents/MyAgent/* and route them automatically.
    if (url.pathname.startsWith('/agents/')) {
      const response = await routeAgentRequest(request, env);
      if (response) {
        // Add CORS headers to the agent's response
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Service-Key');
        return new Response(response.body, { ...response, headers: newHeaders });
      }
    }

    // Serve the list of models for the frontend to use.
    if (url.pathname === '/api/models') {
      const models = [
        { id: 'deepseek/deepseek-v3.1', label: 'DeepSeek v3.1', provider: 'gateway' },
        { id: 'huggingface/zephyr-7b', label: 'Zephyr-7B', provider: 'gateway' },
        { id: 'openrouter/mistral-7b-instruct', label: 'Mistral-7B (Instruct)', provider: 'openrouter' },
        { id: '@cf/meta/llama-3.3-70b-instruct-fp8', label: 'Llama 3.3 70B', provider: 'workers-ai' },
      ];
      return new Response(JSON.stringify(models), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Fallback to serving static assets for the UI
    // This includes the root path '/' and anything that isn't an API call.
    try {
      // The `ASSETS` binding is provided by the `assets` config in wrangler.jsonc
      return await env.ASSETS.fetch(request);
    } catch (e) {
      console.error('Failed to fetch from ASSETS:', e);
      return new Response('Not Found', { status: 404 });
    }
  },
};
