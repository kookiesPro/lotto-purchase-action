// 로컬 PC에서 로또 구매를 실행하는 러너 (GitHub Actions 없이)
//
// 사용법 (저장소 루트에서):
//   node local/run-local.mjs           # 오늘 이미 실행했으면 건너뜀
//   node local/run-local.mjs --force   # 오늘 실행 기록을 무시하고 실행
//
// 설정: local/.env (local/.env.example 참고)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const localDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(localDir, '..');
const envPath = path.join(localDir, '.env');
const lockPath = path.join(localDir, 'last-run.txt');
const force = process.argv.includes('--force');

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error(`[Local] 설정 파일이 없습니다: ${file}\n        local/.env.example 을 복사해서 local/.env 로 만들고 값을 채워 주세요.`);
    process.exit(2);
  }
  const env = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// 중복 구매 방지: 같은 날 두 번 실행되지 않게 함
if (!force && fs.existsSync(lockPath)) {
  const last = fs.readFileSync(lockPath, 'utf8').trim().split(/\s+/)[0];
  if (last === todayKst) {
    console.log(`[Local] 오늘(${todayKst}) 이미 실행했습니다. 중복 구매를 막기 위해 건너뜁니다. (강제 실행: --force)`);
    process.exit(0);
  }
}

const env = loadEnv(envPath);
if (!env.DHLOTTERY_ID || !env.DHLOTTERY_PASSWORD) {
  console.error('[Local] local/.env 에 DHLOTTERY_ID 와 DHLOTTERY_PASSWORD 를 설정해 주세요.');
  process.exit(2);
}

// @actions/core 의 getInput 은 INPUT_<이름 대문자> 환경변수를 읽음
const inputs = {
  'DHLOTTERY-ID': env.DHLOTTERY_ID,
  'DHLOTTERY-PASSWORD': env.DHLOTTERY_PASSWORD,
  'GAME-COUNT': env.GAME_COUNT || '5',
  'WORKFLOW-FILE': env.WORKFLOW_FILE || 'custom-workflows/01-auto-basic.js',
  'TELEGRAM-BOT-TOKEN': env.TELEGRAM_BOT_TOKEN || '',
  'TELEGRAM-CHAT-ID': env.TELEGRAM_CHAT_ID || '',
  'GITHUB-TOKEN': ''
};
for (const [k, v] of Object.entries(inputs)) process.env[`INPUT_${k}`] = v;
delete process.env.GITHUB_TOKEN; // 로컬 모드: GitHub 이슈 기록 건너뜀

// 실행 기록을 먼저 남김 (중간에 죽어도 같은 날 재실행으로 중복 구매되지 않도록)
fs.writeFileSync(lockPath, `${todayKst} ${new Date().toISOString()}\n`);

process.chdir(repoRoot);
console.log(`[Local] ${todayKst} 로또 구매 시작 (workflow: ${inputs['WORKFLOW-FILE']})`);
await import(pathToFileURL(path.join(repoRoot, 'dist', 'index.js')).href);
