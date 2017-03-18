this.WebVn = this.WebVn || {};
(function(WebVn) {
  WebVn.Prompt = class {
  };

  WebVn.AnimatablePrompt = class extends WebVn.Prompt {
    /**
    * Prompt that gets displayed by renderer.
    */
    constructor() {
      super();
      // TODO: bg, sprites, sound...
    }

    /**
    * Get next animateble state.
    * @param {AnimatableSate} prevState - previous state to apply commands on
    * @return {AnimatableSate} - the resulting state.
    */
    getAnimatableState(prevState) {
      return this;
    }

  };

  WebVn.TextNode = class {
    /**
     * Renderable text node.
     * @param {string} text string
     */
    constructor(text) {
      this.text = text;
    }
  };

  WebVn.TextPrompt = class extends WebVn.AnimatablePrompt {
    /**
    * Contains any kind of displayable text.
    * @param {Array<TextNode>} textNodes
    */
    constructor(textNodes) {
      super();
      this.textNodes = textNodes;
    }
  };

  // TODO: adv, fullscreen, note, freeform

  // TODO: decision

  WebVn.ControlStructure = class extends WebVn.Prompt {
  };

  WebVn.Jump = class extends WebVn.ControlStructure {
    /**
    * Jump to specified label.
    * @param  {string} label label to jump to
    */
    constructor(label) {
      super();
      this.label = label;
    }
  };

  // TODO: contitionalJump

  WebVn.Player = class Player {
    /**
    * Vn player instance.
    * @param {PromptTree} promptTree - initial compiled promptTree.
    */
    constructor(promptTree) {
      this.promptTree = promptTree;
      let promptIndex = -1;
      this.animatableState = {};

      this.getCurrentPrompt = function() {
        return promptTree[promptIndex];
      };
      /**
       * Advances the player to the next prompt according to current state.
       * @return {AnimatableState} The next AnimatableState.
       */
      this.advance = function() {
        while (true) {
          promptIndex++;
          if (this.getCurrentPrompt() instanceof WebVn.ControlStructure) {
            // TODO: jump to label
          } else if (this.getCurrentPrompt()
              instanceof WebVn.AnimatablePrompt) {
            return this.getCurrentPrompt()
              .getAnimatableState(this.animatableState);
          } else {
            promptIndex--;
            throw new Error('Reached invalid node!');
          }
        }
      };
    }
  };
})(WebVn);
