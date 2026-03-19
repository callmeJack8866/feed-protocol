const { chromium } = require('playwright');
const { Wallet, ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

const API_BASE_URL = process.env.SMOKE_API_URL || 'http://127.0.0.1:3001';
const APP_BASE_URL = process.env.SMOKE_APP_URL || 'http://localhost:3000';
const STAKE_AMOUNT = 150;
const FLOW_SYMBOL = `FLOW_${Date.now()}`;
const FLOW_PRICE = '100.12';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'tmp', 'browser-smoke');
const BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getExecutablePath() {
  return BROWSER_PATHS.find((candidate) => fs.existsSync(candidate)) || null;
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
  const message = `Browser mainflow smoke login ${Date.now()} #${index}`;
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
    token: auth.token,
    address: wallet.address.toLowerCase(),
    feeder: auth.feeder,
  };
}

async function seedAchievements() {
  const res = await request('GET', '/api/achievements');
  assert(res.success, 'achievement seed failed');
}

async function stakeWallet(user) {
  const txHash = ethers.keccak256(ethers.toUtf8Bytes(`browser-mainflow-stake:${user.address}:${Date.now()}`));
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

async function createOrder(adminUser) {
  const res = await request('POST', '/api/admin/orders', {
    token: adminUser.token,
    address: adminUser.address,
    body: {
      symbol: FLOW_SYMBOL,
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

  assert(res.success, 'order creation failed');
  return res.order;
}

function buildCommitHash(price, salt) {
  const normalizedPrice = ethers.parseUnits(price.toString(), 18);
  return ethers.solidityPackedKeccak256(['uint256', 'string'], [normalizedPrice, salt]);
}

async function runHelperFlow(user, orderId, price) {
  const grabbed = await request('POST', `/api/orders/${orderId}/grab`, { token: user.token });
  assert(grabbed.success, `helper grab failed for ${user.address}`);

  const salt = `${user.address.slice(2, 10)}-${Date.now()}`;
  const committed = await request('POST', `/api/orders/${orderId}/submit`, {
    token: user.token,
    body: {
      priceHash: buildCommitHash(price, salt),
      screenshot: `ipfs://browser-helper-${orderId}-${user.address.slice(-6)}`,
    },
  });
  assert(committed.success, `helper commit failed for ${user.address}`);

  const revealed = await request('POST', `/api/orders/${orderId}/reveal`, {
    token: user.token,
    body: {
      price,
      salt,
    },
  });
  assert(revealed.success, `helper reveal failed for ${user.address}`);
}

async function waitForOrder(orderId, expectedStatus, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await request('GET', `/api/orders/${orderId}`);
      if (res.order?.status === expectedStatus) {
        return res.order;
      }
    } catch (error) {
      const message = error.message || '';
      const retryAfterMatch = message.match(/\"retryAfter\":(\d+)/);
      if (retryAfterMatch) {
        await new Promise((resolve) => setTimeout(resolve, (Number(retryAfterMatch[1]) + 1) * 1000));
        continue;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`order ${orderId} did not reach ${expectedStatus}`);
}

async function collectUiState(page) {
  const errorText = await page.getByTestId('feed-modal-error').textContent().catch(() => null);
  const detailVisible = await page.getByTestId('order-detail-modal').isVisible().catch(() => false);
  const feedModalVisible = await page.getByTestId('feed-modal').isVisible().catch(() => false);
  const inputVisible = await page.getByTestId('feed-modal-step-input').isVisible().catch(() => false);
  const commitVisible = await page.getByTestId('feed-modal-step-commit').isVisible().catch(() => false);
  const revealVisible = await page.getByTestId('feed-modal-step-reveal').isVisible().catch(() => false);
  const processingVisible = await page.getByTestId('feed-modal-step-processing').isVisible().catch(() => false);
  const consensusVisible = await page.getByTestId('feed-modal-step-consensus').isVisible().catch(() => false);
  const successVisible = await page.getByTestId('feed-modal-step-success').isVisible().catch(() => false);
  const bodyText = await page.locator('body').innerText().catch(() => '');

  return {
    detailVisible,
    feedModalVisible,
    inputVisible,
    commitVisible,
    revealVisible,
    processingVisible,
    consensusVisible,
    successVisible,
    errorText: errorText?.trim() || null,
    bodyPreview: bodyText.slice(0, 2000),
  };
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

  const browserUser = users[0];
  const helperUsers = users.slice(1);
  const order = await createOrder(browserUser);

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  });
  const apiEvents = [];

  context.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/orders/')) {
      return;
    }
    if (!/(grab|submit|reveal)$/.test(url)) {
      return;
    }

    const body = await response.text().catch(() => '');
    apiEvents.push({
      url,
      status: response.status(),
      body: body.slice(0, 400),
    });
  });

  await context.addInitScript(({ token, address }) => {
    localStorage.setItem('feed-engine-lang', 'en');
    localStorage.setItem('feed-engine-auth', JSON.stringify({
      state: { token, address },
      version: 0,
    }));
  }, { token: browserUser.token, address: browserUser.address });

  const page = await context.newPage();
  await page.goto(APP_BASE_URL, { waitUntil: 'networkidle' });

  await page.getByText('Quest Hall', { exact: true }).click();
  await page.getByText('COMMAND_CENTER_V4', { exact: true }).waitFor({ timeout: 15000 });

  await page.getByTestId(`order-card-${order.id}`).waitFor({ timeout: 15000 });
  await page.getByTestId(`order-card-${order.id}`).click();

  await page.getByTestId('order-detail-modal').waitFor({ timeout: 15000 });
  await page.getByTestId('order-detail-engage').click();

  await page.getByTestId('feed-modal').waitFor({ timeout: 15000 });
  const helperFlow = Promise.all([
    runHelperFlow(helperUsers[0], order.id, '100.11'),
    runHelperFlow(helperUsers[1], order.id, '100.13'),
  ]);
  const priceInput = page.getByTestId('feed-price-input');
  await priceInput.fill(FLOW_PRICE);
  const submitResponsePromise = page.waitForResponse(
    (response) => response.url().includes(`/api/orders/${order.id}/submit`) && response.request().method() === 'POST',
    { timeout: 15000 },
  ).catch(() => null);
  await page.getByTestId('commit-signal-button').click();
  await page.waitForTimeout(1200);
  const submitResponse = await submitResponsePromise;
  if (!submitResponse) {
    const failurePath = path.join(SCREENSHOT_DIR, 'mainflow-submit-failure.png');
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
    const uiState = await collectUiState(page);
    throw new Error(`Browser submit request was not sent. UI=${JSON.stringify(uiState)} API=${JSON.stringify(apiEvents.slice(-6))} screenshot=${failurePath}`);
  }
  const submitBodyText = await submitResponse.text().catch(() => '');
  assert(
    submitResponse.ok(),
    `browser submit failed: ${submitResponse.status()} ${submitBodyText.slice(0, 400)}`,
  );

  const revealResponse = await page.waitForResponse(
    (response) => response.url().includes(`/api/orders/${order.id}/reveal`) && response.request().method() === 'POST',
    { timeout: 15000 },
  );
  const revealBodyText = await revealResponse.text().catch(() => '');
  assert(
    revealResponse.ok(),
    `browser reveal failed: ${revealResponse.status()} ${revealBodyText.slice(0, 400)}`,
  );

  try {
    await page.getByTestId('feed-modal-step-success').waitFor({ timeout: 15000 });
  } catch (error) {
    const failurePath = path.join(SCREENSHOT_DIR, 'mainflow-failure.png');
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
    const uiState = await collectUiState(page);
    throw new Error(`Mainflow did not advance after submit. UI=${JSON.stringify(uiState)} API=${JSON.stringify(apiEvents.slice(-6))} screenshot=${failurePath}`);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'mainflow-success.png'), fullPage: true });

  const claimButton = page.getByTestId('claim-bounty-button');
  await claimButton.click();
  await page.waitForTimeout(1000);

  await helperFlow;
  const settledOrder = await waitForOrder(order.id, 'SETTLED', 90000);
  const feederProfile = await request('GET', '/api/feeders/me', { token: browserUser.token });

  const modalStillVisible = await page.getByText('ORACLE HANDSHAKE', { exact: true }).isVisible().catch(() => false);
  const successStillVisible = await claimButton.isVisible().catch(() => false);

  await browser.close();

  assert(!modalStillVisible && !successStillVisible, 'FeedModal did not close after claim');
  assert(settledOrder.finalPrice !== null, 'settled order missing final price');
  assert(feederProfile.feeder.totalFeeds >= 1, 'feeder totalFeeds did not increase');

  console.log(JSON.stringify({
    ok: true,
    appUrl: APP_BASE_URL,
    apiUrl: API_BASE_URL,
    order: {
      id: settledOrder.id,
      symbol: settledOrder.symbol,
      status: settledOrder.status,
      finalPrice: settledOrder.finalPrice,
    },
    feeder: {
      address: browserUser.address,
      totalFeeds: feederProfile.feeder.totalFeeds,
      xp: feederProfile.feeder.xp,
      accuracyRate: feederProfile.feeder.accuracyRate,
    },
    screenshot: path.join(SCREENSHOT_DIR, 'mainflow-success.png'),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error.message,
    stack: error.stack,
  }, null, 2));
  process.exit(1);
});
