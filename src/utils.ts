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
				const nextHeadingRegex = new RegExp(
					`\\n#{1,${heading.level}}\\s`,
					"g",
				);
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
	processedWikilinks: Set<string> = new Set()
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
	// Track which wikilinks have already been processed
	const processedWikilinks = new Set<string>();

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
				const userQuery = content.join("\n").trim();
				// Modified to pass the set of processed wikilinks
				currentMessage.content = await parseUserPrompt(app, userQuery, processedWikilinks);
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
		const userQuery = content.join("\n").trim();
		// Modified to pass the set of processed wikilinks
		currentMessage.content = await parseUserPrompt(app, userQuery, processedWikilinks);
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
	const lastLine = editor.lastLine();
	editor.setCursor(lastLine, editor.getLine(lastLine).length);
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
