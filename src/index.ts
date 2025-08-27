import { routeAgentRequest } from 'agents';
import { MyAgent, Env } from './agent';

export { MyAgent };

// --- Constants ---
const ADMIN_USERNAME = "admin"; // The user can change this to their desired admin username
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

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // --- Authentication Endpoints ---
    if (url.pathname === '/api/signup') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      try {
        const { username, password } = await request.json<{ username?: string; password?: string }>();
        if (!username || !password) return new Response(JSON.stringify({ error: 'Username and password are required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const existingUser = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existingUser) return new Response(JSON.stringify({ error: 'Username already taken.' }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const userId = crypto.randomUUID();
        const hashedPassword = await hashPassword(password);
        const planType = username === ADMIN_USERNAME ? 'admin' : 'free';

        await env.DB.prepare(
          'INSERT INTO users (id, username, hashed_password, plan_type) VALUES (?, ?, ?, ?)'
        ).bind(userId, username, hashedPassword, planType).run();

        return new Response(JSON.stringify({ success: true, userId }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (e) {
        console.error('Signup error:', e);
        return new Response(JSON.stringify({ error: 'An internal error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    if (url.pathname === '/api/login') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      try {
        const { username, password } = await request.json<{ username?: string; password?: string }>();
        if (!username || !password) return new Response(JSON.stringify({ error: 'Username and password are required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const user = await env.DB.prepare('SELECT id, hashed_password FROM users WHERE username = ?').bind(username).first<{ id: string; hashed_password: string }>();
        if (!user) return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const hashedPassword = await hashPassword(password);
        if (hashedPassword !== user.hashed_password) return new Response(JSON.stringify({ error: 'Invalid credentials.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const sessionToken = crypto.randomUUID();
        await env.SESSIONS.put(sessionToken, user.id, { expirationTtl: 86400 });

        return new Response(JSON.stringify({ success: true, token: sessionToken }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      } catch (e) {
        console.error('Login error:', e);
        return new Response(JSON.stringify({ error: 'An internal error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    }

    // --- Authenticated API Endpoints ---
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const userId = await getUserIdFromToken(token, env);

    if (url.pathname === '/api/get-agents') {
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const { results } = await env.DB.prepare('SELECT id, name FROM agents WHERE user_id = ?').bind(userId).all();
        return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (url.pathname === '/api/create-agent') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const { name: agentName } = await request.json<{ name?: string }>();
        if (!agentName) return new Response(JSON.stringify({ error: 'Agent name is required.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const user = await env.DB.prepare('SELECT plan_type, agent_count FROM users WHERE id = ?').bind(userId).first<{ plan_type: string; agent_count: number }>();
        if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

        const { plan_type, agent_count } = user;
        const limit = plan_type === 'free' ? FREE_PLAN_AGENT_LIMIT : Infinity;

        if (agent_count >= limit) {
            return new Response(JSON.stringify({ error: 'Agent limit reached. Please upgrade your plan.' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        const agentId = crypto.randomUUID();
        await env.DB.batch([
            env.DB.prepare('INSERT INTO agents (id, user_id, name) VALUES (?, ?, ?)').bind(agentId, userId, agentName),
            env.DB.prepare('UPDATE users SET agent_count = agent_count + 1 WHERE id = ?').bind(userId)
        ]);

        return new Response(JSON.stringify({ success: true, agentId: agentId }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // --- Agent and Asset Endpoints ---
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
