/**
 * Minimal OpenAI-compatible mock for the CLI LLM suite (feature 53).
 *
 * Deliberately NOT the mock inside test_toolbox_serve.sh: that one carries a
 * call counter and prompt routing for six different relays, and its response
 * bytes are pinned by the black-box oracle. This one answers exactly what
 * `toolbox.js review-notes` needs, so the CLI suite can never break the
 * serve suite's parity assertions by editing a shared fixture.
 *
 * Prints `PORT=<n>` on stdout once listening. Streams SSE deltas so the CLI's
 * streaming path is exercised, not just the final result.
 */
const http = require("node:http");

const server = http.createServer((req, res) => {
  // Health probe: the ollama provider entry sets healthCheck: true.
  if (req.method === "GET" && req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
    return;
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    // One line per served completion: the suite counts these to prove that a
    // rejected run never reached the model.
    console.log("SERVED chat/completions");
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const frame = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (body.includes("Feature bajo revision")) {
        // A checklist of QUESTIONS, carrying no verdict token on purpose: the
        // contract is that this output never decides anything.
        frame({ choices: [{ delta: { content: "borrador: verificar todo\n" }, finish_reason: null }] });
        frame({
          choices: [{ delta: { content: "- invariante de solo-lectura respetada?" }, finish_reason: null }],
        });
      } else {
        frame({ choices: [{ delta: { content: "unexpected prompt" }, finish_reason: null }] });
      }
      frame({ choices: [{ delta: {}, finish_reason: "stop" }] });
      res.write("data: [DONE]\n\n");
      res.end();
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end("{}");
});

server.listen(0, "127.0.0.1", () => {
  console.log(`PORT=${server.address().port}`);
});
