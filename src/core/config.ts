// URLs for DH Lottery website
export const URLS = {
  MAIN: 'https://www.dhlottery.co.kr/main',
  LOGIN: 'https://www.dhlottery.co.kr/login',
  LOGOUT: 'https://www.dhlottery.co.kr/logout.do',
  PASSWORD_CHANGE_NOTICE: 'https://www.dhlottery.co.kr/mbrsrvc/ExpryPswdNoti',
  MYPAGE_HOME: 'https://www.dhlottery.co.kr/mypage/home',
  LOTTO_645: 'https://ol.dhlottery.co.kr/olotto/game/game645.do',
  PENSION_720_MOBILE: 'https://el.dhlottery.co.kr/game_mobile/pension720/game.jsp',
  PENSION_720_LEDGER: 'https://www.dhlottery.co.kr/mypage/mylotteryledger?lottoId=LP72',
  CHECK_WINNING: 'https://www.dhlottery.co.kr/qr.do'
};

// DOM selectors for Playwright automation
export const SELECTORS = {
  // Login
  ID_INPUT: '#inpUserId',
  PWD_INPUT: '#inpUserPswdEncn',
  LOGIN_BUTTON: '#btnLogin',
  LOGIN_ERROR_POPUP: '.msgPop[role="alertdialog"]',

  // Purchase page
  ENVIRONMENT_ALERT_CONFIRM: 'input[value="확인"][onclick="javascript:closepopupLayerAlert();"]',
  PURCHASE_TYPE_MIXED_BTN: 'a[href="#divWay2Buy1"]#num1',
  PURCHASE_TYPE_RANDOM_BTN: 'a[href="#divWay2Buy1"]#num2',
  PURCHASE_AMOUNT_SELECT: 'select#amoundApply',
  PURCHASE_AMOUNT_CONFIRM_BTN: 'input[value="확인"]#btnSelectNum',
  PURCHASE_BTN: 'button#btnBuy',
  PURCHASE_CONFIRM_BTN: 'input[value="확인"][onclick="javascript:closepopupLayerConfirm(true);"]',
  PURCHASE_NUMBER_LIST: '#reportRow .nums',

  // Manual number selection
  NUMBER_CHECKBOX: (num: number) => `label[for="check645num${num}"]`,
  NUMBER_RESET_BTN: 'input#resetAllNum'
};

// Constants
export const BROWSER_LOGIN_WAIT = 5000;
export const BROWSER_LOGIN_TIMEOUT = 20000;
export const BROWSER_PAGE_POPUP_WAIT = 1500;
export const BROWSER_PAGE_DIALOG_WAIT = 10000;
export const WEEK_TO_MILLISECOND = 604800000;
export const THOUSAND_ROUND_DATE = '2022-01-29T11:50:00Z';
export const LOGIN_ERROR_MESSAGE = '아이디 또는 비밀번호가 일치하지 않습니다';
export const LOGIN_SUCCESS_TEXT = '로그아웃';
export const PASSWORD_CHANGE_NOTICE_TEXT = '비밀번호 변경안내';
export const PASSWORD_CHANGE_DEFER_TEXT = '다음에 변경';
export const GOTO_TIMEOUT = 60000;
export const PURCHASE_PAGE_READY_TIMEOUT = 15000;
export const PURCHASE_RESULT_TIMEOUT = 10000;

// Browser configuration
export interface BrowserConfig {
  headless: boolean;
  args?: string[];
}
