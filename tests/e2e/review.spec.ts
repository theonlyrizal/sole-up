import { expect, test, type Page } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { seedVisualData } from "./visual-data";

import {
  expectNoSeriousViolations,
  openQuickAdd,
  signInAndConfirm,
} from "./helpers";

// The weekly review flow (chunk 7.3): opened from the navigation on last
// week, four steps that save as they are left, adjustments through the
// ordinary goal and task actions, and "Finish review" with nothing filled.

test.use({ viewport: { width: 1280, height: 800 } });

const PAUSED_GOAL = "Learn Spanish";
const PRIORITY_GOAL = "Write a novel";
const FIRST_TASK = "Book a tutor";
const SECOND_TASK = "Draft chapter one";
const PRIORITY_TASK = "Buy notebooks";

function toastSaying(page: Page, title: string) {
  return page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: title });
}

function stepsNav(page: Page) {
  return page.getByRole("navigation", { name: "Review steps" });
}

function reviewedWeek(page: Page) {
  return page.getByRole("region", { name: "Reviewed week" });
}

async function expectStep(page: Page, label: string) {
  await expect(
    page.getByRole("heading", { level: 2, name: label }),
  ).toBeVisible();
  await expect(
    stepsNav(page).getByRole("link", { name: label }),
  ).toHaveAttribute("aria-current", "step");
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
}

async function createTask(page: Page, title: string) {
  const dialog = await openQuickAdd(page);
  await dialog.getByLabel("Task title").fill(title);
  await dialog.getByLabel("Task title").press("Enter");
  await expect(dialog).toHaveCount(0);
}

async function openReview(page: Page) {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Review" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Weekly review" }),
  ).toBeVisible();
  await expectStep(page, "Look back");
}

