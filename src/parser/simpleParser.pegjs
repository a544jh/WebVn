Prompts = Prompt+

Prompt = name:Name? Ws* text:Text Newline? {
	return {actor: name, text, line: location().start.line, type: "adv"}
}

Text = chars:Char+ { return chars.join("") }

Name = chars:Char+ Colon { return chars.join("") }

Char = [^\0-\x1F\x5C:]
Colon = ":"
Ws = [ \t\r]
Newline = "\n"