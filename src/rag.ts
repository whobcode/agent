import { Env } from './agent';

/**
 * Queries the AutoRAG pipeline to get relevant context for a given prompt.
 * @param query The user's chat prompt.
 * @param env The worker environment.
 * @returns A string of relevant context to be injected into the LLM prompt.
 */
export async function queryRAG(query: string, env: Env): Promise<string> {
    console.log(`Querying AutoRAG for context on: "${query}"`);

    // Use the AI binding to access the configured AutoRAG project.
    const stream = await env.AI.autorag(env.AUTORAG_PROJECT_NAME).aiSearch({
        query: query,
    });

    // For simplicity, we'll buffer the response here. In a real app, you might stream this.
    let response = "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response += decoder.decode(value);
    }

    // The response from aiSearch is the final, context-aware answer from the LLM.
    return response;
}

/**
 * The AutoRAG service handles ingestion automatically based on the
 * data sources configured in the Cloudflare dashboard. A manual ingestion
 * trigger from the Worker is not the standard workflow. Instead, feedback
 * (like a user flagging a response) should be used to refine the data source
 * or prompt, which AutoRAG will then re-index on its next scheduled run.
 *
 * For this reason, a manual `ingestQuery` function is not implemented.
 * The feedback loop will be handled by the collaborative chat agent in Phase 5,
 * which can use this `queryRAG` function to get better context before answering.
 */
