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

// Define the expected request body types
interface ChatRequestBody {
  type: 'chat';
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string;
  provider?: 'gateway' | 'openrouter' | 'workers-ai';
}

interface TaskRequestBody {
    type: 'task';
    description: string;
}

type RequestBody = ChatRequestBody | TaskRequestBody;


export class MyAgent extends Agent<Env> {

  /**
   * A public method that allows this agent to delegate a task to a new sub-agent.
   * This can be called programmatically from another agent or from a Worker.
   */
  async delegateTask(taskDescription: string): Promise<Response> {
      console.log(`Agent ${this.id} received delegation request: ${taskDescription}`);

      // 1. Create a new, unique sub-agent to handle the task
      const subAgentId = this.env.MyAgent.newUniqueId();
      const subAgent = this.env.MyAgent.get(subAgentId);

      console.log(`Creating sub-agent ${subAgent.id} to handle the task.`);

      // 2. Construct the request to send to the sub-agent
      const taskRequest = new Request(`https://agent.internal/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              type: 'task',
              description: taskDescription,
          } as TaskRequestBody),
      });

      // 3. Programmatically call the sub-agent's onRequest method
      // The `agents` runtime routes this call directly to the sub-agent instance.
      return subAgent.onRequest(taskRequest);
  }

  /**
   * The main entrypoint for all requests to this agent. It now handles both
   * user-facing chat requests and internal, delegated task requests.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: this._corsHeaders() });
    }

    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: this._corsHeaders() });
    }

    // Differentiate between a user chat and a delegated task
    if (body.type === 'task') {
        return this.handleDelegatedTask(body);
    } else {
        return this.handleUserChat(request, body);
    }
  }

  /**
   * Handles a delegated task from another agent.
   */
  private async handleDelegatedTask(task: TaskRequestBody): Promise<Response> {
      console.log(`Agent ${this.id} is handling a delegated task: ${task.description}`);
      // In a real-world scenario, this is where the agent would perform the actual work.
      // For this example, we'll just return a confirmation.
      return new Response(JSON.stringify({
          success: true,
          message: `Sub-agent ${this.id} completed task: ${task.description}`,
      }), { headers: { 'Content-Type': 'application/json' }});
  }

  /**
   * Handles a chat request from an end-user.
   */
  private async handleUserChat(request: Request, body: ChatRequestBody): Promise<Response> {
    const { messages, model, provider } = body;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const cc = request.headers.get('CF-IPCountry') || 'unknown';
    const selectedModel = model || this.env.DEFAULT_MODEL_ID;
    console.log(`model=${selectedModel} ip=${ip} cc=${cc}`);

    const selectedProvider = this._providerFromModel(selectedModel, provider);

    try {
      let stream: ReadableStream;
      if (selectedProvider === 'openrouter') {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.OPENAI_API_KEY}` },
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
      return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: this._corsHeaders() });
    }
  }

  private _providerFromModel(model: string, explicit?: 'gateway' | 'openrouter' | 'workers-ai'): string {
    if (explicit) return explicit;
    if (model.startsWith('openrouter/')) return 'openrouter';
    if (model.startsWith('@cf/')) return 'workers-ai';
    return 'gateway';
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
