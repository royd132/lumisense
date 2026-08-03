import { roleForUser } from "./edge-harness";

export type EdgePrincipal = {
  agentId: string;
  email: string;
  displayName: string;
  role: string;
};

const PRIVILEGED_ROLES = new Set(["SUPERVISOR", "RISK_MANAGER", "ADMIN"]);

function decodedFullName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (
    !encoded ||
    request.headers.get("oai-authenticated-user-full-name-encoding") !==
      "percent-encoded-utf-8"
  ) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function principalForRequest(
  request: Request,
  options: { allowPublicDemo?: boolean } = {},
): Promise<EdgePrincipal | null> {
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (authenticatedEmail) {
    const role = (await roleForUser(authenticatedEmail)).toUpperCase();
    return {
      agentId: authenticatedEmail,
      email: authenticatedEmail,
      displayName: decodedFullName(request) ?? authenticatedEmail,
      role,
    };
  }

  const url = new URL(request.url);
  if (
    options.allowPublicDemo &&
    (url.hostname.endsWith(".chatgpt.site") || url.hostname === "chatgpt.site")
  ) {
    return {
      agentId: "public-demo",
      email: "public-demo@lumisense.invalid",
      displayName: "公开演示访客",
      role: "AGENT",
    };
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    const email = (
      request.headers.get("x-agent-id") ?? "local_agent@example.test"
    ).toLowerCase();
    return {
      agentId: email,
      email,
      displayName: "本地测试客服",
      role: (request.headers.get("x-agent-role") ?? "AGENT").toUpperCase(),
    };
  }
  return null;
}

export function canReadAllCases(principal: EdgePrincipal) {
  return PRIVILEGED_ROLES.has(principal.role);
}

export function isSupervisor(principal: EdgePrincipal) {
  return PRIVILEGED_ROLES.has(principal.role);
}
