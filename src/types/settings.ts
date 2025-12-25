/**
 * Plugin settings and configuration types
 */

export interface PromptTemplate {
  name: string; // Command name (e.g., "explain")
  template: string; // Template content with optional {cursor} placeholder
}

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
  useCallouts: boolean;
  customPrompts: PromptTemplate[];
}
