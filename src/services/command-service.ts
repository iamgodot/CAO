import { App, Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { CAOSettings, PromptTemplate, ChatMessage } from "../types";
import { ChatService } from "./chat-service";
import { ResponseService } from "./response-service";
import { TemplateService } from "./template-service";
import { validateChatBeforeResponse } from "../utils";

export class CommandService {
	private app: App;
	private plugin: Plugin;
	private settings: CAOSettings;
	private chatService: ChatService;
	private responseService: ResponseService;
	private templateService: TemplateService;
	private promptCommands: Set<string> = new Set();

	constructor(
		app: App,
		plugin: Plugin,
		settings: CAOSettings,
		chatService: ChatService,
		responseService: ResponseService,
		templateService: TemplateService,
	) {
		this.app = app;
		this.plugin = plugin;
		this.settings = settings;
		this.chatService = chatService;
		this.responseService = responseService;
		this.templateService = templateService;
	}

	updateSettings(settings: CAOSettings): void {
		this.settings = settings;
		this.chatService.updateSettings(settings);
		this.responseService.updateSettings(settings);
	}

	registerCommands(): void {
		this.registerChatCommands();
		this.registerResponseCommand();
		this.registerFrontmatterCommand();
		this.registerPromptCommands(this.settings.customPrompts);
	}

	private registerChatCommands(): void {
		this.plugin.addCommand({
			id: "open-new-chat",
			name: "Open new chat",
			callback: () => this.chatService.openNewChat(),
		});

		this.plugin.addCommand({
			id: "open-last-chat",
			name: "Open last chat",
			callback: () => this.chatService.openLastChat(),
		});

		this.plugin.addCommand({
			id: "select-chat",
			name: "Select chat",
			callback: () => this.chatService.selectChat(),
		});
	}

	private registerResponseCommand(): void {
		this.plugin.addCommand({
			id: "get-response",
			name: "Get response",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.handleGetResponse(editor, view);
			},
		});
	}

	private registerFrontmatterCommand(): void {
		this.plugin.addCommand({
			id: "add-chat-options",
			name: "Add/Reset chat options in frontmatter",
			editorCallback: async (_: Editor, view: MarkdownView) => {
				await this.handleAddChatOptions(view);
			},
		});
	}

	private async handleGetResponse(editor: Editor, view: MarkdownView): Promise<void> {
		const currentText = editor.getValue();

		// Comprehensive chat validation
		const validation = await validateChatBeforeResponse(
			this.app,
			currentText,
			this.settings.useCallouts,
		);
		if (!validation.isValid) {
			new Notice(validation.error!.message, 8000);
			return;
		}

		const messages = validation.messages!;

		// Get base settings from plugin or frontmatter
		let model =
			this.settings.provider === "anthropic"
				? this.settings.anthropicModel
				: this.settings.openaiModel;
		let maxTokens = this.settings.maxTokens;
		let temperature = this.settings.temperature;
		let systemPrompt = this.settings.systemPrompt;

		const currentFile = view.file;
		if (currentFile) {
			await this.app.fileManager.processFrontMatter(
				currentFile,
				(frontmatter) => {
					if ("model" in frontmatter) {
						model = frontmatter["model"];
					}
					if ("max_tokens" in frontmatter) {
						maxTokens = frontmatter["max_tokens"];
					}
					if ("temperature" in frontmatter) {
						temperature = frontmatter["temperature"];
					}
					if ("system_prompt" in frontmatter) {
						systemPrompt = frontmatter["system_prompt"];
					}
				},
			);
		}

		await this.responseService.generateResponse(
			editor,
			messages,
			model,
			maxTokens,
			temperature,
			systemPrompt,
		);
	}

	private async handleAddChatOptions(view: MarkdownView): Promise<void> {
		const currentFile = view.file;
		if (!currentFile) {
			new Notice("Please open a chat first.");
			return;
		}

		await this.app.fileManager.processFrontMatter(currentFile, (frontmatter) => {
			const model =
				this.settings.provider === "anthropic"
					? this.settings.anthropicModel
					: this.settings.openaiModel;
			frontmatter["model"] = model;
			frontmatter["max_tokens"] = this.settings.maxTokens;
			frontmatter["temperature"] = this.settings.temperature;
			frontmatter["system_prompt"] = this.settings.systemPrompt;
		});
	}

	registerPromptCommands(templates: PromptTemplate[]): void {
		templates.forEach((template) => {
			this.plugin.addCommand({
				id: template.name,
				name: template.name,
				editorCallback: (editor: Editor, view: MarkdownView) => {
					this.templateService.insertTemplate(editor, template);
				},
			});

			this.promptCommands.add(template.name);
		});
	}

	updatePromptCommands(templates: PromptTemplate[]): void {
		// Remove commands that no longer exist
		const newNames = new Set(templates.map((t) => t.name));

		this.promptCommands.forEach((commandId) => {
			if (!newNames.has(commandId)) {
				this.plugin.removeCommand(commandId);
				this.promptCommands.delete(commandId);
			}
		});

		// Add new commands
		templates.forEach((template) => {
			if (!this.promptCommands.has(template.name)) {
				this.plugin.addCommand({
					id: template.name,
					name: template.name,
					editorCallback: (editor: Editor, view: MarkdownView) => {
						this.templateService.insertTemplate(editor, template);
					},
				});

				this.promptCommands.add(template.name);
			}
		});
	}
}