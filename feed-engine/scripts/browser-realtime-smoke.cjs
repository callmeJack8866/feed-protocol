const { chromium } = require('playwright');
const { Wallet, ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

const API_BASE_URL = process.env.SMOKE_API_URL || 'http://127.0.0.1:3001';
const APP_BASE_URL = process.env.SMOKE_APP_URL || 'http://localhost:5173';
const PRIMARY_BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const STAKE_AMOUNT = 150;
const DASHBOARD_ORDER_SYMBOL = `BROWSERDASH_${Date.now()}`;
const QUEST_ORDER_SYMBOL = `BROWSERWS_${Date.now()}`;
const SCREENSHOT_DIR = path.join(__dirname, '..', 'tmp', 'browser-smoke');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getExecutablePath() {
  return PRIMARY_BROWSER_PATHS.find((candidate) => fs.existsSync(candidate)) || null;
}

async function request(method, endpoint, { token, address, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (address) headers['x-wallet-address'] = address;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function loginWallet(index) {
  const wallet = Wallet.createRandom();
  const message = `Browser realtime smoke login ${Date.now()} #${index}`;
  const signature = await wallet.signMessage(message);
  const auth = await request('POST', '/api/auth/connect', {
    body: {
      address: wallet.address.toLowerCase(),
      message,
      signature,
    },
  });

  assert(auth.success && auth.token, `login failed for wallet ${index}`);
  return {
    wallet,
    token: auth.token,
    address: wallet.address.toLowerCase(),
    feeder: auth.feeder,
  };
}

async function seedAchievements() {
  const res = await request('GET', '/api/achievements');
  assert(res.success, 'failed to seed achievements');
}

async function stakeWallet(user) {
  const txHash = ethers.keccak256(ethers.toUtf8Bytes(`browser-stake:${user.address}:${Date.now()}`));
  const res = await request('POST', '/api/staking/stake', {
    token: user.token,
    body: {
      stakeType: 'USDT',
      amount: STAKE_AMOUNT,
      txHash,
    },
  });
  assert(res.success, `stake failed for ${user.address}`);
}

async function createOrder(adminUser, symbol) {
  const res = await request('POST', '/api/admin/orders', {
    token: adminUser.token,
    address: adminUser.address,
    body: {
      symbol,
      market: 'US_STOCK',
      country: 'US',
      exchange: 'NASDAQ',
      feedType: 'SETTLEMENT',
      notionalAmount: 50000,
      rewardAmount: 30,
      feeAmount: 10,
      grabTimeout: 600,
      feedTimeout: 600,
      specialConditions: '[]',
    },
  });
  assert(res.success, `failed to create order ${symbol}`);
  return res.order;
}

function buildCommitHash(price, salt) {
  const normalizedPrice = ethers.parseUnits(price.toString(), 18);
  return ethers.solidityPackedKeccak256(['uint256', 'string'], [normalizedPrice, salt]);
}

async function runSettlementFlow(users, symbol) {
  const order = await createOrder(users[0], symbol);
  const prices = ['321.11', '321.12', '321.10'];
  const salts = users.map((user, index) => `${user.address.slice(2, 10)}-${Date.now()}-${index}`);

  for (const user of users) {
    const grabbed = await request('POST', `/api/orders/${order.id}/grab`, { token: user.token });
    assert(grabbed.success, `grab failed for ${user.address}`);
  }

  for (let i = 0; i < users.length; i += 1) {
    const committed = await request('POST', `/api/orders/${order.id}/submit`, {
      token: users[i].token,
      body: {
        priceHash: buildCommitHash(prices[i], salts[i]),
        screenshot: `ipfs://browser-smoke-${order.id}-${i}`,
      },
    });
    assert(committed.success, `commit failed for ${users[i].address}`);
  }

  for (let i = 0; i < users.length; i += 1) {
    const revealed = await request('POST', `/api/orders/${order.id}/reveal`, {
      token: users[i].token,
      body: {
        price: prices[i],
        salt: salts[i],
      },
    });
    assert(revealed.success, `reveal failed for ${users[i].address}`);
  }

  return order;
}

async function waitForDashboardValue(page, label, expectedText, timeoutMs = 15000) {
  const valueLocator = page
    .locator(`p:text-is("${label}")`)
    .locator('xpath=..')
    .locator('p')
    .nth(1);

  await valueLocator.waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForFunction(
    ({ selector, expected }) => {
      const node = document.querySelector(selector);
      return !!node && node.textContent && node.textContent.includes(expected);
    },
    {
      selector: await valueLocator.evaluate((node) => {
        if (!node.id) {
          node.id = `smoke-${Math.random().toString(36).slice(2, 10)}`;
        }
        return `#${node.id}`;
      }),
      expected: expectedText,
    },
    { timeout: timeoutMs },
  );
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const executablePath = getExecutablePath();
  assert(executablePath, 'No Chrome/Edge executable found for browser smoke');

  await seedAchievements();

  const users = [];
  for (let i = 0; i < 3; i += 1) {
    users.push(await loginWallet(i + 1));
  }

  for (const user of users) {
    await stakeWallet(user);
  }

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });

  const orderRequests = [];
  context.on('request', (request) => {
    if (request.url().includes('/api/orders')) {
      orderRequests.push({ url: request.url(), method: request.method(), time: Date.now() });
    }
  });

  await context.addInitScript(({ token, address }) => {
    localStorage.setItem('feed-engine-lang', 'en');
    localStorage.setItem('feed-engine-auth', JSON.stringify({
      state: { token, address },
      version: 0,
    }));
  }, { token: users[0].token, address: users[0].address });

  const page = await context.newPage();
  await page.goto(APP_BASE_URL, { waitUntil: 'networkidle' });

  await page.getByText('Dashboard', { exact: true }).click();
  await page.getByText('NODE_TELEMETRY', { exact: true }).waitFor({ timeout: 15000 });

  const totalFeedsValue = page.locator('p:text-is("Total Feeds")').locator('xpath=..').locator('p').nth(1);
  await totalFeedsValue.waitFor({ state: 'visible', timeout: 15000 });
  const initialTotalFeeds = (await totalFeedsValue.textContent())?.trim() || '';

  await runSettlementFlow(users, DASHBOARD_ORDER_SYMBOL);

  await page.waitForFunction(
    () => {
      const header = Array.from(document.querySelectorAll('p')).find((node) => node.textContent?.trim() === 'TOTAL FEEDS');
      const fallbackHeader = Array.from(document.querySelectorAll('p')).find((node) => node.textContent?.trim() === 'Total Feeds');
      const value = (header || fallbackHeader)?.parentElement?.querySelectorAll('p')?.[1]?.textContent?.trim();
      return value && value !== '0';
    },
    undefined,
    { timeout: 35000 },
  );

  const refreshedTotalFeeds = (await totalFeedsValue.textContent())?.trim() || '';
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-refresh.png'), fullPage: true });

  await page.getByText('Quest Hall', { exact: true }).click();
  await page.getByText('COMMAND_CENTER_V4', { exact: true }).waitFor({ timeout: 15000 });

  const orderRequestCountBefore = orderRequests.length;
  await createOrder(users[0], QUEST_ORDER_SYMBOL);

  await page.getByText(`${QUEST_ORDER_SYMBOL} HUB`, { exact: true }).waitFor({ timeout: 15000 });
  const orderRequestCountAfter = orderRequests.length;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'questhall-websocket.png'), fullPage: true });

  const feederSnapshot = await request('GET', '/api/feeders/me', { token: users[0].token });

  await browser.close();

  const result = {
    ok: true,
    appUrl: APP_BASE_URL,
    apiUrl: API_BASE_URL,
    dashboard: {
      initialTotalFeeds,
      refreshedTotalFeeds,
      backendTotalFeeds: feederSnapshot.feeder.totalFeeds,
      screenshot: path.join(SCREENSHOT_DIR, 'dashboard-refresh.png'),
    },
    websocket: {
      symbol: QUEST_ORDER_SYMBOL,
      orderRequestsBefore: orderRequestCountBefore,
      orderRequestsAfter: orderRequestCountAfter,
      screenshot: path.join(SCREENSHOT_DIR, 'questhall-websocket.png'),
    },
  };

  assert(Number(refreshedTotalFeeds.replace(/,/g, '')) >= 1, 'dashboard total feeds did not refresh');
  assert(orderRequestCountAfter === orderRequestCountBefore, 'quest hall websocket landing triggered extra /api/orders fetch');

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    stack: error.stack,
  }, null, 2));
  process.exit(1);
});
