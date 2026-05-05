import { redirect } from "next/navigation";
import { AppNavbar } from "@/components/app-navbar";
import { UserManagement } from "@/components/user-management";
import { getCurrentUser } from "@/lib/auth";
import { Users } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/");
  }

  const initialUsers = Users.getAll();

  return (
    <div className="app-shell">
      <AppNavbar user={user} />
      <UserManagement initialUsers={initialUsers} />
    </div>
  );
}
