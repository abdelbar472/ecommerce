// API client for the Kafka demo backend.
// All calls go through same-origin /api/* (Next.js rewrites to services).

const TOKEN_KEY = "fk_token";
const EMAIL_KEY = "fk_email";
const ROLE_KEY = "fk_role";

export type Role = "admin" | "merchant" | "client";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(EMAIL_KEY);
}

export function getRole(): Role | null {
  if (typeof window === "undefined") return null;
  return (window.localStorage.getItem(ROLE_KEY) as Role) || null;
}

export function setSession(token: string, email: string, role?: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(EMAIL_KEY, email);
  if (role) window.localStorage.setItem(ROLE_KEY, role);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

/** Role-scoped landing page issued from the JWT `role` / `party` claim. */
export function dashboardPath(role?: Role | null): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "merchant") return "/merchant/dashboard";
  if (role === "client") return "/client/dashboard";
  return "/login";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers, cache: "no-store" });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the service running?");
  }

  if (res.status === 401) {
    clearSession();
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === "string") detail = data.detail;
      else if (data) detail = JSON.stringify(data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------- Types ---------- */
export type OrderItem = { name: string; qty: number; price: number };

export type Order = {
  id: string;
  user_email: string;
  total: number;
  items: OrderItem[];
  created_at: string;
};

export type Notification = {
  id: string;
  event_id: string;
  order_id: string;
  user_email: string;
  total: number;
  items: OrderItem[];
  message: string;
  created_at: string;
  read: boolean;
};

export type Summary = {
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  unique_customers: number;
};

export type ProductStat = { name: string; quantity_sold: number; revenue: number };
export type CustomerStat = { user_email: string; orders_count: number; total_spent: number };
export type EventRow = {
  order_id: string;
  user_email: string;
  total: number;
  items_count: number;
  created_at: string;
};

export type User = {
  id: string;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  role?: Role;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: Role;
};

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  parent_name?: string | null;
  created_at: string;
  products_count?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category_id: string;
  subcategory_id?: string | null;
  merchant_id?: string;
  merchant_email?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  category?: Category | null;
}

export interface ClientOrderItem {
  product_id?: string;
  product_name?: string;
  quantity: number;
  price: number;
}

export interface ClientOrder {
  id: string;
  user_id: string;
  user_email: string;
  total: number;
  status: string;
  created_at: string;
  items: ClientOrderItem[];
}

export type StatusCounts = Record<string, number>;

export interface ClientDashboard {
  email: string | null;
  total_orders: number;
  total_spent: number;
  items_bought: number;
  by_status: StatusCounts;
  recent_orders: ClientOrder[];
}

