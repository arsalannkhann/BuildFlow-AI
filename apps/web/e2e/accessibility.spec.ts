import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([
    "wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa",
  ]).analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

test("primary owner and field routes meet automated WCAG A/AA checks", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await expectAccessible(page);
  await page.getByRole("button", { name: /Organization Owner/i }).click();
  await expect(page).toHaveURL(/\/reports|\/onboarding/, { timeout: 30_000 });
  for (const path of ["/reports", "/projects", "/portfolio", "/organization", "/onboarding"]) {
    await page.goto(path);
    await expectAccessible(page);
  }

  // Exercise the field journey at the narrow WCAG reflow viewport as well as desktop.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Site Engineer/i }).click();
  await expect(page).toHaveURL(/\/reports/, { timeout: 30_000 });
  await page.goto("/capture");
  const horizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expectAccessible(page);
});
