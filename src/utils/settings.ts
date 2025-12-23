import { App, TFile } from "obsidian";
import { ChatRequestSettings } from "../types/content";
import { CAOSettings } from "../types/settings";
import { FRONTMATTER_KEYS } from "./constants";

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