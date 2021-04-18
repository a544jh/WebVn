import { YamlParser } from "../../../yamlParser/YamlParser";
import { VnPlayerState } from "../../state";
import { Command } from "../Command";
import { ErrorLevel, ParserError, SourceLocation } from "../Parser";
import "./Jump"

export class Label extends Command {
  constructor(location: SourceLocation, name: string) {
    super(location)
    this.name = name
  }
  name: string

  public apply(state: VnPlayerState): VnPlayerState {
    return {...state, stopAfterRender: false}
  }
}

YamlParser.registerCommand("label", (obj, location) => {
  if (typeof obj === "string") {
    return new Label(location, obj)
  }
  return new ParserError("Label must be a string.", location, ErrorLevel.WARNING)
})