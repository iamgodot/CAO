import { Editor, MarkdownView, Plugin, Notice } from "obsidian";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { format } from "date-fns";
import { CAOSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CAOSettings } from "./types";
import { parseChat, setCursorToEnd, streamText } from "./utils";
import { TextBlock } from "@anthropic-ai/sdk/resources";

export default class CAO extends Plugin {
	settings: CAOSettings;

	private anthropic: Anthropic | null = null;
	private openai: OpenAI | null = null;

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
				const currentApiKey =
					this.settings.provider === "anthropic"
						? this.settings.anthropicApiKey
						: this.settings.openaiApiKey;

				if (!currentApiKey) {
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
				let interval = 0;

				if (this.settings.provider === "anthropic") {
					// Anthropic SDK
					const msgs = messages.map((m) => ({
						role: m.role === "user" ? "user" : "assistant",
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
							interval = 0;
							await streamText(editor, "\n\n### CAO\n", interval);
							const stream =
								this.anthropic!.messages.stream(chatOptions);
							for await (const event of stream) {
								if (event.type === "content_block_delta") {
									await streamText(
										editor,
										event.delta.text,
										interval,
									);
								}
								if (event.type === "message_delta") {
									tokenCount =
										event.usage?.output_tokens || 0;
								}
							}
						} else {
							interval = 50;
							const response =
								await this.anthropic!.messages.create(
									chatOptions,
								);

							if (!response || !response.content) {
								new Notice(
									"No response received, try again later",
								);
								return;
							}

							tokenCount = response.usage?.output_tokens || 0;
							const generatedText =
								`\n\n### CAO\n` +
								response.content
									.map((item: TextBlock) => item.text)
									.join("");
							await streamText(editor, generatedText, interval);
						}
					} catch (error: any) {
						let errorMessage =
							"Failed to get response from Anthropic: ";
						if (error.status === 401) {
							errorMessage +=
								"Invalid API key. Please check your Anthropic API key in settings.";
						} else if (error.status === 404) {
							errorMessage += `Model "${model}" not found. Please verify the model name in settings.`;
						} else if (error.status === 429) {
							errorMessage +=
								"Rate limit exceeded. Please try again later.";
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
								m.role === "user"
									? ("user" as const)
									: ("assistant" as const),
							content: m.content,
						})),
					];

					const chatOptions: OpenAI.Chat.ChatCompletionCreateParams =
						{
							model,
							max_tokens: maxTokens,
							temperature,
							messages: msgs,
						};

					try {
						if (this.settings.streamingResponse) {
							interval = 0;
							await streamText(editor, "\n\n### CAO\n", interval);
							const stream =
								await this.openai!.chat.completions.create({
									...chatOptions,
									stream: true,
								});
							for await (const chunk of stream) {
								const content =
									chunk.choices[0]?.delta?.content;
								if (content) {
									await streamText(editor, content, interval);
								}
								if (chunk.usage) {
									tokenCount =
										chunk.usage.completion_tokens || 0;
								}
							}
						} else {
							interval = 50;
							const response =
								await this.openai!.chat.completions.create(
									chatOptions,
								);

							if (
								!response ||
								!response.choices ||
								response.choices.length === 0
							) {
								new Notice(
									"No response received, try again later",
								);
								return;
							}

							tokenCount = response.usage?.completion_tokens || 0;
							const generatedText =
								`\n\n### CAO\n` +
								response.choices[0].message.content;
							await streamText(editor, generatedText, interval);
						}
					} catch (error: any) {
						let errorMessage = "Failed to get response: ";
						if (error.status === 401) {
							errorMessage +=
								"Invalid API key. Please check your provider API key in settings.";
						} else if (error.status === 404) {
							errorMessage += `Model "${model}" not found. Please verify the base URL or the model name in settings.`;
						} else if (error.status === 429) {
							errorMessage +=
								"Rate limit exceeded. Please try again later.";
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
						const model =
							this.settings.provider === "anthropic"
								? this.settings.anthropicModel
								: this.settings.openaiModel;
						frontmatter["model"] = model;
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