test("a review pauses a goal, plans two tasks for next week and sets priorities", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await createGoal(page, PAUSED_GOAL);
  await createGoal(page, PRIORITY_GOAL);
  for (const title of [FIRST_TASK, SECOND_TASK, PRIORITY_TASK]) {
    await createTask(page, title);
  }

  // The flow opens on last week, with this week offered instead.
  await openReview(page);
  await expect(reviewedWeek(page)).toContainText("Last week");
  await expect(reviewedWeek(page)).toContainText("Not finished");
  await expect(
    reviewedWeek(page).getByRole("link", { name: /^Review this week instead/ }),
  ).toBeVisible();

  // Look back: each figure with its definition.
  const summary = page.getByRole("list", { name: "Summary of the week" });
  await expect(
    summary.getByRole("heading", { name: "Tasks completed" }),
  ).toBeVisible();
  await expect(summary.getByRole("listitem")).toHaveCount(6);
  const metricInfo = summary.getByRole("button", {
    name: "How this is counted: Tasks completed",
  });
  await metricInfo.press("Enter");
  const definition = page.getByRole("dialog", { name: "How this is counted" });
  await expect(definition).toContainText(
    "Tasks marked completed during this week",
  );
  await expect(definition).toContainText("As of");
  await page.keyboard.press("Escape");
  await expect(metricInfo).toBeFocused();
  await expectNoSeriousViolations(page);

  // Reflect: saved on leaving the step.
  await page.getByRole("button", { name: "Next: Reflect" }).click();
  await expectStep(page, "Reflect");
  await page.getByLabel("Wins").fill("Kept practising every morning.");
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Next: Adjust" }).click();
  await expectStep(page, "Adjust");

  // Adjust: pause a goal with the ordinary goal action.
  const goals = page.getByRole("list", { name: "Active and paused goals" });
  await goals.getByRole("button", { name: `Pause: ${PAUSED_GOAL}` }).click();
  const pause = page.getByRole("alertdialog", {
    name: `Pause ${PAUSED_GOAL}?`,
  });
  await expect(pause).toContainText("This moves the goal to Paused");
  await pause.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(toastSaying(page, "Paused.").first()).toBeVisible();
  await expect(
    goals.getByRole("button", { name: `Resume: ${PAUSED_GOAL}` }),
  ).toBeVisible();

  // Plan two tasks on days of the week after the reviewed one.
  const planForm = page.getByRole("form", {
    name: "Plan a task for next week",
  });
  const planned = page.getByRole("list", { name: "Planned for next week" });
  const days = await planForm.getByLabel("Day").locator("option").all();
  const lastDay = (await days.at(-1)!.getAttribute("value"))!;
  await planForm.getByLabel("Task").selectOption({ label: FIRST_TASK });
  await planForm.getByRole("button", { name: "Plan" }).click();
  await expect(planned.getByText(FIRST_TASK)).toBeVisible();
  await planForm.getByLabel("Task").selectOption({ label: SECOND_TASK });
  await planForm.getByLabel("Day").selectOption(lastDay);
  await planForm.getByRole("button", { name: "Plan" }).click();
  await expect(planned.getByText(SECOND_TASK)).toBeVisible();
  await expect(planned.getByRole("listitem")).toHaveCount(2);
  // A planned task is no longer offered.
  await expect(
    planForm.getByLabel("Task").locator("option", { hasText: FIRST_TASK }),
  ).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  // Choose priorities: a goal and a task, reordered, with a note.
  await page.getByRole("button", { name: "Next: Choose priorities" }).click();
  await expectStep(page, "Choose priorities");
  const picker = page.getByRole("region", { name: "Add a priority" });
  await picker
    .getByRole("searchbox", { name: "Find a goal or task" })
    .fill("novel");
  await expect(
    picker.getByRole("button", { name: `Add ${PRIORITY_TASK}` }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: `Add ${PRIORITY_GOAL}` }).click();
  await picker.getByRole("searchbox").fill("notebooks");
  await picker.getByRole("button", { name: `Add ${PRIORITY_TASK}` }).click();
  const priorities = page.getByRole("list", {
    name: "Priorities for next week",
  });
  await priorities
    .getByRole("button", { name: `Move ${PRIORITY_TASK} up` })
    .click();
  await expect(priorities.getByRole("listitem")).toHaveText([
    new RegExp(PRIORITY_TASK),
    new RegExp(PRIORITY_GOAL),
  ]);
  // Focus stays with the moved row.
  await expect(
    priorities.getByRole("button", { name: `Move ${PRIORITY_TASK} down` }),
  ).toBeFocused();
  await page.getByLabel("Note (optional)").fill("Mornings first.");
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Finish review" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Your review is saved",
  });
  await expect(confirmation).toContainText("You can change it until");
  await confirmation.getByRole("button", { name: "Done", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(reviewedWeek(page)).toContainText("Finished on");

  // Everything was saved: reload and walk back through the steps.
  await page.reload();
  await expectStep(page, "Choose priorities");
  await expect(priorities.getByRole("listitem")).toHaveText([
    new RegExp(PRIORITY_TASK),
    new RegExp(PRIORITY_GOAL),
  ]);
  await expect(page.getByLabel("Note (optional)")).toHaveValue(
    "Mornings first.",
  );
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expectStep(page, "Reflect");
  await expect(page.getByLabel("Wins")).toHaveValue(
    "Kept practising every morning.",
  );
  await stepsNav(page).getByRole("link", { name: "Adjust" }).click();
  await expectStep(page, "Adjust");
  await expect(planned.getByRole("listitem")).toHaveCount(2);

  // The adjustments are ordinary changes, seen everywhere.
  await page.goto("/goals?status=paused");
  await expect(page.getByRole("link", { name: PAUSED_GOAL })).toBeVisible();

  // Last week is finished, so the flow now opens on this week.
  await openReview(page);
  await expect(reviewedWeek(page)).toContainText("This week");
  await expect(
    reviewedWeek(page).getByRole("link", { name: /^Review last week instead/ }),
  ).toBeVisible();
});

test("a review with nothing filled can be finished, with the keyboard alone", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openReview(page);

  // Step links work from the keyboard, and focus moves to the new step.
  const priorities = stepsNav(page).getByRole("link", {
    name: "Choose priorities",
  });
  await priorities.focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "Choose priorities");
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose priorities" }),
  ).toBeFocused();
  await expect(page.getByText("None chosen yet.")).toBeVisible();

  const finish = page.getByRole("button", { name: "Finish review" });
  await finish.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", {
    name: "Your review is saved",
  });
  await expect(confirmation).toContainText("You can change it until");
  await confirmation
    .getByRole("button", { name: "Done", exact: true })
    .press("Enter");
  await expect(confirmation).toHaveCount(0);
  await expect(reviewedWeek(page)).toContainText("Finished on");
  // A finished review stays editable while its week is open.
  await expect(page.getByRole("button", { name: "Save review" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("step links save the draft and focus the destination heading", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/review?step=reflect");
  await expectStep(page, "Reflect");
  const wins = page.getByLabel("Wins", { exact: true });
  await wins.fill("Practised the short route.");
  await stepsNav(page).getByRole("link", { name: "Adjust" }).press("Enter");
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}&step=adjust$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Adjust", exact: true }),
  ).toBeFocused();
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expect(wins).toHaveValue("Practised the short route.");

  await wins.fill("Practised the short route twice.");
  const otherWeek = reviewedWeek(page).getByRole("link", {
    name: "Review this week instead",
  });
  await otherWeek.click();
  await expectStep(page, "Look back");
  await expect(reviewedWeek(page)).toContainText("This week");
  await reviewedWeek(page)
    .getByRole("link", { name: "Review last week instead" })
    .click();
  await expect(reviewedWeek(page)).toContainText("Last week");
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expect(wins).toHaveValue("Practised the short route twice.");

  await wins.fill("Walked the short route with a friend.");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/review?step=reflect");
  await expect(wins).toHaveValue("Walked the short route with a friend.");
});

