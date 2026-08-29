import type { CreatureMetadata } from "./metadata.js";
import { buildMetadataApiResponse } from "./metadata-api.js";

export interface MetadataHttpResponse {
  status: 200 | 400 | 404;
  headers: Record<string, string>;
  body: string;
}

export type MetadataLoader = (tokenId: bigint) => Promise<CreatureMetadata | null>;

function jsonError(status: 400 | 404, error: string): MetadataHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({ error }),
  };
}

/**
 * Pure request handler for the public metadata surface. Transport adapters can
 * map Node/Fetch HTTP requests onto this function without coupling metadata
 * projection to a specific web framework.
 */
export async function handleMetadataRequest(
  pathname: string,
  loadMetadata: MetadataLoader,
): Promise<MetadataHttpResponse> {
  if (!pathname.startsWith("/metadata/")) {
    return jsonError(404, "not found");
  }

  const rawTokenId = pathname.slice("/metadata/".length);
  if (!/^[1-9][0-9]*$/.test(rawTokenId)) {
    return jsonError(400, "invalid token id");
  }

  const metadata = await loadMetadata(BigInt(rawTokenId));
  if (metadata === null) {
    return jsonError(404, "creature not found");
  }

  return buildMetadataApiResponse(metadata);
}
