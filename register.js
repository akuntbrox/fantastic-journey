#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const blessed = require("blessed");
const { faker } = require("@faker-js/faker");
const { HttpsProxyAgent } = require("https-proxy-agent");

// --- Configuration ---------------------------------------------------------
const CONFIG = {
  endpoint:
    "https://qpzjnejmxtifajnkfuoh.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fcryptowave.blog%2F",
  apiKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwempuZWpteHRpZmFqbmtmdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjExOTMsImV4cCI6MjA4Mjc5NzE5M30.lVbiUI5_WIkI8mACai8V5fRdEzcXbJ8_z1L3Ar5ZulI",
  bearerToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwempuZWpteHRpZmFqbmtmdW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjExOTMsImV4cCI6MjA4Mjc5NzE5M30.lVbiUI5_WIkI8mACai8V5fRdEzcXbJ8_z1L3Ar5ZulI",
  referralCode: "EARN9AFF51",
  minDelayMs: Number(process.env.MIN_DELAY_MS || 500),
  maxDelayMs: Number(process.env.MAX_DELAY_MS || 5000),
  workers: Number(process.env.WORKERS || 5),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 20000),
  proxyFile: path.join(__dirname, "proxies.txt"),
  acceptedDomains: [
    "gmail.com",
    "outlook.com",
    "yahoo.com",
    "protonmail.com",
    "mail.com",
  ],
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  credentialsFile: path.join(__dirname, "accounts-success.csv"),
};

// --- Blessed UI ------------------------------------------------------------
const screen = blessed.screen({
  smartCSR: true,
  title: "Cryptowave Register Bot",
});

const layout = blessed.box({
  parent: screen,
  width: "100%",
  height: "100%",
});

const logBox = blessed.log({
  parent: layout,
  label: " Activity ",
  top: 0,
  left: 0,
  width: "70%",
  height: "100%",
  border: "line",
  tags: true,
  scrollable: true,
  scrollbar: {
    ch: " ",
    inverse: true,
  },
  style: {
    border: { fg: "cyan" },
    label: { fg: "white", bold: true },
  },
});

const statsBox = blessed.box({
  parent: layout,
  label: " Stats ",
  top: 0,
  left: "70%",
  width: "30%",
  height: "50%",
  border: "line",
  tags: true,
  style: {
    border: { fg: "magenta" },
    label: { fg: "white", bold: true },
  },
});

const helpBox = blessed.box({
  parent: layout,
  label: " Controls ",
  top: "50%",
  left: "70%",
  width: "30%",
  height: "50%",
  border: "line",
  tags: true,
  content: " q / ESC / CTRL+C : quit\n space : toggle pause/resume",
  style: {
    border: { fg: "green" },
    label: { fg: "white", bold: true },
  },
});

screen.key(["escape", "q", "C-c"], () => {
  logMessage("{red-fg}[SYSTEM]{/} Stopping bot...");
  process.exit(0);
});

// --- Proxy Handling --------------------------------------------------------
function readProxies(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(normalizeProxy);
  } catch (error) {
    return [];
  }
}

function normalizeProxy(input) {
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) return input;
  return `http://${input}`;
}

const proxies = readProxies(CONFIG.proxyFile);
if (proxies.length === 0) {
  logMessage(
    "{red-fg}[ERROR]{/} proxies.txt is missing or empty. Populate it with one proxy per line."
  );
  process.exit(1);
}

ensureCredentialsFile();

function ensureCredentialsFile() {
  try {
    if (!fs.existsSync(CONFIG.credentialsFile)) {
      fs.writeFileSync(
        CONFIG.credentialsFile,
        "email,password,display_name,proxy\n",
        "utf8"
      );
    }
  } catch (error) {
    logMessage(
      `{red-fg}[ERROR]{/} Unable to prepare credentials file: ${error.message}`
    );
    process.exit(1);
  }
}

let proxyIndex = 0;
function getNextProxy() {
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  return proxy;
}

function maskProxy(proxy) {
  try {
    const url = new URL(proxy);
    const host = url.hostname;
    if (host.length <= 6) return host;
    return `${host.slice(0, 3)}***${host.slice(-2)}`;
  } catch (err) {
    return proxy;
  }
}

// --- State -----------------------------------------------------------------
const state = {
  success: 0,
  failure: 0,
  lastError: "-",
  paused: false,
};

