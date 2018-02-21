export const enum PromptType {
  ADV = "adv" , NVL = "nvl", freeform = "freeform"
}

export interface AnimatablePrompt {
  type: PromptType
  textNodes: Array<TextNode>
}

export interface TextNode {
  text: string
}
