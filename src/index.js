import { MyAgent } from './aiworker_js.js';

function corsHeaders(type = 'application/json'){
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Service-Key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}
export class PlaywrightMCP {
  constructor(state, env) { this.ctx = state; this.env = env; }
  async fetch(req) { return new Response("MCP DO alive"); }
}
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);

    if (request.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/models'){
      return new Response(JSON.stringify([
        { id: 'deepseek/deepseek-v3.1', label: 'DeepSeek v3.1', provider: 'AI Gateway' },
        { id: 'huggingface/zephyr-7b', label: 'Zephyr-7B', provider: 'AI Gateway' },
        { id: 'openrouter/mistral-7b-instruct', label: 'Mistral-7B (Instruct)', provider: 'OpenRouter' },
        { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Workers AI Llama 3.3 70B', provider: 'Workers AI' },
      ]), { headers: corsHeaders() });
    }

    if (url.pathname === '/api/chat'){
      const agent = new MyAgent({
        systemPrompt: env.DEFAULT_SYSTEM_PROMPT,
        model: env.DEFAULT_MODEL_ID,
      });
      return agent.handleRequest({ request, env });
    }

    if (url.pathname === '/manage'){
      // Serve the standalone UI from /public/manage.html
      const rewritten = new Request(new URL('/manage.html', url), request);
      return env.ASSETS.fetch(rewritten);
    }

    // Static assets (incl. /manage.html and /manage.js)
    if (url.pathname === '/' || !url.pathname.startsWith('/api/')){
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders('text/plain') });
  }
};
