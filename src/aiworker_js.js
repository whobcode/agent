import { Agent } from 'agents';

// MyAgent: routes to Cloudflare AI Gateway (compat), OpenRouter, or Workers AI; supports child agents & geo logging
export class MyAgent extends Agent {
  constructor(config = {}){
    super(config);
    this.model = config.model || 'deepseek/deepseek-v3.1';
    this.systemPrompt = config.systemPrompt || 'You are a cool, intelligent, witty AI assistant.';
    this.children = new Map();
  }

  async handleRequest({ request, env }){
    // CORS preflight handled at router; keep here if called directly
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: this._corsHeaders() });

    let body = {};
    try { body = await request.json(); } catch {}
    const { prompt, messages: userMessages, action, config = {}, model } = body;

    // Geo logging via CF headers
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const cc = request.headers.get('CF-IPCountry') || 'unknown';
    console.log(`action=${action ?? 'chat'} model=${model ?? this.model} ip=${ip} cc=${cc}`);

    if (action === 'create_agent' && config){
      const id = `agent_${Date.now()}`;
      const child = new MyAgent(config);
      this.children.set(id, child);
      return new Response(JSON.stringify({ success:true, id }), { headers: this._corsHeaders() });
    }

    if (action === 'use_agent' && config?.id){
      const child = this.children.get(config.id);
      if (!child) return new Response(JSON.stringify({ error:'Agent not found' }), { status:404, headers: this._corsHeaders() });
      return child.handleRequest({ request, env });
    }

    const messages = userMessages ?? [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt ?? '' },
    ];

    const selected = model ?? this.model;
    const provider = this._providerFromModel(selected, config.provider);

    try {
      let stream;
      if (provider === 'openrouter'){
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
          body: JSON.stringify({ model: selected, messages, stream: true }),
        });
        if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${await resp.text()}`);
        stream = resp.body;
      } else if (provider === 'gateway'){
        const endpoint = `https://gateway.ai.cloudflare.com/v1/${env.AI_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/compat/chat/completions`;
        const body = { model: selected, messages, stream: true };
        const apiKey = this._forwardApiKey(selected, env);
        if (apiKey) body.apiKey = apiKey; // optional vendor key passthrough if not configured in Gateway
        const resp = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.SERVICE_API_KEY ? { 'X-Service-Key': env.SERVICE_API_KEY } : {}) },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error(`Gateway ${resp.status}: ${await resp.text()}`);
        stream = resp.body;
      } else { // workers-ai fallback for @cf/*
        const aiResp = await env.AI.run(selected, { messages, stream: true });
        stream = aiResp; // ReadableStream
      }

      return new Response(stream, { headers: this._corsHeaders('application/x-ndjson') });
    } catch (err) {
      console.error('agent error', err);
      return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: this._corsHeaders() });
    }
  }

  _providerFromModel(model, explicit){
    if (explicit) return explicit;
    if (model?.startsWith('openrouter/')) return 'openrouter';
    if (model?.startsWith('@cf/')) return 'workers-ai';
    if (model?.includes('/')) return 'gateway'; // e.g., deepseek/..., huggingface/...
    return 'gateway';
  }

  _forwardApiKey(model, env){
    if (model?.startsWith('deepseek/')) return env.DEEPSEEK_API_KEY || null;
    if (model?.startsWith('huggingface/')) return env.HF_API_KEY || null;
    if (model?.startsWith('openai/')) return env.OPENAI_API_KEY || null;
    return null;
  }

  _corsHeaders(type = 'application/json'){
    return {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Service-Key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };
  }
}
