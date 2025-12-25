import OpenAI from "openai";
import { BaseProvider } from "./base";
import { OpenAIConfig } from "../types/provider";
import {
  ChatRequest,
  ChatResponse,
  StreamingEvent,
  ContentBlock,
  Usage,
} from "../types/content";

/**
 * OpenAI-compatible provider implementation
 * Supports OpenAI, OpenRouter, and other OpenAI-compatible APIs
 */
export class OpenAIProvider extends BaseProvider {
  readonly id = "openai-compatible";
  readonly name = "OpenAI Compatible";

  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
  }

  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const openaiRequest = this.convertRequest(request);
    const response = (await this.client.chat.completions.create(
      openaiRequest,
    )) as OpenAI.Chat.ChatCompletion;
    return this.convertResponse(response);
  }

  async *streamMessage(
    request: ChatRequest,
  ): AsyncIterableIterator<StreamingEvent> {
    try {
      const openaiRequest = {
        ...this.convertRequest(request),
        stream: true,
        stream_options: { include_usage: true },
      };

      const stream = await this.client.chat.completions.create(openaiRequest);

      yield* this.wrapStream(stream, (chunk) => {
        // Map OpenAI streaming chunks to unified format
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          return {
            type: "content",
            data: this.createTextContent(content),
          };
        }

        if (chunk.usage) {
          return {
            type: "usage",
            data: {
              inputTokens: chunk.usage.prompt_tokens || 0,
              outputTokens: chunk.usage.completion_tokens || 0,
              totalTokens: chunk.usage.total_tokens || 0,
            },
          };
        }

        return null; // Ignore other chunk types
      });
    } catch (error) {
      yield {
        type: "error",
        data: error,
      };
    }
  }

  /**
   * Convert unified ChatRequest to OpenAI chat completion format
   */
  private convertRequest(
    request: ChatRequest,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    // OpenAI requires system prompt as first message
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message if present
    if (request.systemPrompt) {
      messages.push({
        role: "system",
        content: request.systemPrompt,
      });
    }

    // Convert and add user/assistant messages
    request.messages.forEach((msg) => {
      // Skip system messages (handled above)
      if (msg.role === "system") return;

      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content
          .filter((block) => block.type === "text")
          .map((block) => block.content as string)
          .join(""),
      });
    });

    return {
      model: request.model,
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };
  }

  /**
   * Convert OpenAI response to unified ChatResponse format
   */
  private convertResponse(response: OpenAI.Chat.ChatCompletion): ChatResponse {
    const choice = response.choices[0];
    const messageContent = choice?.message?.content || "";

    const content: ContentBlock[] = [this.createTextContent(messageContent)];

    const usage: Usage = {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };

    return {
      content,
      usage,
      metadata: {
        model: response.model,
        finish_reason: choice?.finish_reason,
        created: response.created,
      },
    };
  }
}
