import { Notice } from "obsidian";
import { ResponseHandler, ResponseHandlerOptions } from "./response-handler";
import { ChatService } from "./chat-service";
import { ChatRequest } from "../types/content";
import {
  renderText,
  formatNewAISection,
  formatNewUserSection,
  processStreamingCalloutContent,
  setCursorToEnd,
} from "../utils";

export class StreamingResponseHandler implements ResponseHandler {
  private tokenCount = 0;
  private isStartOfLine = true;

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

  private async processResponse(
    chatService: ChatService,
    request: ChatRequest,
  ): Promise<void> {
    // Streaming response using unified ChatService
    renderText(
      this.options.editor,
      formatNewAISection(this.options.useCallouts),
    );

    for await (const event of chatService.streamMessage(request)) {
      if (event.type === "content" && event.data && "content" in event.data) {
        const content = event.data.content as string;
        if (content) {
          if (this.options.useCallouts) {
            const { processedChunk, newIsStartOfLine } =
              processStreamingCalloutContent(content, this.isStartOfLine);
            renderText(this.options.editor, processedChunk);
            this.isStartOfLine = newIsStartOfLine;
          } else {
            renderText(this.options.editor, content);
          }
        }
      } else if (
        event.type === "usage" &&
        event.data &&
        "outputTokens" in event.data
      ) {
        this.tokenCount = event.data.outputTokens || 0;
      } else if (event.type === "error") {
        throw event.data;
      }
    }
  }

  private renderTokenCount(): void {
    const tokenText = this.options.useCallouts
      ? `\n> (${this.tokenCount} tokens)`
      : `\n(${this.tokenCount} tokens)`;
    renderText(this.options.editor, tokenText);
  }

  private addNewUserSection(): void {
    renderText(
      this.options.editor,
      formatNewUserSection(this.options.useCallouts),
    );
    setCursorToEnd(this.options.editor);
  }
}
