import { expect, test } from '@playwright/test';

test('loads the game canvas and advances the simulation', async ({ page }) => {
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

  await page.goto('/');

  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.getByTestId('sim-status')).toContainText('slimes');
  await page.getByLabel('Pause simulation').check();
  await expect(page.getByTestId('sim-status')).toContainText('paused');
  await page.getByLabel('Shader lighting').uncheck();
  await page.getByLabel('Specular highlights').uncheck();
  await page.getByLabel('Sampled slime color').uncheck();
  const edgeFeatherSlider = page.locator('[data-shader-slider="edgeFadeWidth"]');
  await edgeFeatherSlider.fill('0.032');
  await page.getByTestId('restart-simulation').click();
  await expect(edgeFeatherSlider).toHaveValue('0.032');
  await page.getByLabel('Threshold shader').uncheck();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('sim-status')).toContainText('slimes');
  await page.waitForTimeout(250);

  expect(renderFailures).toEqual([]);
});
