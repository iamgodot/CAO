import { Editor, MarkdownView, Plugin, Notice } from "obsidian";
import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";
import { CAOSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CAOSettings } from "./types";
import { parseChat, setCursorToEnd, streamText } from "./utils";
import { TextBlock } from "@anthropic-ai/sdk/resources";

export default class CAO extends Plugin {
	settings: CAOSettings;

	private anthropic: Anthropic;

	private initializeAnthropicClient() {
		this.anthropic = new Anthropic({
			apiKey: this.settings.apiKey,
			dangerouslyAllowBrowser: true,
		});
	}

	async onload() {
		await this.loadSettings();

		this.initializeAnthropicClient();
		this.addSettingTab(new CAOSettingTab(this.app, this));

		this.addCommand({
			id: "open-new-chat",
			name: "Open new chat",
			callback: async () => {
				const formattedDateTime = format(
					new Date(),
					"yyyy-MM-dd HH-mm-ss",
				);
				const filename = `Chat ${formattedDateTime}.md`;
				const folderPath = this.settings.chatFolderPath;

				if (!(await this.app.vault.adapter.exists(folderPath))) {
					await this.app.vault.createFolder(folderPath);
				}

				const filePath = `${folderPath}/${filename}`;
				// TODO: make constant
				const file = await this.app.vault.create(filePath, "### Me\n");
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
					.filter((file) => file.path.startsWith(folderPath))
					.filter((file) => file.basename.startsWith("Chat "))
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
			id: "get-response",
			name: "Get response",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.anthropic.apiKey) {
					new Notice("Please set your API key first.");
					return;
				}

				const currentText = editor.getValue();
				const messages = await parseChat(this.app, currentText);
				if (!messages || messages.length === 0) {
					new Notice(
						'Invalid chat format. Messages should alternate between "### Me" and "### CAO"',
					);
					return;
				}
				const emptyMessage = messages.find(
					(msg) => !msg.content.trim(),
				);
				if (emptyMessage) {
					new Notice("Messages are not allowed to be empty");
					return;
				}

				const msgs = messages.map((m) => ({
					role: m.role === "user" ? "user" : "assistant",
					content: m.content,
				}));

				const chatOptions = {
					model: this.settings.model,
					max_tokens: this.settings.maxTokens,
					temperature: this.settings.temperature,
					system: this.settings.systemPrompt,
					messages: msgs,
				};
				const currentFile = view.file;
				if (currentFile) {
					await this.app.fileManager.processFrontMatter(
						currentFile,
						(frontmatter) => {
							if ("model" in frontmatter) {
								chatOptions["model"] = frontmatter["model"];
							}
							if ("max_tokens" in frontmatter) {
								chatOptions["max_tokens"] =
									frontmatter["max_tokens"];
							}
							if ("temperature" in frontmatter) {
								chatOptions["temperature"] =
									frontmatter["temperature"];
							}
							if ("system_prompt" in frontmatter) {
								chatOptions["system"] =
									frontmatter["system_prompt"];
							}
						},
					);
				}
				let tokenCount = 0;
				let interval = 0;
				if (this.settings.streamingResponse) {
					interval = 0;
					await streamText(editor, "\n\n### CAO\n", interval);
					const stream = this.anthropic.messages.stream(chatOptions);
					for await (const event of stream) {
						if (event.type === "content_block_delta") {
							await streamText(
								editor,
								event.delta.text,
								interval,
							);
						}
						if (event.type === "message_delta") {
							tokenCount = event.usage?.output_tokens || 0;
						}
					}
				} else {
					interval = 50;
					const response =
						await this.anthropic.messages.create(chatOptions);

					if (!response || !response.content) {
						new Notice("No response received, try again later");
					}

					tokenCount = response.usage?.output_tokens || 0;
					const generatedText =
						`\n\n### CAO\n` +
						response.content
							.map((item: TextBlock) => item.text)
							.join("");
					await streamText(editor, generatedText, interval);
				}
				if (this.settings.showStats) {
					await streamText(
						editor,
						`\n(${tokenCount} tokens)`,
						interval,
					);
				}
				await streamText(editor, "\n\n### Me\n", interval);
				setCursorToEnd(editor);
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
				await this.app.fileManager.processFrontMatter(
					currentFile,
					(frontmatter) => {
						frontmatter["model"] = this.settings.model;
						frontmatter["max_tokens"] = this.settings.maxTokens;
						frontmatter["temperature"] = this.settings.temperature;
						frontmatter["system_prompt"] =
							this.settings.systemPrompt;
					},
				);
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeAnthropicClient();
	}
}
