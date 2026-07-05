import * as core from '@actions/core';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { BrowserSession } from './core/browser';
import { purchasePension720 } from './core/pension720';
import { getDepositBalance, purchaseAuto, purchaseManual } from './core/purchase';
import { isInsufficientBalanceError } from './core/errors';
import type { Pension720PurchaseResult, PurchaseMetadata } from './core/types';
import { generateExcluding } from './utils/numbers';
import { initLabels, createConsolidatedIssue, createPurchaseFailureIssue, checkWinningIssues } from './github/issues';
import { notifyPurchase, notifyPurchaseFailure, notifyWinning } from './telegram/notify';

interface WorkflowApi {
  purchaseAuto: (amount: number) => Promise<number[][]>;
  purchaseManual: (numbers: number[][]) => Promise<number[][]>;
  purchasePension720: (amount?: number) => Promise<Pension720PurchaseResult>;
  generateExcluding: (exclude: number[][], count: number) => number[][];
}

type CustomWorkflow = (api: WorkflowApi) => Promise<unknown> | unknown;

interface PurchaseStepFailure {
  label: string;
  error: unknown;
  message: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reportPurchaseFailure(error: unknown, message: string, label = '복권 구매'): Promise<void> {
  const details = isInsufficientBalanceError(error) ? error.details : undefined;

  try {
    await createPurchaseFailureIssue(details, message, label);
  } catch (issueError) {
    console.error('[Main] Failed to create purchase failure issue:', issueError);
  }

  try {
    await notifyPurchaseFailure(details, message, label);
  } catch (telegramError) {
    console.error('[Main] Failed to notify purchase failure via Telegram:', telegramError);
  }
}

function recordPurchaseStepFailure(label: string, error: unknown, failures: PurchaseStepFailure[]): void {
  const message = getErrorMessage(error);
  failures.push({ label, error, message });
  console.warn(`[Main] ${label} failed: ${message}`);
}

async function trackPurchaseStep<T>(
  label: string,
  task: () => Promise<T>,
  failures: PurchaseStepFailure[]
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    recordPurchaseStepFailure(label, error, failures);
    throw error;
  }
}

async function attemptPurchaseStep<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
  try {
    return await task();
  } catch (error) {
    console.warn(`[Main] ${label} failed, continuing with next purchase step: ${getErrorMessage(error)}`);
    return undefined;
  }
}

