import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    {
      message:
        "การตั้งค่าโควตาสาขาต่อร้านทำได้โดย SYSTEM_ADMIN เท่านั้น กรุณาเข้าเมนู System Admin > Config",
    },
    { status: 403 },
  );
}
