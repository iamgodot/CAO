import { Editor, EditorPosition, MarkdownView, Plugin, Notice } from "obsidian";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { format } from "date-fns";
import { CAOSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CAOSettings, PromptTemplate } from "./types";
import {
	setCursorToEnd,
	renderText,
	formatNewAISection,
	formatNewUserSection,
	processCalloutContent,
	processStreamingCalloutContent,
	validateChatBeforeResponse,
} from "./utils";
import { TextBlock } from "@anthropic-ai/sdk/resources";
import { ChatSelectionModal } from "./chat-selection-modal";

export default class CAO extends Plugin {
	settings: CAOSettings;

	private anthropic: Anthropic | null = null;
	private openai: OpenAI | null = null;
	private promptCommands: Set<string> = new Set();

	private initializeAnthropicClient() {
		if (this.settings.provider === "anthropic") {
			this.anthropic = new Anthropic({
				apiKey: this.settings.anthropicApiKey,
				dangerouslyAllowBrowser: true,
			});
			this.openai = null;
		} else {
			this.openai = new OpenAI({
				apiKey: this.settings.openaiApiKey,
				baseURL: this.settings.baseURL || "https://api.openai.com/v1",
				dangerouslyAllowBrowser: true,
			});
			this.anthropic = null;
		}
	}

