#!/usr/bin/env node
/**
 * 오류 메일 설정 — Gmail 주소·앱 비밀번호를 opsSecrets/errorMail 에 저장하고 시험 메일을 보낸다.
 * 실행: node scripts/set-error-mail.mjs   (firebase login 된 상태)
 */
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import readline from 'node:readline';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const nodemailer = require('nodemailer');

const PROJECT = 'airpick-reservation';
const DOC_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/opsSecrets/errorMail`;

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(`${os.homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.tokens.refresh_token,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('firebase login 이 필요합니다: npx firebase-tools login');
  return json.access_token;
}

const gmailUser = await ask('보내는 Gmail 주소: ');
const appPassword = (await ask('Gmail 앱 비밀번호 16자리 (그대로 붙여넣기, 띄어쓰기 있어도 됨): ')).replace(/\s+/g, '');
const to = (await ask(`받을 메일 주소 (그냥 Enter = ${gmailUser}): `)) || gmailUser;

if (!/^[^@\s]+@[^@\s]+$/.test(gmailUser)) {
  console.error(`메일 주소 형식이 아닙니다: ${gmailUser}`);
  process.exit(1);
}
if (appPassword.length !== 16) {
  console.error(`앱 비밀번호가 ${appPassword.length}자리입니다. 16자리여야 합니다. Google 앱 비밀번호 화면에서 다시 복사해 주세요.`);
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+$/.test(to)) {
  console.error(`받을 메일 주소 형식이 아닙니다: ${to}`);
  process.exit(1);
}

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: appPassword } });
try {
  await transport.sendMail({
    from: `에어픽 오류 알림 <${gmailUser}>`,
    to,
    subject: '[에어픽 직원 앱] 오류 메일 시험',
    text: '오류 메일 설정이 끝났습니다. 앞으로 직원 앱에 오류가 쌓인 날만 평일 오전 9시에 이 주소로 메일이 옵니다.',
  });
} catch (err) {
  console.error('시험 메일을 보내지 못했습니다. 앱 비밀번호를 확인해 주세요.');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const res = await fetch(DOC_URL, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    fields: {
      gmailUser: { stringValue: gmailUser },
      appPassword: { stringValue: appPassword },
      to: { stringValue: to },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  }),
});
if (!res.ok) {
  console.error('설정을 저장하지 못했습니다.', res.status);
  process.exit(1);
}
console.log(`완료. ${to} 로 시험 메일을 보냈고 설정을 저장했습니다.`);