function updateStats() {
  statsBox.setContent(
    ` Total Attempts : ${state.success + state.failure}\n` +
      `{green-fg}Success{/}       : ${state.success}\n` +
      `{red-fg}Failed{/}        : ${state.failure}\n` +
      ` Active Workers : ${CONFIG.workers}\n` +
      ` Delay Range    : ${CONFIG.minDelayMs} - ${CONFIG.maxDelayMs} ms\n` +
      ` Current Proxy  : ${maskProxy(
        proxies[(proxyIndex + proxies.length - 1) % proxies.length]
      )}\n` +
      ` Last Error     : ${state.lastError}`
  );
  screen.render();
}

function logMessage(message) {
  logBox.log(message);
  screen.render();
}

// --- Helpers ---------------------------------------------------------------
function randomDelay() {
  const min = Math.min(CONFIG.minDelayMs, CONFIG.maxDelayMs);
  const max = Math.max(CONFIG.minDelayMs, CONFIG.maxDelayMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildPayload() {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const emailDomain = faker.helpers.arrayElement(CONFIG.acceptedDomains);
  const localPart = `${firstName}.${lastName}.${faker.string.alphanumeric(5)}`.toLowerCase();
  const email = `${localPart}@${emailDomain}`.replace(/[^a-z0-9@.]/g, "");
  const password = `${faker.internet.password({
    length: 12,
    memorable: false,
    pattern: /[A-Za-z0-9]/,
  })}!`;

  return {
    email,
    password,
    data: {
      display_name: `${firstName} ${lastName}`,
      referral_code: CONFIG.referralCode,
    },
    gotrue_meta_security: {},
    code_challenge: null,
    code_challenge_method: null,
  };
}

async function registerAccount(workerId) {
  const payload = buildPayload();
  const proxy = getNextProxy();
  const proxyLabel = maskProxy(proxy);

  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.8",
    apikey: CONFIG.apiKey,
    authorization: `Bearer ${CONFIG.bearerToken}`,
    "content-type": "application/json;charset=UTF-8",
    dnt: "1",
    origin: "https://cryptowave.blog",
    referer: "https://cryptowave.blog/",
    "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "sec-gpc": "1",
    "user-agent": CONFIG.userAgent,
    "x-client-info": "supabase-js-web/2.89.0",
    "x-supabase-api-version": "2024-01-01",
  };

  const axiosConfig = {
    method: "post",
    url: CONFIG.endpoint,
    headers,
    data: payload,
    timeout: CONFIG.requestTimeoutMs,
    httpsAgent: new HttpsProxyAgent(proxy),
  };

  try {
    const response = await axios(axiosConfig);
    state.success += 1;
    state.lastError = "-";
    saveCredentials(payload, proxy);
    logMessage(
      `{green-fg}[WORKER ${workerId}]{/} Registered {bold}${payload.email}{/} via ${proxyLabel}`
    );
  } catch (error) {
    state.failure += 1;
    state.lastError = error.response
      ? `${error.response.status} ${error.response.statusText}`
      : error.code || error.message;
    logMessage(
      `{red-fg}[WORKER ${workerId}]{/} Failed for {bold}${payload.email}{/} via ${proxyLabel} -> ${state.lastError}`
    );
  } finally {
    updateStats();
  }
}

function saveCredentials(payload, proxy) {
  const displayName = payload.data?.display_name || "";
  const sanitizedDisplayName = `"${displayName.replace(/"/g, '""')}"`;
  const line = `${payload.email},${payload.password},${sanitizedDisplayName},${proxy}\n`;
  fs.appendFile(CONFIG.credentialsFile, line, (error) => {
    if (error) {
      state.lastError = `credential-save ${error.message}`;
      logMessage(
        `{red-fg}[SYSTEM]{/} Failed to save credentials for ${payload.email}: ${error.message}`
      );
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function workerLoop(workerId) {
  while (true) {
    if (state.paused) {
      await wait(500);
      continue;
    }

    await registerAccount(workerId);
    await wait(randomDelay());
  }
}

screen.key(["space"], () => {
  state.paused = !state.paused;
  logMessage(
    state.paused
      ? "{yellow-fg}[SYSTEM]{/} Bot paused."
      : "{yellow-fg}[SYSTEM]{/} Bot resumed."
  );
  updateStats();
});

async function bootstrap() {
  logMessage(
    `{cyan-fg}[SYSTEM]{/} Loaded ${proxies.length} proxies. Starting ${CONFIG.workers} worker(s)...`
  );
  updateStats();

  for (let i = 1; i <= CONFIG.workers; i += 1) {
    workerLoop(i).catch((err) => {
      logMessage(
        `{red-fg}[WORKER ${i}]{/} crashed: ${err.message}. Restarting worker...`
      );
      setTimeout(() => workerLoop(i), 1000);
    });
  }
}

bootstrap();
