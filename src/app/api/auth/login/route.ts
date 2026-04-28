import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, generateToken, resolveUserFromCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { identifier, password, remember } = await request.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Usuario/email e senha sao obrigatorios." },
        { status: 400 },
      );
    }

    const user = resolveUserFromCredentials(String(identifier), String(password));
    if (!user) {
      return NextResponse.json({ error: "Credenciais invalidas." }, { status: 401 });
    }

    const expiresIn = remember ? "7d" : "12h";
    const token = await generateToken(user, expiresIn);

    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(remember ? { maxAge: 60 * 60 * 24 * 7 } : {}),
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Erro ao processar login." }, { status: 500 });
  }
}
