import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { CAOSettings } from "./types";
import CAO from "./main";

export const DEFAULT_SETTINGS: CAOSettings = {
	apiKey: "",
	maxTokens: 1024,
	model: "claude-3-7-sonnet-latest",
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
			.setName("API key")
			.setDesc("Enter your Anthropic API key")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Model")
			.setDesc("Claude model to use")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"claude-3-7-sonnet-latest",
						"Claude 3.7 Sonnet (latest)",
					)
					.addOption(
						"claude-3-5-sonnet-latest",
						"Claude 3.5 Sonnet v2 (latest)",
					)
					.addOption(
						"claude-3-5-sonnet-20240620",
						"Claude 3.5 Sonnet (20240620)",
					)
					.addOption(
						"claude-3-sonnet-20240229",
						"Claude 3 Sonnet (20240229)",
					)
					.addOption(
						"claude-3-haiku-latest",
						"Claude 3 Haiku (latest)",
					)
					.addOption(
						"claude-3-haiku-20240307",
						"Claude 3 Haiku (20240307)",
					)
					.addOption("claude-3-opus-latest", "Claude 3 Opus (latest)")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					}),
			);
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
