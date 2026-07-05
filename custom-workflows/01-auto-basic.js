/**
 * 01. 자동 구매 기본 예제
 *
 * 가장 먼저 실행해보기 좋은 예제입니다.
 * 설정한 게임 수만큼 로또를 자동 구매하고, 연금복권720+도 5,000원 구매합니다.
 * 이 실행이 끝나면 구매 결과는 GitHub Issue 1개로 정리됩니다.
 */

const GAME_COUNT = 5;

export default async ({ purchaseAuto, purchasePension720 }) => {
  console.log('=== 01-auto-basic 시작 ===');
  const failures = [];

  console.log(`로또 자동 구매 ${GAME_COUNT}게임을 진행합니다.`);
  try {
    const lottoPurchased = await purchaseAuto(GAME_COUNT);
    console.log('로또 구매 완료:', lottoPurchased);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name: '로또 자동 구매', error, message });
    console.warn(`로또 구매 실패, 연금복권720+ 구매를 계속 진행합니다: ${message}`);
  }

  try {
    const pensionPurchased = await purchasePension720();
    console.log('연금복권720+ 구매 완료:', pensionPurchased);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name: '연금복권720+ 구매', error, message });
    console.warn(`연금복권720+ 구매 실패: ${message}`);
  }

  if (failures.length > 0) {
    console.warn(`구매 단계 ${failures.length}개가 실패했습니다. 실패 알림은 각 구매 단계별로 별도 발송됩니다.`);
  }
};
