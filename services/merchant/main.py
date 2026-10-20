"""
MERCHANT SERVICE (port 8007)

Merchant-facing API. Shares `market_db` (catalog + orders) with the Client
service so products created here are visible to clients and client orders
are visible here.

- Manage own categories / products
- View orders that contain own products
- Update order status
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
import os

from fastapi import FastAPI, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine,
    text,
    Column,
    String,
    DateTime,
    Boolean,
    Integer,
    Numeric,
    ForeignKey,
)
from sqlalchemy.orm import sessionmaker, Session, declarative_base, relationship

from services.auth.security import require_role

DATABASE_URL = os.getenv(
    "DATABASE_URL_MARKET",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/market_db",
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


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    # NULL = top-level category, otherwise id of the parent category (max 2 levels).
    parent_id = Column(String, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    price = Column(Numeric(10, 2), nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    category_id = Column(String, ForeignKey("categories.id"), nullable=False, index=True)
    subcategory_id = Column(String, index=True, nullable=True)
    merchant_id = Column(String, nullable=False, index=True)
    merchant_email = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="products")


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False)
    user_email = Column(String, nullable=False)
    total = Column(Numeric(10, 2), nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True, index=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    product_id = Column(String)
    product_name = Column(String)
    merchant_id = Column(String)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(10, 2), nullable=False)

    order = relationship("Order", back_populates="items")


Base.metadata.create_all(bind=engine)


def ensure_schema(bind_engine) -> None:
    """Add sub-category columns to databases created before this feature."""
    statements = [
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id VARCHAR",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id VARCHAR",
        "CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories (parent_id)",
        "CREATE INDEX IF NOT EXISTS ix_products_subcategory_id ON products (subcategory_id)",
    ]
    try:
        with bind_engine.begin() as conn:
            for sql in statements:
                conn.execute(text(sql))
    except Exception as exc:
        print(f"Merchant Service: schema migration skipped ({exc})")


ensure_schema(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Schemas
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: Optional[str] = None
    # Optional parent category id -> creates a sub-category (2 levels max).
    parent_id: Optional[str] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    slug: str
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    created_at: datetime
    products_count: Optional[int] = 0

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = None
    price: float = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    category_id: str
    subcategory_id: Optional[str] = None
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    stock: Optional[int] = Field(default=None, ge=0)
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    price: float
    stock: int
    category_id: str
    subcategory_id: Optional[str] = None
    merchant_id: str
    merchant_email: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OrderItemOut(BaseModel):
    id: str
    product_id: Optional[str]
    product_name: Optional[str]
    merchant_id: Optional[str]
    quantity: int
    price: float

    class Config:
        from_attributes = True


class MerchantOrderOut(BaseModel):
    id: str
    user_id: str
    user_email: str
    total: float
    status: str
    created_at: datetime
    items: List[OrderItemOut] = []


class UpdateOrderStatus(BaseModel):
    status: str = Field(pattern=r"^(pending|confirmed|shipped|delivered|cancelled)$")


class ProductSalesOut(BaseModel):
    product_name: str
    quantity_sold: int
    revenue: float


class MerchantDashboardOut(BaseModel):
    email: Optional[str]
    total_orders: int
    total_revenue: float
    items_sold: int
    pending_orders: int
    by_status: dict[str, int]
    top_products: List[ProductSalesOut] = []
    recent_orders: List[MerchantOrderOut] = []


app = FastAPI(title="Merchant Service")


@app.get("/health")
def health():
    return {"status": "ok", "service": "merchant"}


@app.get("/merchant/categories", response_model=List[CategoryOut])
def list_categories(
    parent_id: Optional[str] = Query(
        None,
        description="Omitted: all categories. 'none': top-level only. <id>: its sub-categories.",
    ),
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant", "admin"])),
):
    cats = db.query(Category).order_by(Category.name).all()
    names = {c.id: c.name for c in cats}
    if parent_id == "none":
        selected = [c for c in cats if not c.parent_id]
    elif parent_id:
        selected = [c for c in cats if c.parent_id == parent_id]
    else:
        selected = cats
    mine = db.query(Product).filter(Product.merchant_id == user["sub"]).all()
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            slug=c.slug,
            parent_id=c.parent_id,
            parent_name=names.get(c.parent_id) if c.parent_id else None,
            created_at=c.created_at,
            products_count=len(
                [p for p in mine if p.category_id == c.id or p.subcategory_id == c.id]
            ),
        )
        for c in selected
    ]


@app.post("/merchant/categories", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["merchant", "admin"])),
):
    if body.parent_id:
        parent = db.query(Category).filter(Category.id == body.parent_id).first()
        if not parent:
            raise HTTPException(404, "Parent category not found")
        if parent.parent_id:
            raise HTTPException(400, "Sub-categories cannot have sub-categories")
    try:
        from slugify import slugify as _slugify

        slug = body.slug or _slugify(body.name)
    except Exception:
        slug = (body.slug or body.name).lower().replace(" ", "-")

    if db.query(Category).filter(Category.slug == slug).first():
        slug = f"{slug}-{uuid4().hex[:4]}"
    cat = Category(
        id=str(uuid4()),
        name=body.name,
        slug=slug,
        parent_id=body.parent_id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    parent_name = (
        db.query(Category).filter(Category.id == cat.parent_id).first().name
        if cat.parent_id
        else None
    )
    return CategoryOut(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        parent_id=cat.parent_id,
        parent_name=parent_name,
        created_at=cat.created_at,
        products_count=0,
    )


def _validate_subcategory(db: Session, category_id: str, subcategory_id: Optional[str]) -> None:
    """A sub-category must exist and belong to the product's category."""
    if not subcategory_id:
        return
    sub = db.query(Category).filter(Category.id == subcategory_id).first()
    if not sub:
        raise HTTPException(404, "Sub-category not found")
    if sub.parent_id != category_id:
        raise HTTPException(400, "Sub-category does not belong to the selected category")


