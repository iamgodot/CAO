import { App, Editor, TFile } from "obsidian";
import {
	ChatMessage,
	ChatFormatValidation,
	ChatRequestSettings,
} from "./types/content";
import { CAOSettings } from "./types/settings";

export const CURSOR_PLACEHOLDER = "{cursor}";
export const CALLOUT_USER_PREFIX = "> [!question]+ Me";
export const CALLOUT_AI_PREFIX = "> [!success]+ CAO";
export const HEADER_USER_PREFIX = "### Me";
export const HEADER_AI_PREFIX = "### CAO";

export const FRONTMATTER_KEYS = {
	MODEL: "model",
	MAX_TOKENS: "max_tokens",
	TEMPERATURE: "temperature",
	SYSTEM_PROMPT: "system_prompt",
} as const;

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

	// TODO: use cachedRead instead because we're not modifying the content
	const fileContent = await app.vault.read(file);
	if (!subPath) {
		return fileContent;
	}

	const metadata = app.metadataCache.getFileCache(file);
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
		if (line.startsWith(HEADER_USER_PREFIX)) {
			if (currentMessage) {
				currentMessage.content = [
					{
						type: "text" as const,
						content: content.join("\n").trim(),
					},
				];
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "user", content: [] };
			content = [];
			inCallout = false;
		} else if (line.startsWith(HEADER_AI_PREFIX)) {
			if (currentMessage) {
				const userQuery = content.join("\n").trim();
				const processedContent = await parseUserPrompt(
					app,
					userQuery,
					processedWikilinks,
				);
				currentMessage.content = [
					{
						type: "text" as const,
						content: processedContent,
					},
				];
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "assistant", content: [] };
			content = [];
			inCallout = false;
		}
		// Check for callout format
		else if (line.startsWith(CALLOUT_USER_PREFIX)) {
			if (currentMessage) {
				let processedContent = content.join("\n").trim();
				// Remove callout prefixes if we were in a callout
				if (inCallout) {
					processedContent = content
						.map((l) => (l.startsWith("> ") ? l.slice(2) : l))
						.join("\n")
						.trim();
				}
				currentMessage.content = [
					{
						type: "text" as const,
						content: processedContent,
					},
				];
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "user", content: [] };
			content = [];
			inCallout = true;
		} else if (line.startsWith(CALLOUT_AI_PREFIX)) {
			if (currentMessage) {
				let processedContent = content.join("\n").trim();
				// Remove callout prefixes if we were in a callout, then parse wikilinks
				if (inCallout) {
					processedContent = content
						.map((l) => (l.startsWith("> ") ? l.slice(2) : l))
						.join("\n")
						.trim();
				}
				const finalProcessedContent = await parseUserPrompt(
					app,
					processedContent,
					processedWikilinks,
				);
				currentMessage.content = [
					{
						type: "text" as const,
						content: finalProcessedContent,
					},
				];
				messages.push(currentMessage as ChatMessage);
			}
			currentMessage = { role: "assistant", content: [] };
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
		const lastProcessedContent = await parseUserPrompt(
			app,
			processedContent,
			processedWikilinks,
		);
		currentMessage.content = [
			{
				type: "text" as const,
				content: lastProcessedContent,
			},
		];
		messages.push(currentMessage as ChatMessage);
	}

	// Validate the chat format
	for (let i = 0; i < messages.length; i++) {
		if (i % 2 === 0 && messages[i].role !== "user") return null;
		if (i % 2 === 1 && messages[i].role !== "assistant") return null;
	}

	return messages;
}

export async function validateChatFormat(
	text: string,
	useCallouts: boolean,
): Promise<ChatFormatValidation> {
	const detectedFormat = detectChatFormat(text);

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

	if (detectedFormat === "empty") {
		return {
			isValid: false,
			error: {
				type: "format",
				message: "No valid formatting found (headers or callouts).",
			},
		};
	}

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

	const hasContent = text
		.split("\n")
		.some(
			(line) =>
				!line.startsWith(HEADER_USER_PREFIX) &&
				!line.startsWith(HEADER_AI_PREFIX) &&
				!line.startsWith(CALLOUT_USER_PREFIX) &&
				!line.startsWith(CALLOUT_AI_PREFIX) &&
				line.trim().length > 0,
		);

	if (!hasContent) {
		return {
			isValid: false,
			error: {
				type: "empty_message",
				message: "Query message is empty.",
			},
		};
	}

	return {
		isValid: true,
		format: detectedFormat as "headers" | "callouts",
	};
}

