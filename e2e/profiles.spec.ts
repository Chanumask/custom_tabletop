import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

// Player profiles in every browser engine (docs/decisions.md, "Player
// profiles"): shared on the join screen, seen by the host alone, kept on
// the device, and a sideways phone photo shown the right way up after the
// server strips its hidden data.

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

const codeFor = (browserName: string) =>
  `${browserName.slice(0, 2)}P${Date.now() % 100000}`.toUpperCase();

/** A real PNG of the given size (a plain parchment colour). */
function pngOf(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3, 0xe8);
  row[0] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A 400 × 300 JPEG, made by this browser, as a phone saves one: stored
 * sideways with EXIF orientation 6, and a (pretend) GPS position inside. */
async function sidewaysPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#dfe8f0';
    c.fillRect(0, 0, 400, 300);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9),
    );
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const secret = new TextEncoder().encode('SECRET-GPS-52.52N\0');
    const tiff = new Uint8Array(8 + 2 + 2 * 12 + 4 + secret.length);
    const view = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 0x2a, 0x00]);
    view.setUint32(4, 8, true);
    view.setUint16(8, 2, true);
    view.setUint16(10, 0x0112, true); // orientation: SHORT 6
    view.setUint16(12, 3, true);
    view.setUint32(14, 1, true);
    view.setUint16(18, 6, true);
    view.setUint16(22, 0xa431, true); // a serial number: ASCII, the secret
    view.setUint16(24, 2, true);
    view.setUint32(26, secret.length, true);
    view.setUint32(30, 38, true);
    tiff.set(secret, 38);
    const exif = new TextEncoder().encode('Exif\0\0');
    const length = 2 + exif.length + tiff.length;
    const app1 = new Uint8Array(2 + length);
    app1.set([0xff, 0xe1, length >> 8, length & 255]);
    app1.set(exif, 4);
    app1.set(tiff, 4 + exif.length);
    const out = new Uint8Array(jpeg.length + app1.length);
    out.set(jpeg.subarray(0, 2));
    out.set(app1, 2);
    out.set(jpeg.subarray(2), 2 + app1.length);
    let binary = '';
    out.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

/** The API's address as the page sees it (dev: the server's own port). */
const apiOf = (page: Page) =>
  page.evaluate(() => (location.port === '5173' ? 'http://localhost:3001' : location.origin));

test('a player’s profile reaches the host, and only the host', async ({ browser, browserName }) => {
  // Three players, two rooms rendered in software: WebKit needs longer.
  test.slow(browserName === 'webkit');
  const code = codeFor(browserName);
  const hana = await (await browser.newContext()).newPage();
  const aliceContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await (await browser.newContext()).newPage();
  const errors = [...collectErrors(hana), ...collectErrors(alice)];

  await hana.goto('/');
  await hana.getByPlaceholder('What should the table call you?').fill('Hana');
  await hana.locator('#session-code').fill(code);
  await hana.getByRole('button', { name: 'Create session' }).click();
  await expect(hana.getByText(`Session ${code}`)).toBeVisible();

  // Alice picks her sheet on the join screen: checked there, shared on joining.
  await alice.goto(`/?join=${code}`);
  await alice.getByPlaceholder('What should the table call you?').fill('Alice');
  await alice.getByLabel('Choose a profile image').setInputFiles({
    name: 'sheet.png',
    mimeType: 'image/png',
    buffer: pngOf(620, 877),
  });
  await expect(alice.getByText('PNG · 620 × 877')).toBeVisible();
  await expect(alice.getByText(/at the table/)).toBeVisible();
  await alice.getByRole('button', { name: 'Join session' }).click();
  // Shared in the background while her room loads — which headless Firefox
  // does in software, slowly enough to hold the upload up for a while.
  await expect(alice.getByText('Shared with the host')).toBeVisible({ timeout: 60_000 });

  // The host opens it, full size.
  await hana.getByRole('button', { name: 'View Alice’s profile' }).click();
  const viewer = hana.getByRole('dialog', { name: 'Alice’s profile' });
  const shown = viewer.locator('img');
  await expect(shown).toBeVisible();
  expect(
    await shown.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
  ).toEqual([620, 877]);
  await hana.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);

  // Bob, another player: no sign of it, and no way to it.
  await bob.goto(`/?join=${code}`);
  await bob.getByPlaceholder('What should the table call you?').fill('Bob');
  await expect(bob.getByText(/at the table/)).toBeVisible();
  await bob.getByRole('button', { name: 'Join session' }).click();
  await expect(bob.locator('.player-list li', { hasText: 'Alice' })).toBeVisible();
  await expect(bob.getByRole('button', { name: /Alice’s profile/ })).toHaveCount(0);
  const aliceId = await alice.evaluate(() => sessionStorage.getItem('customTabletop.playerId'));
  const api = await apiOf(bob);
  const refused = await bob.evaluate(
    async ({ api, aliceId, code }) => {
      const response = await fetch(`${api}/api/profile-image/${aliceId}`, {
        headers: {
          'X-Table': code,
          'X-Player': sessionStorage.getItem('customTabletop.playerId') ?? '',
          Authorization: `Bearer ${sessionStorage.getItem('customTabletop.playerToken')}`,
        },
      });
      return response.status;
    },
    { api, aliceId, code },
  );
  expect(refused).toBe(403);

  // Alice's browser kept a copy: a new tab offers it on the join screen.
  const later = await aliceContext.newPage();
  await later.goto(`/?join=${code}`);
  await expect(later.getByText('Saved on this device')).toBeVisible();
  await expect(later.getByText('PNG · 620 × 877')).toBeVisible();
  await later.close();

  // She replaces it with a sideways phone photo: the host hears so, and
  // sees it upright, with nothing hidden left in the file.
  await alice.locator('.profile-image-section input[type=file]').setInputFiles({
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: await sidewaysPhoto(alice),
  });
  await expect(alice.getByText('JPG · 300 × 400')).toBeVisible();
  await expect(hana.getByText('Alice updated their profile.')).toBeVisible();
  await hana.getByRole('button', { name: 'View Alice’s profile' }).click();
  await expect(viewer.locator('img')).toBeVisible();
  const photo = await viewer.locator('img').evaluate(async (img: HTMLImageElement) => {
    const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    let text = '';
    bytes.forEach((byte) => (text += String.fromCharCode(byte)));
    return { size: [img.naturalWidth, img.naturalHeight], secret: text.includes('SECRET-GPS') };
  });
  expect(photo).toEqual({ size: [300, 400], secret: false });
  await hana.keyboard.press('Escape');

  // She withdraws it: gone for the host too.
  await alice.getByRole('button', { name: 'Remove', exact: true }).click();
  await alice.getByRole('button', { name: 'Remove it?' }).click();
  await expect(alice.getByText('Choose an image…')).toBeVisible();
  await expect(hana.getByRole('button', { name: 'View Alice’s profile' })).toHaveCount(0);

  expect(errors).toEqual([]);
});
