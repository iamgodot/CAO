// Model aliases: https://docs.claude.com/en/docs/about-claude/models/overview#model-aliases (last check: 2025_10_15)
// Retired-Dates: https://docs.claude.com/en/docs/about-claude/model-deprecations#model-status (last check: 2025_10_15)

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { CAOSettings } from "./types";
import CAO from "./main";

export const DEFAULT_SETTINGS: CAOSettings = {
	provider: "anthropic",
	anthropicApiKey: "",
	openaiApiKey: "",
	baseURL: "",
	maxTokens: 1024,
	anthropicModel: "claude-sonnet-4-5",
	openaiModel: "gpt-4o",
	systemPrompt: "You are a helpful AI assistant",
	temperature: 1.0,
	chatFolderPath: "CAO/history",
	streamingResponse: true,
	showStats: true,
};

export class CAOSettingTab extends PluginSettingTab {
	plugin: CAO;

	constructor(app: App, plugin: CAO) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Chat folder path")
			.setDesc("Path to store chat history files(relative to vault root)")
			.addText((text) =>
				text
					.setPlaceholder("CAO/history")
					.setValue(this.plugin.settings.chatFolderPath)
					.onChange(async (value) => {
						if (!value) {
							this.plugin.settings.chatFolderPath =
								DEFAULT_SETTINGS.chatFolderPath;
						} else {
							this.plugin.settings.chatFolderPath = value;
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API Provider")
			.setDesc(
				"Choose between Anthropic (official) or OpenAI-compatible APIs",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("anthropic", "Anthropic (Official)")
					.addOption("openai-compatible", "OpenAI Compatible")
					.setValue(this.plugin.settings.provider)
					.onChange(
						async (value: "anthropic" | "openai-compatible") => {
							this.plugin.settings.provider = value;
							await this.plugin.saveSettings();
							this.display(); // Refresh UI to show/hide fields
						},
					),
			);

		// API Key field - dynamic based on provider
		const isAnthropic = this.plugin.settings.provider === "anthropic";
		new Setting(containerEl)
			.setName(isAnthropic ? "Anthropic API Key" : "Provider API Key")
			.setDesc(
				isAnthropic
					? "Enter your Anthropic API key"
					: "Enter your provider's API key (OpenAI, OpenRouter, etc.)",
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(
						isAnthropic
							? this.plugin.settings.anthropicApiKey
							: this.plugin.settings.openaiApiKey,
					)
					.onChange(async (value) => {
						if (isAnthropic) {
							this.plugin.settings.anthropicApiKey = value;
						} else {
							this.plugin.settings.openaiApiKey = value;
						}
						await this.plugin.saveSettings();
					}),
			);

		// Base URL - only show for OpenAI Compatible
		if (!isAnthropic) {
			new Setting(containerEl)
				.setName("Base URL")
				.setDesc(
					"Custom API endpoint (leave empty for default: https://api.openai.com/v1)",
				)
				.addText((text) =>
					text
						.setPlaceholder("https://api.openai.com/v1")
						.setValue(this.plugin.settings.baseURL)
						.onChange(async (value) => {
							this.plugin.settings.baseURL = value;
							await this.plugin.saveSettings();
						}),
				);
		}

		// Model selection - different UI based on provider
		if (isAnthropic) {
			new Setting(containerEl)
				.setName("Model")
				.setDesc("Claude model to use")
				.addDropdown((dropdown) =>
					dropdown
						.addOption(
							"claude-sonnet-4-5",
							"Claude 4.5 Sonnet (latest)",
						)
						.addOption(
							"claude-sonnet-4-0",
							"Claude 4.0 Sonnet  (latest)",
						)
						.addOption(
							"claude-3-7-sonnet-latest",
							"Claude 3.7 Sonnet (latest)",
						)
						.addOption(
							// Deprecated,	Tentative Retirement Date: October 22, 2025
							"claude-3-5-sonnet-latest",
							"Claude 3.5 Sonnet v2 (latest)",
						)
						.addOption(
							// Deprecated,	Tentative Retirement Date: October 22, 2025
							"claude-3-5-sonnet-20240620",
							"Claude 3.5 Sonnet (20240620)",
						)
						.addOption(
							// Active,	Tentative Retirement Date: Not sooner than October 22, 2025
							"claude-3-5-haiku-latest",
							"Claude 3.5 Haiku (latest)",
						)
						.addOption(
							// Active,	Tentative Retirement Date: Not sooner than March 7, 2025
							"claude-3-haiku-latest",
							"Claude 3 Haiku (latest)",
						)
						.addOption(
							"claude-opus-4-1",
							"Claude 4.1 Opus (latest)",
						)
						.addOption("claude-opus-4-0", "Claude 4 Opus (latest)")
						.addOption(
							// Deprecated,	Tentative Retirement Date: January 5, 2026
							"claude-3-opus-latest",
							"Claude 3 Opus (latest)",
						)
						.setValue(this.plugin.settings.anthropicModel)
						.onChange(async (value) => {
							this.plugin.settings.anthropicModel = value;
							await this.plugin.saveSettings();
						}),
				);
		} else {
			new Setting(containerEl)
				.setName("Model")
				.setDesc(
					"Model to use (e.g., gpt-4o for OpenAI, anthropic/claude-haiku-4.5 for OpenRouter, or provider-specific model names)",
				)
				.addText((text) =>
					text
						.setPlaceholder("gpt-4o")
						.setValue(this.plugin.settings.openaiModel)
						.onChange(async (value) => {
							this.plugin.settings.openaiModel = value;
							await this.plugin.saveSettings();
						}),
				);
		}
		new Setting(containerEl)
			.setName("Max tokens")
			.setDesc("Maximum number of tokens in response")
			.addText((text) =>
				text
					.setPlaceholder("1024")
					.setValue(this.plugin.settings.maxTokens.toFixed(0))
					.onChange(async (value) => {
						const numValue = Number(value);
						if (!numValue) {
							this.plugin.settings.maxTokens =
								DEFAULT_SETTINGS.maxTokens;
							await this.plugin.saveSettings();
						} else if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.maxTokens = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Max tokens should be a positive integer.",
							);
						}
					}),
			);
		new Setting(containerEl)
			.setName("Temperature")
			.setDesc(
				"Controls randomness in responses(0.0 to 1.0). Lower values make responses more deterministic, while higher values get more creative.",
			)
			.addText((text) =>
				text
					.setPlaceholder("1.0")
					.setValue(this.plugin.settings.temperature.toFixed(2))
					.onChange(async (value) => {
						const numValue = Number(value);
						if (!numValue) {
							this.plugin.settings.temperature =
								DEFAULT_SETTINGS.temperature;
							await this.plugin.saveSettings();
						} else if (
							!isNaN(numValue) &&
							numValue >= 0 &&
							numValue <= 1
						) {
							this.plugin.settings.temperature = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice(
								"Temperature should be a number between 0 and 1.",
							);
						}
					}),
			);
		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Default system prompt for Claude")
			.addTextArea((text) =>
				text
					.setPlaceholder("You are a helpful AI assistant")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Streaming response")
			.setDesc("Stream response content as they're generated")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.streamingResponse)
					.onChange(async (value) => {
						this.plugin.settings.streamingResponse = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Show stats")
			.setDesc("Show numbers of tokens in responses")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStats)
					.onChange(async (value) => {
						this.plugin.settings.showStats = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
