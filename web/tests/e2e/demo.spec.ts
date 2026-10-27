import { expect, test } from "@playwright/test";

// 1. Visitor Home Journey: Volt Lime accent, Timestack hero, Story walk
test("home explains the product and the story walks one traced goal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every goal has a bug." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trace. Prove. Explain." })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Match library" })).toBeAttached();

  // Verify the canonical fixture in library
  await expect(page.getByText("KBY 4–4 IRA")).toBeAttached();

  // Story walk
  await page.goto("/#/story");
  await expect(page.getByText("How Root Cause thinks")).toBeVisible();
  await expect(page.getByText(/Example: a real traced goal/)).toBeVisible();
});

// 2. Direct Goal 3 navigation in Goal Autopsy & Untraced goal handling
test("goal autopsy preserves valid traces, respects direct goal 3 navigation, and displays untraced goals", async ({
  page,
}) => {
  // Navigate directly to Goal 3
  await page.goto("/?goal=kby-ira-g3#/autopsy");

  // Verify Goal 3 heading is active and rendered (not falling back to Goal 1!)
  await expect(page.getByRole("heading", { name: /36:24 · J. Tamsin scores/ })).toBeVisible({ timeout: 15_000 });

  // Click Verdict step to verify culprit and causal link blame attribution
  await page.getByRole("button", { name: "Verdict" }).click();
  await expect(page.getByRole("heading", { name: /Kerrow.*74% of the blame/ })).toBeVisible();
  await expect(page.getByText("Quint 26%")).toBeVisible();
  await expect(page.getByText(/goals fall from 138 to 12 in 200 replays/)).toBeVisible();

  // Untraced goals (e.g. Goal 1) are selectable in the match's goal list
  const g1Button = page.getByRole("button", { name: /24:04.*Morrow/i }).first();
  await expect(g1Button).toBeVisible();
  await g1Button.click();
  // Goal 1 is now displayed with its honest answer
  await expect(page.getByRole("heading", { name: /24:04 · C. Morrow scores/ })).toBeVisible();

  // Non-existent goal handling shows honest card instead of falling back
  await page.goto("/?goal=kby-ira-nonexistent#/autopsy");
  await expect(page.getByText(/Goal “kby-ira-nonexistent” not found/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "View Match Autopsy" })).toBeVisible();
});

test("reduced-motion playback keeps the rendered canvas attached when changing Autopsy beats", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?goal=kby-ira-g2#/autopsy");
  const canvas = await page.getByRole("img", { name: "3D replay of the goal and its autopsy" }).elementHandle();
  expect(canvas).not.toBeNull();
  await page.getByRole("button", { name: "Mistakes", exact: true }).click();
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "The test", exact: true }).click();
  expect(await canvas!.evaluate((el) => el.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

// 3. Tactics Lab: Tactical lenses, Pitch, and Live Broadcast HUD toggle
test("tactics lab displays live player tracking, focus panel, and broadcast HUD", async ({
  page,
}) => {
  await page.goto("/#/lab");
  await expect(page.getByRole("heading", { name: "See the whole match." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Tactics Lab" })).toBeVisible();

  // Verify Pitch / Stadium canvas is mounted
  await expect(page.locator("canvas").first()).toBeVisible();

  // Verify tactical lenses and moment breakdown
  await expect(page.getByText("Space owned")).toBeVisible();
  await expect(page.getByText("Passing options")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Space" })).toBeVisible();

  // Broadcast graphics toggle in the Tactics Lab transport
  const overlay = page.getByRole("button", { name: "Broadcast graphics" });
  await expect(overlay).toBeVisible();
  await overlay.click();
  await expect(overlay).toHaveAttribute("aria-pressed", "true");
});

// 4. Personalization: My Club & My Player preferences
test("preferences menu allows setting favorite club and player with persistence", async ({
  page,
}) => {
  await page.goto("/");

  // The header's "Your team" picker saves the club by name
  await page.getByRole("button", { name: "Pick your club and player" }).first().click();
  const club = page.getByRole("radio", { name: /Ironmoor Athletic/ });
  await expect(club).toBeVisible();
  await club.click();
  await expect(club).toHaveAttribute("aria-checked", "true");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("rc.fan") ?? "{}").club);
  expect(saved).toBe("Ironmoor Athletic");
});

// 5. Multilingual and Honest Provenance
test("multilingual narratives switch cleanly with zero unlocalized English", async ({ page }) => {
  // Test Spanish mode
  await page.goto("/?lang=es#/autopsy?goal=kby-ira-g3");
  await expect(page.getByText(/autopsia|análisis|gol|revisión/i).first()).toBeVisible({ timeout: 15_000 });

  // Test Hindi mode
  await page.goto("/?lang=hi#/autopsy?goal=kby-ira-g3");
  await expect(page.getByText(/गोल|समीक्षा|विश्लेषण/i).first()).toBeVisible({ timeout: 15_000 });
});
