const path = require('path');
const { chromium } = require('playwright');
const { getApiKeyStatus } = require('./settings');

let contextPromise = null;

async function requirePermission() {
  const status = await getApiKeyStatus();
  if (!status.allowBrowserAutomation) {
    throw new Error('A automacao de navegador esta desligada. Autorize-a nas configuracoes primeiro.');
  }
}

async function getContext(userDataDir) {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    }).catch((error) => {
      contextPromise = null;
      throw error;
    });
  }
  return contextPromise;
}

async function openAuthorizedWorkspace(userDataDir) {
  await requirePermission();
  const context = await getContext(path.join(userDataDir, 'authorized-browser'));
  const urls = [
    ['Gmail', 'https://mail.google.com/'],
    ['WhatsApp Web', 'https://web.whatsapp.com/'],
    ['Instagram', 'https://www.instagram.com/'],
  ];
  const pages = [];
  for (const [label, url] of urls) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    pages.push({ label, url, title: await page.title().catch(() => '') });
  }
  return { pages, profile: 'authorized-browser', manualLoginRequired: true };
}

module.exports = { openAuthorizedWorkspace };
