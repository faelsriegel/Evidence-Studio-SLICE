import { redirect } from "next/navigation";
import Image from "next/image";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "Login",
  description: "Acesso ao Gerador de Evidencias",
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  return (
    <>
      <div className="bg-glow" aria-hidden="true" />

      <div className="split">
        <aside className="split__left">
          <Image className="brand-logo" src="/assets/img/Ativo-3.svg" alt="Slice" width={108} height={50} priority />

          <div className="split__center">
            <div className="hero anim-fade-up">
              <p className="hero__eyebrow">Evidence Studio</p>
              <h1 className="hero__title">
                Evidencias corporativas <br />
                para <em> auditoria</em>.
              </h1>
              <p className="hero__sub">
                Padronize a emissao de evidencias para DPO, LGPD e SI com
                formato unico e rastreavel.
              </p>
            </div>
          </div>
        </aside>

        <main className="split__right">
          <div className="form-wrap anim-fade-up anim-fade-up--d1">
            <h2 className="form-title">Acesse sua conta</h2>
            <LoginForm />
          </div>
        </main>
      </div>
    </>
  );
}
