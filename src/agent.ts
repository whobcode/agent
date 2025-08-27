import { Agent, AgentNamespace } from 'agents';

// Define the environment bindings, including secrets and storage
export interface Env {
  // Bindings
  MyAgent: AgentNamespace<MyAgent>;
  ASSETS: Fetcher;
  AI: Ai;
  DB: D1Database;
  SESSIONS: KVNamespace;

  // Secrets
  DEEPSEEK_API_KEY: string;
  OPENAI_API_KEY: string;
  SERVICE_API_KEY: string;
  STRIPE_API_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // Vars
  AI_ACCOUNT_ID: string;
  AI_GATEWAY_NAME: string;
  DEFAULT_SYSTEM_PROMPT: string;
  DEFAULT_MODEL_ID: string;
  STRIPE_PRICE_ID: string;
}

// Define the expected request body for the chat
interface ChatRequestBody {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string;
  provider?: 'gateway' | 'openrouter' | 'workers-ai';
}

export class MyAgent extends Agent<Env> {
  // The onRequest handler is called for HTTP requests to the agent.
  async onRequest(request: Request): Promise<Response> {
    // CORS preflight is handled by the router now, but this is good practice.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: this._corsHeaders() });
    }

    let body: ChatRequestBody;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: this._corsHeaders(),
      });
    }

    const { messages, model, provider } = body;

    // Log request details
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const cc = request.headers.get('CF-IPCountry') || 'unknown';
    const selectedModel = model || this.env.DEFAULT_MODEL_ID;
    console.log(`model=${selectedModel} ip=${ip} cc=${cc}`);

    // Determine the provider based on the model, falling back to the default.
    const selectedProvider = this._providerFromModel(selectedModel, provider);

    try {
      let stream: ReadableStream;

      if (selectedProvider === 'openrouter') {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.OPENAI_API_KEY}` }, // OpenRouter uses OpenAI-compatible keys
          body: JSON.stringify({ model: selectedModel.replace('openrouter/', ''), messages, stream: true }),
        });
        if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
        stream = resp.body;
      } else if (selectedProvider === 'gateway') {
        const endpoint = `https://gateway.ai.cloudflare.com/v1/${this.env.AI_ACCOUNT_ID}/${this.env.AI_GATEWAY_NAME}/compat/chat/completions`;
        const fetchBody = { model: selectedModel, messages, stream: true };

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Service-Key': this.env.SERVICE_API_KEY || '' },
          body: JSON.stringify(fetchBody),
        });
        if (!resp.ok) throw new Error(`Gateway ${resp.status}: ${await resp.text()}`);
        stream = resp.body;
      } else { // 'workers-ai'
        const aiResp = await this.env.AI.run(selectedModel, { messages, stream: true });
        stream = aiResp;
      }

      return new Response(stream, { headers: this._corsHeaders('text/event-stream') });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Agent error:', errorMsg);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 500,
        headers: this._corsHeaders(),
      });
    }
  }

  private _providerFromModel(model: string, explicit?: 'gateway' | 'openrouter' | 'workers-ai'): string {
    if (explicit) return explicit;
    if (model.startsWith('openrouter/')) return 'openrouter';
    if (model.startsWith('@cf/')) return 'workers-ai';
    return 'gateway'; // Default for models like 'deepseek/...'
  }

  private _corsHeaders(contentType = 'application/json'): Record<string, string> {
    return {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Service-Key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
}
