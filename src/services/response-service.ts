import { Editor, MarkdownView, Notice } from "obsidian";
import OpenAI from "openai";
import { TextBlock } from "@anthropic-ai/sdk/resources";
import { CAOSettings, ChatMessage } from "../types";
import { AIClientService } from "./ai-client-service";
import {
	renderText,
	formatNewAISection,
	formatNewUserSection,
	processCalloutContent,
	processStreamingCalloutContent,
	setCursorToEnd,
} from "../utils";

export class ResponseService {
	private aiClientService: AIClientService;
	private settings: CAOSettings;

	constructor(aiClientService: AIClientService, settings: CAOSettings) {
		this.aiClientService = aiClientService;
		this.settings = settings;
	}

	updateSettings(settings: CAOSettings): void {
		this.settings = settings;
	}

	async generateResponse(
		editor: Editor,
		messages: ChatMessage[],
		model: string,
		maxTokens: number,
		temperature: number,
		systemPrompt: string,
	): Promise<void> {
		if (!this.aiClientService.isValidApiKey()) {
			new Notice("Please set your API key first.");
			return;
		}

		let tokenCount = 0;

		if (this.settings.provider === "anthropic") {
			await this.generateAnthropicResponse(
				editor,
				messages,
				model,
				maxTokens,
				temperature,
				systemPrompt,
			);
		} else {
			await this.generateOpenAIResponse(
				editor,
				messages,
				model,
				maxTokens,
				temperature,
				systemPrompt,
			);
		}
	}

	private async generateAnthropicResponse(
		editor: Editor,
		messages: ChatMessage[],
		model: string,
		maxTokens: number,
		temperature: number,
		systemPrompt: string,
	): Promise<void> {
		const anthropic = this.aiClientService.getAnthropicClient()!;
		const msgs = messages.map((m) => ({
			role: m.role === "user" ? ("user" as const) : ("assistant" as const),
			content: m.content,
		}));

		const chatOptions = {
			model,
			max_tokens: maxTokens,
			temperature,
			system: systemPrompt,
			messages: msgs,
		};

		try {
			if (this.settings.streamingResponse) {
				await this.handleAnthropicStreaming(editor, anthropic, chatOptions);
			} else {
				await this.handleAnthropicNonStreaming(editor, anthropic, chatOptions);
			}
		} catch (error: any) {
			this.handleAnthropicError(error, model);
		}
	}

	private async handleAnthropicStreaming(
		editor: Editor,
		anthropic: any,
		chatOptions: any,
	): Promise<void> {
		await renderText(editor, formatNewAISection(this.settings.useCallouts));
		const stream = anthropic.messages.stream(chatOptions);
		let isStartOfLine = true;
		let tokenCount = 0;

		for await (const event of stream) {
			if (event.type === "content_block_delta" && "text" in event.delta) {
				if (this.settings.useCallouts) {
					const { processedChunk, newIsStartOfLine } =
						processStreamingCalloutContent(event.delta.text, isStartOfLine);
					await renderText(editor, processedChunk);
					isStartOfLine = newIsStartOfLine;
				} else {
					await renderText(editor, event.delta.text);
				}
			}
			if (event.type === "message_delta") {
				tokenCount = event.usage?.output_tokens || 0;
			}
		}

		await this.addTokenStats(editor, tokenCount);
	}

	private async handleAnthropicNonStreaming(
		editor: Editor,
		anthropic: any,
		chatOptions: any,
	): Promise<void> {
		const response = await anthropic.messages.create(chatOptions);

		if (!response || !response.content) {
			new Notice("No response received, try again later");
			return;
		}

		const tokenCount = response.usage?.output_tokens || 0;
		const rawContent = response.content
			.map((item: TextBlock) => item.text)
			.join("");
		const processedContent = this.settings.useCallouts
			? processCalloutContent(rawContent)
			: rawContent;
		const generatedText =
			formatNewAISection(this.settings.useCallouts) + processedContent;

		await renderText(editor, generatedText);
		await this.addTokenStats(editor, tokenCount);
	}

	private async generateOpenAIResponse(
		editor: Editor,
		messages: ChatMessage[],
		model: string,
		maxTokens: number,
		temperature: number,
		systemPrompt: string,
	): Promise<void> {
		const openai = this.aiClientService.getOpenAIClient()!;
		const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...messages.map((m) => ({
				role: m.role === "user" ? ("user" as const) : ("assistant" as const),
				content: m.content,
			})),
		];

