"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(saved = null) {
  // Real production logic; only browser input, display and storage are replaced.
  const math = Object.create(Math);
  math.random = () => 0;
  const context = vm.createContext({ Math: math });
  for (const file of ["tile.js", "grid.js", "game_manager.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"),
      context, { filename: file });
  }
  class Input {
    constructor() { this.events = {}; }
    on(name, callback) { this.events[name] = callback; }
  }
  class Actuator {
    actuate(grid, metadata) { this.last = clone({ grid: grid.serialize(), metadata }); }
    continueGame() {}
  }
  class Storage {
    constructor() { this.state = saved && clone(saved); this.best = 0; }
    getGameState() { return this.state && clone(this.state); }
    setGameState(state) { this.state = clone(state); }
    clearGameState() { this.state = null; }
    getBestScore() { return this.best; }
    setBestScore(score) { this.best = score; }
  }
  const game = new context.GameManager(4, Input, Actuator, Storage);
  return { game, context };
}
function board(f, rows, score = 0) {
  f.game.grid = new f.context.Grid(4);
  rows.forEach((row, y) => row.forEach((value, x) => {
    if (value) f.game.grid.insertTile(new f.context.Tile({ x, y }, value));
  }));
  Object.assign(f.game, { score, over: false, won: false, keepPlaying: false });
}
const rows = game => Array.from({ length: 4 }, (_, y) =>
  Array.from({ length: 4 }, (_, x) => game.grid.cellContent({ x, y })?.value || 0));
const count = game => 16 - game.grid.availableCells().length;

