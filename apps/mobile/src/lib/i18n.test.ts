import { expect, test } from "vitest";
import { formatMessage, type MessageKey } from "./i18n";

const representativeKeys: MessageKey[] = [
  "signIn.title", "today.recordUpdate", "status.waitingForNetwork",
  "capture.submit", "reports.empty", "account.clearSyncedConfirmBody",
];

test("Hindi mobile catalog covers every primary journey without unresolved tokens", () => {
  for (const key of representativeKeys) {
    const message = formatMessage("hi", key, { done: 1, total: 2, count: 1 });
    expect(message).toBeTruthy();
    expect(message).not.toMatch(/\{\w+\}/);
  }
  expect(formatMessage("hi", "capture.submit")).toMatch(/[\u0900-\u097f]/);
});
