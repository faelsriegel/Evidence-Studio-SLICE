import { NextRequest, NextResponse } from "next/server";
import { Users } from "@/lib/db";
import { verifyToken } from "@/lib/auth";

function resolveUserByIdentifier(identifier: string) {
  return Users.findByUsername(identifier) || Users.findById(identifier);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const verified = await verifyToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Token invalido" }, { status: 401 });
    }

    const { id } = await params;
    const user = resolveUserByIdentifier(id);
    if (!user) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    if (verified.role !== "admin" && verified.userId !== user.id && verified.username !== user.username) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error getting user:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const verified = await verifyToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Token invalido" }, { status: 401 });
    }

    const { id } = await params;
    const targetUser = resolveUserByIdentifier(id);
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    if (
      verified.role !== "admin" &&
      verified.userId !== targetUser.id &&
      verified.username !== targetUser.username
    ) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const user = Users.update(targetUser.id, body);

    return NextResponse.json(user);
  } catch (error: unknown) {
    console.error("Error updating user:", error);

    const message = error instanceof Error ? error.message : "";
    if (message === "DB_READ_ONLY") {
      return NextResponse.json(
        { error: "Ambiente somente leitura: edite data/users.json localmente e faca deploy." },
        { status: 403 },
      );
    }

    if (message === "User not found") {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "Email ou username ja cadastrado" }, { status: 400 });
    }

    return NextResponse.json({ error: "Erro ao atualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const targetUser = resolveUserByIdentifier(id);
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    if (verified.userId === targetUser.id || verified.username === targetUser.username) {
      return NextResponse.json(
        { error: "Voce nao pode deletar sua propria conta" },
        { status: 400 },
      );
    }

    const deleted = Users.delete(targetUser.id);
    if (!deleted) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    return NextResponse.json({ message: "Usuario deletado" });
  } catch (error: unknown) {
    console.error("Error deleting user:", error);

    const message = error instanceof Error ? error.message : "";
    if (message === "DB_READ_ONLY") {
      return NextResponse.json(
        { error: "Ambiente somente leitura: edite data/users.json localmente e faca deploy." },
        { status: 403 },
      );
    }

    return NextResponse.json({ error: "Erro ao deletar usuario" }, { status: 500 });
  }
}
