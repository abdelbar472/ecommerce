"""
CLIENT SERVICE (port 8006)

Client-facing API. Shares `market_db` (catalog + orders) with the Merchant
service so merchant-created products are immediately visible here and
client-created orders are visible to merchants.

- Browse categories / products
- Place orders (validates + decrements stock)
- View own orders
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
from contextlib import asynccontextmanager
import json
import os

from aiokafka import AIOKafkaProducer
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
        print(f"Client Service: schema migration skipped ({exc})")


ensure_schema(engine)


# ---------- Kafka ----------
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
ORDER_TOPIC = "order.created"

producer: AIOKafkaProducer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global producer
    try:
        producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await producer.start()
    except Exception as exc:  # keep the service usable even if Kafka is down
        producer = None
        print(f"Client Service: Kafka producer unavailable ({exc})")
    yield
    if producer is not None:
        await producer.stop()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Schemas
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

    class Config:
        from_attributes = True


class OrderItemCreate(BaseModel):
    product_id: str
    quantity: int = Field(ge=1)


class CreateOrderRequest(BaseModel):
    items: List[OrderItemCreate]


class OrderItemOut(BaseModel):
    id: str
    product_id: Optional[str]
    product_name: Optional[str]
    merchant_id: Optional[str]
    quantity: int
    price: float

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: str
    user_id: str
    user_email: str
    total: float
    status: str
    created_at: datetime
    items: List[OrderItemOut] = []

    class Config:
        from_attributes = True


class ClientDashboardOut(BaseModel):
    email: Optional[str]
    total_orders: int
    total_spent: float
    items_bought: int
    by_status: dict[str, int]
    recent_orders: List[OrderOut] = []


app = FastAPI(title="Client Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "service": "client"}


@app.get("/client/categories", response_model=List[CategoryOut])
def list_categories(
    parent_id: Optional[str] = Query(
        None,
        description="Omitted: all categories. 'none': top-level only. <id>: its sub-categories.",
    ),
    db: Session = Depends(get_db),
    _user=Depends(require_role(["client", "merchant", "admin"])),
):
    cats = db.query(Category).order_by(Category.name).all()
    names = {c.id: c.name for c in cats}
    if parent_id == "none":
        selected = [c for c in cats if not c.parent_id]
    elif parent_id:
        selected = [c for c in cats if c.parent_id == parent_id]
    else:
        selected = cats
    out = []
    active = db.query(Product).filter(Product.is_active == True).all()
    for c in selected:
        # count products assigned to this category OR to this subcategory
        count = len(
            [p for p in active if p.category_id == c.id or p.subcategory_id == c.id]
        )
        out.append(
            CategoryOut(
                id=c.id,
                name=c.name,
                slug=c.slug,
                parent_id=c.parent_id,
                parent_name=names.get(c.parent_id) if c.parent_id else None,
                created_at=c.created_at,
                products_count=count,
            )
        )
    return out


@app.get("/client/products", response_model=List[ProductOut])
def list_products(
    category_id: Optional[str] = Query(None),
    subcategory_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user=Depends(require_role(["client", "merchant", "admin"])),
):
    qset = db.query(Product).filter(Product.is_active == True)
    if category_id:
        qset = qset.filter(Product.category_id == category_id)
    if subcategory_id:
        qset = qset.filter(Product.subcategory_id == subcategory_id)
    if q:
        qset = qset.filter(Product.name.ilike(f"%{q.lower()}%"))
    return [ProductOut.model_validate(p) for p in qset.order_by(Product.created_at.desc()).all()]


@app.get("/client/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["client", "merchant", "admin"])),
):
    p = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()
    if not p:
        raise HTTPException(404, "Product not found")
    return ProductOut.model_validate(p)


@app.post("/client/orders", response_model=OrderOut, status_code=201)
async def create_order(
    body: CreateOrderRequest,
    db: Session = Depends(get_db),
    user=Depends(require_role(["client"])),
):
    if not body.items:
        raise HTTPException(400, "No items provided")

    total = 0.0
    prepared = []
    for item in body.items:
        p = db.query(Product).filter(Product.id == item.product_id, Product.is_active == True).first()
        if not p:
            raise HTTPException(404, f"Product {item.product_id} not found")
        if p.stock < item.quantity:
            raise HTTPException(400, f"Insufficient stock for {p.name}")
        price = float(p.price)
        total += price * item.quantity
        prepared.append((p, item.quantity, price))

    order = Order(
        id=str(uuid4()),
        user_id=user["sub"],
        user_email=user.get("email"),
        total=round(total, 2),
        status="pending",
    )
    db.add(order)
    db.flush()

    for p, qty, price in prepared:
        db.add(
            OrderItem(
                id=str(uuid4()),
                order_id=order.id,
                product_id=p.id,
                product_name=p.name,
                merchant_id=p.merchant_id,
                quantity=qty,
                price=price,
            )
        )
        p.stock -= qty

    db.commit()
    db.refresh(order)

    # Publish order.created so Notification + Analytics stay in sync.
    if producer is not None:
        event = {
            "event_id": str(uuid4()),
            "order_id": order.id,
            "user_email": order.user_email,
            "total": float(order.total),
            "items": [
                {"name": it.product_name, "qty": it.quantity, "price": float(it.price)}
                for it in order.items
            ],
            "created_at": order.created_at.isoformat(),
        }
        try:
            await producer.send_and_wait(ORDER_TOPIC, event)
            print(f"Published order.created -> {order.id}")
        except Exception as exc:
            print(f"Client Service: failed to publish order.created ({exc})")

    return OrderOut.model_validate(order)


@app.get("/client/dashboard", response_model=ClientDashboardOut)
def client_dashboard(
    db: Session = Depends(get_db),
    user=Depends(require_role(["client"])),
):
    """Only the authenticated client's own purchases are aggregated."""
    orders = (
        db.query(Order)
        .filter(Order.user_id == user["sub"])
        .order_by(Order.created_at.desc())
        .all()
    )
    by_status: dict[str, int] = {}
    for o in orders:
        by_status[o.status] = by_status.get(o.status, 0) + 1

    return ClientDashboardOut(
        email=user.get("email"),
        total_orders=len(orders),
        total_spent=round(sum(float(o.total) for o in orders), 2),
        items_bought=sum(it.quantity for o in orders for it in o.items),
        by_status=by_status,
        recent_orders=[OrderOut.model_validate(o) for o in orders[:10]],
    )


@app.get("/client/orders", response_model=List[OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    user=Depends(require_role(["client"])),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == user["sub"])
        .order_by(Order.created_at.desc())
        .all()
    )
    return [OrderOut.model_validate(o) for o in orders]


@app.get("/client/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    user=Depends(require_role(["client"])),
):
    o = db.query(Order).filter(Order.id == order_id, Order.user_id == user["sub"]).first()
    if not o:
        raise HTTPException(404, "Order not found")
    return OrderOut.model_validate(o)
