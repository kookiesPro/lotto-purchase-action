# 🎰 동행복권 로또 자동구매

**실제 동행복권 계정으로 로또 6/45와 연금복권720+를 자동 구매하는 GitHub Action입니다.**

매주 정해진 시간에 GitHub Actions가 실행되어, 실제 동행복권 사이트에 로그인하고 로또와 연금복권720+를 구매합니다. 로또 구매 결과는 [GitHub Issue](https://github.com/kkd927/lotto-purchase-action/issues/1)로 기록되며, 추첨 후 당첨 여부도 자동으로 확인됩니다. 연금복권720+ 구매 결과는 텔레그램 알림에 함께 포함됩니다.

## ✨ 주요 기능

| 기능 | 설명 |
| --- | --- |
| 🤖 **자동번호 구매** | 게임 수만 정하면 번호는 자동 생성 |
| ✍️ **수동번호 구매** | 내가 원하는 번호를 직접 지정해서 구매 |
| 🔀 **자동 + 수동 조합** | 한 번에 자동과 수동을 섞어서 구매 |
| 🎫 **연금복권720+ 구매** | 모든조 자동번호 5매(5,000원) 구매 |
| 🧩 **커스텀 로직** | JS 파일 하나로 나만의 구매 전략을 자유롭게 작성 |
| 💡 **AI 연동** | Gemini API로 추천 번호를 받아 구매하는 예제 포함 |
| 📋 **결과 기록** | 구매 내역이 GitHub Issue에 자동 정리 ([예시](https://github.com/kkd927/lotto-purchase-action/issues/1)) |
| 🔔 **텔레그램 알림** | 구매/당첨 결과를 텔레그램으로 알림 (선택) |

## 🚀 바로 시작

> **⚠️ 동행복권 예치금이 미리 충전되어 있어야 구매가 진행됩니다.**
> 예치금이 없으면 워크플로우는 실행되지만 구매에 실패합니다.

### 방법 1: Fork (가장 간단)

> **📢 참고**: Fork한 저장소는 **public**이므로, **구매 이력(GitHub Issue)이 누구나 볼 수 있습니다.**
> 구매 이력을 비공개로 유지하고 싶다면 아래 **방법 2**를 사용하세요.

1. 이 저장소를 **Fork**합니다.
2. Fork한 저장소의 **Actions** 탭에서 **I understand my workflows, go ahead and enable them**을 눌러 활성화합니다.
3. **Settings > Secrets and variables > Actions > Repository secrets**에서 **New repository secret** 버튼을 눌러 시크릿을 추가합니다. (아래 표 참고)
4. **Actions** 탭에서 `lotto-purchase.yml`의 **Enable workflow**를 누릅니다.
5. 바로 테스트하려면 **Run workflow**를 누릅니다.

### 방법 2: Clone → 내 Private 저장소로 Push

구매 이력을 비공개로 유지하고 싶다면 이 방법을 추천합니다.

1. GitHub에서 **New Repository**를 만들고 **Private**을 선택합니다. (README 추가 체크 해제)
2. 아래 명령어를 실행합니다.

```bash
git clone https://github.com/kkd927/lotto-purchase-action.git
cd lotto-purchase-action

# 위에서 만든 private 저장소로 remote 변경
git remote set-url origin https://github.com/<내-계정>/<내-저장소>.git
git push -u origin main
```

이후 설정은 Fork 방식과 동일합니다. (시크릿 추가 → 워크플로우 활성화)

> **💡 Tip**: Private 저장소의 GitHub Actions는 월 무료 한도(2,000분)가 적용됩니다.
> 이 워크플로우는 1회 실행에 약 1~2분이므로, 매주 실행해도 충분합니다.

### 시크릿 설정

**Settings > Secrets and variables > Actions > Repository secrets > New repository secret** 버튼을 눌러 아래 항목을 하나씩 추가합니다.

| Name | 필수 여부 | 설명 |
| --- | :---: | --- |
| `DHLOTTERY_ID` | ✅ 필수 | 동행복권 로그인 아이디 |
| `DHLOTTERY_PASSWORD` | ✅ 필수 | 동행복권 로그인 비밀번호 |
| `TELEGRAM_BOT_TOKEN` | 선택 | 알림용 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 선택 | 알림용 텔레그램 채팅 ID |

> **💡 참고**: `GITHUB_TOKEN`은 GitHub가 자동으로 제공하므로 직접 추가할 필요가 없습니다.

## 🔒 비밀번호는 안전한가요?

**안전합니다.** 동행복권 아이디와 비밀번호는 [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)에 저장됩니다.

- Secrets는 **암호화**되어 저장되며, 한 번 등록하면 누구도 다시 볼 수 없습니다.
- 워크플로우 실행 로그에서도 `***`로 자동 마스킹되어 **절대 노출되지 않습니다.**
- Fork한 다른 사람도, 저장소 관리자 본인도 등록된 값을 확인할 수 없습니다.

자세한 보안 정책은 [SECURITY.md](./SECURITY.md)를 참고하세요.

## 🛠️ 워크플로우 예제

기본 워크플로우는 [lotto-purchase.yml](./.github/workflows/lotto-purchase.yml)에 포함되어 있습니다. `workflow-file` 한 줄만 바꿔서 다양한 예제를 실행할 수 있습니다.

```yaml
workflow-file: custom-workflows/01-auto-basic.js
# workflow-file: custom-workflows/02-manual-fixed-numbers.js
# workflow-file: custom-workflows/03-auto-plus-manual.js
```

| 예제 | 설명 |
| --- | --- |
| `01-auto-basic.js` | 로또 자동 5게임 + 연금복권720+ 5매 구매 |
| `02-manual-fixed-numbers.js` | 고정 번호 수동 구매 |
| `03-auto-plus-manual.js` | 자동 + 수동 조합 구매 |
| `04-gemini-recommendation.js` | Gemini API 추천 번호 구매 |

<details>
<summary><b>나만의 구매 전략 만들기</b></summary>

`purchaseAuto`, `purchaseManual`, `purchasePension720` API를 조합하면 어떤 전략이든 JS로 작성할 수 있습니다.

```javascript
// 예: 자동 3게임 + 고정번호 수동 2게임
export default async ({ purchaseAuto, purchaseManual }) => {
  await purchaseAuto(3);
  await purchaseManual([
    [3, 11, 19, 25, 33, 42],
    [7, 14, 21, 28, 35, 40],
  ]);
};
```

```javascript
// 예: 로또 자동 5게임 + 연금복권720+ 5매
export default async ({ purchaseAuto, purchasePension720 }) => {
  await purchaseAuto(5);
  await purchasePension720();
};
```

더 많은 예제와 API 설명은 [custom-workflows/README.md](./custom-workflows/README.md)를 참고하세요.

</details>

## 🔗 링크

- 커스텀 워크플로우 가이드: [custom-workflows/README.md](./custom-workflows/README.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 보안 정책: [SECURITY.md](./SECURITY.md)
- 라이선스: MIT
