#!/usr/bin/env node
/*
 * toolBox LLM layer tests (port + adapters, dist/toolbox_llm.js).
 *
 * Every fetch is mocked: no test in this suite touches the network. Covered:
 *   T1  buildProviders: instantiation follows the env (keys, Z_AI_API_MODE).
 *   T2  anthropic adapter: streaming draft accumulates text_delta, reports
 *       stop_reason, and sends the right auth header per vendor.
 *   T3  openai-compatible adapter: streaming draft, thinking disabled by
 *       default for GLM, max_tokens capped at 131072.
 *   T4  error mapping: 401 -> unauthorized, 429 code 1113 -> insufficient_balance.
 *   T5  available(): no network without health check; Ollama probe degrades
 *       to false on failure.
 *   T6  providersInfo: shape {id, available, model}, copilot declared as
 *       future id, and no key material in the payload.
 *   T7  loadDotEnv: parses KEY=VALUE, respects existing env, ignores comments.
 *
 * Exit code 0 when all pass, 1 otherwise.
 */
"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DIST = path.join(__dirname, "..", "handyman", "dist", "toolbox_llm.js");

let RUN = 0;
let FAILED = 0;
function check(name, ok, detail) {
  RUN += 1;
  if (ok) {
    console.log(`  PASS ${name}`);
  } else {
    FAILED += 1;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

function sseResponse(lines, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

/** Records calls; answers from a queue of factories. */
function fetchMock(factories) {
  const calls = [];
  const queue = [...factories];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) {
      throw new Error("fetchMock: unexpected extra call");
    }
    return next();
  };
  return { impl, calls };
}

async function main() {
  const llm = await import(pathToFileURL(DIST).href);
  const SECRET = "test-key-7ef7.s3cr3t";

  console.log("toolBox LLM suite (test_toolbox_llm.js)");

  // T1 — factory follows the env
  {
    const none = llm.buildProviders({});
    check(
      "buildProviders without keys yields only ollama",
      none.length === 1 && none[0].id === "ollama",
      `got [${none.map((p) => p.id)}]`,
    );
    const all = llm.buildProviders({ Z_AI_API_KEY: SECRET, ANTHROPIC_API_KEY: SECRET });
    check(
      "buildProviders with keys yields zai, claude, ollama",
      all.map((p) => p.id).join(",") === "zai,claude,ollama",
      `got [${all.map((p) => p.id)}]`,
    );
    check(
      "zai defaults to glm-5.2 (Coding Plan endpoint)",
      all[0].model === "glm-5.2",
      `got ${all[0].model}`,
    );
  }

  // T2 — anthropic adapter: streaming + auth per vendor
  {
    const events = [
      'data: {"type":"message_start","message":{}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ho"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"la"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      'data: {"type":"message_stop"}',
    ];
    const { impl, calls } = fetchMock([() => sseResponse(events)]);
    const zai = llm.buildProviders({ Z_AI_API_KEY: SECRET }, impl)[0];
    const deltas = [];
    const result = await zai.draft({ prompt: "p", system: "s" }, (t) => deltas.push(t));
    check(
      "anthropic adapter accumulates text_delta and stop_reason",
      result.text === "hola" && result.stopReason === "end_turn" && deltas.join("|") === "ho|la",
      JSON.stringify(result),
    );
    const req = calls[0];
    const body = JSON.parse(req.init.body);
    check(
      "zai hits the Anthropic-compatible endpoint with Bearer auth",
      req.url === "https://api.z.ai/api/anthropic/v1/messages" &&
        req.init.headers.Authorization === `Bearer ${SECRET}` &&
        req.init.headers["x-api-key"] === undefined &&
        body.stream === true &&
        body.system === "s",
      `${req.url} headers=${Object.keys(req.init.headers)}`,
    );
    const claudeMock = fetchMock([() => sseResponse(events)]);
    const claude = llm.buildProviders({ ANTHROPIC_API_KEY: SECRET }, claudeMock.impl)[0];
    await claude.draft({ prompt: "p" }, () => {});
    const creq = claudeMock.calls[0];
    check(
      "claude hits api.anthropic.com with x-api-key",
      creq.url === "https://api.anthropic.com/v1/messages" &&
        creq.init.headers["x-api-key"] === SECRET &&
        creq.init.headers.Authorization === undefined,
      creq.url,
    );
  }

  // T3 — openai-compatible adapter: streaming, thinking, max_tokens cap
  {
    const events = [
      'data: {"choices":[{"delta":{"content":"1 "}}]}',
      'data: {"choices":[{"delta":{"content":"2"},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      "data: [DONE]",
    ];
    const { impl, calls } = fetchMock([() => sseResponse(events)]);
    const zai = llm.buildProviders(
      { Z_AI_API_KEY: SECRET, Z_AI_API_MODE: "paas" },
      impl,
    )[0];
    const result = await zai.draft({ prompt: "p", maxTokens: 999999999 }, () => {});
    const body = JSON.parse(calls[0].init.body);
    check(
      "paas mode streams deltas and reports finish_reason",
      result.text === "1 2" && result.stopReason === "stop",
      JSON.stringify(result),
    );
    check(
      "paas mode hits paas/v4 with thinking disabled and capped max_tokens",
      calls[0].url === "https://api.z.ai/api/paas/v4/chat/completions" &&
        body.thinking.type === "disabled" &&
        body.max_tokens === 131072,
      JSON.stringify({ url: calls[0].url, thinking: body.thinking, max: body.max_tokens }),
    );
    const reasoningMock = fetchMock([() => sseResponse(["data: [DONE]"])]);
    const zai2 = llm.buildProviders(
      { Z_AI_API_KEY: SECRET, Z_AI_API_MODE: "paas" },
      reasoningMock.impl,
    )[0];
    await zai2.draft({ prompt: "p", reasoning: true }, () => {});
    check(
      "reasoning:true keeps provider-side thinking on",
      JSON.parse(reasoningMock.calls[0].init.body).thinking === undefined,
    );
  }

  // T4 — error mapping
  {
    const unauthorized = fetchMock([
      () => new Response('{"error":{"code":"401","message":"token expired"}}', { status: 401 }),
    ]);
    const p1 = llm.buildProviders({ Z_AI_API_KEY: SECRET }, unauthorized.impl)[0];
    let err1 = null;
    await p1.draft({ prompt: "p" }, () => {}).catch((e) => {
      err1 = e;
    });
    check("401 maps to unauthorized", err1 && err1.code === "unauthorized", String(err1));

    const broke = fetchMock([
      () =>
        new Response('{"error":{"code":"1113","message":"Insufficient balance"}}', {
          status: 429,
        }),
    ]);
    const p2 = llm.buildProviders(
      { Z_AI_API_KEY: SECRET, Z_AI_API_MODE: "paas" },
      broke.impl,
    )[0];
    let err2 = null;
    await p2.draft({ prompt: "p" }, () => {}).catch((e) => {
      err2 = e;
    });
    check(
      "429 code 1113 maps to insufficient_balance",
      err2 && err2.code === "insufficient_balance",
      String(err2),
    );
  }

  // T5 — available() network policy
  {
    const noNet = fetchMock([]); // any call would throw "unexpected extra call"
    const providers = llm.buildProviders({ Z_AI_API_KEY: SECRET, ANTHROPIC_API_KEY: "" }, noNet.impl);
    const zaiAvailable = await providers[0].available();
    check(
      "available() with key present answers true without network",
      zaiAvailable === true && noNet.calls.length === 0,
      `calls=${noNet.calls.length}`,
    );
    const down = fetchMock([
      () => {
        throw new Error("ECONNREFUSED");
      },
    ]);
    const ollama = llm.buildProviders({}, down.impl)[0];
    check("ollama health check degrades to false", (await ollama.available()) === false);
    const up = fetchMock([() => new Response("{}", { status: 200 })]);
    const ollama2 = llm.buildProviders({}, up.impl)[0];
    check(
      "ollama health check probes GET /v1/models",
      (await ollama2.available()) === true &&
        up.calls[0].url === "http://127.0.0.1:11434/v1/models",
      up.calls[0] && up.calls[0].url,
    );
  }

  // T6 — providersInfo shape, copilot future, no key material
  {
    const down = fetchMock([
      () => {
        throw new Error("down");
      },
    ]);
    const providers = llm.buildProviders({ Z_AI_API_KEY: SECRET }, down.impl);
    const infos = await llm.providersInfo(providers);
    const ids = infos.map((i) => i.id);
    check(
      "providersInfo lists adapters plus copilot as future id",
      ids.join(",") === "zai,ollama,copilot" &&
        infos.every((i) => "available" in i && "model" in i),
      JSON.stringify(infos),
    );
    const copilot = infos[infos.length - 1];
    check(
      "copilot is declared unavailable with null model",
      copilot.id === "copilot" && copilot.available === false && copilot.model === null,
      JSON.stringify(copilot),
    );
    check(
      "provider info payload carries no key material",
      !JSON.stringify(infos).includes(SECRET) && !JSON.stringify(infos).includes("s3cr3t"),
    );
  }

  // T7 — loadDotEnv
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-env-"));
    fs.writeFileSync(
      path.join(dir, ".env"),
      '# comment\nZ_AI_API_KEY="from-file"\nEXISTING=loser\nexport QUOTED=\'q v\'\nBROKEN LINE\n',
    );
    const env = { EXISTING: "winner" };
    llm.loadDotEnv(dir, env);
    check(
      "loadDotEnv parses values, quotes and export prefix",
      env.Z_AI_API_KEY === "from-file" && env.QUOTED === "q v",
      JSON.stringify(env),
    );
    check("loadDotEnv never overrides existing env", env.EXISTING === "winner", env.EXISTING);
    check("loadDotEnv skips malformed lines", !("BROKEN" in env));
    llm.loadDotEnv(path.join(dir, "missing"), env); // no .env: must be a no-op
    check("loadDotEnv without .env is a no-op", env.EXISTING === "winner");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\nSummary: ${RUN} run, ${RUN - FAILED} passed, ${FAILED} failed`);
  process.exit(FAILED === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`suite crashed: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
