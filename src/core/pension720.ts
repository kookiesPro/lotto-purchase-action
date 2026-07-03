/* global globalThis */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Dialog, Page } from 'playwright';
import type { BrowserSession } from './browser';
import { PURCHASE_PAGE_READY_TIMEOUT, PURCHASE_RESULT_TIMEOUT, URLS } from './config';
import { InsufficientBalanceError, formatWon } from './errors';
import { getDepositBalance } from './purchase';
import type { Pension720PurchaseResult, Pension720Ticket } from './types';

dayjs.extend(utc);
dayjs.extend(timezone);

const PENSION_720_TICKET_PRICE = 1000;
const PENSION_720_TICKET_COUNT = 5;
const PENSION_720_PURCHASE_AMOUNT = PENSION_720_TICKET_PRICE * PENSION_720_TICKET_COUNT;
const PENSION_720_AUTO_TIMEOUT = 20000;
const PENSION_720_ORDER_TIMEOUT = Math.max(PURCHASE_RESULT_TIMEOUT, 30000);

interface AutoSelectionState {
  autoProcess: string;
  buyCount: string;
  buyNo: string;
  selectedNumber: string;
  setType: string;
  workingFlag: string;
}

interface DialogCollector {
  messages: string[];
  dispose: () => void;
}

interface ParsedPension720Result {
  amount: number;
  failedTicketCount: number;
  failedTickets: Pension720Ticket[];
  message: string;
  orderDate: string;
  orderNo: string;
  round: string;
  saleCount: number;
  tickets: Pension720Ticket[];
}

function validatePension720Amount(amount: number | undefined): number {
  const requestedAmount = amount ?? PENSION_720_PURCHASE_AMOUNT;

  if (requestedAmount !== PENSION_720_PURCHASE_AMOUNT) {
    throw new Error(`현재 연금복권720+ 자동 구매는 모든조 5매(${formatWon(PENSION_720_PURCHASE_AMOUNT)})만 지원합니다`);
  }

  return requestedAmount;
}

function validatePension720Availability(): void {
  const now = dayjs.tz(Date.now(), 'Asia/Seoul');

  // Official internet sales time: Fri-Wed all day, Thu 00:00-17:00 and 22:00-24:00.
  if (now.day() !== 4) {
    return;
  }

  const today = now.hour(0).minute(0).second(0).millisecond(0);
  const pauseStart = today.hour(17);
  const pauseEnd = today.hour(22);

  if (!now.isBefore(pauseStart) && now.isBefore(pauseEnd)) {
    throw new Error('연금복권720+ 구매 가능 시간이 아닙니다 (금~수: 00:00-24:00, 목요일: 00:00-17:00 / 22:00-24:00)');
  }
}

async function validateDepositBalance(session: BrowserSession, requiredAmount: number): Promise<void> {
  const currentBalance = await getDepositBalance(session);

  if (currentBalance < requiredAmount) {
    throw new InsufficientBalanceError({
      currentBalance,
      requiredAmount,
      requestedGames: PENSION_720_TICKET_COUNT
    });
  }

  console.log(`[Pension720] Deposit balance is enough: required ${formatWon(requiredAmount)}`);
}

async function getPension720Diagnostics(page: Page, dialogMessages: string[] = []): Promise<string> {
  const title = await page.title().catch(() => 'unknown');
  const bodySnippet = await page
    .locator('body')
    .innerText()
    .then(text => text.replace(/\s+/g, ' ').slice(0, 300))
    .catch(() => '');
  const dialogs = dialogMessages.length > 0 ? `, dialogs: ${dialogMessages.join(' | ')}` : '';

  return [`URL: ${page.url()}`, `title: ${title}`, `bodySnippet: ${bodySnippet || 'none'}`].join(', ') + dialogs;
}

function createDialogCollector(page: Page): DialogCollector {
  const messages: string[] = [];
  const handler = async (dialog: Dialog) => {
    messages.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept().catch(() => undefined);
  };

  page.on('dialog', handler);

  return {
    messages,
    dispose: () => page.off('dialog', handler)
  };
}

async function waitForPension720PageReady(page: Page): Promise<void> {
  const isReady = await page
    .waitForFunction(
      () => {
        const doc = (globalThis as any).document;
        const win = globalThis as any;

        return (
          Boolean(doc.querySelector('#frm')) &&
          Boolean(doc.querySelector('#frmauto')) &&
          typeof win.doAuto === 'function' &&
          typeof win.doVerify === 'function' &&
          typeof win.doOrder === 'function' &&
          typeof win.checkDeposit === 'function' &&
          typeof win.encrypt === 'function'
        );
      },
      null,
      { timeout: PURCHASE_PAGE_READY_TIMEOUT }
    )
    .then(() => true)
    .catch(() => false);

  if (!isReady) {
    throw new Error(`Failed to load pension720 purchase page (${await getPension720Diagnostics(page)})`);
  }
}

