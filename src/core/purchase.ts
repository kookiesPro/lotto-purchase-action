import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Page } from 'playwright';
import type { BrowserSession } from './browser';
import { GOTO_TIMEOUT, PURCHASE_PAGE_READY_TIMEOUT, PURCHASE_RESULT_TIMEOUT, URLS, SELECTORS } from './config';
import { InsufficientBalanceError, formatWon } from './errors';

dayjs.extend(utc);
dayjs.extend(timezone);

const LOTTO_GAME_PRICE = 1000;

// Validate purchase availability (time-based)
function validatePurchaseAvailability(): void {
  const now = dayjs.tz(Date.now(), 'Asia/Seoul');
  const isSaturday = now.day() === 6;

  const resetTime = (d: dayjs.Dayjs) => d.hour(0).minute(0).second(0).millisecond(0);
  const openingTime = resetTime(dayjs.tz(Date.now(), 'Asia/Seoul')).hour(6);
  const closingTime = isSaturday
    ? resetTime(dayjs.tz(Date.now(), 'Asia/Seoul')).hour(20)
    : resetTime(dayjs.tz(Date.now(), 'Asia/Seoul')).hour(24);

  if (now.isBefore(openingTime) || now.isAfter(closingTime)) {
    throw new Error('구매 가능 시간이 아닙니다 (평일/일요일: 06:00-24:00, 토요일: 06:00-20:00)');
  }
}

async function waitForVisible(page: Page, selector: string, timeout: number): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function dismissEnvironmentAlert(page: Page): Promise<void> {
  const alertConfirm = page.locator(SELECTORS.ENVIRONMENT_ALERT_CONFIRM).first();
  const isVisible = await alertConfirm.isVisible({ timeout: 2000 }).catch(() => false);

  if (!isVisible) {
    return;
  }

  console.log('[Purchase] Closing environment alert');
  await alertConfirm.click().catch(() => undefined);
  await page.waitForTimeout(500);
}

async function getPurchaseDiagnostics(page: Page): Promise<string> {
  const title = await page.title().catch(() => 'unknown');
  const bodySnippet = await page
    .locator('body')
    .innerText()
    .then(text => text.replace(/\s+/g, ' ').slice(0, 300))
    .catch(() => '');

  return [`URL: ${page.url()}`, `title: ${title}`, `bodySnippet: ${bodySnippet || 'none'}`].join(', ');
}

function parseWon(value: string): number | null {
  const normalized = value.replace(/[^\d]/g, '');
  if (!normalized) {
    return null;
  }

  return Number(normalized);
}

