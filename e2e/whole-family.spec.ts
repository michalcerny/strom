import { test, expect, Page } from '@playwright/test';
import { card } from './helpers.js';
import { expectFits, sampleTree } from './mobile-screens.js';

/**
 * The whole family at once: "Whole family" focuses the head of the focus
 * person's family (the topmost ancestor with the most descendants) with every
 * generation down and frames the chart; "Wider family" adds the partners'
 * ancestors and the siblings of every ancestor (great-aunts/uncles), kept as
 * a setting. Desktop: both in the focus pill. Phone and tablet: More → View.
 *
 * The sample tree: Nora Berg is seven generations below Peter Berg; Eva Berg
 * is a sister of Nora's grandfather Martin (a great-aunt).
 */

async function focusNora(page: Page): Promise<void> {
    await page.evaluate(() => window.Strom.TreeRenderer.setFocus('demo_nora' as never));
    await expect(page.locator('#focus-name')).toHaveText('Nora Berg');
}

/** Every rendered card lies inside the tree's viewport. */
async function allCardsInView(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const box = document.getElementById('tree-container')!.getBoundingClientRect();
        return [...document.querySelectorAll('#tree-canvas .person-card')].every(el => {
            const r = el.getBoundingClientRect();
            return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
        });
    });
}

test.describe('desktop focus pill', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('Whole family: the head of the family, every generation down, the whole chart in view', async ({ page }) => {
        await sampleTree(page);
        await focusNora(page);
        await page.locator('#focus-whole-family').click();
        await expect(page.locator('#focus-name')).toHaveText('Peter Berg');
        await expect(card(page, 'Nora')).toBeVisible();
        const depth = await page.evaluate(() => ({
            down: window.Strom.TreeRenderer.getFocusDepthDown(),
            max: Math.max(...[...(document.getElementById('focus-depth-down') as HTMLSelectElement).options].map(o => +o.value)),
        }));
        expect(depth.down).toBe(depth.max);
        await expect.poll(() => allCardsInView(page)).toBe(true);
    });

    test('Whole family from the fan chart opens the family view', async ({ page }) => {
        await sampleTree(page);
        await focusNora(page);
        await page.evaluate(() => window.Strom.UI.setDisplayViewMode('fan'));
        await page.evaluate(() => window.Strom.UI.showWholeFamily());
        await expect.poll(() => page.evaluate(() => window.Strom.TreeRenderer.getViewMode())).toBe('family');
        await expect(card(page, 'Peter')).toBeVisible();
    });

    test('Wider family: great-aunts appear, the choice is kept, off takes them away', async ({ page }) => {
        await sampleTree(page);
        await focusNora(page);
        const wider = page.locator('#focus-wider-family');
        await expect(wider).toHaveAttribute('aria-pressed', 'false');
        await expect(card(page, 'Eva')).toHaveCount(0);

        await wider.click();
        await expect(wider).toHaveAttribute('aria-pressed', 'true');
        await expect(card(page, 'Eva')).toBeVisible();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('strom-settings') ?? '{}').widerFamily)).toBe(true);

        await page.reload();
        await expect(page.locator('#focus-wider-family')).toHaveAttribute('aria-pressed', 'true');
        // The reload starts on the tree's own person, from whom Eva is a descendant.
        await focusNora(page);
        await expect(card(page, 'Eva')).toBeVisible();

        await page.locator('#focus-wider-family').click();
        await expect(page.locator('#focus-wider-family')).toHaveAttribute('aria-pressed', 'false');
        await expect(card(page, 'Eva')).toHaveCount(0);
    });
});

test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the person row stays one 48px row; More → View carries both', async ({ page }) => {
        await sampleTree(page);
        await focusNora(page);
        await expect(page.locator('#focus-controls .focus-scope')).toBeHidden();
        expect(Math.round((await page.locator('#focus-controls').boundingBox())!.height)).toBe(48);
        await expectFits(page, 'tree');

        const sheet = page.locator('.bottom-sheet-menu');
        const row = (label: string) => sheet.locator('.bottom-sheet-item', { hasText: label });
        await page.locator('#bb-view-more').tap();
        await expect(row('Wider family')).toContainText('Off');
        await expectFits(page, 'More');
        await row('Wider family').tap();
        await expect(card(page, 'Eva')).toHaveCount(1);

        await page.locator('#bb-view-more').tap();
        await expect(row('Wider family')).toContainText('On');
        await row('Whole family').tap();
        await expect(page.locator('#focus-name')).toHaveText('Peter Berg');
        await expectFits(page, 'whole family');
    });

    test('the descendants chart offers Whole family but not Wider family', async ({ page }) => {
        await sampleTree(page);
        await page.evaluate(() => window.Strom.UI.setDisplayViewMode('descendants'));
        await page.locator('#bb-view-more').tap();
        const sheet = page.locator('.bottom-sheet-menu');
        await expect(sheet.locator('.bottom-sheet-item', { hasText: 'Whole family' })).toBeVisible();
        await expect(sheet.locator('.bottom-sheet-item', { hasText: 'Wider family' })).toHaveCount(0);
    });
});
