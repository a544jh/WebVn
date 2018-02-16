// for debugging
let tree = [new WebVn.TextPrompt(new WebVn.TextNode('asd1')),
  new WebVn.TextPrompt(new WebVn.TextNode('asd2')),
  new WebVn.TextPrompt(new WebVn.TextNode('asd3'))];
let player = new WebVn.Player(tree);
/**
* setText
*/
function advance() {
  transitionDelay(player.advance().textNodes.text) // lol need typescript
}

let body = document.body;
let textbox = document.createElement('div');
body.appendChild(textbox);
let button = document.createElement('button');
button.innerHTML = 'Next';
button.addEventListener('click', advance);
body.appendChild(button);


function transitionDelay(text) {
  const delay = 20

  textbox.innerHTML = ""
  for (let i = 0; i < text.length; i++) {
    let span = document.createElement("span")
    span.innerText = text.charAt(i)
    span.style.opacity = "0"
    span.style.transitionProperty = "opacity"
    span.style.transitionDelay = (i * delay) + "ms"
    textbox.appendChild(span)
  }
  window.setTimeout(function () {
    for (let i = 0; i < textbox.children.length; i++) {
      textbox.children[i].style.opacity = "1"
    }
  }, 0)
}