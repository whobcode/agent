import { Agent, AgentNamespace } from 'agents';
import { Env } from './agent';
import { queryRAG } from './rag';
import puppeteer from '@cloudflare/puppeteer';

interface ToolRequest {
    tool: 'webSearch' | 'vectorSearch';
    query: string;
}

/**
 * MCPAgent (Model Context Protocol Agent)
 * A specialized agent that acts as a central hub for tools.
 */
export class MCPAgent extends Agent<Env> {

    async onRequest(request: Request): Promise<Response> {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        try {
            const body: ToolRequest = await request.json();
            switch (body.tool) {
                case 'webSearch':
                    const searchResults = await this.webSearch(body.query);
                    return new Response(JSON.stringify(searchResults), { headers: { 'Content-Type': 'application/json' } });
                case 'vectorSearch':
                    const vectorContext = await this.vectorSearch(body.query);
                    return new Response(JSON.stringify({ context: vectorContext }), { headers: { 'Content-Type': 'application/json' } });
                default:
                    return new Response(JSON.stringify({ error: 'Unknown tool' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('MCP Error:', errorMsg);
            return new Response(JSON.stringify({ error: 'Failed to execute tool', details: errorMsg }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    /**
     * Uses the Browser Rendering API to perform a web search.
     * @param query The search query.
     * @returns A string containing the top search results.
     */
    async webSearch(query: string): Promise<string> {
        console.log(`MCP Agent performing web search for: "${query}"`);
        const browser = await puppeteer.launch(this.env.BROWSER);
        const page = await browser.newPage();
        await page.goto(`https://www.duckduckgo.com/?q=${encodeURIComponent(query)}`);

        // Wait for the results to load
        await page.waitForSelector('#links');

        const links = await page.evaluate(() => {
            const results = Array.from(document.querySelectorAll('h2 > a'));
            return results.slice(0, 5).map(a => ({
                title: a.textContent,
                href: a.href,
            }));
        });

        await browser.close();

        return `Web search results for "${query}":\n` + links.map(l => `- ${l.title} (${l.href})`).join('\n');
    }

    /**
     * Queries the AutoRAG pipeline via the rag module.
     * @param query The query to search for in the vector index.
     * @returns A string of context from the knowledge base.
     */
    async vectorSearch(query: string): Promise<string> {
        console.log(`MCP Agent performing vector search for: "${query}"`);
        return await queryRAG(query, this.env);
    }
}
