// Railway terminates TLS at its edge; Next.js can see an internal HTTP URL.
// Use the platform-provided public domain, never client forwarding headers,
// for the public origin used by CSRF checks and staff sign-in redirects.
export function requestOrigin(request, env = process.env) {
  const domain = env.RAILWAY_PUBLIC_DOMAIN;
  if (domain && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain)) {
    return `https://${domain.toLowerCase()}`;
  }
  return request.nextUrl.origin;
}
