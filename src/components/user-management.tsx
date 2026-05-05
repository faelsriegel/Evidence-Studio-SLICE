"use client";

import { useMemo, useState } from "react";

interface UserItem {
  id: string;
  name: string;
  email: string;
  username: string;
  phone: string;
  title: string;
  department: string;
  website: string;
  role: "admin" | "member";
}

type FormState = {
  name: string;
  username: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  website: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  username: "",
  email: "",
  phone: "",
  title: "",
  department: "",
  website: "https://www.slice.global",
  password: "",
};

function sanitizeApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  return fallback;
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function UserManagement({ initialUsers }: { initialUsers: UserItem[] }) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [users],
  );

  async function reloadUsers() {
    try {
      setLoading(true);
      const res = await fetch("/api/users", { cache: "no-store" });
      const payload = await readResponseBody(res);

      if (!res.ok) {
        throw new Error(sanitizeApiError(payload, "Falha ao carregar usuarios"));
      }

      if (!Array.isArray(payload)) {
        throw new Error("Resposta invalida ao carregar usuarios");
      }

      setUsers(payload as UserItem[]);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormMessage("");
    setShowModal(true);
  }

  function openEditModal(user: UserItem) {
    setEditingUser(user);
    setForm({
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone || "",
      title: user.title || "",
      department: user.department || "",
      website: user.website || "https://www.slice.global",
      password: "",
    });
    setFormMessage("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormMessage("");
  }

  async function handleSubmit() {
    setFormMessage("");

    if (!form.name || !form.email) {
      setFormMessage("Preencha nome e email.");
      return;
    }

    if (!editingUser && !form.password.trim()) {
      setFormMessage("Informe uma senha temporaria.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const payload = await readResponseBody(res);

        if (!res.ok) {
          throw new Error(sanitizeApiError(payload, "Falha ao atualizar usuario"));
        }
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, role: "member" }),
        });
        const payload = await readResponseBody(res);

        if (!res.ok) {
          throw new Error(sanitizeApiError(payload, "Falha ao criar usuario"));
        }
      }

      closeModal();
      await reloadUsers();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!window.confirm("Tem certeza que deseja deletar este usuario?")) return;

    try {
      setDeleting(userId);
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const payload = await readResponseBody(res);

      if (!res.ok) {
        throw new Error(sanitizeApiError(payload, "Falha ao deletar usuario"));
      }

      await reloadUsers();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Erro ao deletar usuario");
    } finally {
      setDeleting(null);
    }
  }

  function initials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  function field(
    id: keyof FormState,
    label: string,
    type = "text",
    required = false,
    full = false,
  ) {
    return (
      <div key={id} className={`field${full ? " field--full" : ""}`}>
        <label className="field__label" htmlFor={`user-${id}`}>
          {label}
        </label>
        <input
          className="field__input"
          id={`user-${id}`}
          name={id}
          type={type}
          value={form[id]}
          onChange={(event) => setForm((prev) => ({ ...prev, [id]: event.target.value }))}
          required={required}
        />
      </div>
    );
  }

  return (
    <>
      <div className={`modal${showModal ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
        <div className="modal__backdrop" onClick={closeModal} />
        <div className="modal__panel">
          <div className="modal__header">
            <div className="modal__header-left">
              <p className="modal__eyebrow">Admin - Equipe Slice</p>
              <h2 className="modal__title" id="user-modal-title">
                {editingUser ? "Editar usuario" : "Novo usuario"}
              </h2>
            </div>
            <button className="modal__close" onClick={closeModal} aria-label="Fechar">
              &times;
            </button>
          </div>

          <div className="modal__body">
            <div className="modal__grid">
              {field("name", "Nome completo", "text", true)}
              {!editingUser && field("username", "Usuario (login)", "text")}
              {field("email", "Email", "email", true)}
              {field("title", "Cargo", "text")}
              {field("department", "Time (opcional)", "text")}
              {field("phone", "Telefone", "tel")}
              {field("website", "Site", "url")}
              {editingUser
                ? field("password", "Nova senha (opcional)", "password", false, true)
                : field("password", "Senha temporaria", "text", true, true)}
            </div>
            <p className="feedback feedback--error" role="status">
              {formMessage}
            </p>
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Salvando..." : editingUser ? "Salvar alteracoes" : "Criar usuario"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={closeModal}>
              Cancelar
            </button>
          </div>
        </div>
      </div>

      <div className="app">
        <main className="app__body">
          <div className="page-hero anim-fade-up">
            <p className="card__eyebrow">Equipe SLICE</p>
            <h1 className="page-hero__title">Usuarios e permissoes</h1>
            <p className="page-hero__sub">
              Gestao centralizada para cadastro, edicao e controle de acesso por perfil.
            </p>
          </div>

          <section className="card anim-fade-up anim-fade-up--d1" aria-labelledby="users-heading">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
              <h2 className="card__title" id="users-heading" style={{ marginBottom: 0 }}>
                Usuarios
              </h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn--ghost" onClick={reloadUsers} disabled={loading}>
                  {loading ? "Atualizando..." : "Atualizar"}
                </button>
                <button className="btn btn--primary" onClick={openCreateModal}>
                  + Novo usuario
                </button>
              </div>
            </div>

            {formMessage ? <p className="feedback feedback--error">{formMessage}</p> : null}

            {loading ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : (
              <div className="user-list">
                {sortedUsers.map((user) => (
                  <div key={user.id} className="user-card">
                    <div className="user-card__avatar">{initials(user.name)}</div>
                    <div className="user-card__meta">
                      <p className="user-card__name">{user.name}</p>
                      <p className="user-card__role">
                        {user.title
                          ? `${user.title}${user.department ? " - " + user.department : ""}`
                          : user.email}
                      </p>
                    </div>
                    <div className="user-card__actions">
                      <button className="btn btn--ghost" onClick={() => openEditModal(user)}>
                        Editar
                      </button>
                      {user.role !== "admin" ? (
                        <button
                          className="btn btn--ghost"
                          onClick={() => handleDelete(user.id)}
                          disabled={deleting === user.id}
                          style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
                        >
                          {deleting === user.id ? "..." : "Deletar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
