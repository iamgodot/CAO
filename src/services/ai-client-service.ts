import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { CAOSettings } from "../types";

export class AIClientService {
	private anthropic: Anthropic | null = null;
	private openai: OpenAI | null = null;
	private settings: CAOSettings;

	constructor(settings: CAOSettings) {
		this.settings = settings;
		this.initializeClient();
	}

	updateSettings(settings: CAOSettings): void {
		this.settings = settings;
		this.initializeClient();
	}

	private initializeClient(): void {
		if (this.settings.provider === "anthropic") {
			this.anthropic = new Anthropic({
				apiKey: this.settings.anthropicApiKey,
				dangerouslyAllowBrowser: true,
			});
			this.openai = null;
		} else {
			this.openai = new OpenAI({
				apiKey: this.settings.openaiApiKey,
				baseURL: this.settings.baseURL || "https://api.openai.com/v1",
				dangerouslyAllowBrowser: true,
			});
			this.anthropic = null;
		}
	}

	getAnthropicClient(): Anthropic | null {
		return this.anthropic;
	}

	getOpenAIClient(): OpenAI | null {
		return this.openai;
	}

	getCurrentApiKey(): string {
		return this.settings.provider === "anthropic"
			? this.settings.anthropicApiKey
			: this.settings.openaiApiKey;
	}

	isValidApiKey(): boolean {
		return !!this.getCurrentApiKey();
	}
}