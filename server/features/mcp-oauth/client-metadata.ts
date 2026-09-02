import { getAllowedClientMetadataOrigins } from "./config.js";

type ClientMetadata = {
  client_id?: string;
  client_name?: string;
  redirect_uris?: unknown;
  token_endpoint_auth_method?: string;
  token_endpoint_auth_methods_supported?: unknown;
};

export type ValidatedClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

export async function validateClientMetadata(
  clientId: string,
  environment = process.env,
  fetcher: typeof fetch = fetch,
): Promise<ValidatedClient> {
  const url = new URL(clientId);
  if (url.protocol !== "https:" || !getAllowedClientMetadataOrigins(environment).has(url.origin)) {
    throw new Error("untrusted_client_metadata_origin");
  }

  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("client_metadata_unavailable");

  const metadata = (await response.json()) as ClientMetadata;
  if (metadata.client_id && metadata.client_id !== clientId) {
    throw new Error("client_id_mismatch");
  }

  const redirectUris = Array.isArray(metadata.redirect_uris)
    ? metadata.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  if (redirectUris.length === 0 || redirectUris.some((uri) => new URL(uri).protocol !== "https:")) {
    throw new Error("invalid_client_redirect_uris");
  }

  const methods = Array.isArray(metadata.token_endpoint_auth_methods_supported)
    ? metadata.token_endpoint_auth_methods_supported
    : [metadata.token_endpoint_auth_method || "none"];
  if (!methods.includes("none")) throw new Error("unsupported_token_endpoint_auth_method");

  return {
    clientId,
    clientName: metadata.client_name?.trim() || new URL(clientId).hostname,
    redirectUris,
  };
}
