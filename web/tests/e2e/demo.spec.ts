import { expect, test } from "@playwright/test";

// The first-visit flow: home explains the product, the story traces the goal, explore and report hold up.
test("a first-time visitor can follow the story from home to the match report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every goal has a bug." })).toBeVisible();
  await expect(page.getByText("The orange line traces the goal back to Lucan Weyre")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Watch the 2-minute story" }).click();
  await expect(page.getByRole("heading", { name: "Kick-off" })).toBeVisible();
  await page.getByRole("button", { name: "Skip to the goal" }).click();
  await expect(page.getByRole("heading", { name: "Tracing back" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "The root cause" })).toBeVisible();
  await expect(page.getByText("89%").first()).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("the pass at 62:29 is offside")).toBeVisible();

  await page.getByRole("button", { name: "Skip the story" }).click();
  await page.getByRole("tab", { name: "What if?" }).click();
  await page.getByRole("button", { name: "Mistake fixed" }).click();
  await expect(page.getByText("0 / 200")).toBeVisible();

  await page.getByRole("link", { name: "Match report" }).first().click();
  await expect(page.getByRole("heading", { name: "Bug Report" })).toBeVisible();
  await expect(page.getByText("Not yet measured")).toBeVisible();
});
