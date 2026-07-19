import { expect, test } from "@playwright/test";

test("primary navigation has no dead destinations", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Organization Owner/i }).click();
  await expect(page).toHaveURL(/\/reports|\/onboarding/, { timeout: 30_000 });

  const seedRoutes = ["/reports", "/projects", "/search", "/assistant", "/portfolio", "/organization", "/onboarding"];
  const destinations = new Set(seedRoutes);
  for (const route of seedRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator("main#main-content")).toBeVisible();
    const links = await page.locator('main a[href^="/"]').evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href") ?? "")
        .filter((href) => href && !href.startsWith("/api/") && !href.startsWith("/r/")),
    );
    links.forEach((href) => destinations.add(href));
  }

  for (const href of destinations) {
    const response = await page.request.get(href, { maxRedirects: 2 });
    expect(response.status(), `dead navigation destination: ${href}`).toBeLessThan(400);
  }
});
