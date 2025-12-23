import { ChatRequest, ChatResponse, StreamingEvent } from './content';


/**
 * Base configuration for all providers
 */
export interface ProviderConfig {
  apiKey: string;
}

/**
 * Anthropic-specific configuration
 */
export interface AnthropicConfig extends ProviderConfig {
}

/**
 * OpenAI-compatible provider configuration
 */
export interface OpenAIConfig extends ProviderConfig {
  baseURL?: string;
}

/**
 * Core provider interface that all AI providers must implement
 */
export interface ChatProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Send a message and get a complete response
   */
  sendMessage(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Send a message and get streaming response chunks
   */
  streamMessage(request: ChatRequest): AsyncIterableIterator<StreamingEvent>;
}