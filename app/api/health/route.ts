export async function GET() {
  return Response.json({
    status: "ok",
    service: "carepulse-edge-harness",
    persistence: "D1",
  });
}
