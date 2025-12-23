import { Notice } from "obsidian";
import { ResponseHandler, ResponseHandlerOptions } from "./response-handler";
import { ChatService } from "./chat-service";
import { ChatRequest } from "../types/content";
import {
	renderText,
	formatNewAISection,
	formatNewUserSection,
	processCalloutContent,
	setCursorToEnd,
} from "../utils";

export class NonStreamingResponseHandler implements ResponseHandler {
	private tokenCount = 0;

	constructor(private options: ResponseHandlerOptions) {}

	async process(chatService: ChatService, request: ChatRequest): Promise<void> {
		try {
			await this.processResponse(chatService, request);
			if (this.options.showStats) {
				this.renderTokenCount();
			}
			this.addNewUserSection();
		} catch (error: any) {
			const errorMessage = error.message || "Unknown error occurred.";
			new Notice(errorMessage, 8000);
		}
	}

	private async processResponse(chatService: ChatService, request: ChatRequest): Promise<void> {
		// Non-streaming response using unified ChatService
		const response = await chatService.sendMessage(request);

		if (
			!response ||
			!response.content ||
			response.content.length === 0
		) {
			new Notice("No response received, try again later");
			return;
		}

		this.tokenCount = response.usage?.outputTokens || 0;
		const rawContent = response.content
			.filter((block) => block.type === "text")
			.map((block) => block.content as string)
			.join("");

		const processedContent = this.options.useCallouts
			? processCalloutContent(rawContent)
			: rawContent;
		const generatedText =
			formatNewAISection(this.options.useCallouts) + processedContent;
		renderText(this.options.editor, generatedText);
	}

	private renderTokenCount(): void {
		const tokenText = this.options.useCallouts
			? `\n> (${this.tokenCount} tokens)`
			: `\n(${this.tokenCount} tokens)`;
		renderText(this.options.editor, tokenText);
	}

	private addNewUserSection(): void {
		renderText(this.options.editor, formatNewUserSection(this.options.useCallouts));
		setCursorToEnd(this.options.editor);
	}
}