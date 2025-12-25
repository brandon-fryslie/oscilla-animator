

10) Constants and “Default Sources” (replacing params)

10.1 Constants

export interface ConstPool {
  consts: Record<string, TypedConst>;
}

export type TypedConst =
  | { type: TypeDesc; value: number | string | boolean | object | null };

10.2 Default Sources

Default Sources are not visible blocks. They are compile-time attachments to inputs when no other source is present, and they are also the mechanism that replaces “params”.

export type DefaultSourceId = string;

export interface DefaultSourceTable {
  defaults: Record<DefaultSourceId, DefaultSourceIR>;
}

export interface DefaultSourceIR {
  id: DefaultSourceId;
  type: TypeDesc;

  // the current configured default (stored in patch/project)
  valueConstId: string;

  // UI hints (slider/knob/etc)
  ui: {
    widget: "knob" | "slider" | "toggle" | "color" | "text" | "dropdown";
    range?: { min: number; max: number; step?: number };
    unitsLabel?: string;
  };

  // Optional: identity hint (e.g. unit01 default = 1, multiplier identity)
  identityValueConstId?: string;
}

Semantics
	•	Every Node input always resolves to an InputSource: slot/bus/const/default/external.
	•	“Parameter” == “this input is fed by its DefaultSource”.
