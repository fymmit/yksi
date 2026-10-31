import { expect, test } from "bun:test";
import {
  createForm,
  numberValue,
  questionChoices,
  questionState,
  sameAnswer,
  editQuestion,
} from "../src/ui/form-state";

test("form model honors nullable constraints, defaults, types and optional omission", () => {
  const form = createForm({
    required: ["name"],
    properties: {
      name: { type: "string", title: "Name", minLength: 1, maxLength: null, default: null },
      enabled: { type: "boolean", default: false },
      count: { type: "integer", minimum: 0, maximum: 4, default: 0 },
      extra: { type: "string" },
    },
  });
  expect(form.schemaError).toBe("");
  expect(form.defaults).toEqual({ enabled: false, count: 0 });
  expect(form.validate({ ...form.defaults, name: "Hi" }).content).toEqual({
    enabled: false,
    count: 0,
    name: "Hi",
  });
  expect(form.validate({ name: "", count: 1.5 }).errors?.fields).toEqual({
    name: "must NOT have fewer than 1 characters",
    count: "must be integer",
  });
  expect(form.validate({}).errors?.fields.name).toContain("required");
  expect(form.validate({ name: "Hi", count: 5 }).errors?.fields.count).toContain("<= 4");
  expect(form.validate({ name: "Hi", extra: "" }).content).toEqual({ name: "Hi", extra: "" });
  expect(form.validate({ name: "Hi", other: true }).errors?.summary).toContain(
    "additional properties",
  );
});

test("enum and multi-select controls use exact values with schema validation", () => {
  const form = createForm({
    properties: {
      mode: {
        type: "string",
        oneOf: [
          { const: "fast", title: "Quick" },
          { const: "full", title: "Thorough" },
        ],
      },
      color: { type: "string", enum: ["red", "blue"] },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, minItems: 1 },
    },
  });
  expect(form.fields[0]?.choices).toEqual([
    { value: "fast", title: "Quick" },
    { value: "full", title: "Thorough" },
  ]);
  expect(form.fields[1]?.choices?.[0]).toEqual({ value: "red", title: "red" });
  expect(form.fallback).toEqual([]);
  expect(form.fields[2]?.choices).toEqual([
    { value: "a", title: "a" },
    { value: "b", title: "b" },
  ]);
  expect(form.validate({ mode: "full", tags: ["a"] }).content).toEqual({
    mode: "full",
    tags: ["a"],
  });
  expect(form.validate({ mode: "Thorough", tags: [] }).errors?.fields).toHaveProperty("tags");
});

test("multi-selects support titled choices, defaults, omission and cardinality", () => {
  const form = createForm({
    properties: {
      tags: {
        type: "array",
        items: {
          anyOf: [
            { const: "a", title: "Alpha" },
            { const: "b", title: "Beta" },
          ],
        },
        default: ["b"],
        minItems: 1,
        maxItems: 1,
      },
      required: { type: "array", items: { type: "string", enum: ["a"] } },
    },
    required: ["required"],
  });
  const field = form.fields[0]!;
  expect(form.schemaError).toBe("");
  expect(field.choices).toEqual([
    { value: "a", title: "Alpha" },
    { value: "b", title: "Beta" },
  ]);
  expect(questionState(field, form.defaults.tags)).toEqual({
    kind: "multi",
    value: ["b"],
    highlight: 0,
    confirmed: false,
  });
  expect(form.validateField(field, undefined)).toBeUndefined();
  expect(form.validateField(field, [])?.fields.tags).toContain("fewer than 1");
  expect(form.validateField(field, ["a", "b"])?.fields.tags).toContain("more than 1");
  expect(form.validateField(field, ["Alpha"])?.fields.tags).toBeDefined();
  expect(form.validate({ required: [] }).content).toEqual({ required: [] });
  expect(form.validate({}).errors?.fields.required).toContain("required");
  expect(form.questionFallback({ tags: ["b"] })).toEqual([]);
  expect(form.questionFallback({ tags: ["b", "b"] })[0]).toContain("cannot be represented");
  expect(form.questionFallback({ tags: ["unknown"] })[0]).toContain("cannot be represented");
  expect(form.questionFallback({ tags: "b" })[0]).toContain("cannot be represented");
});

