import { Ai } from '@cloudflare/ai';
import { Env } from './agent'; // Import the shared Env interface

/**
 * Represents a single AI agent defined by a system prompt, with its own state and memory.
 * Each instance of this class is a unique Durable Object.
 */
export class PromptAgentDurableObject {
	state: DurableObjectState;
	env: Env;
	ai: Ai;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
		this.ai = new Ai(env.AI);
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
			const history = (await this.state.storage.get<any[]>('history')) || [];

			const messages = [
				{ role: 'system', content: systemPrompt },
				...history,
				{ role: 'user', content: message },
			];

			// Execute the AI model and get a stream.
			const stream = await this.ai.run('@cf/meta/llama-3-8b-instruct', {
				messages,
				stream: true,
			});

			// We need to process the stream to save the full response to history,
			// while still sending the raw stream to the user for low latency.
			const { readable, writable } = new TransformStream();
			this.saveHistory(stream, writable, messages).catch(console.error);

			return new Response(readable, {
				headers: { 'Content-Type': 'text/event-stream', ...this.corsHeaders() },
			});
		} catch (e: any) {
			console.error('Error in handleChat:', e);
			return new Response('Error processing your request.', { status: 500 });
		}
	}

	/**
	 * Reads the AI's response stream, saves the complete response to history,
	 * and forwards the stream to the client.
	 */
	private async saveHistory(stream: ReadableStream, writable: WritableStream, messages: any[]) {
		const reader = stream.getReader();
		const writer = writable.getWriter();
		let fullResponse = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = new TextDecoder().decode(value);
				// SSE streams have a "data: " prefix. We need to parse it to get the content.
				const lines = chunk.split('\n');
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const content = line.substring(6);
						if (content.trim() === '[DONE]') {
							continue;
						}
						try {
							const { response } = JSON.parse(content);
							fullResponse += response;
						} catch (e) {
							// Ignore parsing errors for non-JSON parts of the stream
						}
					}
				}
				// Forward the raw chunk to the client
				await writer.write(value);
			}

			// Update the history with the user's message and the AI's full response.
			// We slice the messages array to remove the system prompt before saving.
			const newHistory = [
				...messages.slice(1),
				{ role: 'assistant', content: fullResponse },
			];

			// Persist the updated history for the next turn.
			await this.state.storage.put('history', newHistory);
		} catch (err) {
			console.error('Error saving history:', err);
		} finally {
			writer.close();
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
