import {
	ChatProvider,
	ProviderConfig,
} from "../types/provider";
import {
	ChatRequest,
	ChatResponse,
	StreamingEvent,
	ContentBlock,
} from "../types/content";

/**
 * Abstract base class for AI providers - provides shared functionality
 * to reduce implementation overhead for specific providers
 */
export abstract class BaseProvider implements ChatProvider {
	abstract readonly id: string;
	abstract readonly name: string;

	protected config: ProviderConfig;

	constructor(config: ProviderConfig) {
		this.config = config;
	}

	abstract sendMessage(request: ChatRequest): Promise<ChatResponse>;
	abstract streamMessage(
		request: ChatRequest,
	): AsyncIterableIterator<StreamingEvent>;


	/**
	 * Shared streaming wrapper with error handling
	 * Maps provider-specific streams to unified StreamingEvent format
	 */
	protected async *wrapStream(
		providerStream: any,
		eventMapper: (event: any) => StreamingEvent | null,
	): AsyncIterableIterator<StreamingEvent> {
		try {
			for await (const event of providerStream) {
				const mappedEvent = eventMapper(event);
				if (mappedEvent) {
					yield mappedEvent;
				}
			}
			yield { type: "done", data: null };
		} catch (error) {
			yield {
				type: "error",
				data: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Helper to create text content blocks
	 */
	protected createTextContent(text: string): ContentBlock {
		return {
			type: "text",
			content: text,
		};
	}

}