export interface ProductSales {
  product_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface MerchantDashboard {
  email: string | null;
  total_orders: number;
  total_revenue: number;
  items_sold: number;
  pending_orders: number;
  by_status: StatusCounts;
  top_products: ProductSales[];
  recent_orders: ClientOrder[];
}

export interface CustomerAnalytics {
  user_id: string;
  user_email: string | null;
  orders: number;
  total_spent: number;
}

export interface SellerAnalytics {
  merchant_id: string;
  merchant_email: string | null;
  products: number;
  items_sold: number;
  orders: number;
  revenue: number;
}

export interface AdminDashboard {
  total_orders: number;
  total_revenue: number;
  total_customers: number;
  total_sellers: number;
  total_products: number;
  active_products: number;
  total_categories: number;
  total_subcategories: number;
  customers: CustomerAnalytics[];
  sellers: SellerAnalytics[];
}

/** Self-service sign-up roles: a customer (cx) or a seller. Admin is invite-only. */
export type RegisterRole = Extract<Role, "client" | "merchant">;

/** Human label for the JWT role shown in the UI. */
export function roleLabel(role?: Role | null): string {
  if (role === "merchant") return "seller";
  if (role === "client") return "cx";
  return role || "";
}

/* ---------- Auth Service ---------- */
export const authApi = {
  register: (email: string, password: string, full_name?: string, role: RegisterRole = "client") =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: full_name || null, role }),
    }),
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const t = await request<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setSession(t.access_token, t.email, t.role);
    return t;
  },
  me: () => request<User>("/api/auth/me"),
  users: () => request<User[]>("/api/auth/users"),
  listUsers: () => request<User[]>("/api/auth/users"),
  adminCreateUser: (data: { email: string; password: string; full_name?: string; role: Role }) =>
    request<User>("/api/auth/admin/users", { method: "POST", body: JSON.stringify(data) }),
  setUserRole: (userId: string, role: Role) =>
    request<User>(`/api/auth/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
};

/* ---------- Order Service ---------- */
export const orderApi = {
  list: () => request<Order[]>("/api/orders"),
  create: (user_email: string, items: OrderItem[]) =>
    request<Order>("/api/orders", { method: "POST", body: JSON.stringify({ user_email, items }) }),
  get: (id: string) => request<Order>(`/api/orders/${id}`),
};

/* ---------- Notification Service ---------- */
export const notificationApi = {
  list: () => request<Notification[]>("/api/notifications"),
  get: (id: string) => request<Notification>(`/api/notifications/${id}`),
};

/* ---------- Analytics Service ---------- */
export const analyticsApi = {
  summary: () => request<Summary>("/api/analytics/summary"),
  topProducts: (limit = 10) => request<ProductStat[]>(`/api/analytics/top-products?limit=${limit}`),
  topCustomers: (limit = 10) => request<CustomerStat[]>(`/api/analytics/top-customers?limit=${limit}`),
  events: () => request<EventRow[]>("/api/analytics/events"),
};

/* ---------- Client Service ---------- */
export const clientApi = {
  categories: (params?: { parent_id?: string }) => {
    const qs = params && params.parent_id ? `?parent_id=${encodeURIComponent(params.parent_id)}` : "";
    return request<Category[]>(`/api/client/categories${qs}`);
  },
  products: (params?: Record<string, any>) => {
    const entries = Object.entries(params || {}).filter(
      ([, v]) => v !== undefined && v !== null && v !== ""
    );
    const qs = entries.length ? "?" + new URLSearchParams(entries as any).toString() : "";
    return request<Product[]>(`/api/client/products${qs}`);
  },
  product: (id: string) => request<Product>(`/api/client/products/${id}`),
  createOrder: (items: { product_id: string; quantity: number }[]) =>
    request<ClientOrder>("/api/client/orders", { method: "POST", body: JSON.stringify({ items }) }),
  orders: () => request<ClientOrder[]>("/api/client/orders"),
  order: (id: string) => request<ClientOrder>(`/api/client/orders/${id}`),
  dashboard: () => request<ClientDashboard>("/api/client/dashboard"),
};

/* ---------- Merchant Service ---------- */
export const merchantApi = {
  categories: (params?: { parent_id?: string }) => {
    const qs = params && params.parent_id ? `?parent_id=${encodeURIComponent(params.parent_id)}` : "";
    return request<Category[]>(`/api/merchant/categories${qs}`);
  },
  createCategory: (c: { name: string; slug?: string; parent_id?: string | null }) =>
    request<Category>("/api/merchant/categories", { method: "POST", body: JSON.stringify(c) }),
  products: () => request<Product[]>("/api/merchant/products"),
  product: (id: string) => request<Product>(`/api/merchant/products/${id}`),
  createProduct: (p: any) => request<Product>("/api/merchant/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: string, p: any) => request<Product>(`/api/merchant/products/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  removeProduct: (id: string) => request<void>(`/api/merchant/products/${id}`, { method: "DELETE" }),
  orders: () => request<ClientOrder[]>("/api/merchant/orders"),
  updateOrderStatus: (id: string, status: string) =>
    request<ClientOrder>(`/api/merchant/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  dashboard: () => request<MerchantDashboard>("/api/merchant/dashboard"),
};

/* ---------- Admin Service ---------- */
export const adminApi = {
  audit: (limit = 100) => request<any[]>(`/api/admin/audit?limit=${limit}`),
  logAudit: (body: any) => request<any>("/api/admin/audit", { method: "POST", body: JSON.stringify(body) }),
  categories: () => request<Category[]>("/api/admin/categories"),
  createCategory: (c: any) => request<Category>("/api/admin/categories", { method: "POST", body: JSON.stringify(c) }),
  products: () => request<any[]>("/api/admin/products"),
  syncProduct: (body: any) => request<any>("/api/admin/products/sync", { method: "POST", body: JSON.stringify(body) }),
  metrics: (limit = 50) => request<any[]>(`/api/admin/metrics?limit=${limit}`),
  recordMetric: (body: any) => request<any>("/api/admin/metrics", { method: "POST", body: JSON.stringify(body) }),
  dashboard: () => request<AdminDashboard>("/api/admin/dashboard"),
};

/* ---------- Health ---------- */
export type Health = { status: string; service: string };
export const healthApi = {
  auth: () => request<Health>("/api/health/auth"),
  order: () => request<Health>("/api/health/order"),
  notification: () => request<Health>("/api/health/notification"),
  analytics: () => request<Health>("/api/health/analytics"),
  client: () => request<Health>("/api/health/client"),
  merchant: () => request<Health>("/api/health/merchant"),
  admin: () => request<Health>("/api/health/admin"),
};
