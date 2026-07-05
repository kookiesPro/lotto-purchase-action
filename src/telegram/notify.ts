import { isEnabled, sendMessage } from './client';
import { getCheckWinningLink } from '../utils/winning';
import { getNextLottoRound } from '../utils/rounds';
import { formatWon, type InsufficientBalanceDetails } from '../core/errors';
import { URLS } from '../core/config';
import type { LottoPurchaseMetadata, Pension720PurchaseMetadata, PurchaseMetadata } from '../core/types';

function getBalanceFeedback(purchases: PurchaseMetadata[]): string | null {
  for (let index = purchases.length - 1; index >= 0; index--) {
    const checkedPurchase = purchases[index]!;

    if (checkedPurchase.remainingBalance === undefined && checkedPurchase.balanceCheckError === undefined) {
      continue;
    }

    if (checkedPurchase.remainingBalance !== undefined) {
      return `잔여 예치금: ${formatWon(checkedPurchase.remainingBalance)}`;
    }

    return '잔여 예치금: 확인 실패';
  }

  return null;
}

// Send purchase notification to Telegram
export async function notifyPurchase(purchases: PurchaseMetadata[]): Promise<void> {
  if (!isEnabled()) return;

  const round = getNextLottoRound();
  const lottoPurchases = purchases.filter(
    (purchase): purchase is LottoPurchaseMetadata => purchase.product === 'lotto645'
  );
  const pensionPurchases = purchases.filter(
    (purchase): purchase is Pension720PurchaseMetadata => purchase.product === 'pension720'
  );
  const totalLottoGames = lottoPurchases.reduce((sum, p) => sum + p.numbers.length, 0);
  const totalPensionTickets = pensionPurchases.reduce((sum, p) => sum + p.ticketCount, 0);
  const totalPensionAmount = pensionPurchases.reduce((sum, p) => sum + p.amount, 0);
  const balanceFeedback = getBalanceFeedback(purchases);

  const lottoSections = lottoPurchases.map((purchase, index) => {
    const typeLabel = purchase.type === 'auto' ? '자동' : '수동';
    const link = getCheckWinningLink(purchase.numbers, round);
    const numbersText = purchase.numbers.map((nums, i) => `  ${i + 1}. \`${nums.join(', ')}\``).join('\n');

    return `*로또 #${index + 1} (${typeLabel})*\n${numbersText}\n[당첨확인](${link})`;
  });

  const pensionSections = pensionPurchases.map((purchase, index) => {
    const roundText = purchase.round ? `회차: ${purchase.round}회\n` : '';
    const orderText = purchase.orderNo ? `거래번호: \`${purchase.orderNo}\`\n` : '';
    const ticketsText = purchase.tickets
      .map((ticket, ticketIndex) => `  ${ticketIndex + 1}. \`${ticket.group}조 ${ticket.number}\``)
      .join('\n');
    const failedText =
      purchase.failedTicketCount && purchase.failedTicketCount > 0 ? `\n실패: ${purchase.failedTicketCount}매` : '';

    return (
      `*연금복권720+ #${index + 1} (자동)*\n` +
      `${roundText}` +
      `구매금액: ${formatWon(purchase.amount)} / ${purchase.ticketCount}매\n` +
      `${orderText}` +
      `${ticketsText}${failedText}\n` +
      `[구매내역 보기](${URLS.PENSION_720_LEDGER})`
    );
  });

  const summary = [
    totalLottoGames > 0 ? `로또645: ${totalLottoGames}게임` : null,
    totalPensionTickets > 0 ? `연금복권720+: ${totalPensionTickets}매 (${formatWon(totalPensionAmount)})` : null,
    balanceFeedback
  ]
    .filter(Boolean)
    .join('\n');
  const sections = [...lottoSections, ...pensionSections];
  const title =
    totalLottoGames > 0 && totalPensionTickets > 0
      ? `🎰 *복권 구매 완료*`
      : totalLottoGames > 0
      ? `🎰 *제${round}회 로또 구매 완료*`
      : `🎰 *연금복권720+ 구매 완료*`;
  const message = `${title}\n${summary}\n\n${sections.join('\n\n')}`;

  console.log('[Telegram] Sending purchase notification');
  await sendMessage(message);
}

// Send winning notification to Telegram (only when there are winners)
export async function notifyWinning(issueNumber: number, round: number, ranks: number[]): Promise<void> {
  if (!isEnabled()) return;

  const winningGames = ranks.map((rank, index) => ({ rank, game: index + 1 })).filter(r => r.rank > 0);

  if (winningGames.length === 0) return;

  const rankEmojis = ['', '🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const results = winningGames.map(g => `  ${rankEmojis[g.rank]} ${g.game}번 게임: ${g.rank}등 당첨!`).join('\n');

  const message = `🎉 *제${round}회 당첨!*\n\n` + `${results}\n\n` + `Issue #${issueNumber}`;

  console.log('[Telegram] Sending winning notification');
  await sendMessage(message);
}

// Send purchase failure notification to Telegram
export async function notifyPurchaseFailure(
  details: InsufficientBalanceDetails | undefined,
  message: string,
  label = '복권 구매'
): Promise<void> {
  if (!isEnabled()) return;

  const amountFeedback = details
    ? `\n\n` +
      `현재 예치금: ${formatWon(details.currentBalance)}\n` +
      `필요 금액: ${formatWon(details.requiredAmount)}\n` +
      `부족 금액: ${formatWon(details.shortage)}`
    : '';
  const notification =
    `⚠️ *${label} 실패*\n\n` +
    `구매가 완료되지 않았습니다.\n\n` +
    `사유: ${message}` +
    amountFeedback +
    `\n\nGitHub Actions는 실패 처리하지 않고 정상 종료했습니다.`;

  console.log('[Telegram] Sending purchase failure notification');
  await sendMessage(notification);
}
