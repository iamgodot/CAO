import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base";
import { AnthropicConfig } from "../types/provider";
import {
	ChatRequest,
	ChatResponse,
	StreamingEvent,
	ContentBlock,
	Usage,
} from "../types/content";

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider extends BaseProvider {
	readonly id = "anthropic";
	readonly name = "Anthropic Claude";

	private client: Anthropic;

	constructor(config: AnthropicConfig) {
		super(config);
		this.client = new Anthropic({
			apiKey: config.apiKey,
			dangerouslyAllowBrowser: true,
		});
	}

	async sendMessage(request: ChatRequest): Promise<ChatResponse> {
		const anthropicRequest = this.convertRequest(request);
		const response = await this.client.messages.create(anthropicRequest);
		return this.convertResponse(response);
	}

	async *streamMessage(
		request: ChatRequest,
	): AsyncIterableIterator<StreamingEvent> {
		try {
			const anthropicRequest = {
				...this.convertRequest(request),
				stream: true,
			};
			const stream = this.client.messages.stream(anthropicRequest);

			yield* this.wrapStream(stream, (event) => {
				// Map Anthropic streaming events to unified format
				if (event.type === "content_block_delta" && "text" in event.delta) {
					return {
						type: "content",
						data: this.createTextContent(event.delta.text),
					};
				}

				if (event.type === "message_delta" && event.usage) {
					return {
						type: "usage",
						data: {
							inputTokens: 0,
							outputTokens: event.usage.output_tokens || 0,
							totalTokens: event.usage.output_tokens || 0,
						},
					};
				}

				return null; // Ignore other event types
			});
		} catch (error) {
			yield {
				type: "error",
				data: error,
			};
		}
	}

	/**
	 * Convert unified ChatRequest to Anthropic message format
	 */
	private convertRequest(request: ChatRequest): any {
		// Filter out system messages first, then convert remaining messages
		const filteredMessages = request.messages.filter(
			(msg) => msg.role !== "system",
		);
		const messages = filteredMessages.map((msg) => ({
			role: msg.role as "user" | "assistant",
			content: msg.content
				.filter((block) => block.type === "text")
				.map((block) => block.content as string)
				.join(""),
		}));

		return {
			model: request.model,
			max_tokens: request.maxTokens,
			temperature: request.temperature,
			system: request.systemPrompt, // Anthropic uses separate system parameter
			messages: messages,
		};
	}

	/**
	 * Convert Anthropic response to unified ChatResponse format
	 */
	private convertResponse(response: any): ChatResponse {
		let content: ContentBlock[];

		if (Array.isArray(response.content)) {
			// Handle multiple content blocks
			content = response.content.map((block: any) => {
				if (block.type === "text") {
					return this.createTextContent(block.text);
				}
				// Handle other content types as they're supported
				return this.createTextContent(String(block));
			});
		} else if (typeof response.content === "string") {
			content = [this.createTextContent(response.content)];
		} else {
			content = [this.createTextContent("")];
		}

		const usage: Usage = {
			inputTokens: response.usage?.input_tokens || 0,
			outputTokens: response.usage?.output_tokens || 0,
			totalTokens:
				(response.usage?.input_tokens || 0) +
				(response.usage?.output_tokens || 0),
		};

		return {
			content,
			usage,
			metadata: {
				model: response.model,
				stop_reason: response.stop_reason,
			},
		};
	}
}
