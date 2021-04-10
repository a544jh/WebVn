import { Command } from "./Command";

export type Parser = (s: string) => Command[];

// TODO: handle multiple files and stuff at some point :)
