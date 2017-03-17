describe('WebVn player', function() {
  it('initializes with first currentPrompt', function() {
    let promptTree = [{text: 'testNode'}];
    let player = new WebVn.Player(promptTree);
    expect(player.getCurrentPrompt()).toEqual({text: 'testNode'});
  });

  it('advances until next AnimatiblePrompt', function() {
    let anim = new WebVn.TextPrompt();
    let tree = [new WebVn.Jump(), new WebVn.Jump(), anim];
    let player = new WebVn.Player(tree);
    expect(player.advance()).toBe(anim);
  });
});
