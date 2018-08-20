Prompts = Prompt+

Prompt = prompt:(Command / SayPrompt) Newline+ {return prompt}

SayPrompt = name:Name? Ws* text:Text {
	return {actor: name, text, line: location().start.line, type: "adv"}
}

Text = chars:Char+ { return chars.join("") }

Name = chars:Char+ Colon { return chars.join("") }

Arg = Ws chars:AlphaNum+ { return chars.join("") }

Command = Backslash cmd:AlphaNum+ args:Arg* {
	return {type: cmd.join(""), args: args, line: location().start.line}
}

Char = [^\0-\x1F\x5C:]
AlphaNum = [0-9a-zA-Z]
Colon = ":"
Ws = [ \t\r]
Newline = "\n"
Backslash = "\\"