@app.get("/merchant/products", response_model=List[ProductOut])
def list_my_products(
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant", "admin"])),
):
    prods = (
        db.query(Product)
        .filter(Product.merchant_id == user["sub"])
        .order_by(Product.created_at.desc())
        .all()
    )
    return [ProductOut.model_validate(p) for p in prods]


@app.post("/merchant/products", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant"])),
):
    if not db.query(Category).filter(Category.id == body.category_id).first():
        raise HTTPException(404, "Category not found")
    _validate_subcategory(db, body.category_id, body.subcategory_id)
    p = Product(
        id=str(uuid4()),
        name=body.name,
        description=body.description,
        price=round(float(body.price), 2),
        stock=int(body.stock),
        category_id=body.category_id,
        subcategory_id=body.subcategory_id,
        merchant_id=user["sub"],
        merchant_email=user.get("email"),
        is_active=bool(body.is_active),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ProductOut.model_validate(p)


@app.patch("/merchant/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant"])),
):
    p = db.query(Product).filter(Product.id == product_id, Product.merchant_id == user["sub"]).first()
    if not p:
        raise HTTPException(404, "Product not found")
    if body.category_id and not db.query(Category).filter(Category.id == body.category_id).first():
        raise HTTPException(404, "Category not found")
    if body.name is not None:
        p.name = body.name
    if body.description is not None:
        p.description = body.description
    if body.price is not None:
        p.price = round(float(body.price), 2)
    if body.stock is not None:
        p.stock = int(body.stock)
    if body.category_id is not None:
        p.category_id = body.category_id
    if body.subcategory_id is not None:
        _validate_subcategory(db, p.category_id, body.subcategory_id)
        p.subcategory_id = body.subcategory_id
    elif body.category_id is not None and p.subcategory_id:
        # Category moved: drop a sub-category that no longer matches it.
        sub = db.query(Category).filter(Category.id == p.subcategory_id).first()
        if not sub or sub.parent_id != p.category_id:
            p.subcategory_id = None
    if body.is_active is not None:
        p.is_active = body.is_active
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return ProductOut.model_validate(p)


