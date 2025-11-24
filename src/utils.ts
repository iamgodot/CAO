import { App, Editor } from "obsidian";
import { ChatMessage } from "./types";

function extractWikilinks(text: string): string[] {
	const wikiLinkRegex = /\[\[(.*?)\]\]/g;
	const matches = text.match(wikiLinkRegex) || [];
	return matches.map((match) => {
		// Extract content between [[ and ]]
		const linkContent = match.slice(2, -2);
		// If there's a pipe, take only the part before it (the actual link)
		const actualLink = linkContent.split("|")[0];
		return actualLink;
	});
}

async function resolveWikilink(
	app: App,
	linkText: string,
): Promise<string | null> {
	// Remove display text if present (everything after the pipe)
	linkText = linkText.split("|")[0];

	// Parse link components (file, heading, block)
	let [fileName, subPath] = linkText.split("#");

	// Get file by name (checking both displayed name and path)
	const file = app.metadataCache.getFirstLinkpathDest(fileName, "");

	if (!file) {
		console.warn(`Could not find file: ${fileName}`);
		return null;
	}

	// Read file content
	const fileContent = await app.vault.read(file);

	// If no subpath, return whole file content
	if (!subPath) {
		return fileContent;
	}

	// Get metadata for headings and blocks
	const metadata = app.metadataCache.getFileCache(file);

	// If it's a heading reference
	if (metadata?.headings && !subPath.startsWith("^")) {
		const heading = metadata.headings.find((h) => h.heading === subPath);
		if (heading) {
			// Extract the section (from this heading to the next heading of same or higher level)
			const headingIndex = fileContent.indexOf(
				"#".repeat(heading.level) + " " + heading.heading,
			);
			if (headingIndex !== -1) {
				// Find next heading of same or higher level
				const remainingContent = fileContent.slice(headingIndex);
				const nextHeadingRegex = new RegExp(`\\n#{1,${heading.level}}\\s`, "g");
				nextHeadingRegex.lastIndex = 1; // Start search after current heading
				const match = nextHeadingRegex.exec(remainingContent);
				const endIndex = match
					? headingIndex + match.index
					: fileContent.length;
				return fileContent.slice(headingIndex, endIndex);
			}
		}
	}

	// If it's a block reference
	if (metadata?.blocks && subPath.startsWith("^")) {
		const blockId = subPath.slice(1); // Remove ^ prefix
		const blockPosition = metadata.blocks[blockId];
		if (blockPosition) {
			const lines = fileContent.split("\n");
			const start = blockPosition.position.start.line;
			const end = blockPosition.position.end.line;
			return lines.slice(start, end + 1).join("\n");
		}
	}

	return null;
}

async function parseUserPrompt(
	app: App,
	userQuery: string,
	processedWikilinks: Set<string> = new Set(),
): Promise<string> {
	let userPrompt = `User query: ${userQuery}`;
	const wikilinks = extractWikilinks(userQuery);
	for (const wikilink of wikilinks) {
		// Skip if this wikilink has already been processed
		if (processedWikilinks.has(wikilink)) continue;

		const resolvedContent = await resolveWikilink(app, wikilink);
		if (resolvedContent) {
			userPrompt += `\n\nContext from [[${wikilink}]]:\n${resolvedContent}`;
			// Mark this wikilink as processed
			processedWikilinks.add(wikilink);
		}
	}
	return userPrompt;
}

