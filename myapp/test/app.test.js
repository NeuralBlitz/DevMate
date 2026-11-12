import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { app } from "../app.js";

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("GET / returns a successful JSON response", async () => {
  const response = await fetch(baseUrl + "/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await response.json(), { ok: true });
});

test("Unknown routes return HTTP 404", async () => {
  const response = await fetch(baseUrl + "/not-found");
  assert.equal(response.status, 404);
});
