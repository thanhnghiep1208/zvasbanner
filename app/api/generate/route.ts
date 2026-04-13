import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, message: "Not implemented" }, { status: 501 });
}
