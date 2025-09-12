import { createWorkersAI } from 'workers-ai-provider';
import { streamText, CoreMessage } from 'ai';
import { Env } from './agent'; // Import the shared Env interface

/**
 * Represents a single AI agent defined by a system prompt, with its own state and memory.
 * Each instance of this class is a unique Durable Object.
 */
export class PromptAgentDurableObject {
	state: DurableObjectState;
	env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	/**
	 * Handles incoming requests to the Durable Object.
	 * This method is the entry point for all communication with an agent.
	 * It distinguishes between an initial setup request and subsequent chat requests.
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// The first request to a new agent is always to initialize it with its system prompt.
		const isInitializing = !(await this.state.storage.get('systemPrompt'));
		if (isInitializing) {
			if (request.method !== 'POST') {
				return new Response('Method Not Allowed', { status: 405 });
			}
			try {
				const { systemPrompt } = await request.json<{ systemPrompt: string }>();
				if (!systemPrompt) {
					return new Response('systemPrompt is required for initialization', { status: 400 });
				}
				await this.state.storage.put('systemPrompt', systemPrompt);
				return new Response(null, { status: 201 }); // Successfully initialized
			} catch (e) {
				return new Response('Invalid initialization body', { status: 400 });
			}
		}

		// Subsequent requests are for chatting.
		if (url.pathname === '/chat' && request.method === 'POST') {
			return this.handleChat(request);
		}

		return new Response('Not Found', { status: 404 });
	}

	/**
	 * Handles a chat request.
	 * It maintains conversation history and streams responses from the AI.
	 */
	private async handleChat(request: Request): Promise<Response> {
		try {
			const { message } = await request.json<{ message: string }>();
			if (!message) {
				return new Response('Message is required', { status: 400 });
			}

			// Retrieve the agent's persona and conversation history from storage.
			const systemPrompt = (await this.state.storage.get<string>('systemPrompt')) || this.env.DEFAULT_SYSTEM_PROMPT;
			const history = (await this.state.storage.get<CoreMessage[]>('history')) || [];

			const messages: CoreMessage[] = [
				{ role: 'system', content: systemPrompt },
				...history,
				{ role: 'user', content: message },
			];

            // Use the new provider and Vercel AI SDK
            const workersai = createWorkersAI({ binding: this.env.AI });
			const result = await streamText({
				model: workersai('@cf/meta/llama-3-8b-instruct'),
				messages,
			});

            // The result object from streamText contains the stream.
            // We fork the stream to be able to read it for history and also send it to the client.
            const [historyStream, clientStream] = result.textStream.tee();

            // Save history in the background without awaiting it, so we can stream response to client immediately.
            this.saveHistory(historyStream, messages).catch(console.error);

            // Return the stream to the client
			return new Response(clientStream, {
				headers: { 'Content-Type': 'text/plain; charset=utf-8', ...this.corsHeaders() },
			});
		} catch (e: any) {
			console.error('Error in handleChat:', e);
			return new Response('Error processing your request.', { status: 500 });
		}
	}

	/**
	 * Reads one of the forked streams to completion to get the full response and save it to history.
	 */
	private async saveHistory(stream: ReadableStream, messages: CoreMessage[]) {
		const reader = stream.getReader();
		let fullResponse = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
                // The Vercel AI SDK stream provides raw text chunks, which we decode and concatenate.
				fullResponse += new TextDecoder().decode(value);
			}

			// Update the history with the user's message and the AI's full response.
			const newHistory: CoreMessage[] = [
				...messages.slice(1), // Exclude system prompt from history
				{ role: 'assistant', content: fullResponse },
			];

			// Persist the updated history for the next turn.
			await this.state.storage.put('history', newHistory);
		} catch (err) {
			console.error('Error saving history:', err);
		}
	}

    /**
     * Helper to return CORS headers.
     */
    private corsHeaders(): Record<string, string> {
        return {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };
    }
}
