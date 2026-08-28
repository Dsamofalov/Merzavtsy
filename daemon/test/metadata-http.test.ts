import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMetadataRequest } from "../src/metadata-server.js";

const metadata = {
  tokenId: 7n,
  name: "Мерзавец #7",
  description: "dynamic biography",
  image: "data:image/svg+xml,%3Csvg%2F%3E",
  attributes: [{ trait_type: "Стадия", value: 2 }],
};

describe("metadata HTTP surface", () => {
  it("serves /metadata/:tokenId with deterministic JSON/cache headers", async () => {
    const response = await handleMetadataRequest("/metadata/7", async (tokenId) => {
      assert.equal(tokenId, 7n);
      return metadata;
    });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).name, "Мерзавец #7");
    assert.match(response.headers.etag, /^"0x[0-9a-f]{64}"$/);
  });

  it("rejects malformed paths and returns 404 for unknown creatures", async () => {
    assert.equal((await handleMetadataRequest("/health", async () => metadata)).status, 404);
    assert.equal((await handleMetadataRequest("/metadata/not-a-number", async () => metadata)).status, 400);
    assert.equal((await handleMetadataRequest("/metadata/99", async () => null)).status, 404);
  });
});