		const chatOptions: OpenAI.Chat.ChatCompletionCreateParams = {
			model,
			max_tokens: maxTokens,
			temperature,
			messages: msgs,
		};

		try {
			if (this.settings.streamingResponse) {
				await this.handleOpenAIStreaming(editor, openai, chatOptions);
			} else {
				await this.handleOpenAINonStreaming(editor, openai, chatOptions);
			}
		} catch (error: any) {
			this.handleOpenAIError(error, model);
		}
	}

	private async handleOpenAIStreaming(
		editor: Editor,
		openai: OpenAI,
		chatOptions: OpenAI.Chat.ChatCompletionCreateParams,
	): Promise<void> {
		await renderText(editor, formatNewAISection(this.settings.useCallouts));
		const stream = await openai.chat.completions.create({
			...chatOptions,
			stream: true,
			stream_options: { include_usage: true },
		});
		let isStartOfLine = true;
		let tokenCount = 0;

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content;
			if (content) {
				if (this.settings.useCallouts) {
					const { processedChunk, newIsStartOfLine } =
						processStreamingCalloutContent(content, isStartOfLine);
					await renderText(editor, processedChunk);
					isStartOfLine = newIsStartOfLine;
				} else {
					await renderText(editor, content);
				}
			}
			if (chunk.usage) {
				tokenCount = chunk.usage.completion_tokens || 0;
			}
		}

		await this.addTokenStats(editor, tokenCount);
	}

	private async handleOpenAINonStreaming(
		editor: Editor,
		openai: OpenAI,
		chatOptions: OpenAI.Chat.ChatCompletionCreateParams,
	): Promise<void> {
		const response = await openai.chat.completions.create(chatOptions) as OpenAI.Chat.ChatCompletion;

		if (!response || !response.choices || response.choices.length === 0) {
			new Notice("No response received, try again later");
			return;
		}

		const tokenCount = response.usage?.completion_tokens || 0;
		const rawContent = response.choices[0].message.content || "";
		const processedContent = this.settings.useCallouts
			? processCalloutContent(rawContent)
			: rawContent;
		const generatedText =
			formatNewAISection(this.settings.useCallouts) + processedContent;

		await renderText(editor, generatedText);
		await this.addTokenStats(editor, tokenCount);
	}

	private async addTokenStats(editor: Editor, tokenCount: number): Promise<void> {
		if (this.settings.showStats) {
			const tokenText = this.settings.useCallouts
				? `\n> (${tokenCount} tokens)`
				: `\n(${tokenCount} tokens)`;
			await renderText(editor, tokenText);
		}
		await renderText(editor, formatNewUserSection(this.settings.useCallouts));
		setCursorToEnd(editor);
	}

	private handleAnthropicError(error: any, model: string): void {
		let errorMessage = "Failed to get response from Anthropic: ";
		if (error.status === 401) {
			errorMessage +=
				"Invalid API key. Please check your Anthropic API key in settings.";
		} else if (error.status === 404) {
			errorMessage += `Model "${model}" not found. Please verify the model name in settings.`;
		} else if (error.status === 429) {
			errorMessage += "Rate limit exceeded. Please try again later.";
		} else if (error.message) {
			errorMessage += error.message;
		} else {
			errorMessage += "Unknown error occurred.";
		}
		new Notice(errorMessage, 8000);
		console.error("Anthropic API error:", error);
	}

	private handleOpenAIError(error: any, model: string): void {
		let errorMessage = "Failed to get response: ";
		if (error.status === 401) {
			errorMessage +=
				"Invalid API key. Please check your provider API key in settings.";
		} else if (error.status === 404) {
			errorMessage += `Model "${model}" not found. Please verify the base URL or the model name in settings.`;
		} else if (error.status === 429) {
			errorMessage += "Rate limit exceeded. Please try again later.";
		} else if (error.message) {
			errorMessage += error.message;
		} else {
			errorMessage += "Unknown error occurred.";
		}
		new Notice(errorMessage, 8000);
		console.error("OpenAI-compatible API error:", error);
	}
}