test("Finish shows the sheet once after success and Escape closes it", async ({
  page,
}) => {
  await signInAndConfirm(page);
  // A direct link with the default week still needs to stay on the week saved.
  await page.goto("/review?step=priorities");
  await expectStep(page, "Choose priorities");
  const finish = page.getByRole("button", { name: "Finish review" });
  const sheet = page.getByRole("dialog", { name: "Your review is saved" });
  const week = reviewedWeek(page);
  await expect(week).toContainText("Last week");
  await expect(sheet).toHaveCount(0);

  const requested = Promise.withResolvers<void>();
  const held = Promise.withResolvers<void>();
  const reviewRoute = (url: URL) => url.pathname === "/review";
  await page.route(reviewRoute, async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }
    requested.resolve();
    await held.promise;
    const body = request.postData()!;
    const invalid = body.replace(/"id":"[0-9a-f-]{36}"/, '"id":"invalid"');
    expect(invalid).not.toBe(body);
    await route.continue({ postData: invalid });
  });
  await finish.click();
  try {
    await requested.promise;
    await expect(finish).toBeDisabled();
    await expect(finish).toHaveAttribute("aria-busy", "true");
    await expect(week).toContainText("Not finished");
    await expect(sheet).toHaveCount(0);
  } finally {
    held.resolve();
  }
  await expect(
    page.getByRole("alert").getByText("Some of the details need fixing."),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await page.unroute(reviewRoute);
  await finish.click();
  await expect(sheet).toContainText("You can change it until");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  const save = page.getByRole("button", { name: "Save review" });
  await expect(save).toBeFocused();
  await expect(week).toContainText("Last week");
  await expect(week).toContainText("Finished on");
  await page.reload();
  await expect(save).toBeEnabled();
  await expect(sheet).toHaveCount(0);
  await page.getByLabel("Note (optional)").fill("Keep the early appointment.");
  await save.click();
  await expect(
    page.getByRole("status").getByText("Saved", { exact: true }),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Note (optional)")).toHaveValue(
    "Keep the early appointment.",
  );
  await expect(sheet).toHaveCount(0);
});

test("the priority picker stops at ten and can add again after removal", async ({
  page,
}) => {
  await seedVisualData(page, { plan: true, goalsUI: true });
  await page.goto("/review?step=priorities");
  await expectStep(page, "Choose priorities");
  const candidates = page.getByRole("list", {
    name: "Available goals and tasks",
  });
  const add = candidates.getByRole("button", { name: /^Add / });
  for (let index = 0; index < 10; index++) {
    await add.first().click();
  }
  await expect(page.getByRole("status").getByText("10 of 10")).toBeVisible();
  await expect(add.first()).toBeDisabled();
  const chosen = page.getByRole("list", { name: "Priorities for next week" });
  await chosen
    .getByRole("button", { name: /^Remove / })
    .first()
    .press("Enter");
  await expect(page.getByRole("status").getByText("9 of 10")).toBeVisible();
  await expect(
    chosen.getByRole("button", { name: /^Remove / }).first(),
  ).toBeFocused();
  await expect(add.first()).toBeEnabled();
});

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`review steps and finish are accessible at ${width} in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await seedVisualData(page);
      await page.goto("/review");
      for (const [index, label] of [
        "Look back",
        "Reflect",
        "Adjust",
        "Choose priorities",
      ].entries()) {
        await expect(
          page.getByRole("heading", { level: 2, name: label, exact: true }),
        ).toBeVisible();
        if (width === 390) {
          await expect(
            page.getByText(`Step ${index + 1} of 4 · ${label}`),
          ).toBeVisible();
        } else {
          await expectStep(page, label);
        }
        await expectNoSeriousViolations(page);
        if (index < 3)
          await page.getByRole("button", { name: /^Next:/ }).click();
      }
      await page.getByRole("button", { name: "Finish review" }).click();
      const sheet = page.getByRole("dialog", { name: "Your review is saved" });
      await expect(sheet).toBeVisible();
      await expectNoSeriousViolations(page);
      await sheet
        .getByRole("button", { name: "Done", exact: true })
        .press("Enter");
      await expect(sheet).toHaveCount(0);
    });
  }
}
