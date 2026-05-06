import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
const DB_READ_ONLY = process.env.VERCEL === "1" || process.env.DB_READONLY === "1";
if (!DB_READ_ONLY && !fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = path.join(dataDir, "users.json");
const LOCK_PATH = path.join(dataDir, "users.lock");
const DEFAULT_PHONE = "4004-2642";

type JsonDB = {
  users: User[];
};

const defaultDb: JsonDB = { users: [] };

function readDb(): JsonDB {
  if (!fs.existsSync(DB_PATH)) {
    if (DB_READ_ONLY) {
      return { ...defaultDb, users: [] };
    }
    writeDb(defaultDb);
    return { ...defaultDb, users: [] };
  }

  try {
    const content = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(content) as Partial<JsonDB>;
    return {
      users: Array.isArray(parsed.users) ? (parsed.users as User[]) : [],
    };
  } catch {
    if (DB_READ_ONLY) {
      return { ...defaultDb, users: [] };
    }
    writeDb(defaultDb);
    return { ...defaultDb, users: [] };
  }
}

function writeDb(data: JsonDB) {
  if (DB_READ_ONLY) {
    throw new Error("DB_READ_ONLY");
  }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, DB_PATH);
}

function sleepSync(ms: number) {
  const shared = new SharedArrayBuffer(4);
  const array = new Int32Array(shared);
  Atomics.wait(array, 0, 0, ms);
}

function withWriteLock<T>(fn: () => T): T {
  const maxAttempts = 200;
  let lockFd: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      lockFd = fs.openSync(LOCK_PATH, "wx");
      break;
    } catch {
      sleepSync(10);
    }
  }

  if (lockFd === null) {
    throw new Error("Nao foi possivel obter lock de escrita do banco JSON");
  }

  try {
    return fn();
  } finally {
    fs.closeSync(lockFd);
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  }
}

