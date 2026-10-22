import { expect, test } from "@playwright/test";

// The demo flow from the video script: goal, trace, root cause, counterfactual, report.
test("goal is traced to its root cause and the fix removes the goal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Match events")).toBeVisible();
  await page.getByRole("button", { name: "Skip to the goal" }).click();
  await expect(page.getByRole("tab", { name: "Root cause" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Lucan Weyre").first()).toBeVisible();
  await page.getByRole("tab", { name: "What if" }).click();
  await page.getByRole("button", { name: "Mistake fixed" }).click();
  await expect(page.getByText("0 / 200")).toBeVisible();
  await page.getByRole("button", { name: "Bug Report" }).click();
  await expect(page.getByRole("heading", { name: "Bug Report" })).toBeVisible();
  await expect(page.getByText("Not yet measured")).toBeVisible();
});
