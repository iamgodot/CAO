import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { CAOSettings, PromptTemplate } from "./types/settings";
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
	useCallouts: false,
	customPrompts: [
		{
			name: "Summarize",
			template:
				"Please provide a comprehensive summary of the following content. Include the main points, key takeaways, and important details:\n\n{cursor}",
		},
		{
			name: "Rewrite",
			template:
				"Please rewrite the following text to improve clarity, readability, and flow while maintaining the original meaning and tone:\n\n{cursor}",
		},
		{
			name: "Explain like I'm 5",
			template:
				"Please explain {cursor} in simple terms that a 5-year-old could understand. Use everyday examples and avoid complex terminology.",
		},
	],
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
			.setDesc("Choose between Anthropic (official) or OpenAI-compatible APIs")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("anthropic", "Anthropic (Official)")
					.addOption("openai-compatible", "OpenAI Compatible")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value: "anthropic" | "openai-compatible") => {
						this.plugin.settings.provider = value;
						await this.plugin.saveSettings();
						this.display(); // Refresh UI to show/hide fields
					}),
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
						.addOption("claude-sonnet-4-5", "Claude 4.5 Sonnet (latest)")
						.addOption("claude-sonnet-4-0", "Claude 4.0 Sonnet (latest)")
						.addOption("claude-haiku-4-5", "Claude 4.5 Haiku (latest)")
						.addOption("claude-3-5-haiku-latest", "Claude 3.5 Haiku (latest)")
						.addOption("claude-3-haiku-20240307", "Claude 3 Haiku (latest)")
						.addOption("claude-opus-4-5", "Claude 4.5 Opus (latest)")
						.addOption("claude-opus-4-1", "Claude 4.1 Opus (latest)")
						.addOption("claude-opus-4-0", "Claude 4.0 Opus (latest)")
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
							this.plugin.settings.maxTokens = DEFAULT_SETTINGS.maxTokens;
							await this.plugin.saveSettings();
						} else if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.maxTokens = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("Max tokens should be a positive integer.");
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
							this.plugin.settings.temperature = DEFAULT_SETTINGS.temperature;
							await this.plugin.saveSettings();
						} else if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
							this.plugin.settings.temperature = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("Temperature should be a number between 0 and 1.");
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
		new Setting(containerEl)
			.setName("Callouts for chat formatting (Experimental)")
			.setDesc("Use callouts instead of headers to format chat messages")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useCallouts)
					.onChange(async (value) => {
						this.plugin.settings.useCallouts = value;
						await this.plugin.saveSettings();
					}),
			);

		// Custom Prompts Section
		containerEl.createEl("h3", { text: "Custom Prompts" });
		containerEl.createEl("p", {
			text: "Create custom commands for quick prompt insertion. Use {cursor} to mark cursor position.",
		});

		// Display existing templates
		this.plugin.settings.customPrompts.forEach((template, index) => {
			const setting = new Setting(containerEl).setName(template.name);

			// Edit button
			setting.addButton((button) =>
				button
					.setIcon("pencil")
					.setTooltip("Edit")
					.onClick(() => {
						this.showTemplateEditor(template, index);
					}),
			);

			// Delete button
			setting.addButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Delete")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.customPrompts.splice(index, 1);
						await this.plugin.saveSettings();
						this.display(); // Refresh UI
					}),
			);
		});

		// Add new template button
		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Add Custom Prompt")
				.setCta()
				.onClick(() => {
					this.showTemplateEditor();
				}),
		);
	}

	showTemplateEditor(template?: PromptTemplate, index?: number) {
		const isEditing = template !== undefined;
		const currentTemplate: PromptTemplate = template || {
			name: "",
			template: "",
		};

		const modal = new TemplateEditorModal(
			this.app,
			currentTemplate,
			async (updatedTemplate) => {
				// Validate name uniqueness and command conflicts
				const existingIndex = this.plugin.settings.customPrompts.findIndex(
					(t) => t.name === updatedTemplate.name,
				);

				if (!isEditing && existingIndex !== -1) {
					new Notice("A template with this name already exists!");
					return;
				}

				if (isEditing && existingIndex !== -1 && existingIndex !== index) {
					new Notice("A template with this name already exists!");
					return;
				}

				// Check if command name conflicts with existing Obsidian commands
				// Note: We check this.app.commands.commands which contains all registered commands
				if (
					(this.app as any).commands?.commands &&
					(this.app as any).commands.commands[updatedTemplate.name]
				) {
					if (
						!isEditing ||
						(isEditing &&
							index !== undefined &&
							this.plugin.settings.customPrompts[index].name !==
								updatedTemplate.name)
					) {
						new Notice(
							"A command with this name already exists. Please choose a different name.",
						);
						return;
					}
				}

				// Update or add template
				if (isEditing && index !== undefined) {
					this.plugin.settings.customPrompts[index] = updatedTemplate;
				} else {
					this.plugin.settings.customPrompts.push(updatedTemplate);
				}

				await this.plugin.saveSettings();
				this.display(); // Refresh UI
			},
		);
		modal.open();
	}
}

class TemplateEditorModal extends Modal {
	template: PromptTemplate;
	onSave: (template: PromptTemplate) => void;

	constructor(
		app: App,
		template: PromptTemplate,
		onSave: (template: PromptTemplate) => void,
	) {
		super(app);
		this.template = { ...template };
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Title
		contentEl.createEl("h2", { text: "Custom Prompt Template" });

		// Command name section
		const nameSection = contentEl.createEl("div");
		nameSection.style.marginBottom = "20px";

		nameSection.createEl("h3", { text: "Command Name" });
		nameSection.createEl("p", {
			text: "Name for the command (e.g., 'explain' creates 'explain' command)",
			cls: "setting-item-description",
		});

		const nameInput = nameSection.createEl("input", {
			type: "text",
		});
		nameInput.value = this.template.name; // Set value after creation
		nameInput.style.width = "100%";
		nameInput.style.padding = "8px";
		nameInput.style.marginTop = "8px";
		nameInput.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			this.template.name = target.value;
		});

		// Template content section
		const templateSection = contentEl.createEl("div");
		templateSection.style.marginBottom = "20px";

		templateSection.createEl("h3", { text: "Template Content" });
		templateSection.createEl("p", {
			text: "Template content. Use {cursor} to mark where cursor should be placed after insertion.",
			cls: "setting-item-description",
		});

		const templateTextArea = templateSection.createEl("textarea", {
			placeholder: "Please explain {cursor} in simple terms for beginners",
		});
		templateTextArea.value = this.template.template; // Set value after creation
		templateTextArea.style.width = "100%";
		templateTextArea.style.minHeight = "120px";
		templateTextArea.style.padding = "8px";
		templateTextArea.style.marginTop = "8px";
		templateTextArea.style.fontFamily = "var(--font-monospace)";
		templateTextArea.style.resize = "vertical";
		templateTextArea.addEventListener("input", (e) => {
			const target = e.target as HTMLTextAreaElement;
			this.template.template = target.value;
		});

		// Buttons
		const buttonContainer = contentEl.createEl("div", {
			cls: "modal-button-container",
		});
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "8px";
		buttonContainer.style.marginTop = "16px";

		const saveButton = buttonContainer.createEl("button", { text: "Save" });
		saveButton.classList.add("mod-cta");
		saveButton.addEventListener("click", () => {
			if (!this.template.name.trim()) {
				new Notice("Template name is required!");
				return;
			}
			if (!this.template.template.trim()) {
				new Notice("Template content is required!");
				return;
			}
			this.onSave(this.template);
			this.close();
		});

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
