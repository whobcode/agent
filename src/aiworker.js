import { Agent } from "agents";

export class MyAgent extends Agent {
  constructor(config) {
    super(config);
    this.model = config.model || "@cf/meta/llama-3.1-8b-instruct";
    this.systemPrompt = config.systemPrompt || "You are a cool, intelligent, witty AI assistant.";
    this.useOpenAI = config.useOpenAI || false;
    this.openaiKey = config.openaiKey || null;
    this.gatewayEndpoint = config.gatewayEndpoint || null;
    this.children = new Map();
    this.initAgent();
  }

  initAgent() {
    console.log(`🤖 Initializing AI Agent with model: ${this.model}`);
    this.on('request', this.handleRequest.bind(this));
    this.on('response', this.handleResponse.bind(this));
  }

  async handleRequest({ request, env }) {
    try {
      const body = await request.json();
      const { prompt, action, config } = body;
      const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
      const clientCountry = request.headers.get("CF-IPCountry") || "unknown";
      console.log(`📩 Prompt: ${prompt} | 🌍 From IP: ${clientIP}, Country: ${clientCountry}`);

      if (action === "create_agent" && config) {
        const id = `agent_${Date.now()}`;
        const newAgent = new MyAgent(config);
        this.children.set(id, newAgent);
        return new Response(JSON.stringify({ success: true, id }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (action === "use_agent" && config?.id) {
        const child = this.children.get(config.id);
        if (!child) return new Response(JSON.stringify({ error: "Agent not found." }), { status: 404 });
        return await child.handleRequest({ request, env });
      }

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt }
      ];

      let response;
      if (this.useOpenAI && this.openaiKey) {
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.openaiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            stream: true,
          }),
        });
        response = response.body;
      } else {
        const aiResponse = await env.AI.run(this.model, { messages, stream: true });
        response = aiResponse.pipeThrough(new TextDecoderStream()).pipeThrough(new this.SSEToStream()).pipeThrough(new TextEncoderStream());
      }

      return new Response(response, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (error) {
      console.error('🚨 Error handling request:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  handleResponse(response) {
    console.log(`✅ Completed response: ${JSON.stringify(response)}`);
  }

  SSEToStream = class extends TransformStream {
    constructor() {
      super({
        transform: (chunk, controller) => this.processChunk(chunk, controller),
        flush: (controller) => controller.enqueue(this.format({ done: true })),
      });
    }

    processChunk(chunk, controller) {
      chunk.split('data:').forEach(line => {
        const match = line.match(/{.+?}/);
        if (match) controller.enqueue(this.format(JSON.parse(match[0])));
      });
    }

    format(payload) {
      return JSON.stringify({ done: false, ...payload }) + '\n';
    }
  }

  setModel(newModel) {
    console.log(`🔄 Switching model from ${this.model} to ${newModel}`);
    this.model = newModel;
  }

  setSystemPrompt(newPrompt) {
    console.log(`🛠 Updating system prompt.`);
    this.systemPrompt = newPrompt;
  }

  enableOpenAI(apiKey) {
    this.useOpenAI = true;
    this.openaiKey = apiKey;
    console.log("🔐 OpenAI integration enabled.");
  }

  useCloudflareGateway(endpointUrl) {
    this.gatewayEndpoint = endpointUrl;
    console.log(`🌐 Using Cloudflare AI Gateway: ${endpointUrl}`);
  }
} 
