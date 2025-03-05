# Claude AI for Obsidian

CAO allows you to chat with Claude directly in a note.

![](./demo.gif)

## Installation

Search for CAO in Obsidian's community plugins page.

## Usage

1. After installation, set your Claude API key in CAO settings
2. Use "Open new chat" command to create a new chat note
3. Optionally, use "Add/Reset chat options" command for customization
4. Type out a question and use "Get response" to get replies
5. Next time, use "Open last chat" to continue last conversation

## Features

1. [x] Chat in notes with editable content
2. [x] Manage chat histories with note files
3. [x] Customize chat options in **front matter**
4. [x] Use **wikilinks** for notes as chat context

## Commands

1. Open new chat: Creates a new chat note
2. Open last chat: Opens the last chatted note
3. Get response: Interact with Claude for replies.
4. Add/Reset chat options: Properties will be created/restored in front matter.

**You can add a hot key for quickly getting responses, such as "Cmd/Ctrl + ."**

## Chat Options

Here're the available chat options to use in front matter:

- model
- max_tokens
- temperature
- system_prompt

## Supported Models

All the Claude models are supported by CAO, take a look at [here](https://docs.anthropic.com/en/docs/about-claude/models/all-models) for more details.

**To use a model other than the default one, you can set it in front matter.**

## Contributing

For bug fixes or feature improvements, please create an issue or pull request.

For ideas or any other questions, please post in discussion.

Any suggestions or support is welcome and appreciated, thank you!
