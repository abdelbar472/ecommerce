"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { merchantApi, getRole, Category } from "@/lib/api";

export default function MerchantCategoriesPage() {
  return (
    <RequireAuth>
      <MerchantCategories />
    </RequireAuth>
  );
}

function MerchantCategories() {
  const role = getRole();
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", parent_id: "" });
  const [error, setError] = useState<string | null>(null);

  const topLevel = cats.filter((c) => !c.parent_id);
  const nameOf = (id?: string | null) =>
    id ? cats.find((c) => c.id === id)?.name || "-" : "—";

  const load = async () => {
    try {
      setCats(await merchantApi.categories());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    }
  };

  useEffect(() => {
    if (role !== "merchant" && role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (role !== "merchant" && role !== "admin") {
    return <p className="error">Forbidden: merchant access only</p>;
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await merchantApi.createCategory({
        name: form.name,
        slug: form.slug || undefined,
        parent_id: form.parent_id || null,
      });
      setForm({ name: "", slug: "", parent_id: "" });
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Categories</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Categories and sub-categories you can pick for your products.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <h2>Add category / sub-category</h2>
        <form onSubmit={create} className="row">
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Slug (optional)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">Top-level category</option>
            {topLevel.map((c) => (
              <option key={c.id} value={c.id}>
                Sub-category of {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="grow-0">
            Create
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Categories ({cats.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Parent</th>
              <th>Slug</th>
              <th>Products</th>
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
                <td>{c.products_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