export function detectChatFormat(
	text: string,
): "headers" | "callouts" | "mixed" | "empty" {
	const lines = text.split("\n");

	let hasHeaders = false;
	let hasCallouts = false;

	for (const line of lines) {
		if (
			line.startsWith(HEADER_USER_PREFIX) ||
			line.startsWith(HEADER_AI_PREFIX)
		) {
			hasHeaders = true;
		} else if (
			line.startsWith(CALLOUT_USER_PREFIX) ||
			line.startsWith(CALLOUT_AI_PREFIX)
		) {
			hasCallouts = true;
		}

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

export function formatNewUserSection(
	useCallouts: boolean,
	forNewFile: boolean = false,
): string {
	const prefix = forNewFile ? "" : "\n\n";
	if (useCallouts) {
		return prefix + CALLOUT_USER_PREFIX + "\n> ";
	} else {
		return prefix + HEADER_USER_PREFIX + "\n";
	}
}

export function formatNewAISection(useCallouts: boolean): string {
	if (useCallouts) {
		return "\n\n" + CALLOUT_AI_PREFIX + "\n";
	} else {
		return "\n\n" + HEADER_AI_PREFIX + "\n";
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

export function renderText(editor: Editor, text: string): void {
	const lastLine = editor.lastLine();
	const pos = {
		line: lastLine,
		ch: editor.getLine(lastLine).length,
	};
	editor.replaceRange(text, pos);
	editor.scrollIntoView({ from: pos, to: pos }, true);
}

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

export async function extractChatRequestSettings(
	app: App,
	currentFile: TFile | null,
	defaultSettings: CAOSettings,
): Promise<ChatRequestSettings> {
	let settings: ChatRequestSettings = {
		model: (() => {
			switch (defaultSettings.provider) {
				case "anthropic":
					return defaultSettings.anthropicModel;
				case "openai-compatible":
					return defaultSettings.openaiModel;
				default:
					return "claude-sonnet-4-5"; // Fallback
			}
		})(),
		maxTokens: defaultSettings.maxTokens,
		temperature: defaultSettings.temperature,
		systemPrompt: defaultSettings.systemPrompt,
	};

	// Override with frontmatter if file exists
	if (currentFile) {
		await app.fileManager.processFrontMatter(currentFile, (frontmatter) => {
			// Type-safe extraction with validation
			if (
				FRONTMATTER_KEYS.MODEL in frontmatter &&
				typeof frontmatter[FRONTMATTER_KEYS.MODEL] === "string" &&
				frontmatter[FRONTMATTER_KEYS.MODEL].trim() !== ""
			) {
				settings.model = frontmatter[FRONTMATTER_KEYS.MODEL];
			}

			if (
				FRONTMATTER_KEYS.MAX_TOKENS in frontmatter &&
				typeof frontmatter[FRONTMATTER_KEYS.MAX_TOKENS] === "number" &&
				!isNaN(frontmatter[FRONTMATTER_KEYS.MAX_TOKENS]) &&
				frontmatter[FRONTMATTER_KEYS.MAX_TOKENS] > 0
			) {
				settings.maxTokens = frontmatter[FRONTMATTER_KEYS.MAX_TOKENS];
			}

			if (
				FRONTMATTER_KEYS.TEMPERATURE in frontmatter &&
				typeof frontmatter[FRONTMATTER_KEYS.TEMPERATURE] === "number" &&
				!isNaN(frontmatter[FRONTMATTER_KEYS.TEMPERATURE])
			) {
				settings.temperature = frontmatter[FRONTMATTER_KEYS.TEMPERATURE];
			}

			if (
				FRONTMATTER_KEYS.SYSTEM_PROMPT in frontmatter &&
				typeof frontmatter[FRONTMATTER_KEYS.SYSTEM_PROMPT] === "string"
			) {
				settings.systemPrompt = frontmatter[FRONTMATTER_KEYS.SYSTEM_PROMPT];
			}
		});
	}

	return settings;
}

export async function writeChatSettingsToFrontmatter(
	app: App,
	file: TFile,
	defaultSettings: CAOSettings,
): Promise<void> {
	const settings = await extractChatRequestSettings(
		app,
		null, // No existing frontmatter to override - use plugin defaults
		defaultSettings,
	);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		frontmatter[FRONTMATTER_KEYS.MODEL] = settings.model;
		frontmatter[FRONTMATTER_KEYS.MAX_TOKENS] = settings.maxTokens;
		frontmatter[FRONTMATTER_KEYS.TEMPERATURE] = settings.temperature;
		frontmatter[FRONTMATTER_KEYS.SYSTEM_PROMPT] = settings.systemPrompt;
	});
}