export async function parseChat(
	app: App,
	text: string,
): Promise<ChatMessage[] | null> {
	const lines = text.split("\n");
	const messages: ChatMessage[] = [];
	let currentMessage: Partial<ChatMessage> | null = null;
	let content: string[] = [];
	let inCallout = false; // Track if we're inside a callout block
	// Track which wikilinks have already been processed
	const processedWikilinks = new Set<string>();

	for (const line of lines) {
		// Check for header format (legacy)
		if (line.startsWith("### Me")) {
			if (currentMessage) {
				currentMessage.content = content.join("\n").trim();
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "user", content: "" };
			content = [];
			inCallout = false;
		} else if (line.startsWith("### CAO")) {
			if (currentMessage) {
				const userQuery = content.join("\n").trim();
				currentMessage.content = await parseUserPrompt(
					app,
					userQuery,
					processedWikilinks,
				);
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "assistant", content: "" };
			content = [];
			inCallout = false;
		}
		// Check for callout format
		else if (line.startsWith("> [!question] Me") || line.startsWith("> [!question]+ Me")) {
			if (currentMessage) {
				let processedContent = content.join("\n").trim();
				// Remove callout prefixes if we were in a callout
				if (inCallout) {
					processedContent = content
						.map((l) => (l.startsWith("> ") ? l.slice(2) : l))
						.join("\n")
						.trim();
				}
				currentMessage.content = processedContent;
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "user", content: "" };
			content = [];
			inCallout = true;
		} else if (line.startsWith("> [!success] CAO") || line.startsWith("> [!success]+ CAO")) {
			if (currentMessage) {
				let processedContent = content.join("\n").trim();
				// Remove callout prefixes if we were in a callout, then parse wikilinks
				if (inCallout) {
					processedContent = content
						.map((l) => (l.startsWith("> ") ? l.slice(2) : l))
						.join("\n")
						.trim();
				}
				currentMessage.content = await parseUserPrompt(
					app,
					processedContent,
					processedWikilinks,
				);
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "assistant", content: "" };
			content = [];
			inCallout = true;
		} else {
			content.push(line);
		}
	}

	// Add the last message
	if (currentMessage) {
		let processedContent = content.join("\n").trim();
		// Remove callout prefixes if we were in a callout, then parse wikilinks
		if (inCallout) {
			processedContent = content
				.map((l) => (l.startsWith("> ") ? l.slice(2) : l))
				.join("\n")
				.trim();
		}
		currentMessage.content = await parseUserPrompt(
			app,
			processedContent,
			processedWikilinks,
		);
		messages.push(currentMessage as ChatMessage);
	}

	// Validate the chat format
	for (let i = 0; i < messages.length; i++) {
		if (i % 2 === 0 && messages[i].role !== "user") return null;
		if (i % 2 === 1 && messages[i].role !== "assistant") return null;
	}

	return messages;
}

// Format detection and validation utilities
export interface ChatValidationResult {
	isValid: boolean;
	messages?: ChatMessage[];
	format?: "headers" | "callouts" | "empty";
	error?: {
		type: "format" | "empty_message" | "parsing";
		message: string;
	};
}

export async function validateChatBeforeResponse(
	app: App,
	text: string,
	useCallouts: boolean,
): Promise<ChatValidationResult> {
	// Step 1: Detect chat format
	const detectedFormat = detectChatFormat(text);

	// Step 2: Handle invalid formats
	if (detectedFormat === "mixed") {
		return {
			isValid: false,
			error: {
				type: "format",
				message:
					"This chat contains mixed formatting (both headers and callouts).",
			},
		};
	}

	// Step 3: Handle empty format (invalid for conversations)
	if (detectedFormat === "empty") {
		return {
			isValid: false,
			error: {
				type: "format",
				message: "No valid formatting found (headers or callouts).",
			},
		};
	}

	// Step 4: Validate format consistency with settings
	if (detectedFormat === "headers" && useCallouts) {
		return {
			isValid: false,
			error: {
				type: "format",
				message:
					'This chat uses header format, please disable "Use callouts for chat formatting" in settings to continue.',
			},
		};
	}

	if (detectedFormat === "callouts" && !useCallouts) {
		return {
			isValid: false,
			error: {
				type: "format",
				message:
					'This chat uses callout format, please enable "Use callouts for chat formatting" in settings to continue.',
			},
		};
	}

	// Step 5: Parse messages
	const messages = await parseChat(app, text);
	if (!messages || messages.length === 0) {
		return {
			isValid: false,
			error: {
				type: "parsing",
				message:
					"Invalid chat format, messages should alternate user query and assistant response.",
			},
		};
	}

	// Step 6: Check if all messages are empty
	// FIXME: need to slice for the prefix added in parseUserPrompt()
	const allMessagesEmpty = messages.every(
		(msg) => !msg.content.slice(12).trim(),
	);
	if (allMessagesEmpty) {
		return {
			isValid: false,
			error: {
				type: "empty_message",
				message: "Query message is empty.",
			},
		};
	}

	// Step 7: All validation passed
	return {
		isValid: true,
		messages,
		format: detectedFormat,
	};
}

export function detectChatFormat(
	text: string,
): "headers" | "callouts" | "mixed" | "empty" {
	const lines = text.split("\n");

	let hasHeaders = false;
	let hasCallouts = false;

	for (const line of lines) {
		if (line.startsWith("### Me") || line.startsWith("### CAO")) {
			hasHeaders = true;
		} else if (
			line.startsWith("> [!question] Me") ||
			line.startsWith("> [!question]+ Me") ||
			line.startsWith("> [!success] CAO") ||
			line.startsWith("> [!success]+ CAO")
		) {
			hasCallouts = true;
		}

		// Early exit if both formats detected
		if (hasHeaders && hasCallouts) {
			return "mixed";
		}
	}

	if (hasHeaders) {
		return "headers";
	} else if (hasCallouts) {
		return "callouts";
	} else {
		return "empty";
	}
}

