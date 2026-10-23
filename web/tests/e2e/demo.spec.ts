import { expect, test } from "@playwright/test";

// The first-visit flow: home explains the product, the story explains the engine, explore and report hold up.
test("a first-time visitor can follow the story from home to the match report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every goal has a bug." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What it does" })).toBeAttached();
  await expect(page.getByRole("link", { name: /HTN 2–1 NGR/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "See the engine in motion" }).click();
  await expect(page.getByRole("heading", { name: "A goal goes in." })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Rewind the move." })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("146")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Lost the runner/ }).click();
  await expect(page.getByRole("button", { name: /Lost the runner/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("118")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Open the Tactics Lab" }).click();
  await expect(page.getByRole("img", { name: "Interactive 3D view of the goal move" })).toBeVisible();

  await page.goto("/#/explore");
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

test("tactics lab walks a traced goal from the plans to the verdict and the fix", async ({ page }) => {
  await page.goto("/#/lab");
  await expect(page.getByRole("img", { name: "3D stadium: the goal, the suspects and the verdict" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "62:36. Tovick makes it 3–1." })).toBeVisible();
  const next = page.getByRole("button", { name: "Next" });
  await next.click();
  await expect(page.getByRole("heading", { name: "Did anyone change their plan?" })).toBeVisible();
  await expect(page.getByText("Northgate Rovers line 28.8 m")).toBeVisible();
  await page.getByRole("button", { name: /Chapter 6 of 7/ }).click();
  await expect(page.getByRole("heading", { name: "Weyre: 89% to blame." })).toBeVisible();
  await expect(page.getByText("144 ÷ 162 = 89%")).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "What should have happened." })).toBeVisible();
  await expect(page.getByText(/0 of 200/)).toBeVisible();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("button", { name: /Chapter 1 of 7/ })).toHaveAttribute("aria-current", "step");
});