@app.delete("/merchant/products/{product_id}", status_code=204)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant"])),
):
    p = db.query(Product).filter(Product.id == product_id, Product.merchant_id == user["sub"]).first()
    if not p:
        raise HTTPException(404, "Product not found")
    db.delete(p)
    db.commit()
    return


@app.get("/merchant/orders", response_model=List[MerchantOrderOut])
def list_orders(
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant", "admin"])),
):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    out: List[MerchantOrderOut] = []
    for o in orders:
        my_items = [it for it in o.items if it.merchant_id == user["sub"]]
        if not my_items:
            continue
        out.append(
            MerchantOrderOut(
                id=o.id,
                user_id=o.user_id,
                user_email=o.user_email,
                total=round(sum(float(it.price) * it.quantity for it in my_items), 2),
                status=o.status,
                created_at=o.created_at,
                items=[OrderItemOut.model_validate(it) for it in my_items],
            )
        )
    return out


@app.patch("/merchant/orders/{order_id}/status", response_model=MerchantOrderOut)
def update_order_status(
    order_id: str,
    body: UpdateOrderStatus,
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant"])),
):
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(404, "Order not found")
    my_items = [it for it in o.items if it.merchant_id == user["sub"]]
    if not my_items:
        raise HTTPException(403, "Order has no items from this merchant")
    o.status = body.status
    db.commit()
    db.refresh(o)
    return MerchantOrderOut(
        id=o.id,
        user_id=o.user_id,
        user_email=o.user_email,
        total=round(sum(float(it.price) * it.quantity for it in my_items), 2),
        status=o.status,
        created_at=o.created_at,
        items=[OrderItemOut.model_validate(it) for it in my_items],
    )


@app.get("/merchant/dashboard", response_model=MerchantDashboardOut)
def merchant_dashboard(
    db: Session = Depends(get_db),
    user=Depends(require_role(["merchant"])),
):
    """Only sales/orders containing this merchant's own products are aggregated."""
    orders = db.query(Order).order_by(Order.created_at.desc()).all()

    my_orders: List[MerchantOrderOut] = []
    by_status: dict[str, int] = {}
    total_revenue = 0.0
    items_sold = 0
    product_stats: dict[str, dict] = {}

    for o in orders:
        my_items = [it for it in o.items if it.merchant_id == user["sub"]]
        if not my_items:
            continue

        revenue = sum(float(it.price) * it.quantity for it in my_items)
        total_revenue += revenue
        items_sold += sum(it.quantity for it in my_items)
        by_status[o.status] = by_status.get(o.status, 0) + 1

        for it in my_items:
            key = it.product_name or "unknown"
            stats = product_stats.setdefault(key, {"qty": 0, "revenue": 0.0})
            stats["qty"] += it.quantity
            stats["revenue"] += float(it.price) * it.quantity

        my_orders.append(
            MerchantOrderOut(
                id=o.id,
                user_id=o.user_id,
                user_email=o.user_email,
                total=round(revenue, 2),
                status=o.status,
                created_at=o.created_at,
                items=[OrderItemOut.model_validate(it) for it in my_items],
            )
        )

    top_products = sorted(
        (
            ProductSalesOut(
                product_name=name,
                quantity_sold=s["qty"],
                revenue=round(s["revenue"], 2),
            )
            for name, s in product_stats.items()
        ),
        key=lambda x: x.revenue,
        reverse=True,
    )[:10]

    return MerchantDashboardOut(
        email=user.get("email"),
        total_orders=len(my_orders),
        total_revenue=round(total_revenue, 2),
        items_sold=items_sold,
        pending_orders=by_status.get("pending", 0),
        by_status=by_status,
        top_products=top_products,
        recent_orders=my_orders[:10],
    )