async function waitForPension720Deposit(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const win = globalThis as any;
      if (typeof win.checkDeposit === 'function') {
        win.checkDeposit();
      }
    })
    .catch(() => undefined);

  const depositReady = await page
    .waitForFunction(
      () => {
        const doc = (globalThis as any).document;
        const deposit = Number((doc.querySelector('#curdeposit') as any)?.value || '0');
        return deposit > 0;
      },
      null,
      { timeout: PURCHASE_PAGE_READY_TIMEOUT }
    )
    .then(() => true)
    .catch(() => false);

  if (!depositReady) {
    throw new Error(`연금복권720+ 페이지에서 예치금을 조회하지 못했습니다 (${await getPension720Diagnostics(page)})`);
  }
}

async function openPension720Page(session: BrowserSession): Promise<Page> {
  const page = session.getPage();

  console.log('[Pension720] Navigating to pension720 mobile purchase page');
  await session.navigate(URLS.PENSION_720_MOBILE);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

  if (page.url().includes('/login')) {
    throw new Error('연금복권720+ 구매 페이지 접근 중 로그인 페이지로 이동했습니다');
  }

  await waitForPension720PageReady(page);
  await waitForPension720Deposit(page);

  return page;
}

async function readAutoSelectionState(page: Page): Promise<AutoSelectionState> {
  return page.evaluate(() => {
    const doc = (globalThis as any).document;
    const value = (selector: string) => String((doc.querySelector(selector) as any)?.value || '');

    return {
      autoProcess: value('#auto_process'),
      buyCount: value('#frm input[name="BUY_CNT"]'),
      buyNo: value('#frm input[name="BUY_NO"]'),
      selectedNumber: value('#selnum'),
      setType: value('#set_type'),
      workingFlag: value('#WORKING_FLAG')
    };
  });
}

async function requestAutoSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = globalThis as any;
    const $ = win.$;

    if (typeof win.resetNumber === 'function') {
      win.resetNumber();
    }

    if ($) {
      $('#group_sel0').prop('checked', true).trigger('click');
      $('#set_type').val('SA');
      $('#classnum').val('');
    }

    win.doAuto();
  });
}

async function waitForAutoSelection(page: Page): Promise<AutoSelectionState> {
  await page.waitForFunction(
    () => {
      const doc = (globalThis as any).document;
      const value = (selector: string) => String((doc.querySelector(selector) as any)?.value || '');
      const selectedNumber = value('#selnum');

      return value('#WORKING_FLAG') !== 'true' && value('#auto_process') === 'Y' && /^\d{6}$/.test(selectedNumber);
    },
    null,
    { timeout: PENSION_720_AUTO_TIMEOUT }
  );

  return readAutoSelectionState(page);
}

async function verifyAutoSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    (globalThis as any).doVerify();
  });

  await page.waitForFunction(
    () => {
      const doc = (globalThis as any).document;
      const value = (selector: string) => String((doc.querySelector(selector) as any)?.value || '');
      const buyNo = value('#frm input[name="BUY_NO"]').split(',').filter(Boolean);
      const buySetTypes = value('#frm input[name="BUY_SET_TYPE"]').split(',').filter(Boolean);

      return (
        Number(value('#frm input[name="BUY_CNT"]')) === 5 &&
        buyNo.length === 5 &&
        buySetTypes.length === 5 &&
        buySetTypes.every((setType: string) => setType === 'SA')
      );
    },
    null,
    { timeout: PURCHASE_PAGE_READY_TIMEOUT }
  );
}

async function addPension720AutoTickets(page: Page, dialogMessages: string[]): Promise<void> {
  let lastState: AutoSelectionState | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[Pension720] Requesting all-groups auto number (${attempt}/3)`);

    try {
      await requestAutoSelection(page);
      const state = await waitForAutoSelection(page);
      lastState = state;

      if (state.setType !== 'SA') {
        console.warn(`[Pension720] Auto selection did not return all-groups ticket, retrying (${state.setType})`);
        continue;
      }

      console.log(`[Pension720] Auto number selected for all groups: ${state.selectedNumber}`);
      await verifyAutoSelection(page);
      return;
    } catch (error) {
      lastState = await readAutoSelectionState(page).catch(() => lastState);
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Pension720] Failed to prepare auto tickets on attempt ${attempt}: ${message}`);
    }
  }

  throw new Error(
    `Failed to prepare pension720 all-groups auto tickets (state: ${JSON.stringify(
      lastState
    )}, ${await getPension720Diagnostics(page, dialogMessages)})`
  );
}

