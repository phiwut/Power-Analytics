const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/healthz") {
      return Response.json({ status: "ok" }, { headers: jsonHeaders });
    }

    return Response.json(
      { error: "Not found" },
      { status: 404, headers: jsonHeaders },
    );
  },
} satisfies ExportedHandler;
