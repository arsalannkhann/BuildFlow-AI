import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessibilityTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("public landing page is accessible, responsive and routes into the product", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Capture the day. Trust the record." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a workspace" }).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");

  const desktopA11y = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
  expect(desktopA11y.violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 720 });
  await page.reload();
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("heading", { name: "Capture the day. Trust the record." })).toBeVisible();

  const mobileA11y = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze();
  expect(mobileA11y.violations).toEqual([]);
});
