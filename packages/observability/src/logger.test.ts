import { expect, test, vi } from "vitest";
import { currentTraceId, errorCategory, logEvent, withTrace } from "./logger";

test("trace context propagates without accepting arbitrary customer content", () => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  withTrace("trace-1", () => {
    expect(currentTraceId()).toBe("trace-1");
    logEvent("info", "request.completed", { route: "/api/v1/me", status: 200 });
  });
  const parsed = JSON.parse(String(write.mock.calls[0][0]));
  expect(parsed).toMatchObject({ event: "request.completed", traceId: "trace-1", status: 200 });
  expect(parsed).not.toHaveProperty("message");
  write.mockRestore();
});

test("error categories never expose an error message", () => {
  expect(errorCategory(new Error("customer narrative must not escape"))).toBe("Error");
  expect(errorCategory({ code: "ETIMEDOUT", message: "secret" })).toBe("ETIMEDOUT");
});
