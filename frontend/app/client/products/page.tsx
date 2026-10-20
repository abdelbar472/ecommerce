"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { clientApi, Category, Product, getRole } from "@/lib/api";

export default function ClientProductsPage() {
  return (
    <RequireAuth>
      <ClientProducts />
    </RequireAuth>
  );
}

function ClientProducts() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cat, setCat] = useState("");
  const [subcat, setSubcat] = useState("");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = getRole();

  const topLevel = categories.filter((c) => !c.parent_id);
  const subOptions = categories.filter((c) =>
    cat ? c.parent_id === cat : !!c.parent_id
  );
  const nameOf = (id?: string | null) =>
    id ? categories.find((c) => c.id === id)?.name || "" : "";

  const load = async () => {
    try {
      setCategories(await clientApi.categories());
      setProducts(
        await clientApi.products({
          category_id: cat || undefined,
          subcategory_id: subcat || undefined,
        })
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, subcat]);

  const filtered = products.filter((p) =>
    q ? p.name.toLowerCase().includes(q.toLowerCase()) : true
  );

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id: string) =>
    setCart((c) => {
      const n = (c[id] || 0) - 1;
      if (n <= 0) {
        const next = { ...c };
        delete next[id];
        return next;
      }
      return { ...c, [id]: n };
    });

  const placeOrder = async () => {
    if (role !== "client") return setError("Only clients can place orders");
    const items = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (items.length === 0) return setError("Cart is empty");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const o = await clientApi.createOrder(items);
      setNotice(`Order ${o.id.slice(0, 8)}… created ($${o.total.toFixed(2)})`);
      setCart({});
      load();
    } catch (err: any) {
      setError(err?.message || "Failed to place order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Shop</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Pick a category / sub-category, add to cart and check out. Purchase history lives under
        My Orders.
      </p>

      {error && <div className="error">{error}</div>}
      {notice && (
        <div className="pill ok" style={{ display: "block", marginBottom: 14 }}>
          {notice}
        </div>
      )}

      <div className="row" style={{ alignItems: "center" }}>
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setSubcat("");
          }}
        >
          <option value="">All categories</option>
          {topLevel.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={subcat}
          onChange={(e) => setSubcat(e.target.value)}
          disabled={subOptions.length === 0}
        >
          <option value="">All sub-categories</option>
          {subOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input placeholder="Search products..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ghost small" onClick={load}>
          Refresh
        </button>
        <button onClick={placeOrder} disabled={busy || role !== "client"}>
          {busy ? "Placing…" : `Place order (${Object.keys(cart).length} items)`}
        </button>
      </div>

      <div className="grid cols-3" style={{ marginTop: 20 }}>
        {filtered.map((p) => (
          <div key={p.id} className="card">
            <div className="row" style={{ alignItems: "center", gap: 6 }}>
              <span className="pill">{nameOf(p.category_id) || "uncategorised"}</span>
              {p.subcategory_id && <span className="pill ok">{nameOf(p.subcategory_id)}</span>}
            </div>
            <h3 style={{ marginTop: 8 }}>{p.name}</h3>
            <p className="muted" style={{ minHeight: 40 }}>
              {p.description || "—"}
            </p>
            <div className="row" style={{ alignItems: "center" }}>
              <strong>${p.price.toFixed(2)}</strong>
              <span className="muted">Stock {p.stock}</span>
              <span className={`pill ${p.is_active ? "ok" : "err"}`}>
                {p.is_active ? "active" : "inactive"}
              </span>
            </div>
            {role === "client" && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="ghost small" onClick={() => sub(p.id)}>
                  -
                </button>
                <span style={{ minWidth: 40, textAlign: "center" }}>
                  {cart[p.id] || 0}
                </span>
                <button className="ghost small" onClick={() => add(p.id)}>
                  +
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
