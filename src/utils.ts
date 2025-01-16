import { Editor } from "obsidian";
import { ChatMessage } from "./types";

export function parseChat(text: string): ChatMessage[] | null {
	const lines = text.split("\n");
	const messages: ChatMessage[] = [];
	let currentMessage: Partial<ChatMessage> | null = null;
	let content: string[] = [];

	for (const line of lines) {
		if (line.startsWith("### Me")) {
			if (currentMessage) {
				currentMessage.content = content.join("\n").trim();
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "user", content: "" };
			content = [];
		} else if (line.startsWith("### CAO")) {
			if (currentMessage) {
				currentMessage.content = content.join("\n").trim();
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "assistant", content: "" };
			content = [];
		} else {
			content.push(line);
		}
	}

	// Add the last message
	if (currentMessage) {
		currentMessage.content = content.join("\n").trim();
		messages.push(currentMessage as ChatMessage);
	}

	// Validate the chat format
	for (let i = 0; i < messages.length; i++) {
		if (i % 2 === 0 && messages[i].role !== "user") return null;
		if (i % 2 === 1 && messages[i].role !== "assistant") return null;
	}

	return messages;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setCursorToEnd(editor: Editor): void {
	editor.setCursor(
		editor.lastLine(),
		editor.getLine(editor.lastLine()).length,
	);
}

export async function streamText(
	editor: Editor,
	text: string,
	interval: number,
): Promise<void> {
	for (const char of text.split("")) {
		await sleep(interval);
		const lastLine = editor.lastLine();
		const pos = {
			line: lastLine,
			ch: editor.getLine(lastLine).length,
		};
		editor.replaceRange(char, pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);
	}
}
