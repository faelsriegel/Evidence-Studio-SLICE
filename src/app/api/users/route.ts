import { NextRequest, NextResponse } from "next/server";
import { Users } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const verified = await verifyToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Token invalido" }, { status: 401 });
    }

    if (verified.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const users = Users.getAll();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error listing users:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const verified = await verifyToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Token invalido" }, { status: 401 });
    }

    if (verified.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { name, username, email, phone, title, department, website, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Campos obrigatorios: name, email, password" },
        { status: 400 },
      );
    }

    const user = Users.create({
      name,
      username: username || email,
      email,
      phone: phone || "",
      title: title || "",
      department: department || "",
      website: website || "https://www.slice.global",
      password,
      role: "member",
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    console.error("Error creating user:", error);

    const message = error instanceof Error ? error.message : "";
    if (message === "DB_READ_ONLY") {
      return NextResponse.json(
        { error: "Ambiente somente leitura: edite data/users.json localmente e faca deploy." },
        { status: 403 },
      );
    }

    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "Email ou username ja cadastrado" }, { status: 400 });
    }

    return NextResponse.json({ error: "Erro ao criar usuario" }, { status: 500 });
  }
}
