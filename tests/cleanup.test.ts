import { expect, test } from "bun:test";
import { cleanup } from "../src/cleanup";

test("cleanup attempts all resources and retains every failure", () => {
  const calls: string[] = [];
  const failures = [new Error("save"), new Error("close")];
  try {
    cleanup(
      () => {
        calls.push("controller");
        throw failures[0];
      },
      () => {
        calls.push("storage");
        throw failures[1];
      },
      () => {
        calls.push("renderer");
      },
    );
    throw new Error("Expected cleanup failure");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual(failures);
  }
  expect(calls).toEqual(["controller", "storage", "renderer"]);
});