function mutateDb<T>(fn: (db: JsonDB) => T): T {
  if (DB_READ_ONLY) {
    throw new Error("DB_READ_ONLY");
  }
  return withWriteLock(() => {
    const db = readDb();
    const result = fn(db);
    writeDb(db);
    return result;
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value?: string) {
  const phone = (value || "").trim();
  return phone || DEFAULT_PHONE;
}

function withoutPassword(user: User): SafeUser {
  const { password_hash: _passwordHash, ...safe } = user;
  return safe;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  website: string;
  password_hash: string;
  role: "admin" | "member";
  created_at: string;
}

export type SafeUser = Omit<User, "password_hash">;

type CreateUserInput = Omit<User, "id" | "created_at" | "password_hash"> & {
  password: string;
};

type UpdateUserInput = Partial<
  Omit<User, "id" | "created_at" | "password_hash"> & {
    password?: string;
  }
>;

function seedDatabase() {
  if (DB_READ_ONLY) {
    return;
  }

  const defaultUsers = [
    {
      id: "infra",
      name: "Infra Admin",
      username: "infra",
      email: "infra@slice.global",
      phone: "",
      title: "Infrastructure",
      department: "Infra",
      website: "https://www.slice.global",
      password: "infra",
      role: "admin" as const,
    },
    {
      id: "riegel",
      name: "Rafael Riegel",
      username: "riegel",
      email: "rafael.riegel@slice.global",
      phone: "4004-2642",
      title: "Infrastructure and Security",
      department: "",
      website: "https://www.slice.global",
      password: "rafael123",
      role: "member" as const,
    },
  ];

  mutateDb((db) => {
    db.users = db.users.map((u) => ({
      ...u,
      username: normalize(u.username || u.id),
      email: normalize(u.email),
      phone: normalizePhone(u.phone),
    }));

    for (const user of defaultUsers) {
      const exists = db.users.some(
        (u) =>
          u.id === user.id ||
          normalize(u.username) === normalize(user.username) ||
          normalize(u.email) === normalize(user.email),
      );

      if (!exists) {
        db.users.push({
          id: user.id,
          name: user.name,
          username: normalize(user.username),
          email: normalize(user.email),
          phone: normalizePhone(user.phone),
          title: user.title,
          department: user.department,
          website: user.website,
          password_hash: bcrypt.hashSync(user.password, 10),
          role: user.role,
          created_at: new Date().toISOString(),
        });
      }
    }
  });
}

seedDatabase();

export const Users = {
  findById(id: string): SafeUser | undefined {
    const db = readDb();
    const user = db.users.find((u) => u.id === id);
    return user ? withoutPassword(user) : undefined;
  },

  findByIdWithPassword(id: string): User | undefined {
    const db = readDb();
    return db.users.find((u) => u.id === id);
  },

  findByEmail(email: string): User | undefined {
    const db = readDb();
    const target = normalize(email);
    return db.users.find((u) => normalize(u.email) === target);
  },

  findByUsername(username: string): User | undefined {
    const db = readDb();
    const target = normalize(username);
    return db.users.find((u) => normalize(u.username) === target);
  },

  getAll(): SafeUser[] {
    const db = readDb();
    return [...db.users]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((u) => withoutPassword(u));
  },

  create(userData: CreateUserInput): SafeUser {
    return mutateDb((db) => {
      const email = normalize(userData.email);
      const username = normalize(userData.username || userData.email);

      if (db.users.some((u) => normalize(u.email) === email)) {
        throw new Error("UNIQUE constraint failed: users.email");
      }

      if (db.users.some((u) => normalize(u.username) === username)) {
        throw new Error("UNIQUE constraint failed: users.username");
      }

      const user: User = {
        id: username,
        name: userData.name,
        username,
        email,
        phone: normalizePhone(userData.phone),
        title: userData.title || "",
        department: userData.department || "",
        website: userData.website || "https://www.slice.global",
        password_hash: bcrypt.hashSync(userData.password, 10),
        role: userData.role,
        created_at: new Date().toISOString(),
      };

      db.users.push(user);
      return withoutPassword(user);
    });
  },

  update(id: string, updates: UpdateUserInput): SafeUser {
    return mutateDb((db) => {
      const index = db.users.findIndex((u) => u.id === id);
      if (index < 0) throw new Error("User not found");

      const current = db.users[index];
      const hasEmailUpdate = typeof updates.email === "string" && updates.email.trim() !== "";
      const hasUsernameUpdate =
        typeof updates.username === "string" && updates.username.trim() !== "";
      const nextEmail = hasEmailUpdate ? normalize(updates.email as string) : current.email;
      const nextUsername = hasUsernameUpdate
        ? normalize(updates.username as string)
        : current.username;

      if (db.users.some((u) => u.id !== id && normalize(u.email) === nextEmail)) {
        throw new Error("UNIQUE constraint failed: users.email");
      }

      if (db.users.some((u) => u.id !== id && normalize(u.username) === nextUsername)) {
        throw new Error("UNIQUE constraint failed: users.username");
      }

      if (db.users.some((u) => u.id !== id && u.id === nextUsername)) {
        throw new Error("UNIQUE constraint failed: users.id");
      }

      const hasPasswordUpdate =
        typeof updates.password === "string" && updates.password.trim() !== "";

      const updated: User = {
        ...current,
        id: nextUsername,
        name: updates.name !== undefined ? updates.name : current.name,
        username: nextUsername,
        email: nextEmail,
        phone:
          updates.phone !== undefined ? normalizePhone(updates.phone) : normalizePhone(current.phone),
        title: updates.title !== undefined ? updates.title : current.title,
        department: updates.department !== undefined ? updates.department : current.department,
        website: updates.website !== undefined ? updates.website : current.website,
        role: updates.role !== undefined ? updates.role : current.role,
        password_hash: hasPasswordUpdate
          ? bcrypt.hashSync(updates.password as string, 10)
          : current.password_hash,
      };

      db.users[index] = updated;
      return withoutPassword(updated);
    });
  },

  delete(id: string): boolean {
    return mutateDb((db) => {
      const before = db.users.length;
      db.users = db.users.filter((u) => u.id !== id);
      return db.users.length !== before;
    });
  },
};

const db = {
  engine: "json",
  path: DB_PATH,
  readOnly: DB_READ_ONLY,
};

export default db;