test("unsupported arrays retain JSON fallback and array equality preserves order", () => {
  const form = createForm({
    properties: {
      free: { type: "array", items: { type: "string" } },
      custom: { type: "array", items: { type: "_custom" } },
      duplicate: { type: "array", items: { type: "string", enum: ["a", "a"] } },
    },
  });
  expect(form.fallback).toEqual(["free", "custom", "duplicate"]);
  expect(sameAnswer(["b", "a"], ["b", "a"])).toBe(true);
  expect(sameAnswer(["b", "a"], ["a", "b"])).toBe(false);
  expect(sameAnswer([], undefined)).toBe(false);
  expect(sameAnswer(["a"], ["a", "a"])).toBe(false);
});

test("invalid schemas and unsupported content produce explicit errors", () => {
  const form = createForm({ properties: { custom: { type: "_future" } } });
  expect(form.schemaError).toContain("Cannot validate");
  expect(form.validate({ custom: "x" }).errors?.summary).toContain("Cannot validate");
  const objectForm = createForm({ properties: { custom: { type: "object" } } });
  expect(objectForm.validate({ custom: {} }).errors?.summary).toContain("Answers must contain");
});

test("formats, patterns and escaped property names retain validation", () => {
  const form = createForm({
    properties: {
      "a/b~c": { type: "string", format: "email" },
      value: { type: "string", pattern: "^[a-z]+$" },
    },
  });
  expect(form.validate({ "a/b~c": "invalid", value: "123" }).errors?.fields).toEqual({
    "a/b~c": 'must match format "email"',
    value: 'must match pattern "^[a-z]+$"',
  });
});

test("numeric input never silently converts blanks, malformed values or infinity to zero", () => {
  for (const text of ["", " ", "NaN", "Infinity", "1e999", "0x10", "1.2.3", "12x"])
    expect(numberValue(text)).toBeUndefined();
  expect(numberValue("0")).toBe(0);
  expect(numberValue(" -1.25e2 ")).toBe(-125);
});

test("question validation is independent of later required questions", () => {
  const form = createForm({
    properties: { name: { type: "string", minLength: 2 }, count: { type: "integer", minimum: 1 } },
    required: ["name", "count"],
  });
  expect(form.validateField(form.fields[0]!, "ok")).toBeUndefined();
  expect(form.validateField(form.fields[0]!, "")?.fields.name).toContain("fewer than 2");
  expect(form.validateField(form.fields[0]!, undefined)?.fields.name).toContain("required");
  expect(form.validateField(form.fields[1]!, 0)?.fields.count).toContain(">= 1");
  expect(form.validate({ name: "ok" }).errors?.fields.count).toContain("required");
});

test("question defaults are unconfirmed and optional choices have a distinct skip", () => {
  const form = createForm({
    properties: {
      enabled: { type: "boolean", default: false },
      count: { type: "integer", default: 0 },
    },
  });
  expect(questionChoices(form.fields[0]!)).toEqual([
    { title: "Yes", value: true },
    { title: "No", value: false },
    { title: "Skip (leave unset)", value: undefined },
  ]);
  expect(questionState(form.fields[0]!, false)).toEqual({
    kind: "choice",
    value: false,
    highlight: 1,
    confirmed: false,
  });
  expect(questionState(form.fields[1]!, 0)).toEqual({
    kind: "number",
    text: "0",
    value: 0,
    confirmed: false,
  });
  expect(form.validateField(form.fields[0]!, undefined)).toBeUndefined();
});

test("widget-specific edits invalidate answers without conflating navigation and selection", () => {
  const form = createForm({
    properties: {
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] } },
      free: { type: "array", items: { type: "string" } },
    },
  });
  const field = form.fields[0]!;
  const confirmed = editQuestion(field, questionState(field, ["a"]), {
    kind: "confirm",
    value: ["a"],
  });
  const navigated = editQuestion(field, confirmed, { kind: "highlight", highlight: 1 });
  expect(navigated.confirmed).toBe(true);
  const changed = editQuestion(field, navigated, {
    kind: "selection",
    value: ["a", "b"],
    highlight: 1,
  });
  expect(changed.confirmed).toBe(false);
  expect(changed.answer).toBeUndefined();
  expect(editQuestion(field, confirmed, { kind: "text", text: "wrong widget" })).toBe(confirmed);
  expect(form.fields[1]?.kind).toBe("json");
  expect(questionState(form.fields[1]!, ["anything"]).kind).toBe("json");
});
