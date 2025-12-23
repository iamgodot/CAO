import { Editor } from "obsidian";
import { ChatService } from "./chat-service";
import { ChatRequest } from "../types/content";

export interface ResponseHandler {
	process(chatService: ChatService, request: ChatRequest): Promise<void>;
}

export interface ResponseHandlerOptions {
	editor: Editor;
	useCallouts: boolean;
	showStats: boolean;
}