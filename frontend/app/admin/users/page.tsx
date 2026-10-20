"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { authApi, adminApi, getRole, User, Category, Role } from "@/lib/api";

export default function AdminUsersPage() {
  return (
    <RequireAuth>
      <AdminUsers />
    </RequireAuth>
  );
}

function AdminUsers() {
  const role = getRole();
  const [users, setUsers] = useState<User[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [uform, setUform] = useState({ email: "", password: "", full_name: "", role: "client" as Role });
  const [cform, setCform] = useState({ name: "", slug: "", parent_id: "" });
  const [error, setError] = useState<string | null>(null);

  const topLevel = cats.filter((c) => !c.parent_id);
  const nameOf = (id?: string | null) =>
    id ? cats.find((c) => c.id === id)?.name || "-" : "—";

  const load = async () => {
    try {
      const [us, cs] = await Promise.all([authApi.listUsers(), adminApi.categories()]);
      setUsers(us);
      setCats(cs);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "admin") return <p className="error">Forbidden: admin access only</p>;

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.adminCreateUser(uform);
      setUform({ email: "", password: "", full_name: "", role: "client" });
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to create user");
    }
  };

  const setRole = async (id: string, r: Role) => {
    try {
      await authApi.setUserRole(id, r);
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to update role");
    }
  };

  const createCat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createCategory({
        name: cform.name,
        slug: cform.slug || undefined,
        parent_id: cform.parent_id || null,
      });
      setCform({ name: "", slug: "", parent_id: "" });
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Admin - Users &amp; Categories</h1>
      {error && <div className="error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>Users</h2>
          <form onSubmit={createUser}>
            <div className="grid cols-2">
              <input placeholder="Email" value={uform.email} onChange={(e) => setUform({ ...uform, email: e.target.value })} required />
              <input type="password" placeholder="Password" minLength={6} value={uform.password} onChange={(e) => setUform({ ...uform, password: e.target.value })} required />
              <input placeholder="Full name" value={uform.full_name} onChange={(e) => setUform({ ...uform, full_name: e.target.value })} />
              <select value={uform.role} onChange={(e) => setUform({ ...uform, role: e.target.value as Role })}>
                <option value="client">cx (customer)</option>
                <option value="merchant">seller (merchant)</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button type="submit" style={{ marginTop: 12 }}>
              Create user
            </button>
          </form>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span className="pill">{u.role || "client"}</span>
                  </td>
                  <td>
                    <select value={u.role || "client"} onChange={(e) => setRole(u.id, e.target.value as Role)}>
                      <option value="client">cx (customer)</option>
                      <option value="merchant">seller (merchant)</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Categories &amp; Sub-categories</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 12 }}>
            Shared catalog: sellers pick these when adding products, customers browse them.
          </p>
          <form onSubmit={createCat} className="row">
            <input placeholder="Name" value={cform.name} onChange={(e) => setCform({ ...cform, name: e.target.value })} required />
            <input placeholder="Slug (optional)" value={cform.slug} onChange={(e) => setCform({ ...cform, slug: e.target.value })} />
            <select value={cform.parent_id} onChange={(e) => setCform({ ...cform, parent_id: e.target.value })}>
              <option value="">Top-level category</option>
              {topLevel.map((c) => (
                <option key={c.id} value={c.id}>
                  Sub-category of {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="grow-0">
              Add
            </button>
          </form>
          <table style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Parent</th>
                <th>Slug</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td>{c.parent_id ? `↳ ${c.name}` : c.name}</td>
                  <td>
                    <span className={`pill ${c.parent_id ? "" : "ok"}`}>
                      {c.parent_id ? "sub-category" : "category"}
                    </span>
                  </td>
                  <td className="muted">{c.parent_id ? nameOf(c.parent_id) : "—"}</td>
                  <td className="mono">{c.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
