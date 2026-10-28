import { NextResponse, type NextRequest } from "next/server";

// Optional site-wide password (HTTP Basic Auth) for test deployments, until real
// sign-in (SSO) exists. Active only when BASIC_AUTH_PASSWORD is set.
export function middleware(request: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();

  const user = process.env.BASIC_AUTH_USER || "josera";
  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");
    if (decoded.slice(0, separator) === user && decoded.slice(separator + 1) === password) {
      return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Campaign Tracker", charset="UTF-8"' },
  });
}

export const config = {
  matcher: "/:path*",
};
