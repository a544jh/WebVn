// Type definitions for PEG.js v0.10.0
// Project: http://pegjs.org/
// Definitions by: vvakame <https://github.com/vvakame>, Tobias Kahlert <https://github.com/SrTobi>, C.J. Bell <https://github.com/siegebell>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace PEG {
	function parse(input:string):any;

	interface Location {
		line: number;
		column: number;
		offset: number;
	}

	interface LocationRange {
		start: Location,
		end: Location
	}

	class SyntaxError {
		line: number;
		column: number;
		offset: number;
		location: LocationRange;
		expected:any[];
		found:any;
		name:string;
		message:string;
	}
}

export type Location = PEG.Location;
export type LocationRange = PEG.LocationRange;

export interface ExpectedItem {
    type: string;
    value?: string;
    description: string;
}

export interface PegjsError extends Error {
    name: string;
    message: string;
    location: LocationRange;
    found?: any;
    expected?: ExpectedItem[];
    stack?: any;
}

export type GrammarError = PegjsError;
export var GrammarError: any;

export interface ParserOptions {
    startRule: string;
    tracer: any;
}

export function parse(input: string, options?:ParserOptions): any;

export interface Parser {

    SyntaxError: any;
}

export interface BuildOptionsBase {
    /** rules the parser will be allowed to start parsing from (default: the first rule in the grammar) */
    allowedStartRules?: string[];
    /** if `true`, makes the parser cache results, avoiding exponential parsing time in pathological cases but making the parser slower (default: `false`) */
    cache?: boolean;
    /** selects between optimizing the generated parser for parsing speed (`"speed"`) or code size (`"size"`) (default: `"speed"`) */
    optimize?: "speed" | "size";
    /** plugins to use */
    plugins?: any[];
    /** makes the parser trace its progress (default: `false`) */
    trace?: boolean
}


export namespace parser {
    type SyntaxError = PegjsError;
    var SyntaxError: any;
}
export as namespace PEG;

