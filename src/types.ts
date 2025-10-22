export interface CAOSettings {
	provider: "anthropic" | "openai-compatible";
	anthropicApiKey: string;
	openaiApiKey: string;
	baseURL: string;
	maxTokens: number;
	anthropicModel: string;
	openaiModel: string;
	systemPrompt: string;
	temperature: number;
	chatFolderPath: string;
	streamingResponse: boolean;
	showStats: boolean;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}
