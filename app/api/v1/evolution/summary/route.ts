export async function GET() {
  const { getLumisenseEvolutionSummary } = await import(
    "../../../../lib/edge-harness"
  );
  return Response.json({
    code: 0,
    message: "ok",
    data: await getLumisenseEvolutionSummary(),
  }, { headers: { "Cache-Control": "no-store" } });
}
