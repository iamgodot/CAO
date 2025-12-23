import { Editor, EditorPosition, MarkdownView, Plugin, Notice } from "obsidian";
import { format } from "date-fns";
import { CAOSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CAOSettings, PromptTemplate } from "./types/settings";
import { ChatService } from "./services/chat-service";
import { ResponseHandlerFactory } from "./services/response-handler-factory";
import { ChatRequest } from "./types/content";
import {
	setCursorToEnd,
	formatNewUserSection,
	parseChat,
	validateChatFormat,
	extractChatRequestSettings,
	writeChatSettingsToFrontmatter,
	CURSOR_PLACEHOLDER,
} from "./utils";
import { ChatSelectionModal } from "./chat-selection-modal";

export default class CAO extends Plugin {
	settings: CAOSettings;
	private chatService: ChatService;
	private promptCommands: Set<string> = new Set();

	async onload() {
		await this.loadSettings();

		this.chatService = new ChatService(this.settings);
		this.addSettingTab(new CAOSettingTab(this.app, this));

		this.addCommand({
			id: "open-new-chat",
			name: "Open new chat",
			callback: async () => {
				const formattedDateTime = format(new Date(), "yyyy-MM-dd HH-mm-ss");
				const filename = `Chat ${formattedDateTime}.md`;
				const folderPath = this.settings.chatFolderPath;

				if (!(await this.app.vault.adapter.exists(folderPath))) {
					await this.app.vault.createFolder(folderPath);
				}

				const filePath = `${folderPath}/${filename}`;
				const file = await this.app.vault.create(
					filePath,
					formatNewUserSection(this.settings.useCallouts, true),
				);
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);

				const view = leaf.view;
				if (view instanceof MarkdownView) {
					setCursorToEnd(view.editor);
				}
			},
		});

		this.addCommand({
			id: "open-last-chat",
			name: "Open last chat",
			callback: async () => {
				const folderPath = this.settings.chatFolderPath;
				if (!(await this.app.vault.adapter.exists(folderPath))) {
					new Notice("CAO folder not found");
					return;
				}
				const files = this.app.vault
					.getMarkdownFiles()
					.filter((file) => file.path.startsWith(folderPath + "/"))
					.sort((a, b) => b.stat.mtime - a.stat.mtime);
				if (files.length === 0) {
					new Notice("No chats yet");
					return;
				}
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(files[0]);
			},
		});

		this.addCommand({
			id: "select-chat",
			name: "Select chat",
			callback: async () => {
				const folderPath = this.settings.chatFolderPath;
				if (!(await this.app.vault.adapter.exists(folderPath))) {
					new Notice("CAO folder not found");
					return;
				}

				const modal = new ChatSelectionModal(
					this.app,
					folderPath,
					async (selectedFile) => {
						const leaf = this.app.workspace.getLeaf(false);
						await leaf.openFile(selectedFile);
					},
				);
				modal.open();
			},
		});

		this.addCommand({
			id: "get-response",
			name: "Get response",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.chatService.hasProvider()) {
					new Notice("Please set your API key first.");
					return;
				}

				const currentText = editor.getValue();

				const formatValidation = await validateChatFormat(
					currentText,
					this.settings.useCallouts,
				);
				if (!formatValidation.isValid) {
					new Notice(formatValidation.error!.message, 8000);
					return;
				}

				const messages = await parseChat(this.app, currentText);
				if (!messages) {
					new Notice("Failed to parse chat messages", 8000);
					return;
				}

				const chatSettings = await extractChatRequestSettings(
					this.app,
					view.file,
					this.settings,
				);
				const request: ChatRequest = {
					...chatSettings,
					messages,
					stream: this.settings.streamingResponse,
				};

				const handler = ResponseHandlerFactory.create(
					this.settings.streamingResponse,
					{
						editor,
						useCallouts: this.settings.useCallouts,
						showStats: this.settings.showStats,
					},
				);

				await handler.process(this.chatService, request);
			},
		});

		this.addCommand({
			id: "add-chat-options",
			name: "Add/Reset chat options in frontmatter",
			editorCallback: async (_: Editor, view: MarkdownView) => {
				const currentFile = view.file;
				if (!currentFile) {
					new Notice("Please open a chat first.");
					return;
				}
				await writeChatSettingsToFrontmatter(
					this.app,
					currentFile,
					this.settings,
				);
			},
		});

		this.registerPromptCommands(this.settings.customPrompts);
	}

	private registerPromptCommands(templates: PromptTemplate[]) {
		templates.forEach((template) => {
			this.addCommand({
				id: template.name,
				name: template.name,
				editorCallback: (editor: Editor, view: MarkdownView) => {
					this.insertTemplate(editor, template);
				},
			});

			this.promptCommands.add(template.name);
		});
	}

	private updatePromptCommands(templates: PromptTemplate[]) {
		// Remove commands that no longer exist
		const newNames = new Set(templates.map((t) => t.name));
		this.promptCommands.forEach((commandId) => {
			if (!newNames.has(commandId)) {
				this.removeCommand(commandId);
				this.promptCommands.delete(commandId);
			}
		});

		// Add new commands
		templates.forEach((template) => {
			if (!this.promptCommands.has(template.name)) {
				this.addCommand({
					id: template.name,
					name: template.name,
					editorCallback: (editor: Editor, view: MarkdownView) => {
						this.insertTemplate(editor, template);
					},
				});

				this.promptCommands.add(template.name);
			}
		});
	}

	private insertTemplate(editor: Editor, template: PromptTemplate) {
		const cursorPos = editor.getCursor();
		const templateText = template.template;

		this.positionCursorInTemplate(editor, cursorPos, templateText);
	}

	private positionCursorInTemplate(
		editor: Editor,
		insertPos: EditorPosition,
		templateText: string,
	) {
		const placeholderIndex = templateText.indexOf(CURSOR_PLACEHOLDER);

		if (placeholderIndex !== -1) {
			// Calculate cursor position relative to insert point
			const beforeCursor = templateText.substring(0, placeholderIndex);
			const lines = beforeCursor.split("\n");

			const finalLine = insertPos.line + lines.length - 1;
			const finalCh =
				lines.length === 1
					? insertPos.ch + lines[0].length
					: lines[lines.length - 1].length;

			// Insert template without placeholder
			const cleanTemplate = templateText.replace(CURSOR_PLACEHOLDER, "");
			editor.replaceRange(cleanTemplate, insertPos);

			// Position cursor
			editor.setCursor(finalLine, finalCh);
		} else {
			// No cursor placeholder, insert template and position at end
			editor.replaceRange(templateText, insertPos);

			const lines = templateText.split("\n");
			const finalLine = insertPos.line + lines.length - 1;
			const finalCh =
				lines.length === 1
					? insertPos.ch + lines[0].length
					: lines[lines.length - 1].length;

			editor.setCursor(finalLine, finalCh);
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		let needsSave = false;

		if (data?.apiKey && !data?.anthropicApiKey) {
			this.settings.anthropicApiKey = data.apiKey;
			this.settings.provider = "anthropic";
			needsSave = true;
		}
		if (data?.model && !data?.anthropicModel) {
			this.settings.anthropicModel = data.model;
			needsSave = true;
		}

		if (needsSave) {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.chatService.setProvider(this.settings);
		this.updatePromptCommands(this.settings.customPrompts);
	}
}
