import { expect, test } from '@playwright/test';

test('hub mounts, tutorial level loads, and the canvas comes online', async ({ page }) => {
  const renderFailures: string[] = [];
  const renderFailurePattern =
    /PixiJS Error|Could not initialize shader|gl\.getProgramInfoLog|ERROR: 0:|WebGL: INVALID_OPERATION/i;

  page.on('console', (message) => {
    const text = message.text();
    if ((message.type() === 'error' || message.type() === 'warning') && renderFailurePattern.test(text)) {
      renderFailures.push(text);
    }
  });
  page.on('pageerror', (error) => {
    renderFailures.push(error.message);
  });

  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('slimegame.metaProgress.v1');
    } catch {
      // ignore
    }
  });

  await page.goto('/');

  await expect(page.locator('.hub-title')).toHaveText('Slime Campaign');
  await expect(page.locator('.balance-card', { hasText: 'Goo' })).toBeVisible();
  await expect(page.locator('.balance-card', { hasText: 'Cores' })).toBeVisible();
  await expect(page.locator('.upgrade-tree-viewport')).toBeVisible();
  await expect(page.locator('.upgrade-node-button', { hasText: '1 Core' })).toBeVisible();
  await expect(page.locator('.upgrade-node-button')).toHaveCount(1);
  await expect(page.locator('.upgrade-node-button', { hasText: 'Poke' })).toHaveCount(0);
  await page.locator('.upgrade-node-button', { hasText: '1 Core' }).click();
  await expect(page.locator('.hub-message')).toContainText('Bought Unlock: Pinpricker');
  await page.getByRole('button', { name: 'Reset Campaign' }).click();
  await expect(page.locator('.hub-message')).toContainText('Campaign reset');
  await expect(page.locator('.upgrade-node-button')).toHaveCount(1);
  await expect(page.locator('.upgrade-node-button', { hasText: '1 Core' })).toBeVisible();
  await page.locator('.upgrade-node-button', { hasText: '1 Core' }).click();

  await page.getByRole('button', { name: 'Levels' }).click();
  const tutorialCard = page.locator('.level-card', { hasText: 'Level 0 - Tutorial' });
  await expect(tutorialCard).toBeVisible();
  await tutorialCard.locator('button').click();

  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.locator('.run-toolbar')).toBeVisible();
  await expect(page.locator('.run-status')).toContainText('Level 0');
  await expect(page.locator('.run-banner')).toContainText('Place the Pinpricker');

  expect(renderFailures).toEqual([]);
});

test('level 1 ability buttons stay clickable above the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'slimegame.metaProgress.v1',
        JSON.stringify({
          version: 1,
          goo: 0,
          cores: 0,
          purchased: ['pinpricker.unlock', 'poke.unlock'],
          clears: { tutorial: 1 },
          hasSeenIntro: true,
        }),
      );
    } catch {
      // ignore
    }
  });

  await page.goto('/');

  const level1Card = page.locator('.level-card', { hasText: 'Level 1 - Drainpipe' });
  await expect(level1Card).toBeVisible();
  await level1Card.locator('button').click();

  const pokeButton = page.locator('.tool-button', { hasText: 'Poke' });
  await expect(pokeButton).toBeVisible();

  await pokeButton.click();
  await expect(pokeButton).toHaveClass(/active/);
});
