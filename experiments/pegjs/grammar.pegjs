
Prompts = Prompt+

Prompt = name:Name Ws* text:Text Newline? {
	return {name, text}
}

Text = chars:Char+ { return chars.join("") }

Name = chars:Char+ Colon { return chars.join("") }

Char = [^\0-\x1F\x22\x5C:]
Colon = ":"
Ws = [ \t\r]
Newline = "\n"