"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { merchantApi, getRole, Product, Category } from "@/lib/api";

export default function MerchantProductsPage() {
  return (
    <RequireAuth>
      <MerchantProducts />
    </RequireAuth>
  );
}

function MerchantProducts() {
  const role = getRole();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "0",
    category_id: "",
    subcategory_id: "",
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const catName = (id?: string | null) =>
    id ? categories.find((c) => c.id === id)?.name || "-" : "—";
  const subcategories = categories.filter((c) => c.parent_id === form.category_id);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([merchantApi.products(), merchantApi.categories()]);
      setProducts(p);
      setCategories(c);
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
    setError(null);
    setNotice(null);
    try {
      await merchantApi.createProduct({
        ...form,
        price: Number(form.price),
        stock: Number(form.stock),
        subcategory_id: form.subcategory_id || null,
      });
      setForm({
        name: "",
        description: "",
        price: "",
        stock: "0",
        category_id: "",
        subcategory_id: "",
        is_active: true,
      });
      setNotice("Product created");
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to create product");
    }
  };

  const toggle = async (p: Product) => {
    try {
      await merchantApi.updateProduct(p.id, { is_active: !p.is_active });
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to update");
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await merchantApi.removeProduct(id);
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete");
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 22 }}>My Products</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Add products with a price, then pick a category and sub-category.
      </p>

      {error && <div className="error">{error}</div>}
      {notice && (
        <div className="pill ok" style={{ display: "block", marginBottom: 14 }}>
          {notice}
        </div>
      )}

      <div className="card">
        <h2>Create product</h2>
        <form onSubmit={create}>
          <div className="grid cols-2">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>Category</label>
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value, subcategory_id: "" })
                }
                required
              >
                <option value="">Select category</option>
                {categories
                  .filter((c) => !c.parent_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label>Sub-category {subcategories.length === 0 && "(optional)"}</label>
              <select
                value={form.subcategory_id}
                onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}
                disabled={!form.category_id || subcategories.length === 0}
              >
                <option value="">
                  {form.category_id ? "No sub-category" : "Pick a category first"}
                </option>
                {subcategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Price</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div>
              <label>Stock</label>
              <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} style={{ width: "auto" }} />
            Active
          </label>
          <button type="submit" style={{ marginTop: 14 }}>
            Create product
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Products ({products.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Sub-category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{catName(p.category_id)}</td>
                <td className="muted">{catName(p.subcategory_id)}</td>
                <td>${p.price.toFixed(2)}</td>
                <td>{p.stock}</td>
                <td>
                  <span className={`pill ${p.is_active ? "ok" : "err"}`}>{p.is_active ? "active" : "inactive"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="ghost small" onClick={() => toggle(p)}>
                    {p.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button className="ghost small" onClick={() => del(p.id)} style={{ marginLeft: 6 }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
