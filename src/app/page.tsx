import { EvidenceGenerator } from "@/components/evidence-generator";
import { AppNavbar } from "@/components/app-navbar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <AppNavbar user={user} />
      <EvidenceGenerator />
    </div>
  );
}
