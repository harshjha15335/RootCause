import { expect, test } from "@playwright/test";

// The first-visit flow: home explains the product, a demo match's story traces the goal, explore and report hold up.
test("a first-time visitor can follow the story from home to the match report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every goal has a bug." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What it does" })).toBeAttached();
  await expect(page.getByRole("link", { name: /HTN 2–1 NGR/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Watch the story" }).first().click();
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

// The full-match analysis: overview, tactics, every chance with its breakdown, player cards.
test("the match analysis covers the whole match, not just the traced goal", async ({ page }) => {
  await page.goto("/#/analysis");
  await expect(page.getByRole("heading", { name: "Match analysis" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Every chance" })).toBeAttached({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Goals" }).click();
  await page.getByRole("button", { name: /Bram Tovick/ }).first().click();
  await expect(page.getByRole("heading", { name: "What would have been better" })).toBeVisible();
  await page.getByRole("radio", { name: "Pass network" }).click();
  await expect(page.getByRole("img", { name: /pass network/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bram Tovick", exact: true })).toBeVisible();
});

test("tactics lab shows the traced mistake three ways, with the fix", async ({ page }) => {
  await page.goto("/#/lab");
  await expect(page.getByRole("img", { name: "Interactive 3D view of the goal move" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Match time" })).toBeVisible();
  const fix = page.getByRole("button", { name: "Show the fix" });
  await fix.click();
  await expect(fix).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: /Forks/ }).click();
  await expect(page.getByRole("tab", { name: /Forks/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Next touch" })).toBeVisible();
  await page.getByRole("tab", { name: /Their Eyes/ }).click();
  const be = page.getByRole("button", { name: /^Be Weyre/ });
  await expect(be).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Follow the ball" }).click();
  await expect(page.getByRole("button", { name: "Follow the ball" })).toHaveAttribute("aria-pressed", "true");
});
