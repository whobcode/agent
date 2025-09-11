import { routeAgentRequest } from 'agents';
import { MyAgent, Env } from './agent';
import { MCPAgent } from './mcp';
import { PromptAgentDurableObject } from './prompt_agent';
import Stripe from 'stripe';

export { MyAgent, MCPAgent, PromptAgentDurableObject };

// --- Constants ---
const ADMIN_USERNAME = "admin";
const FREE_PLAN_AGENT_LIMIT = 3;

// --- Helper Functions ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getUserIdFromToken(token: string | null, env: Env): Promise<string | null> {
    if (!token) return null;
    return await env.SESSIONS.get(token);
}


export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // --- Stripe Webhook Endpoint (must be handled before auth) ---
    if (url.pathname === '/api/stripe-webhook') {
        // ... (existing webhook logic)
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const stripe = new Stripe(env.STRIPE_API_KEY);
        const signature = request.headers.get('stripe-signature');
        const body = await request.text();
        try {
            const event = await stripe.webhooks.constructEvent(body, signature!, env.STRIPE_WEBHOOK_SECRET);
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object as Stripe.Checkout.Session;
                const userId = session.client_reference_id;
                if (userId) await env.DB.prepare("UPDATE users SET plan_type = 'paid' WHERE id = ?").bind(userId).run();
            }
            return new Response(JSON.stringify({ received: true }), { status: 200 });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
        }
    }

    // --- Regular Request Handling ---
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // --- Unauthenticated Endpoints ---
    if (url.pathname === '/api/signup' || url.pathname === '/api/login') {
      // ... (existing signup/login logic)
       if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      try {
        const { username, password } = await request.json<{ username?: string; password?: string }>();
        if (!username || !password) return new Response(JSON.stringify({ error: 'Username and password are required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        if (url.pathname === '/api/signup') {
            const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (existingUser) return new Response(JSON.stringify({ error: 'Username already taken.' }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const userId = crypto.randomUUID();
            const hashedPassword = await hashPassword(password);
            const planType = username === ADMIN_USERNAME ? 'admin' : 'free';
            await env.DB.prepare('INSERT INTO users (id, username, hashed_password, plan_type) VALUES (?, ?, ?, ?)').bind(userId, username, hashedPassword, planType).run();
            return new Response(JSON.stringify({ success: true, userId }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } else {
            const user = await env.DB.prepare('SELECT id, hashed_password FROM users WHERE username = ?').bind(username).first<{ id: string; hashed_password: string }>();
            if (!user) return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const hashedPassword = await hashPassword(password);
            if (hashedPassword !== user.hashed_password) return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            const sessionToken = crypto.randomUUID();
            await env.SESSIONS.put(sessionToken, user.id, { expirationTtl: 86400 });
            return new Response(JSON.stringify({ success: true, token: sessionToken }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'An internal error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // --- Authenticated API Endpoints ---
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const userId = await getUserIdFromToken(token, env);

    if (!userId && !url.pathname.startsWith('/public') && url.pathname !== '/' && url.pathname !== '/api/models' && !url.pathname.startsWith('/agents/')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/feedback') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

        const { query } = await request.json<{ query?: string }>();
        if (!query) return new Response(JSON.stringify({ error: 'Query is required.' }), { status: 400 });

        // The AutoRAG pipeline ingests automatically. For now, we just log the feedback event.
        console.log(`Feedback received for query: "${query}" from user: ${userId}`);

        return new Response(JSON.stringify({ success: true, message: 'Feedback received.' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/get-agents') {
        const { results } = await env.DB.prepare('SELECT id, name FROM agents WHERE user_id = ?').bind(userId).all();
        return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/create-agent') {
        // ... (existing create-agent logic)
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const { name: agentName } = await request.json<{ name?: string }>();
        if (!agentName) return new Response(JSON.stringify({ error: 'Agent name is required.' }), { status: 400 });
        const user = await env.DB.prepare('SELECT plan_type, agent_count FROM users WHERE id = ?').bind(userId).first<{ plan_type: string; agent_count: number }>();
        if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        const { plan_type, agent_count } = user;
        const limit = plan_type === 'free' ? FREE_PLAN_AGENT_LIMIT : Infinity;
        if (agent_count >= limit) return new Response(JSON.stringify({ error: 'Agent limit reached. Please upgrade.' }), { status: 403 });
        
        // Use the Durable Object namespace to create a valid, unique ID
        const agentIdObject = env.MyAgent.newUniqueId();
        const agentId = agentIdObject.toString();

        await env.DB.batch([
            env.DB.prepare('INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)').bind(agentId, userId, agentName),
            env.DB.prepare('UPDATE users SET agent_count = agent_count + 1 WHERE id = ?').bind(userId)
        ]);
        return new Response(JSON.stringify({ success: true, agentId: agentId }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/create-checkout-session') {
        // ... (existing checkout logic)
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const stripe = new Stripe(env.STRIPE_API_KEY);
        const origin = request.headers.get('Origin') || new URL(request.url).origin;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'subscription',
            success_url: `${origin}/payment-success.html`,
            cancel_url: `${origin}/payment-cancel.html`,
            client_reference_id: userId,
        });
        return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/delegate-task') {
        // ... (existing delegate logic)
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const { agentId, taskDescription } = await request.json<{ agentId?: string, taskDescription?: string }>();
        if (!agentId || !taskDescription) return new Response(JSON.stringify({ error: 'agentId and taskDescription are required.' }), { status: 400 });
        const agentStub = env.MyAgent.get(env.MyAgent.idFromString(agentId));
        return agentStub.delegateTask(taskDescription);
    }

    // --- NEW: Create a Prompt-based Agent ---
    if (url.pathname === '/api/create-prompt-agent' && request.method === 'POST') {
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

        try {
            const { name, systemPrompt } = await request.json<{ name?: string; systemPrompt?: string }>();
            if (!name || !systemPrompt) {
                return new Response(JSON.stringify({ error: 'Agent name and systemPrompt are required.' }), { status: 400, headers: corsHeaders });
            }

            // Check plan limits, reusing the logic from the other agent creation endpoint
            const user = await env.DB.prepare('SELECT plan_type, agent_count FROM users WHERE id = ?').bind(userId).first<{ plan_type: string; agent_count: number }>();
            if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: corsHeaders });

            const limit = user.plan_type === 'free' ? FREE_PLAN_AGENT_LIMIT : Infinity;
            if (user.agent_count >= limit) {
                return new Response(JSON.stringify({ error: 'Agent limit reached. Please upgrade.' }), { status: 403, headers: corsHeaders });
            }

            const agentIdObject = env.PROMPT_AGENT_DO.newUniqueId();
            const agentId = agentIdObject.toString();
            const agentStub = env.PROMPT_AGENT_DO.get(agentIdObject);

            // Initialize the new agent by sending its system prompt to its storage.
            await agentStub.fetch(new Request('https://agent.internal/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt }),
            }));

            // Save agent to the database. Assuming an 'agents' table with a 'type' column.
            await env.DB.batch([
                env.DB.prepare('INSERT INTO agents (id, user_id, name, type) VALUES (?, ?, ?, ?)').bind(agentId, userId, name, 'prompt_agent'),
                env.DB.prepare('UPDATE users SET agent_count = agent_count + 1 WHERE id = ?').bind(userId)
            ]);

            return new Response(JSON.stringify({ success: true, agentId: agentId }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            console.error('Error creating prompt agent:', errorMessage);
            return new Response(JSON.stringify({ error: 'An internal error occurred.' }), { status: 500, headers: corsHeaders });
        }
    }

    // --- NEW: Chat with a Prompt-based Agent ---
    if (url.pathname.startsWith('/api/prompt-agents/') && url.pathname.endsWith('/chat') && request.method === 'POST') {
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

        try {
            const pathSegments = url.pathname.split('/');
            const agentId = pathSegments[3]; // expecting /api/prompt-agents/:id/chat

            const idObject = env.PROMPT_AGENT_DO.idFromString(agentId);
            const agentStub = env.PROMPT_AGENT_DO.get(idObject);

            // Forward the request to the durable object. The DO expects a URL path of `/chat`.
            return await agentStub.fetch(new Request('https://agent.internal/chat', request));
        } catch (e) {
            return new Response('Invalid Agent ID', { status: 400, headers: corsHeaders });
        }
    }

    // --- Other Endpoints ---
    if (url.pathname.startsWith('/agents/')) {
      return routeAgentRequest(request, env);
    }

    if (url.pathname === '/api/models') {
       const models = [
        { id: 'deepseek/deepseek-v3.1', label: 'DeepSeek v3.1', provider: 'gateway' },
        { id: 'huggingface/zephyr-7b', label: 'Zephyr-7B', provider: 'gateway' },
        { id: 'openrouter/mistral-7b-instruct', label: 'Mistral-7B (Instruct)', provider: 'openrouter' },
        { id: '@cf/meta/llama-3.3-70b-instruct-fp8', label: 'Llama 3.3 70B', provider: 'workers-ai' },
      ];
      return new Response(JSON.stringify(models), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return env.ASSETS.fetch(request);
  },
};
