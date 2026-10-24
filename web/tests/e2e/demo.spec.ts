import { expect, test } from "@playwright/test";

// The first visit: home sells the product with no match's data in its copy, the story walks one example goal.
test("home explains the product and the story walks one traced goal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every goal has a bug." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trace. Prove. Explain." })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Match library" })).toBeAttached();
  const hero = page.locator("section[aria-labelledby=hero-h]");
  await expect(hero).not.toContainText(/Harbour|Northgate|\d+[′']/);

  await page.getByRole("button", { name: "How it thinks" }).first().click();
  await expect(page.getByText("Example: a real traced goal from Meeting 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The goal sits on top." })).toBeVisible();
  for (const h of ["Scan down, layer by layer.", "One layer lights up.", "Draw the fix beside it.", "The goal disappears."]) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Open this goal's autopsy" })).toHaveAttribute("href", /goal=p-1008-g4.*#\/autopsy|#\/autopsy/);
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