async function attachRemainingBalance(session: BrowserSession, purchases: PurchaseMetadata[]): Promise<void> {
  const latestPurchase = purchases[purchases.length - 1];
  if (!latestPurchase) {
    return;
  }

  try {
    latestPurchase.remainingBalance = await getDepositBalance(session);
    latestPurchase.balanceCheckedAt = new Date().toISOString();
    console.log(`[Main] Remaining deposit balance checked: ${latestPurchase.remainingBalance}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    latestPurchase.balanceCheckError = message;
    console.warn('[Main] Failed to check remaining deposit balance after purchase:', message);
  }
}

async function loadWorkflow(workflowFile: string): Promise<CustomWorkflow> {
  const resolvedPath = path.resolve(process.cwd(), workflowFile);

  try {
    const workflowModule = await import(pathToFileURL(resolvedPath).href);
    const workflow = workflowModule.default;

    if (typeof workflow !== 'function') {
      throw new Error(
        `[Main] Invalid custom workflow export in "${workflowFile}". ` +
          `Expected default export function.\n` +
          `- ESM (.js/.mjs): export default async (api) => {}\n` +
          `- CJS (.cjs): module.exports = async (api) => {}`
      );
    }

    return workflow as CustomWorkflow;
  } catch (error) {
    if (error instanceof Error && error.message.includes('module is not defined in ES module scope')) {
      throw new Error(
        `[Main] Invalid custom workflow module format in "${workflowFile}".\n` +
          `Detected CommonJS syntax (module.exports) in a .js file under an ESM package.\n` +
          `Choose one of the following:\n` +
          `1) Keep .js and switch to ESM: export default async (api) => {}\n` +
          `2) Keep CommonJS and rename file to .cjs: module.exports = async (api) => {}`
      );
    }

    throw error;
  }
}

async function run() {
  const session = new BrowserSession();
  const purchases: PurchaseMetadata[] = []; // Track all successful purchases
  const purchaseFailures: PurchaseStepFailure[] = [];
  let purchaseWorkflowStarted = false;

  try {
    // Get inputs
    const id = core.getInput('dhlottery-id', { required: true });
    const pwd = core.getInput('dhlottery-password', { required: true });
    const amount = parseInt(core.getInput('game-count') || '5');
    const workflowFile = core.getInput('workflow-file');

    console.log('[Main] Starting lotto purchase action');

    // Initialize browser and login
    console.log('[Main] Initializing browser session');
    await session.init({
      headless: true,
      args: ['--no-sandbox']
    });

    console.log('[Main] Logging in');
    await session.login(id, pwd);

    // Initialize GitHub labels
    console.log('[Main] Initializing GitHub labels');
    await initLabels();

    // Check previous purchases for winning
    console.log('[Main] Checking winning for previous purchases');
    const winningResults = await checkWinningIssues();

    // Send Telegram notifications for winning results
    for (const result of winningResults) {
      await notifyWinning(result.issueNumber, result.round, result.ranks);
    }

    // Create API with session bound to functions (no need to pass session manually)
    const api: WorkflowApi = {
      purchaseAuto: async (amt: number) => {
        return trackPurchaseStep(
          `로또645 자동 구매 ${amt}게임`,
          async () => {
            console.log(`[Main] Executing auto purchase: ${amt} games`);
            const result = await purchaseAuto(session, amt);
            purchases.push({
              product: 'lotto645',
              type: 'auto',
              numbers: result,
              timestamp: new Date().toISOString()
            }); // Auto-track successful purchase
            console.log(`[Main] Auto purchase successful: ${result.length} games`);
            return result;
          },
          purchaseFailures
        );
      },
      purchaseManual: async (numbers: number[][]) => {
        return trackPurchaseStep(
          `로또645 수동 구매 ${numbers.length}게임`,
          async () => {
            console.log(`[Main] Executing manual purchase: ${numbers.length} games`);
            const result = await purchaseManual(session, numbers);
            purchases.push({
              product: 'lotto645',
              type: 'manual',
              numbers: result,
              timestamp: new Date().toISOString()
            }); // Auto-track successful purchase
            console.log(`[Main] Manual purchase successful: ${result.length} games`);
            return result;
          },
          purchaseFailures
        );
      },
      purchasePension720: async (amt?: number) => {
        return trackPurchaseStep(
          `연금복권720+ 구매`,
          async () => {
            console.log(`[Main] Executing pension720 purchase: ${amt ?? 5000} KRW`);
            const result = await purchasePension720(session, amt);
            purchases.push({
              ...result,
              timestamp: new Date().toISOString()
            });
            console.log(`[Main] Pension720 purchase successful: ${result.ticketCount} tickets`);
            return result;
          },
          purchaseFailures
        );
      },
      generateExcluding: (exclude: number[][], count: number) => {
        console.log(`[Main] Generating ${count} games excluding ${exclude.length} sets`);
        return generateExcluding(exclude, count);
      }
    };

    // Execute user workflow
    if (workflowFile) {
      console.log(`[Main] Loading custom workflow from: ${workflowFile}`);
      const workflow = await loadWorkflow(workflowFile);
      purchaseWorkflowStarted = true;
      await workflow(api);
      console.log('[Main] Custom workflow completed');
    } else {
      // Default: lotto auto purchase plus pension720 all-groups auto purchase.
      console.log(`[Main] Running default auto purchase: ${amount} games`);
      purchaseWorkflowStarted = true;
      await attemptPurchaseStep(`로또 자동 구매 ${amount}게임`, () => api.purchaseAuto(amount));
      await attemptPurchaseStep('연금복권720+ 구매', () => api.purchasePension720());
    }

    console.log(`[Main] All purchases completed: ${purchases.length} total purchases`);
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('[Main] Workflow error:', message);

    if (purchaseWorkflowStarted) {
      core.warning(`복권 구매 실패: ${message}`);
      if (purchaseFailures.length === 0) {
        await reportPurchaseFailure(error, message);
      } else {
        console.log(`[Main] Purchase step failures will be reported individually: ${purchaseFailures.length}`);
      }
    } else {
      core.setFailed(message);
    }
    // Continue to create issues for successful purchases
  } finally {
    for (const failure of purchaseFailures) {
      await reportPurchaseFailure(failure.error, failure.message, failure.label);
    }

    // Create one consolidated issue for all successful purchases
    if (purchases.length > 0) {
      try {
        await attachRemainingBalance(session, purchases);
        await createConsolidatedIssue(purchases);
        const totalLottoGames = purchases.reduce(
          (sum, p) => sum + (p.product === 'lotto645' ? p.numbers.length : 0),
          0
        );
        const totalPensionTickets = purchases.reduce(
          (sum, p) => sum + (p.product === 'pension720' ? p.ticketCount : 0),
          0
        );
        console.log(
          `[Main] Processed ${purchases.length} purchases (${totalLottoGames} lotto games, ${totalPensionTickets} pension720 tickets)`
        );

        // Send Telegram notification for purchases
        await notifyPurchase(purchases);
      } catch (error) {
        console.error(`[Main] Failed to create consolidated issue:`, error);
      }
    } else {
      console.log(`[Main] No successful purchases to create issue`);
    }

    // Close browser session
    console.log('[Main] Closing browser session');
    await session.close();

    console.log('[Main] Action completed');
  }
}

run();
