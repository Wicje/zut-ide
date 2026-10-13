import { expect, test } from '@playwright/test';

// Closed-waitlist contract: landing sells + captures, /app stays locked.
// No form is submitted here (that would write to the real Supabase table).

test('landing shows the waitlist first', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /sentences/i })).toBeVisible();
  await expect(page.locator('form[data-waitlist]').first()).toBeVisible();
  // No IDE entry points during closed waitlist.
  await expect(page.getByRole('link', { name: /launch ide|log in/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /join the waitlist/i }).first()).toBeVisible();
});

test('/app is locked behind the waitlist gate', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByText(/private waitlist/i)).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  // Back-to-landing escape hatch exists.
  await expect(page.getByRole('link', { name: /back to landing/i })).toBeVisible();
});

test('/app?nowait opens the IDE shell (owner bypass)', async ({ page }) => {
  await page.goto('/app/?nowait');
  await expect(page.locator('#root')).toBeAttached();
  // Shell chrome renders without crashing.
  await expect(page.getByRole('button', { name: /deploy/i }).first()).toBeVisible({ timeout: 30_000 });
});
