/**
 * Content type system supporting text content
 */

export interface ContentBlock {
  type: 'text';
  content: string;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  stream?: boolean;
  metadata?: Record<string, any>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  content: ContentBlock[];
  usage: Usage;
  metadata?: Record<string, any>;
}

export interface StreamingEvent {
  type: 'content' | 'usage' | 'error' | 'done';
  data: ContentBlock | Usage | Error | null;
}

export interface ChatFormatValidation {
  isValid: boolean;
  format?: "headers" | "callouts";
  error?: {
    type: "format" | "empty_message";
    message: string;
  };
}

export interface ChatRequestSettings {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
}

