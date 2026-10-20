"""
ADMIN SERVICE
Port: 8008
- Global user management, role assignment, audit logs
- Global categories/products oversight
- System metrics
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
import os

from fastapi import FastAPI, Depends, HTTPException, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import (
    create_engine,
    text,
    Column,
    String,
    DateTime,
    Numeric,
    Integer,
    Boolean,
    JSON,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker, Session, declarative_base

from services.auth.security import get_current_user, require_role, Role

DATABASE_URL = os.getenv(
    "DATABASE_URL_ADMIN",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/admin_db",
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
pool_kwargs = (
    {}
    if DATABASE_URL.startswith("sqlite")
    else {"pool_size": 20, "max_overflow": 20, "pool_timeout": 30}
)
engine = create_engine(DATABASE_URL, connect_args=connect_args, **pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Read-only access to the shared marketplace DB (client + merchant data),
# so the admin can analyse customers and sellers.
MARKET_DATABASE_URL = os.getenv(
    "DATABASE_URL_MARKET",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/market_db",
)
market_connect_args = (
    {"check_same_thread": False} if MARKET_DATABASE_URL.startswith("sqlite") else {}
)
market_pool_kwargs = (
    {}
    if MARKET_DATABASE_URL.startswith("sqlite")
    else {"pool_size": 10, "max_overflow": 10, "pool_timeout": 30}
)
market_engine = create_engine(
    MARKET_DATABASE_URL,
    connect_args=market_connect_args,
    **market_pool_kwargs,
)
MarketSession = sessionmaker(autocommit=False, autoflush=False, bind=market_engine)
MarketBase = declarative_base()


# Read-only views over the shared marketplace tables (no writes from Admin).
class MarketOrder(MarketBase):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    user_email = Column(String, index=True)
    total = Column(Numeric(10, 2))
    status = Column(String)
    created_at = Column(DateTime)


class MarketOrderItem(MarketBase):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True)
    order_id = Column(String, index=True)
    product_id = Column(String)
    product_name = Column(String)
    merchant_id = Column(String, index=True)
    quantity = Column(Integer)
    price = Column(Numeric(10, 2))


class MarketProduct(MarketBase):
    __tablename__ = "products"

    id = Column(String, primary_key=True)
    name = Column(String)
    merchant_id = Column(String, index=True)
    merchant_email = Column(String)
    price = Column(Numeric(10, 2))
    stock = Column(Integer)
    is_active = Column(Boolean)
    subcategory_id = Column(String, index=True)


class MarketCategory(MarketBase):
    """Categories/sub-categories are shared: admins manage them here, sellers
    pick them for products and customers browse them."""

    __tablename__ = "categories"

    id = Column(String, primary_key=True)
    name = Column(String)
    slug = Column(String, index=True)
    parent_id = Column(String, index=True)
    created_at = Column(DateTime)


def ensure_market_schema() -> None:
    """Make sure the shared catalog has the sub-category columns (read/write)."""
    statements = [
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id VARCHAR",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories (parent_id)",
        "CREATE INDEX IF NOT EXISTS ix_products_subcategory_id ON products (subcategory_id)",
    ]
    try:
        with market_engine.begin() as conn:
            for sql in statements:
                conn.execute(text(sql))
    except Exception as exc:
        print(f"Admin Service: market schema migration skipped ({exc})")


ensure_market_schema()


def get_market_db():
    db = MarketSession()
    try:
        yield db
    finally:
        db.close()


class UserAudit(Base):
    __tablename__ = "users_audit"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False)
    email = Column(String)
    role = Column(String)
    action = Column(String)
    performed_by = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProductGlobal(Base):
    __tablename__ = "products_global"

    id = Column(String, primary_key=True, index=True)
    product_id = Column(String)
    name = Column(String)
    merchant_id = Column(String)
    category_id = Column(String)
    price = Column(Numeric(10, 2))
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemMetric(Base):
    __tablename__ = "system_metrics"

    id = Column(String, primary_key=True, index=True)
    metric_name = Column(String)
    metric_value = Column(JSONB if DATABASE_URL.startswith("postgresql") else JSON)
    recorded_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Schemas
class AuditOut(BaseModel):
    id: str
    user_id: str
    email: Optional[str]
    role: Optional[str]
    action: str
    performed_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryGlobalOut(BaseModel):
    id: str
    name: str
    slug: str
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryIn(BaseModel):
    name: str = Field(min_length=1)
    slug: Optional[str] = None
    # Optional parent id -> creates a sub-category (2 levels max).
    parent_id: Optional[str] = None


class ProductGlobalOut(BaseModel):
    id: str
    product_id: Optional[str]
    name: Optional[str]
    merchant_id: Optional[str]
    category_id: Optional[str]
    price: Optional[float]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class MetricIn(BaseModel):
    metric_name: str
    metric_value: dict


class MetricOut(BaseModel):
    id: str
    metric_name: str
    metric_value: dict
    recorded_at: datetime

    class Config:
        from_attributes = True


class CustomerAnalyticsOut(BaseModel):
    user_id: str
    user_email: Optional[str]
    orders: int
    total_spent: float


class SellerAnalyticsOut(BaseModel):
    merchant_id: str
    merchant_email: Optional[str]
    products: int
    items_sold: int
    orders: int
    revenue: float


class AdminDashboardOut(BaseModel):
    total_orders: int
    total_revenue: float
    total_customers: int
    total_sellers: int
    total_products: int
    active_products: int
    total_categories: int = 0
    total_subcategories: int = 0
    customers: List[CustomerAnalyticsOut] = []
    sellers: List[SellerAnalyticsOut] = []


app = FastAPI(title="Admin Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "admin"}


# Audit logs
@app.get("/admin/audit", response_model=List[AuditOut])
def list_audit(
    limit: int = 100,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    logs = db.query(UserAudit).order_by(UserAudit.created_at.desc()).limit(limit).all()
    return [AuditOut.model_validate(x) for x in logs]


@app.post("/admin/audit", response_model=AuditOut, status_code=201)
def log_audit(
    body: dict,
    db: Session = Depends(get_db),
    user=Depends(require_role(["admin"])),
):
    log = UserAudit(
        id=str(uuid4()),
        user_id=body.get("user_id", user["sub"]),
        email=body.get("email"),
        role=body.get("role"),
        action=body.get("action", "action"),
        performed_by=user["sub"],
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return AuditOut.model_validate(log)


# Global categories/sub-categories (shared marketplace catalog)
@app.get("/admin/categories", response_model=List[CategoryGlobalOut])
def list_categories_global(
    parent_id: Optional[str] = Query(
        None,
        description="Omitted: all categories. 'none': top-level only. <id>: its sub-categories.",
    ),
    market_db: Session = Depends(get_market_db),
    _user=Depends(require_role(["admin"])),
):
    cats = market_db.query(MarketCategory).order_by(MarketCategory.name).all()
    names = {c.id: c.name for c in cats}
    if parent_id == "none":
        selected = [c for c in cats if not c.parent_id]
    elif parent_id:
        selected = [c for c in cats if c.parent_id == parent_id]
    else:
        selected = cats
    return [
        CategoryGlobalOut(
            id=c.id,
            name=c.name,
            slug=c.slug,
            parent_id=c.parent_id,
            parent_name=names.get(c.parent_id) if c.parent_id else None,
            created_at=c.created_at,
        )
        for c in selected
    ]


@app.post("/admin/categories", response_model=CategoryGlobalOut, status_code=201)
def create_category_global(
    body: CategoryIn,
    market_db: Session = Depends(get_market_db),
    _user=Depends(require_role(["admin"])),
):
    if body.parent_id:
        parent = (
            market_db.query(MarketCategory)
            .filter(MarketCategory.id == body.parent_id)
            .first()
        )
        if not parent:
            raise HTTPException(404, "Parent category not found")
        if parent.parent_id:
            raise HTTPException(400, "Sub-categories cannot have sub-categories")
    try:
        from slugify import slugify as _slugify

        slug = body.slug or _slugify(body.name)
    except Exception:
        slug = (body.slug or body.name).lower().replace(" ", "-")
    if market_db.query(MarketCategory).filter(MarketCategory.slug == slug).first():
        slug = f"{slug}-{uuid4().hex[:4]}"
    c = MarketCategory(
        id=str(uuid4()),
        name=body.name,
        slug=slug,
        parent_id=body.parent_id,
        created_at=datetime.utcnow(),
    )
    market_db.add(c)
    market_db.commit()
    market_db.refresh(c)
    parent_name = (
        market_db.query(MarketCategory)
        .filter(MarketCategory.id == c.parent_id)
        .first()
        .name
        if c.parent_id
        else None
    )
    return CategoryGlobalOut(
        id=c.id,
        name=c.name,
        slug=c.slug,
        parent_id=c.parent_id,
        parent_name=parent_name,
        created_at=c.created_at,
    )


# Global products
@app.get("/admin/products", response_model=List[ProductGlobalOut])
def list_products_global(
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    prods = db.query(ProductGlobal).order_by(ProductGlobal.created_at.desc()).all()
    return [ProductGlobalOut.model_validate(p) for p in prods]


@app.post("/admin/products/sync", response_model=ProductGlobalOut, status_code=201)
def sync_product(
    body: dict,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    p = ProductGlobal(
        id=str(uuid4()),
        product_id=body.get("product_id"),
        name=body.get("name"),
        merchant_id=body.get("merchant_id"),
        category_id=body.get("category_id"),
        price=body.get("price"),
        status=body.get("status", "active"),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ProductGlobalOut.model_validate(p)


# Metrics
@app.get("/admin/metrics", response_model=List[MetricOut])
def list_metrics(
    limit: int = 50,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    ms = db.query(SystemMetric).order_by(SystemMetric.recorded_at.desc()).limit(limit).all()
    return [MetricOut.model_validate(m) for m in ms]


@app.post("/admin/metrics", response_model=MetricOut, status_code=201)
def record_metric(
    body: MetricIn,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    m = SystemMetric(
        id=str(uuid4()),
        metric_name=body.metric_name,
        metric_value=body.metric_value,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return MetricOut.model_validate(m)


# Role-scoped marketplace analytics for admins (customers + sellers)
@app.get("/admin/dashboard", response_model=AdminDashboardOut)
def admin_dashboard(
    market_db: Session = Depends(get_market_db),
    _user=Depends(require_role(["admin"])),
):
    orders = market_db.query(MarketOrder).all()
    items = market_db.query(MarketOrderItem).all()
    products = market_db.query(MarketProduct).all()
    categories = market_db.query(MarketCategory).all()

    customer_stats: dict[str, dict] = {}
    for o in orders:
        c = customer_stats.setdefault(
            o.user_id, {"orders": 0, "spent": 0.0, "email": None}
        )
        c["orders"] += 1
        c["spent"] += float(o.total)
        if not c["email"]:
            c["email"] = o.user_email

    customers = sorted(
        (
            CustomerAnalyticsOut(
                user_id=uid,
                user_email=s["email"],
                orders=s["orders"],
                total_spent=round(s["spent"], 2),
            )
            for uid, s in customer_stats.items()
        ),
        key=lambda x: x.total_spent,
        reverse=True,
    )

    product_count: dict[str, int] = {}
    merchant_email: dict[str, Optional[str]] = {}
    for p in products:
        product_count[p.merchant_id] = product_count.get(p.merchant_id, 0) + 1
        merchant_email.setdefault(p.merchant_id, p.merchant_email)

    seller_stats: dict[str, dict] = {}
    for it in items:
        s = seller_stats.setdefault(
            it.merchant_id, {"orders": set(), "qty": 0, "revenue": 0.0}
        )
        s["orders"].add(it.order_id)
        s["qty"] += it.quantity or 0
        s["revenue"] += float(it.price) * (it.quantity or 0)

    sellers = sorted(
        (
            SellerAnalyticsOut(
                merchant_id=mid,
                merchant_email=merchant_email.get(mid),
                products=product_count.get(mid, 0),
                items_sold=seller_stats.get(mid, {}).get("qty", 0),
                orders=len(seller_stats.get(mid, {}).get("orders", ())),
                revenue=round(seller_stats.get(mid, {}).get("revenue", 0.0), 2),
            )
            for mid in set(product_count) | set(seller_stats)
        ),
        key=lambda x: x.revenue,
        reverse=True,
    )

    return AdminDashboardOut(
        total_orders=len(orders),
        total_revenue=round(sum(float(o.total) for o in orders), 2),
        total_customers=len(customers),
        total_sellers=len(sellers),
        total_products=len(products),
        active_products=sum(1 for p in products if p.is_active),
        total_categories=sum(1 for c in categories if not c.parent_id),
        total_subcategories=sum(1 for c in categories if c.parent_id),
        customers=customers,
        sellers=sellers,
    )
