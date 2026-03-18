const axios = require('axios').default;
const { Wallet, ethers } = require('ethers');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const SMOKE_SYMBOL = `SMOKE_${Date.now()}`;
const STAKE_AMOUNT = 150;
const PRICES = ['123.45', '123.46', '123.44'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function commitHash(price, salt) {
  const normalizedPrice = ethers.parseUnits(price.toString(), 18);
  return ethers.solidityPackedKeccak256(['uint256', 'string'], [normalizedPrice, salt]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(method, path, { token, address, data, validateStatus } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (address) headers['x-wallet-address'] = address;

  return axios({
    method,
    url: `${BASE_URL}${path}`,
    data,
    headers,
    validateStatus: validateStatus || ((status) => status >= 200 && status < 300),
  });
}

async function loginWallet(index) {
  const wallet = Wallet.createRandom();
  const message = `Feed Engine smoke login ${Date.now()} #${index}`;
  const signature = await wallet.signMessage(message);
  const response = await request('post', '/api/auth/connect', {
    data: {
      address: wallet.address.toLowerCase(),
      message,
      signature,
    },
  });

  assert(response.data.success, `wallet ${index} login failed`);
  return {
    wallet,
    address: wallet.address.toLowerCase(),
    token: response.data.token,
    feeder: response.data.feeder,
  };
}

async function seedAchievements() {
  const response = await request('get', '/api/achievements');
  assert(response.data.success, 'achievement seed request failed');
  assert(Array.isArray(response.data.achievements), 'achievement list missing');
  return response.data.achievements.length;
}

async function stakeWallet(user, amount) {
  const txHash = ethers.keccak256(ethers.toUtf8Bytes(`stake:${user.address}:${Date.now()}:${Math.random()}`));
  const response = await request('post', '/api/staking/stake', {
    token: user.token,
    data: {
      stakeType: 'USDT',
      amount,
      txHash,
    },
  });

  assert(response.data.success, `staking failed for ${user.address}`);
  return response.data.record;
}

async function createSmokeOrder(adminUser) {
  const response = await request('post', '/api/admin/orders', {
    token: adminUser.token,
    address: adminUser.address,
    data: {
      symbol: SMOKE_SYMBOL,
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

  assert(response.data.success, 'smoke order creation failed');
  assert(response.data.order.requiredFeeders === 3, 'smoke order must require 3 feeders');
  return response.data.order;
}

async function grabOrder(user, orderId) {
  const response = await request('post', `/api/orders/${orderId}/grab`, {
    token: user.token,
  });
  assert(response.data.success, `grab failed for ${user.address}`);
  return response.data;
}

async function submitCommit(user, orderId, price, salt) {
  const response = await request('post', `/api/orders/${orderId}/submit`, {
    token: user.token,
    data: {
      priceHash: commitHash(price, salt),
      screenshot: `ipfs://smoke-${orderId}-${user.address.slice(-6)}`,
    },
  });
  assert(response.data.success, `commit failed for ${user.address}`);
  return response.data;
}

async function revealPrice(user, orderId, price, salt) {
  const response = await request('post', `/api/orders/${orderId}/reveal`, {
    token: user.token,
    data: { price, salt },
  });
  assert(response.data.success, `reveal failed for ${user.address}`);
  return response.data;
}

async function waitForOrderSettled(orderId, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await request('get', `/api/orders/${orderId}`);
    const order = response.data.order;
    if (order && order.status === 'SETTLED') {
      return order;
    }
    await sleep(500);
  }
  throw new Error(`order ${orderId} did not settle within ${timeoutMs}ms`);
}

async function waitForAchievement(user, code, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await request('get', '/api/achievements/my', { token: user.token });
    const achievement = (response.data.achievements || []).find((item) => item.code === code && item.unlocked);
    if (achievement) {
      return {
        unlocked: true,
        stats: response.data.stats,
        achievement,
      };
    }
    await sleep(500);
  }

  const finalResponse = await request('get', '/api/achievements/my', { token: user.token });
  return {
    unlocked: false,
    stats: finalResponse.data.stats,
    achievement: (finalResponse.data.achievements || []).find((item) => item.code === code) || null,
  };
}

async function getDashboardSnapshot(user) {
  const [feederRes, rewardsRes, stakingRes] = await Promise.all([
    request('get', '/api/feeders/me', { token: user.token }),
    request('get', '/api/chain/pending-rewards', { token: user.token }),
    request('get', '/api/staking/info', { token: user.token }),
  ]);

  return {
    feeder: feederRes.data.feeder,
    pendingRewards: rewardsRes.data,
    staking: stakingRes.data.staking,
  };
}

async function getSeasonSnapshot(user) {
  const currentRes = await request('get', '/api/seasons/current');
  assert(currentRes.data.success, 'current season fetch failed');
  const code = currentRes.data.season.code;
  const rankRes = await request('get', `/api/seasons/${code}/my-rank`, { token: user.token });
  assert(rankRes.data.success, 'season rank fetch failed');

  return {
    current: currentRes.data.season,
    myRank: rankRes.data,
  };
}

(async () => {
  try {
    const healthRes = await request('get', '/health');
    assert(healthRes.data.status === 'ok', 'backend health check failed');

    const seededAchievements = await seedAchievements();
    const users = [];
    for (let i = 0; i < 3; i += 1) {
      const user = await loginWallet(i + 1);
      users.push(user);
    }

    const stakeResults = [];
    for (const user of users) {
      stakeResults.push(await stakeWallet(user, STAKE_AMOUNT));
    }

    const order = await createSmokeOrder(users[0]);

    const salts = users.map((user, index) => `${user.address.slice(2, 10)}-${Date.now()}-${index}`);

    const grabResults = [];
    for (const user of users) {
      grabResults.push(await grabOrder(user, order.id));
    }

    const commitResults = [];
    for (let i = 0; i < users.length; i += 1) {
      commitResults.push(await submitCommit(users[i], order.id, PRICES[i], salts[i]));
    }

    const revealResults = [];
    for (let i = 0; i < users.length; i += 1) {
      revealResults.push(await revealPrice(users[i], order.id, PRICES[i], salts[i]));
    }

    const settledOrder = await waitForOrderSettled(order.id);
    assert(Number(settledOrder.finalPrice) === 123.45, `unexpected consensus price: ${settledOrder.finalPrice}`);

    const dashboard = await getDashboardSnapshot(users[0]);
    const season = await getSeasonSnapshot(users[0]);
    const firstFeedAchievement = await waitForAchievement(users[0], 'FIRST_FEED');

    assert(dashboard.feeder.totalFeeds >= 1, 'dashboard feeder totalFeeds did not update');
    assert((dashboard.feeder.history || []).some((item) => item.orderId === order.id), 'dashboard history missing settled order');
    assert(dashboard.staking.currentStake >= STAKE_AMOUNT, 'staking snapshot missing stake');
    assert(Object.prototype.hasOwnProperty.call(dashboard.pendingRewards, 'usdtBalance'), 'pending rewards missing usdtBalance');
    assert(Object.prototype.hasOwnProperty.call(dashboard.pendingRewards, 'nativeBalance'), 'pending rewards missing nativeBalance');
    assert(season.current.status === 'ACTIVE', 'current season is not active');
    assert(Number(season.myRank.ranks.overall) >= 1, 'season rank is invalid');
    assert(firstFeedAchievement.unlocked, 'FIRST_FEED achievement was not unlocked automatically');

    const submissionSummary = (settledOrder.submissions || []).map((submission) => ({
      feeder: submission.feeder?.address,
      revealedPrice: submission.revealedPrice,
      deviation: submission.deviation,
      rewardEarned: submission.rewardEarned,
      xpEarned: submission.xpEarned,
    }));

    const result = {
      ok: true,
      baseUrl: BASE_URL,
      health: healthRes.data,
      seededAchievements,
      order: {
        id: settledOrder.id,
        symbol: settledOrder.symbol,
        status: settledOrder.status,
        requiredFeeders: settledOrder.requiredFeeders,
        finalPrice: settledOrder.finalPrice,
        settledAt: settledOrder.settledAt,
      },
      users: users.map((user, index) => ({
        address: user.address,
        feederId: user.feeder.id,
        stakeRecordId: stakeResults[index].id,
      })),
      pipeline: {
        grabs: grabResults.length,
        commits: commitResults.length,
        reveals: revealResults.length,
        submissions: submissionSummary,
      },
      dashboard: {
        totalFeeds: dashboard.feeder.totalFeeds,
        accuracyRate: dashboard.feeder.accuracyRate,
        xp: dashboard.feeder.xp,
        stakedAmount: dashboard.feeder.stakedAmount,
        historyCount: (dashboard.feeder.history || []).length,
        pendingRewards: dashboard.pendingRewards,
      },
      season: {
        currentCode: season.current.code,
        currentStatus: season.current.status,
        overallRank: season.myRank.ranks.overall,
        stats: season.myRank.stats,
      },
      achievements: {
        firstFeedUnlocked: firstFeedAchievement.unlocked,
        unlockedCount: firstFeedAchievement.stats?.unlocked ?? 0,
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const details = error.response
      ? {
          status: error.response.status,
          data: error.response.data,
        }
      : null;

    console.error(JSON.stringify({
      ok: false,
      message: error.message,
      details,
    }, null, 2));
    process.exit(1);
  }
})();
