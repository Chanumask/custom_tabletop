import { expect, test, type Page } from '@playwright/test';

/** Console errors a page logs (ignoring noise from third-party frames). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !/youtube|googlevideo|favicon/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** A session code unique to this run and browser. */
function codeFor(browserName: string, suffix: string): string {
  return `${browserName.slice(0, 2)}${suffix}${Date.now() % 100000}`.toUpperCase();
}

async function host(page: Page, name: string, code: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Custom Tabletop' })).toBeVisible();
  await page.getByPlaceholder('What should the table call you?').fill(name);
  await page.locator('#session-code').fill(code);
  await page.getByRole('button', { name: 'Create session' }).click();
}

async function join(page: Page, name: string, code: string) {
  await page.goto(`/?join=${code}`);
  await page.getByPlaceholder('What should the table call you?').fill(name);
  await expect(page.getByText(/at the table/)).toBeVisible();
  await page.getByRole('button', { name: 'Join session' }).click();
}

/** Waits until the room's model has loaded and the room is showing. */
async function roomLoaded(page: Page) {
  await expect(page.locator('.room-view canvas')).toBeVisible();
  await expect(page.locator('.room-loading')).toHaveCount(0, { timeout: 60_000 });
}

/** Waits for the room to finish loading, then measures how bright the
 * room looks in a real screenshot — a black frame means nothing rendered.
 * (A screenshot rather than reading the canvas back: it works in every
 * engine and in production builds, which have no debug hooks.) */
async function roomBrightness(page: Page): Promise<number> {
  await roomLoaded(page);
  await page.waitForTimeout(500); // a few frames after the loading card goes
  const png = await page.locator('.room-view canvas').screenshot();
  return page.evaluate(
    async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const probe = document.createElement('canvas');
      probe.width = 64;
      probe.height = 40;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(image, 0, 0, probe.width, probe.height);
      const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
      return sum / (data.length / 4) / 3;
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
}

test('a host can open a table and the room renders', async ({ page, browserName }) => {
  const errors = collectErrors(page);
  await host(page, 'Alice', codeFor(browserName, 'R'));
  await expect(page.getByText(/Session /)).toBeVisible();
  const brightness = await roomBrightness(page);
  expect(brightness, 'the room renders something, not a black frame').toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('two players see each other and can chat', async ({ browser, browserName }) => {
  const code = codeFor(browserName, 'C');
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  const errors = [...collectErrors(alice), ...collectErrors(bob)];

  await host(alice, 'Alice', code);
  await expect(alice.getByText(`Session ${code}`)).toBeVisible();
  await join(bob, 'Bob', code);
  await expect(bob.getByText(`Session ${code}`)).toBeVisible();

  // Each sees the other in the player list.
  await expect(alice.getByText('Bob', { exact: true })).toBeVisible();
  await expect(
    bob.locator('.player-list li', { hasText: 'Alice' }).getByTitle('The host'),
  ).toBeVisible();

  // Bob chats; Alice sees it in her feed.
  await bob.getByRole('button', { name: /Chat/ }).click();
  await bob.getByLabel('Chat message').fill('Hello from Bob!');
  await bob.keyboard.press('Enter');
  await expect(alice.locator('.chat-line', { hasText: 'Hello from Bob!' })).toBeVisible();

  // And a typed roll shows up for both.
  await alice.getByRole('button', { name: /Chat/ }).click();
  await alice.getByLabel('Chat message').fill('/roll 2d6+3');
  await alice.keyboard.press('Enter');
  await expect(bob.locator('.chat-line', { hasText: 'Alice rolled 2d6+3' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('a roll lands for everyone, with sound, without errors', async ({ browser, browserName }) => {
  const code = codeFor(browserName, 'D');
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  const errors = [...collectErrors(alice), ...collectErrors(bob)];

  await host(alice, 'Alice', code);
  await roomLoaded(alice);
  await join(bob, 'Bob', code);
  await roomLoaded(bob);

  // Spawning and rolling plays the dice animation and its synthesized
  // clatter (Web Audio) on both sides.
  await alice.getByRole('tab', { name: 'Dice' }).click();
  await alice.getByTitle('Add a d20').click();
  await alice.getByTitle('Add a d6').click();
  await alice.getByRole('button', { name: /Roll my dice/ }).click();
  await expect(bob.locator('.chat-line', { hasText: /Alice rolled/ })).toBeVisible();
  await expect(alice.locator('.dice-list .dice-result').first()).not.toHaveText('–');
  await alice.waitForTimeout(1500); // let the tumble and its sound play out

  expect(errors).toEqual([]);
});
