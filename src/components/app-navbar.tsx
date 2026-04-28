"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { type AuthUser } from "@/lib/auth";

export function AppNavbar({ user }: { user: AuthUser }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="navbar-slice">
      <div className="navbar-slice__brand">
        <Image className="navbar-slice__logo" src="/assets/img/Ativo-3.svg" alt="Slice" width={92} height={22} />
        <span className="navbar-slice__sep" aria-hidden="true" />
        <span className="navbar-slice__subtitle">Evidence Studio</span>
      </div>

      <div className="navbar-slice__actions">
        <span className="badge-slice">{user.role === "admin" ? "Admin" : "Membro"}</span>
        <span className="navbar-slice__user">{user.name}</span>
        <button onClick={handleLogout} className="btn-slice btn-slice--ghost" type="button" title="Sair">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