async function submitPension720Order(page: Page, dialogMessages: string[]): Promise<void> {
  console.log('[Pension720] Clicking pension720 purchase button');

  await page.evaluate(() => {
    (globalThis as any).doOrder();
  });

  const completed = await page
    .waitForFunction(
      () => {
        const doc = (globalThis as any).document;
        const win = globalThis as any;
        const complete = doc.querySelector('.buyComplete');
        const message = String(doc.querySelector('.saleRetMsg')?.textContent || '').trim();

        return Boolean(complete && win.getComputedStyle(complete).display !== 'none' && message);
      },
      null,
      { timeout: PENSION_720_ORDER_TIMEOUT }
    )
    .then(() => true)
    .catch(() => false);

  if (!completed) {
    throw new Error(
      `Failed to load pension720 purchase results (${await getPension720Diagnostics(page, dialogMessages)})`
    );
  }
}

async function parsePension720Result(page: Page): Promise<ParsedPension720Result> {
  return page.evaluate(() => {
    const doc = (globalThis as any).document;
    const text = (selector: string) =>
      String(doc.querySelector(selector)?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    const numberFromText = (value: string) => Number(value.replace(/[^\d]/g, '')) || 0;
    const parseTickets = (selector: string) =>
      Array.from(doc.querySelectorAll(selector) as any)
        .map((element: any) => {
          const raw = String(element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
          const groupText = String(element.querySelector('.lotto720_popup_group')?.textContent || '')
            .replace(/\s+/g, '')
            .trim();
          const group = groupText.replace(/조$/, '');
          const number = raw.replace(groupText, '').replace(/\s+/g, '').trim();

          return { group, number, raw };
        })
        .filter((ticket: any) => /^\d+$/.test(ticket.group) && /^\d{6}$/.test(ticket.number));

    return {
      amount: numberFromText(text('.orderPay')),
      failedTicketCount: numberFromText(text('.failCnt')),
      failedTickets: parseTickets('.failTicket .lotto720_popup_content_middle_num'),
      message: text('.saleRetMsg'),
      orderDate: text('.orderDate'),
      orderNo: text('.orderNo'),
      round: text('.buyRound'),
      saleCount: numberFromText(text('.saleCnt')),
      tickets: parseTickets('.saleTicket .lotto720_popup_content_middle_num')
    };
  });
}

// Pension Lottery 720+ all-groups auto purchase: 5 tickets, 5,000 KRW.
export async function purchasePension720(session: BrowserSession, amount?: number): Promise<Pension720PurchaseResult> {
  if (!session.isAuthenticated()) {
    throw new Error('Not authenticated. Login first');
  }

  const requestedAmount = validatePension720Amount(amount);
  validatePension720Availability();
  await validateDepositBalance(session, requestedAmount);

  const page = await openPension720Page(session);
  const dialogs = createDialogCollector(page);

  try {
    await addPension720AutoTickets(page, dialogs.messages);
    await submitPension720Order(page, dialogs.messages);

    const parsed = await parsePension720Result(page);
    const ticketCount = parsed.saleCount || parsed.tickets.length;
    const actualAmount = parsed.amount || ticketCount * PENSION_720_TICKET_PRICE;

    if (parsed.tickets.length === 0) {
      throw new Error(
        `연금복권720+ 구매 결과에 성공 티켓이 없습니다 (${
          parsed.message || 'no message'
        }, ${await getPension720Diagnostics(page, dialogs.messages)})`
      );
    }

    if (ticketCount !== PENSION_720_TICKET_COUNT) {
      console.warn(`[Pension720] Purchase completed partially: ${ticketCount}/${PENSION_720_TICKET_COUNT} tickets`);
    }

    const result: Pension720PurchaseResult = {
      product: 'pension720',
      type: 'auto',
      round: parsed.round || undefined,
      orderNo: parsed.orderNo || undefined,
      orderDate: parsed.orderDate || undefined,
      amount: actualAmount,
      ticketCount,
      tickets: parsed.tickets,
      failedTicketCount: parsed.failedTicketCount || undefined,
      failedTickets: parsed.failedTickets.length > 0 ? parsed.failedTickets : undefined,
      message: parsed.message || undefined
    };

    console.log('[Pension720] Purchase completed:', result);
    return result;
  } finally {
    dialogs.dispose();
  }
}