function parseDepositBalance(text: string): number | null {
  const normalized = text.replace(/\s+/g, ' ');
  const patterns = [
    /예치금\s*잔액\s*[:：]?\s*([\d,]+)\s*원/,
    /보유\s*예치금\s*[:：]?\s*([\d,]+)\s*원/,
    /예치금\s*[:：]?\s*([\d,]+)\s*원/,
    /잔액\s*[:：]?\s*([\d,]+)\s*원/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const parsed = match?.[1] ? parseWon(match[1]) : null;
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

async function readDepositBalance(page: Page): Promise<number | null> {
  const depositAmountText = await page
    .locator('.myPage-deposit-info.grid-item02 .deposit-box01 #totalAmt')
    .first()
    .innerText({ timeout: 5000 })
    .catch(() => '');
  const depositAmount = parseWon(depositAmountText);
  if (depositAmount !== null) {
    return depositAmount;
  }

  const depositBoxText = await page
    .locator('.myPage-deposit-info.grid-item02 .deposit-box01')
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => '');
  const depositBoxAmount = parseDepositBalance(depositBoxText);
  if (depositBoxAmount !== null) {
    return depositBoxAmount;
  }

  const candidateSelectors = [
    '[id*="deposit" i]',
    '[class*="deposit" i]',
    '[id*="balance" i]',
    '[class*="balance" i]',
    '[id*="money" i]',
    '[class*="money" i]'
  ];

  for (const selector of candidateSelectors) {
    const text = await page
      .locator(selector)
      .first()
      .innerText({ timeout: 1000 })
      .catch(() => '');
    const parsed = parseDepositBalance(text);
    if (parsed !== null) {
      return parsed;
    }
  }

  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');

  return parseDepositBalance(bodyText);
}

export async function getDepositBalance(session: BrowserSession): Promise<number> {
  const page = session.getPage();

  console.log('[Purchase] Checking deposit balance');
  await session.navigate(URLS.MYPAGE_HOME);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

  if (page.url().includes('/login')) {
    throw new Error('예치금 확인 실패: 마이페이지 접근 중 로그인 페이지로 이동했습니다');
  }

  const balance = await readDepositBalance(page);
  if (balance === null || Number.isNaN(balance)) {
    throw new Error(
      `예치금 확인 실패: 마이페이지에서 예치금 잔액을 찾지 못했습니다 (${await getPurchaseDiagnostics(page)})`
    );
  }

  console.log(`[Purchase] Current deposit balance: ${formatWon(balance)}`);
  return balance;
}

async function validateDepositBalance(session: BrowserSession, requestedGames: number): Promise<void> {
  const requiredAmount = requestedGames * LOTTO_GAME_PRICE;
  const currentBalance = await getDepositBalance(session);

  if (currentBalance < requiredAmount) {
    throw new InsufficientBalanceError({
      currentBalance,
      requiredAmount,
      requestedGames
    });
  }

  console.log(`[Purchase] Deposit balance is enough: required ${formatWon(requiredAmount)}`);
}

async function openPurchasePage(session: BrowserSession, mode: 'auto' | 'manual'): Promise<Page> {
  const page = session.getPage();
  const readySelector = mode === 'manual' ? SELECTORS.NUMBER_CHECKBOX(1) : SELECTORS.PURCHASE_TYPE_RANDOM_BTN;

  console.log('[Purchase] Navigating to lotto game page');
  await session.navigate(URLS.LOTTO_645);

  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    await dismissEnvironmentAlert(page);

    if (mode === 'manual') {
      console.log('[Purchase] Switching to mixed selection tab');
      await page.click(SELECTORS.PURCHASE_TYPE_MIXED_BTN).catch(() => undefined);
    }

    const isReady = await waitForVisible(page, readySelector, PURCHASE_PAGE_READY_TIMEOUT);
    if (isReady) {
      return page;
    }

    if (attempt < 2) {
      console.warn(`[Purchase] Purchase page not ready for ${mode} mode, retrying once`);
      await page.reload({ waitUntil: 'load', timeout: GOTO_TIMEOUT });
    }
  }

  throw new Error(`Failed to load purchase page for ${mode} mode (${await getPurchaseDiagnostics(page)})`);
}

async function waitForPurchaseResults(page: Page): Promise<void> {
  const loaded = await waitForVisible(page, SELECTORS.PURCHASE_NUMBER_LIST, PURCHASE_RESULT_TIMEOUT);
  if (!loaded) {
    throw new Error(`Failed to load purchase results (${await getPurchaseDiagnostics(page)})`);
  }
}

