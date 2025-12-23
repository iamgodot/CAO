import { ChatProvider } from "../types/provider";
import { ChatRequest, ChatResponse, StreamingEvent } from "../types/content";
import { AnthropicProvider } from "../providers/anthropic";
import { OpenAIProvider } from "../providers/openai";
import { CAOSettings } from "../types/settings";

export class ChatService {
	private currentProvider: ChatProvider | null = null;
	private settings: CAOSettings;

	constructor(settings: CAOSettings) {
		this.settings = settings;
		this.initializeProvider();
	}

	private initializeProvider(): void {
		try {
			switch (this.settings.provider) {
				case "anthropic":
					this.currentProvider = new AnthropicProvider({
						apiKey: this.settings.anthropicApiKey,
					});
					break;
				case "openai-compatible":
					this.currentProvider = new OpenAIProvider({
						apiKey: this.settings.openaiApiKey,
						baseURL: this.settings.baseURL,
					});
					break;
				default:
					console.warn(`Unsupported provider: ${this.settings.provider}`);
					this.currentProvider = null;
			}
		} catch (error) {
			console.error("Failed to initialize provider:", error);
			this.currentProvider = null;
		}
	}

	setProvider(settings: CAOSettings): void {
		this.settings = settings;
		this.initializeProvider();
	}

	hasProvider(): boolean {
		return this.currentProvider !== null;
	}

	getProviderName(): string | null {
		return this.currentProvider?.name || null;
	}

	async sendMessage(request: ChatRequest): Promise<ChatResponse> {
		if (!this.currentProvider) {
			throw new Error(
				"No provider configured. Please check your API settings.",
			);
		}

		const response = await this.currentProvider.sendMessage(request);
		return response;
	}

	async *streamMessage(
		request: ChatRequest,
	): AsyncIterableIterator<StreamingEvent> {
		if (!this.currentProvider) {
			throw new Error(
				"No provider configured. Please check your API settings.",
			);
		}

		try {
			for await (const event of this.currentProvider.streamMessage(request)) {
				yield event;
			}
		} catch (error) {
			yield {
				type: "error",
				data: error,
			};
		}
	}
}
