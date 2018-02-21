import './index.html';
import { AnimatablePrompt, TextNode, PromptType } from './prompt';

document.write("Hello from TypeScript!")

let prompt: AnimatablePrompt = {type: PromptType.ADV, textNodes: []}

let textNode: TextNode = {text: "asd"}

prompt.textNodes = [textNode]

document.write(JSON.stringify(prompt))