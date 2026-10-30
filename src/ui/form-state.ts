import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { ElicitationContentValue, ElicitationSchema } from "@agentclientprotocol/sdk";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export type FormContent = Record<string, ElicitationContentValue>;
export type FormField = {
  name: string;
  title: string;
  description?: string;
  required: boolean;
  type: string;
  choices?: { value: string; title: string }[];
};
export type FormErrors = { fields: Record<string, string>; summary: string };
export type QuestionChoice = { title: string; value: string | boolean | undefined };
export type QuestionState = {
  text?: string;
  value?: ElicitationContentValue;
  highlight: number;
  confirmed: boolean;
  answer?: ElicitationContentValue;
};

export function questionChoices(field: FormField): QuestionChoice[] {
  const choices: QuestionChoice[] = field.type === "boolean"
    ? [{ title: "Yes", value: true }, { title: "No", value: false }]
    : field.choices ?? [];
  return choices.length && !field.required ? [...choices, { title: "Skip (leave unset)", value: undefined }] : choices;
}

export function questionState(field: FormField, value?: ElicitationContentValue): QuestionState {
  const choices = questionChoices(field);
  return {
    text: field.type === "array" || choices.length || value === undefined ? undefined : String(value),
    value,
    highlight: value === undefined ? 0 : Math.max(0, choices.findIndex(choice => choice.value === value)),
    confirmed: false,
  };
}

export function sameAnswer(left: ElicitationContentValue | undefined, right: ElicitationContentValue | undefined): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

function enumChoices(schema: Record<string, unknown>, titledKey: "oneOf" | "anyOf"): FormField["choices"] {
  const titled = schema[titledKey];
  if (Array.isArray(titled) && titled.every(option => object(option) && typeof option.const === "string" && typeof option.title === "string")) {
    return titled.map(option => ({ value: option.const, title: option.title }));
  }
  if (Array.isArray(schema.enum) && schema.enum.every(value => typeof value === "string")) {
    return schema.enum.map(value => ({ value, title: value }));
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentValue(value: unknown): value is ElicitationContentValue {
  return typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
    || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function content(value: unknown): value is FormContent {
  return object(value) && Object.values(value).every(contentValue);
}

// ACP permits null for absent constraints; JSON Schema does not.
function validationSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const nullable = new Set(["title", "description", "required", "minLength", "maxLength", "pattern", "format",
    "default", "enum", "oneOf", "minimum", "maximum", "minItems", "maxItems"]);
  return Object.fromEntries(Object.entries(schema).filter(([key, value]) => key !== "_meta" && !(value === null && nullable.has(key)))
    .map(([key, value]) => {
      if (key === "properties" && object(value)) return [key, Object.fromEntries(Object.entries(value).map(([name, property]) => [name, object(property) ? validationSchema(property) : property]))];
      if (key === "items" && object(value)) return [key, validationSchema(value)];
      if ((key === "oneOf" || key === "anyOf") && Array.isArray(value)) return [key, value.map(item => object(item) ? validationSchema(item) : item)];
      return [key, value];
    }));
}

export function createForm(schema: ElicitationSchema) {
  const fields: FormField[] = Object.entries(schema.properties ?? {}).map(([name, property]) => {
    let choices: FormField["choices"];
    if (property.type === "string") {
      choices = enumChoices(property, "oneOf");
    } else if (property.type === "array" && object(property.items)) {
      const items = property.items;
      if (items.type === "string" || (items.type === undefined && Array.isArray(items.anyOf))) {
        choices = enumChoices(items, "anyOf");
        if (!choices?.length || new Set(choices.map(choice => choice.value)).size !== choices.length) choices = undefined;
      }
    }
    return { name, title: typeof property.title === "string" ? property.title : name,
      description: typeof property.description === "string" ? property.description : undefined,
      required: schema.required?.includes(name) ?? false, type: property.type, choices };
  });
  const fallback = fields.filter(field => !["string", "number", "integer", "boolean"].includes(field.type)
    && !(field.type === "array" && field.choices)).map(field => field.title);
  const defaults: FormContent = Object.fromEntries(Object.entries(schema.properties ?? {})
    .flatMap(([name, property]) => contentValue(property.default) ? [[name, structuredClone(property.default)]] : []));
  let validate: ValidateFunction<FormContent> | undefined;
  const fieldValidators = new Map<string, ValidateFunction>();
  let schemaError = "";
  try {
    validate = ajv.compile<FormContent>({ ...validationSchema(schema), type: "object", additionalProperties: false });
    for (const field of fields) {
      fieldValidators.set(field.name, ajv.compile({
        type: "object", properties: { [field.name]: validationSchema(schema.properties![field.name]!) },
        required: field.required ? [field.name] : [], additionalProperties: false,
      }));
    }
  } catch (error) { schemaError = `Cannot validate this form: ${error instanceof Error ? error.message : String(error)}`; }

  const errors = (issues: ErrorObject[]): FormErrors => {
    const byField = new Map<string, string>();
    const summary: string[] = [];
    for (const issue of issues) {
      const name = issue.keyword === "required" ? String(issue.params.missingProperty)
        : issue.instancePath.split("/")[1]?.replace(/~1/g, "/").replace(/~0/g, "~");
      if (name !== undefined && fields.some(field => field.name === name)) {
        byField.set(name, [byField.get(name), issue.message].filter(Boolean).join("; "));
      } else summary.push(`${issue.instancePath || "Answer"} ${issue.message}`);
    }
    return { fields: Object.fromEntries(byField), summary: summary.join("; ") };
  };
  return {
    fields, defaults, fallback, schemaError,
    questionFallback(value: FormContent): string[] {
      return [...fallback, ...fields.filter(field => {
        const answer = value[field.name];
        const choices = field.choices;
        return field.type === "array" && choices && answer !== undefined
          && (!Array.isArray(answer) || new Set(answer).size !== answer.length
            || answer.some(item => !choices.some(choice => choice.value === item)));
      }).map(field => `${field.title} (selection cannot be represented by checkboxes)`)];
    },
    validateField(field: FormField, value: ElicitationContentValue | undefined): FormErrors | undefined {
      if (schemaError) return { fields: {}, summary: schemaError };
      const validator = fieldValidators.get(field.name);
      if (!validator) return { fields: {}, summary: `Unknown question: ${field.name}` };
      if (!validator(value === undefined ? {} : { [field.name]: value })) return errors(validator.errors ?? []);
    },
    validate(value: unknown): { content: FormContent; errors?: never } | { content?: never; errors: FormErrors } {
      if (!validate) return { errors: { fields: {}, summary: schemaError } };
      if (!validate(value)) return { errors: errors(validate.errors ?? []) };
      if (!content(value)) {
        return { errors: { fields: {}, summary: "Answers must contain strings, finite numbers, booleans or arrays of strings." } };
      }
      return { content: value };
    },
  };
}

export function numberValue(text: string): number | undefined {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.trim())) return;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}
