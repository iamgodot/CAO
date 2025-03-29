export interface CAOSettings {
	apiKey: string;
	maxTokens: number;
	model: string;
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