// Auto purchase function
export async function purchaseAuto(session: BrowserSession, amount: number): Promise<number[][]> {
  if (!session.isAuthenticated()) {
    throw new Error('Not authenticated. Login first');
  }

  // Validate amount
  amount = Math.max(1, Math.min(5, amount));

  // Validate purchase time
  validatePurchaseAvailability();
  await validateDepositBalance(session, amount);

  const page = await openPurchasePage(session, 'auto');

  // Click auto purchase button
  console.log('[Purchase] Clicking auto purchase button');
  await page.click(SELECTORS.PURCHASE_TYPE_RANDOM_BTN);

  // Select amount
  console.log(`[Purchase] Selecting amount: ${amount}`);
  await page.selectOption(SELECTORS.PURCHASE_AMOUNT_SELECT, String(amount));
  await page.click(SELECTORS.PURCHASE_AMOUNT_CONFIRM_BTN);

  // Purchase
  console.log('[Purchase] Clicking purchase button');
  await page.click(SELECTORS.PURCHASE_BTN);
  await page.click(SELECTORS.PURCHASE_CONFIRM_BTN);

  // Wait for results
  console.log('[Purchase] Waiting for purchase results');
  await waitForPurchaseResults(page);

  // Parse results
  const result = await page.$$eval(SELECTORS.PURCHASE_NUMBER_LIST, elems => {
    return elems.map(it => Array.from(it.children).map(child => Number((child as any).innerHTML)));
  });

  if (result.length === 0 || result.some(nums => nums.length === 0)) {
    throw new Error('Failed to parse purchase results');
  }

  console.log('[Purchase] Auto purchase completed:', result);
  return result;
}

// Manual purchase function
export async function purchaseManual(session: BrowserSession, numbers: number[][]): Promise<number[][]> {
  if (!session.isAuthenticated()) {
    throw new Error('Not authenticated. Login first');
  }

  // Validate input
  if (numbers.length === 0 || numbers.length > 5) {
    throw new Error('1~5개의 게임만 구매 가능합니다');
  }

  numbers.forEach((nums, idx) => {
    if (nums.length !== 6) {
      throw new Error(`게임 ${idx + 1}: 6개의 번호를 선택해야 합니다`);
    }
    nums.forEach(num => {
      if (num < 1 || num > 45 || !Number.isInteger(num)) {
        throw new Error(`게임 ${idx + 1}: 1~45 사이의 정수만 가능합니다`);
      }
    });
    if (new Set(nums).size !== 6) {
      throw new Error(`게임 ${idx + 1}: 중복된 번호가 있습니다`);
    }
  });

  // Validate purchase time
  validatePurchaseAvailability();
  await validateDepositBalance(session, numbers.length);

  const page = await openPurchasePage(session, 'manual');

  // Select numbers for each game
  for (let gameIdx = 0; gameIdx < numbers.length; gameIdx++) {
    const gameNumbers = numbers[gameIdx]!;
    console.log(`[Purchase] Selecting numbers for game ${gameIdx + 1}:`, gameNumbers);

    // Click each number
    for (const num of gameNumbers) {
      await page
        .locator(SELECTORS.NUMBER_CHECKBOX(num))
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await page.click(SELECTORS.NUMBER_CHECKBOX(num));
      await page.waitForTimeout(1000); // Wait between clicks
    }

    // Set amount to 1
    await page.selectOption(SELECTORS.PURCHASE_AMOUNT_SELECT, '1');

    // Confirm selection
    await page.click(SELECTORS.PURCHASE_AMOUNT_CONFIRM_BTN);
    await page.waitForTimeout(500);

    const slotLabels = ['A', 'B', 'C', 'D', 'E'];
    console.log(`[Purchase] Game ${gameIdx + 1} added to slot ${slotLabels[gameIdx]}`);
  }

  // Purchase
  console.log('[Purchase] Clicking purchase button');
  await page.click(SELECTORS.PURCHASE_BTN);
  await page.click(SELECTORS.PURCHASE_CONFIRM_BTN);

  // Wait for results
  console.log('[Purchase] Waiting for purchase results');
  await waitForPurchaseResults(page);

  // Parse results
  const result = await page.$$eval(SELECTORS.PURCHASE_NUMBER_LIST, elems => {
    return elems.map(it => Array.from(it.children).map(child => Number((child as any).innerHTML)));
  });

  if (result.length === 0 || result.some(nums => nums.length === 0 || nums.some(n => Number.isNaN(n)))) {
    throw new Error('Failed to parse purchase results');
  }

  console.log('[Purchase] Manual purchase completed:', result);
  return result;
}