test("new game has two tiles, zero score and a persisted board", () => {
  const { game } = fixture();
  assert.equal(count(game), 2);
  assert.equal(game.score, 0);
  assert.deepEqual(game.storageManager.state, clone(game.serialize()));
  assert.equal(game.over, false);
});
for (const [name, direction, x, y] of [
  ["up", 0, 1, 0], ["right", 1, 3, 1], ["down", 2, 1, 3], ["left", 3, 0, 1]
]) {
  test("valid " + name + " move slides tile and spawns exactly one new tile", () => {
    const f = fixture();
    board(f, [[0,0,0,0],[0,8,0,0],[0,0,0,0],[0,0,0,0]]);
    f.game.inputManager.events.move(direction);
    assert.equal(f.game.grid.cellContent({ x, y }).value, 8);
    assert.equal(count(f.game), 2);
    assert.equal(f.game.score, 0);
    assert.deepEqual(f.game.storageManager.state, clone(f.game.serialize()));
  });
}
test("equal tiles merge once per move and add their values to score", () => {
  const f = fixture();
  board(f, [[2,2,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 10);
  f.game.move(3);
  assert.deepEqual(rows(f.game)[0], [4,4,0,0]);
  assert.equal(f.game.score, 14);
  assert.equal(count(f.game), 3);
  assert.equal(f.game.storageManager.best, 14);
});
test("four equal tiles produce two independent merges", () => {
  const f = fixture();
  board(f, [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  f.game.move(3);
  assert.deepEqual(rows(f.game)[0], [4,4,0,0]);
  assert.equal(f.game.score, 8);
});
test("ineffective move changes neither board nor score and spawns nothing", () => {
  const f = fixture();
  board(f, [[2,4,8,16],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 30);
  const before = clone(f.game.serialize());
  f.game.move(3);
  assert.deepEqual(clone(f.game.serialize()), before);
});
test("2048 merge wins and blocks moves until keep playing", () => {
  const f = fixture();
  board(f, [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  f.game.move(3);
  assert.equal(f.game.won, true);
  assert.equal(f.game.score, 2048);
  assert.equal(f.game.isGameTerminated(), true);
  const before = clone(f.game.serialize());
  f.game.move(2);
  assert.deepEqual(clone(f.game.serialize()), before);
  f.game.inputManager.events.keepPlaying();
  assert.equal(f.game.isGameTerminated(), false);
});
test("last valid move followed by a filled board detects game over", () => {
  const f = fixture();
  board(f, [[0,4,8,16],[8,16,32,64],[16,32,64,128],[32,64,128,256]]);
  f.game.move(3);
  assert.equal(f.game.over, true);
  assert.equal(f.game.movesAvailable(), false);
  assert.equal(f.game.storageManager.state, null);
});
test("full board with adjacent equal tiles still has a legal move", () => {
  const f = fixture();
  board(f, [[2,2,8,16],[4,8,16,32],[8,16,32,64],[16,32,64,128]]);
  assert.equal(f.game.movesAvailable(), true);
});
test("saved state restores board, score and termination flags", () => {
  const f = fixture();
  board(f, [[2,4,0,0],[0,8,0,0],[0,0,16,0],[0,0,0,32]], 124);
  f.game.won = true;
  f.game.keepPlaying = true;
  const saved = clone(f.game.serialize());
  assert.deepEqual(clone(fixture(saved).game.serialize()), saved);
});
test("restart resets board and score while retaining best score", () => {
  const f = fixture();
  board(f, [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 100);
  f.game.move(3);
  f.game.inputManager.events.restart();
  assert.equal(count(f.game), 2);
  assert.equal(f.game.score, 0);
  assert.equal(f.game.won, false);
  assert.equal(f.game.over, false);
  assert.equal(f.game.storageManager.best, 104);
  assert.deepEqual(f.game.storageManager.state, clone(f.game.serialize()));
});
test("undo restores the board and score and removes the spawned tile", () => {
  const f = fixture();
  board(f, [[0,0,0,0],[0,8,0,0],[0,0,0,0],[0,0,0,0]], 20);
  assert.equal(f.game.actuator.last.metadata.canUndo, false);
  const before = clone(f.game.serialize());
  f.game.inputManager.events.move(3);
  assert.equal(f.game.actuator.last.metadata.canUndo, true);
  assert.equal(count(f.game), 2);
  f.game.inputManager.events.undo();
  assert.deepEqual(clone(f.game.serialize()), before);
  assert.equal(f.game.score, 20);
  assert.equal(count(f.game), 1);
  assert.equal(f.game.actuator.last.metadata.canUndo, false);
  assert.deepEqual(f.game.storageManager.state, clone(f.game.serialize()));
});
test("undo after a merge restores both tiles and the score", () => {
  const f = fixture();
  board(f, [[2,2,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 10);
  const before = clone(f.game.serialize());
  f.game.move(3);
  assert.deepEqual(rows(f.game)[0], [4,4,0,0]);
  assert.equal(f.game.score, 14);
  f.game.undo();
  assert.deepEqual(rows(f.game)[0], [2,2,4,0]);
  assert.equal(f.game.score, 10);
  assert.deepEqual(clone(f.game.serialize()), before);
});
test("only the latest effective move can be undone", () => {
  const f = fixture();
  board(f, [[0,0,0,0],[0,8,0,0],[0,0,0,0],[0,0,0,0]]);
  f.game.move(3);
  const afterFirst = clone(f.game.serialize());
  f.game.move(2);
  assert.notDeepEqual(clone(f.game.serialize()), afterFirst);
  f.game.undo();
  assert.deepEqual(clone(f.game.serialize()), afterFirst);
  f.game.undo(); // A second undo has no history left
  assert.deepEqual(clone(f.game.serialize()), afterFirst);
});
test("an ineffective move does not replace the undo record", () => {
  const f = fixture();
  board(f, [[0,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 5);
  const before = clone(f.game.serialize());
  f.game.move(3);
  const afterFirst = clone(f.game.serialize());
  f.game.move(3); // Nothing can slide left any more
  assert.deepEqual(clone(f.game.serialize()), afterFirst);
  f.game.undo();
  assert.deepEqual(clone(f.game.serialize()), before);
  assert.equal(f.game.score, 5);
});
test("new game clears the undo record", () => {
  const f = fixture();
  board(f, [[0,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 30);
  f.game.move(3);
  f.game.inputManager.events.restart();
  const fresh = clone(f.game.serialize());
  assert.equal(count(f.game), 2);
  f.game.undo();
  assert.deepEqual(clone(f.game.serialize()), fresh);
  assert.equal(f.game.score, 0);
  assert.equal(f.game.actuator.last.metadata.canUndo, false);
});
test("undo without a recorded move is a safe no-op", () => {
  const f = fixture();
  board(f, [[2,4,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 7);
  const before = clone(f.game.serialize());
  assert.doesNotThrow(() => f.game.undo());
  assert.deepEqual(clone(f.game.serialize()), before);
  assert.equal(f.game.score, 7);
});
test("undo revives the game after a game-ending move", () => {
  const f = fixture();
  board(f, [[0,4,8,16],[8,16,32,64],[16,32,64,128],[32,64,128,256]]);
  const before = clone(f.game.serialize());
  f.game.move(3);
  assert.equal(f.game.over, true);
  assert.equal(f.game.storageManager.state, null);
  f.game.undo();
  assert.equal(f.game.over, false);
  assert.deepEqual(clone(f.game.serialize()), before);
  assert.notEqual(f.game.storageManager.state, null);
});
test("undo after winning restores the board and clears the win", () => {
  const f = fixture();
  board(f, [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  const before = clone(f.game.serialize());
  f.game.move(3);
  assert.equal(f.game.won, true);
  assert.equal(f.game.score, 2048);
  f.game.undo();
  assert.equal(f.game.won, false);
  assert.equal(f.game.isGameTerminated(), false);
  assert.deepEqual(clone(f.game.serialize()), before);
});
test("the Undo button press emits an undo event", () => {
  const listeners = {};
  const undoButton = {
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  const placeholder = { addEventListener() {} };
  const context = vm.createContext({
    window: { navigator: {} },
    document: {
      addEventListener() {},
      querySelector: selector =>
        selector === ".undo-button" ? undoButton : placeholder,
      getElementsByClassName: () => [placeholder]
    }
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "js",
      "keyboard_input_manager.js"), "utf8"),
    context, { filename: "keyboard_input_manager.js" });
  const input = new context.KeyboardInputManager();
  let undos = 0;
  input.on("undo", () => { undos += 1; });
  listeners.click({ preventDefault() {} });
  assert.equal(undos, 1);
});
test("the actuator enables Undo only while a move can be undone", () => {
  const context = vm.createContext({
    window: {},
    document: { querySelector: () => null }
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "js", "html_actuator.js"),
      "utf8"),
    context, { filename: "html_actuator.js" });
  const classes = new Set();
  const attributes = {};
  const button = {
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name)
    },
    setAttribute: (name, value) => { attributes[name] = value; },
    removeAttribute: name => { delete attributes[name]; }
  };
  const actuator = Object.create(context.HTMLActuator.prototype);
  actuator.undoButton = button;
  actuator.updateUndoButton(false);
  assert.equal(classes.has("undo-disabled"), true);
  assert.equal(attributes["aria-disabled"], "true");
  actuator.updateUndoButton(true);
  assert.equal(classes.has("undo-disabled"), false);
  assert.equal(attributes["aria-disabled"], undefined);
});

