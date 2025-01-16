export interface CAOSettings {
	apiKey: string;
	maxTokens: number;
	model: string;
	systemPrompt: string;
	temperature: number;
	chatFolderPath: string;
}

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}
