// for debugging
let tree = [new WebVn.TextPrompt(new WebVn.TextNode('asd1')),
  new WebVn.TextPrompt(new WebVn.TextNode('asd2')),
  new WebVn.TextPrompt(new WebVn.TextNode('asd3'))];
let player = new WebVn.Player(tree);
/**
* setText
*/
function advance() {
  textbox.innerHTML = JSON.stringify(player.advance());
}

let body = document.body;
let textbox = document.createElement('div');
textbox.innerHTML = JSON.stringify(player.getCurrentPrompt());
body.appendChild(textbox);
let button = document.createElement('button');
button.innerHTML = 'Next';
button.addEventListener('click', advance);
body.appendChild(button);