	async onload() {
		await this.loadSettings();

		this.initializeAnthropicClient();
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
				// TODO: make constant
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
				const currentApiKey =
					this.settings.provider === "anthropic"
						? this.settings.anthropicApiKey
						: this.settings.openaiApiKey;

				if (!currentApiKey) {
					new Notice("Please set your API key first.");
					return;
				}

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

				let tokenCount = 0;

				if (this.settings.provider === "anthropic") {
					// Anthropic SDK
					const msgs = messages.map((m) => ({
						role:
							m.role === "user" ? ("user" as const) : ("assistant" as const),
						content: m.content,
					}));

					const chatOptions = {
						model,
						max_tokens: maxTokens,
						temperature,
						system: systemPrompt,
						messages: msgs,
					};

					try {
						if (this.settings.streamingResponse) {
							await renderText(
								editor,
								formatNewAISection(this.settings.useCallouts),
							);
							const stream = this.anthropic!.messages.stream(chatOptions);
							let isStartOfLine = true; // Track if we're at the start of a line for callout processing
							for await (const event of stream) {
								if (
									event.type === "content_block_delta" &&
									"text" in event.delta
								) {
									if (this.settings.useCallouts) {
										const { processedChunk, newIsStartOfLine } =
											processStreamingCalloutContent(
												event.delta.text,
												isStartOfLine,
											);
										await renderText(editor, processedChunk);
										isStartOfLine = newIsStartOfLine;
									} else {
										await renderText(editor, event.delta.text);
									}
								}
								if (event.type === "message_delta") {
									tokenCount = event.usage?.output_tokens || 0;
								}
							}
						} else {
							const response =
								await this.anthropic!.messages.create(chatOptions);

							if (!response || !response.content) {
								new Notice("No response received, try again later");
								return;
							}

							tokenCount = response.usage?.output_tokens || 0;
							const rawContent = response.content
								.map((item: TextBlock) => item.text)
								.join("");
							const processedContent = this.settings.useCallouts
								? processCalloutContent(rawContent)
								: rawContent;
							const generatedText =
								formatNewAISection(this.settings.useCallouts) +
								processedContent;
							await renderText(editor, generatedText);
						}
					} catch (error: any) {
						let errorMessage = "Failed to get response from Anthropic: ";
						if (error.status === 401) {
							errorMessage +=
								"Invalid API key. Please check your Anthropic API key in settings.";
						} else if (error.status === 404) {
							errorMessage += `Model "${model}" not found. Please verify the model name in settings.`;
						} else if (error.status === 429) {
							errorMessage += "Rate limit exceeded. Please try again later.";
						} else if (error.message) {
							errorMessage += error.message;
						} else {
							errorMessage += "Unknown error occurred.";
						}
						new Notice(errorMessage, 8000);
						console.error("Anthropic API error:", error);
						return;
					}
				} else {
					// OpenAI SDK
					const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
						{ role: "system", content: systemPrompt },
						...messages.map((m) => ({
							role:
								m.role === "user" ? ("user" as const) : ("assistant" as const),
							content: m.content,
						})),
					];

					const chatOptions: OpenAI.Chat.ChatCompletionCreateParams = {
						model,
						max_tokens: maxTokens,
						temperature,
						messages: msgs,
					};

					try {
						if (this.settings.streamingResponse) {
							await renderText(
								editor,
								formatNewAISection(this.settings.useCallouts),
							);
							const stream = await this.openai!.chat.completions.create({
								...chatOptions,
								stream: true,
								stream_options: { include_usage: true },
							});
							let isStartOfLine = true; // Track if we're at the start of a line for callout processing
							for await (const chunk of stream) {
								const content = chunk.choices[0]?.delta?.content;
								if (content) {
									if (this.settings.useCallouts) {
										const { processedChunk, newIsStartOfLine } =
											processStreamingCalloutContent(content, isStartOfLine);
										await renderText(editor, processedChunk);
										isStartOfLine = newIsStartOfLine;
									} else {
										await renderText(editor, content);
									}
								}
								if (chunk.usage) {
									tokenCount = chunk.usage.completion_tokens || 0;
								}
							}
						} else {
							const response =
								await this.openai!.chat.completions.create(chatOptions);

							if (
								!response ||
								!response.choices ||
								response.choices.length === 0
							) {
								new Notice("No response received, try again later");
								return;
							}

							tokenCount = response.usage?.completion_tokens || 0;
							const rawContent = response.choices[0].message.content || "";
							const processedContent = this.settings.useCallouts
								? processCalloutContent(rawContent)
								: rawContent;
							const generatedText =
								formatNewAISection(this.settings.useCallouts) +
								processedContent;
							await renderText(editor, generatedText);
						}
					} catch (error: any) {
						let errorMessage = "Failed to get response: ";
						if (error.status === 401) {
							errorMessage +=
								"Invalid API key. Please check your provider API key in settings.";
						} else if (error.status === 404) {
							errorMessage += `Model "${model}" not found. Please verify the base URL or the model name in settings.`;
						} else if (error.status === 429) {
							errorMessage += "Rate limit exceeded. Please try again later.";
						} else if (error.message) {
							errorMessage += error.message;
						} else {
							errorMessage += "Unknown error occurred.";
						}
						new Notice(errorMessage, 8000);
						console.error("OpenAI-compatible API error:", error);
						return;
					}
				}
				if (this.settings.showStats) {
					const tokenText = this.settings.useCallouts
						? `\n> (${tokenCount} tokens)`
						: `\n(${tokenCount} tokens)`;
					await renderText(editor, tokenText);
				}
				await renderText(
					editor,
					formatNewUserSection(this.settings.useCallouts),
				);
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
						const model =
							this.settings.provider === "anthropic"
								? this.settings.anthropicModel
								: this.settings.openaiModel;
						frontmatter["model"] = model;
						frontmatter["max_tokens"] = this.settings.maxTokens;
						frontmatter["temperature"] = this.settings.temperature;
						frontmatter["system_prompt"] = this.settings.systemPrompt;
					},
				);
			},
		});

		// Initialize prompt commands - these work with native slash commands
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

		// Handle cursor positioning
		this.positionCursorInTemplate(editor, cursorPos, templateText);
	}

	private positionCursorInTemplate(
		editor: Editor,
		insertPos: EditorPosition,
		templateText: string,
	) {
		const cursorPlaceholder = "{cursor}";
		const placeholderIndex = templateText.indexOf(cursorPlaceholder);

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
			const cleanTemplate = templateText.replace(cursorPlaceholder, "");
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

		// Migration from v1.3.1 to v1.4.0: transfer old settings to new structure
		if (data?.apiKey && !data?.anthropicApiKey) {
			this.settings.anthropicApiKey = data.apiKey;
			this.settings.provider = "anthropic";
			needsSave = true;
		}
		if (data?.model && !data?.anthropicModel) {
			this.settings.anthropicModel = data.model;
			needsSave = true;
		}

		// Save migrated settings
		if (needsSave) {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initializeAnthropicClient();

		// Update prompt commands with new templates
		this.updatePromptCommands(this.settings.customPrompts);
	}
}
