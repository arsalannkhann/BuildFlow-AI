import { expect, test } from "vitest";
import { smoke } from "./smoke";
test("smoke", () => { expect(smoke()).toBe("ok"); });