// Helper functions for callout formatting
export function formatNewUserSection(
	useCallouts: boolean,
	forNewFile: boolean = false,
): string {
	const prefix = forNewFile ? "" : "\n\n";
	if (useCallouts) {
		return prefix + "> [!question]+ Me\n> ";
	} else {
		return prefix + "### Me\n";
	}
}

export function formatNewAISection(useCallouts: boolean): string {
	if (useCallouts) {
		return "\n\n> [!success]+ CAO\n";
	} else {
		return "\n\n### CAO\n";
	}
}

// Process content for callout format by adding "> " prefix to all lines
export function processCalloutContent(text: string): string {
	return text
		.split("\n")
		.map((line) => (line.trim() === "" ? ">" : `> ${line}`))
		.join("\n");
}

// Process streaming chunks for callout format
export function processStreamingCalloutContent(
	chunk: string,
	isStartOfLine: boolean,
): { processedChunk: string; newIsStartOfLine: boolean } {
	if (!chunk) return { processedChunk: chunk, newIsStartOfLine: isStartOfLine };

	let processedChunk = "";
	let newIsStartOfLine = isStartOfLine;

	for (let i = 0; i < chunk.length; i++) {
		const char = chunk[i];

		if (newIsStartOfLine) {
			processedChunk += "> ";
		}

		processedChunk += char;

		newIsStartOfLine = char === "\n";
	}

	return { processedChunk, newIsStartOfLine };
}

export function setCursorToEnd(editor: Editor): void {
	const lastLine = editor.lastLine();
	editor.setCursor(lastLine, editor.getLine(lastLine).length);
}

export async function renderText(
	editor: Editor,
	text: string,
): Promise<void> {
	const lastLine = editor.lastLine();
	const pos = {
		line: lastLine,
		ch: editor.getLine(lastLine).length,
	};
	editor.replaceRange(text, pos);
	editor.scrollIntoView({ from: pos, to: pos }, true);
}

// Template processing utilities
export function validateTemplateName(name: string): {
	valid: boolean;
	error?: string;
} {
	if (!name.trim()) {
		return { valid: false, error: "Template name cannot be empty" };
	}

	// Allow alphanumeric characters, spaces, hyphens, and apostrophes
	if (!/^[a-zA-Z0-9\s\-']+$/.test(name)) {
		return {
			valid: false,
			error:
				"Template name can only contain letters, numbers, spaces, hyphens, and apostrophes",
		};
	}

	if (name.length > 20) {
		return {
			valid: false,
			error: "Template name must be 20 characters or less",
		};
	}

	return { valid: true };
}

export function processTemplateContent(template: string): {
	processedContent: string;
	cursorPosition?: { line: number; ch: number };
} {
	const cursorPlaceholder = "{cursor}";
	const cursorIndex = template.indexOf(cursorPlaceholder);

	if (cursorIndex === -1) {
		return { processedContent: template };
	}

	// Calculate cursor position
	const beforeCursor = template.substring(0, cursorIndex);
	const lines = beforeCursor.split("\n");
	const line = lines.length - 1;
	const ch = lines[lines.length - 1].length;

	// Remove cursor placeholder
	const processedContent = template.replace(cursorPlaceholder, "");

	return {
		processedContent,
		cursorPosition: { line, ch },
	};
}

export function previewTemplate(template: string): string {
	// Replace cursor placeholder with a visual indicator for preview
	return template.replace("{cursor}", "[CURSOR]");
}

export function sanitizeTemplateName(input: string): string {
	// Convert to lowercase, remove invalid characters, replace spaces with hyphens
	return input
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 20);
}

// Chat file discovery utilities
export function getChatFiles(app: App, chatFolderPath: string) {
	return app.vault
		.getMarkdownFiles()
		.filter(
			(file) =>
				file.path.startsWith(chatFolderPath + "/") && file.extension === "md",
		);
}

export function sortFilesByMtime<T extends { stat: { mtime: number } }>(
	files: T[],
): T[] {
	return files.sort((a, b) => b.stat.mtime - a.stat.mtime);
}

export function formatChatDisplayName(fileName: string): string {
	// Remove .md extension and return clean display name
	return fileName.replace(/\.md$/, "");
}
