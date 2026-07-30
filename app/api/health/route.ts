export async function GET() {
  try {
    const { healthCheck } = await import("@/app/lib/edge-harness");
    return Response.json(await healthCheck());
  } catch (error) {
    return Response.json(
      {
        status: "unavailable",
        service: "carepulse-edge-harness",
        persistence: "D1",
        error: error instanceof Error ? error.message : "readiness check failed",
      },
      { status: 503 },
    );
  }
}
