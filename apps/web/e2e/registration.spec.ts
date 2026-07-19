import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("owner creates an organization, first project, and teammate invitation", async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.goto("/signup");
  const a11y = await new AxeBuilder({ page }).withTags([
    "wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa",
  ]).analyze();
  expect(a11y.violations).toEqual([]);
  await page.getByLabel("Organization name").fill(`Northstar Infra ${suffix}`);
  await page.getByLabel("Your name").fill("Asha Verma");
  await page.getByLabel("Work email").fill(`owner+${suffix}@example.com`);
  await page.getByLabel("Password").fill("release-demo-password");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
  await expect(page.getByText(`Northstar Infra ${suffix}`)).toBeVisible();

  await page.getByLabel("Project name").fill("Noida Commercial Tower");
  await page.getByLabel("Client").fill("Northstar Developers");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/project=created/, { timeout: 30_000 });
  await page.getByLabel("Email").fill(`engineer+${suffix}@example.com`);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page).toHaveURL(/invited=/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Invitation created" })).toBeVisible();
});
