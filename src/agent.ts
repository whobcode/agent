import { Agent, AgentNamespace } from 'agents';
import { MCPAgent } from './mcp';

// Define the environment bindings, including secrets and storage
export interface Env {
  // Bindings
  MyAgent: AgentNamespace<MyAgent>;
  MCP: AgentNamespace<MCPAgent>;
  ASSETS: Fetcher;
  AI: Ai;
  DB: D1Database;
  SESSIONS: KVNamespace;
  AGENT_BUCKET: R2Bucket;
  BROWSER: Fetcher;
  VECTORIZE_INDEX: VectorizeIndex;

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
  AUTORAG_PROJECT_NAME: string;
}

// Define the expected request body types
interface ChatRequestBody {
  type: 'chat';
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  model?: string; // This will now be used as the 'synthesizer' model
}

interface TaskRequestBody {
    type: 'task';
    description: string;
}

type RequestBody = ChatRequestBody | TaskRequestBody;


export class MyAgent extends Agent<Env> {

  async delegateTask(taskDescription: string): Promise<Response> {
    // ... (existing delegateTask logic)
    const subAgent = this.env.MyAgent.get(this.env.MyAgent.newUniqueId());
    const taskRequest = new Request(`https://agent.internal/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'task', description: taskDescription } as TaskRequestBody),
    });
    return subAgent.onRequest(taskRequest);
  }

  async onRequest(request: Request): Promise<Response> {
    // ... (existing onRequest logic)
    if (request.method === 'OPTIONS') return new Response(null, { headers: this._corsHeaders() });
    let body: RequestBody;
    try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: this._corsHeaders() });}
    if (body.type === 'task') return this.handleDelegatedTask(body);
    return this.handleUserChat(request, body);
  }

  private async handleDelegatedTask(task: TaskRequestBody): Promise<Response> {
    // ... (existing handleDelegatedTask logic)
    return new Response(JSON.stringify({ success: true, message: `Sub-agent ${this.id} completed task: ${task.description}`}), { headers: { 'Content-Type': 'application/json' }});
  }

  /**
   * Handles a chat request from an end-user by orchestrating a collaborative response.
   */
  private async handleUserChat(request: Request, body: ChatRequestBody): Promise<Response> {
    const userQuery = body.messages.find(m => m.role === 'user')?.content || '';
    if (!userQuery) return new Response(JSON.stringify({ error: 'User query not found.' }), { status: 400 });

    const mcp = this.env.MCP.get(this.env.MCP.idFromName("mcp-main"));

    // 1. Get Context from RAG pipeline via MCP
    const contextResponse = await mcp.fetch(new Request('https://mcp.internal/vectorSearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'vectorSearch', query: userQuery }),
    }));
    const { context } = await contextResponse.json<{ context: string }>();
    console.log("Orchestrator: Got context from RAG.");

    // 2. Delegate to multiple models in parallel
    const modelsToQuery = [
        '@cf/meta/llama-3-8b-instruct',
        this.env.DEFAULT_MODEL_ID, // deepseek
    ];

    console.log("Orchestrator: Delegating to parallel models.");
    const parallelResponses = await Promise.all(modelsToQuery.map(model =>
        this.getExpertResponse(userQuery, context, model)
    ));

    // 3. Synthesize the final answer
    console.log("Orchestrator: Synthesizing final response.");
    const synthesizerModel = body.model || '@cf/meta/llama-3.1-70b-instruct'; // Use a powerful model for synthesis
    const synthesisPrompt = this.createSynthesisPrompt(userQuery, context, parallelResponses);

    const finalResponseStream = await this.env.AI.run(synthesizerModel, {
        messages: [{ role: 'system', content: synthesisPrompt }],
        stream: true,
    });

    return new Response(finalResponseStream, { headers: this._corsHeaders('text/event-stream') });
  }

  /**
   * Calls a single AI model with the user's query and RAG context.
   */
  private async getExpertResponse(query: string, context: string, model: string): Promise<string> {
      const prompt = `Context: ${context}\n\nUser Query: ${query}\n\nBased on the context, answer the user's query.`;
      try {
          const response = await this.env.AI.run(model, {
              messages: [{ role: 'system', content: prompt }],
          });
          return response.response || `Error from ${model}`;
      } catch (e) {
          console.error(`Error from model ${model}:`, e);
          return `Model ${model} failed to respond.`;
      }
  }

  /**
   * Creates the final prompt for the synthesizer model.
   */
  private createSynthesisPrompt(query: string, context: string, responses: string[]): string {
      let prompt = `You are an expert synthesizer. Your job is to review a user's query, some internal context, and several responses from different AI models. Produce a single, high-quality, comprehensive answer for the user.\n\n`;
      prompt += `## User's Original Query:\n${query}\n\n`;
      prompt += `## Internal Context from Knowledge Base:\n${context}\n\n`;
      prompt += `## Responses from Assistant Models to Review:\n`;
      responses.forEach((resp, i) => {
          prompt += `### Response from Model ${i + 1}:\n${resp}\n\n`;
      });
      prompt += `## Your Task:\nSynthesize these responses into the best possible answer for the user. Do not mention the different models or the synthesis process. Just provide the final, clean answer.`;
      return prompt;
  }

  private _corsHeaders(contentType = 'application/json'): Record<string, string> {
    // ... (existing corsHeaders logic)
    return {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Service-Key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
}
