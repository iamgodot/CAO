# Claude AI for Obsidian

CAO allows you to chat with Claude directly in a note.

![](./demo.gif)

## Features

1. [x] Chat in notes with **editable** content
2. [x] Manage chat histories as plain notes
3. [x] Customize chat options in **front matter**
4. [x] Use **wikilinks** for notes as chat context
5. [ ] Integrate OpenRouter

## Installation

Search for CAO in Obsidian's community plugins page.

## Usage

1. After installation, set your **Claude API key** in the settings
2. Use the `Open new chat` command to create a new chat note
3. Optionally, there's `Add/Reset chat options` for customization
4. For replies, fire up `Get response`(you may want a hot key for this, such as **Cmd/Ctro + .**)
5. Next time, use `Open last chat` to resume last conversation

Here're the available chat options with example values to set in the front matter:

```
---
model: claude-3-7-sonnet-latest
max_tokens: 1024
temperature: 1
system_prompt: You are a helpful AI assistant
---
```

## Supported Models

CAO supports all the Claude models, take a look at [here](https://docs.anthropic.com/en/docs/about-claude/models/all-models) for more details.

**You can choose common models in the settings, for anything else, specify it in the front matter.**

## Contributing

For bug fixes or feature improvements, please create an issue or pull request.

For ideas or any other questions, please post in discussion.

Any suggestions or support is welcome and appreciated, thank you!
