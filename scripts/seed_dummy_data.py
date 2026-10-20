"""Seed dummy marketplace data through the real HTTP APIs.

Creates demo sellers + buyers, a category tree, products, and orders.
All orders flow through Kafka into analytics + notifications.

Usage:  python scripts/seed_dummy_data.py
Login:  admin@example.com / admin123
        seller1..3@example.com / secret123
        buyer1..5@example.com / secret123
"""

import sys
import time

import httpx

AUTH = "http://localhost:8004"
CLIENT = "http://localhost:8006"
MERCHANT = "http://localhost:8007"

SELLERS = [f"seller{i}@example.com" for i in (1, 2, 3)]
BUYERS = [f"buyer{i}@example.com" for i in (1, 2, 3, 4, 5)]
PASSWORD = "secret123"

# (category, [subcategories])
CATEGORIES = {
    "Electronics": ["Phones", "Laptops", "Audio"],
    "Fashion": ["Men", "Women", "Shoes"],
    "Home & Kitchen": ["Cookware", "Decor"],
}

# (name, description, price, stock, category, subcategory, seller_index)
PRODUCTS = [
    ("Pixel Pro 9", "Flagship Android phone, 256GB", 899.0, 25, "Electronics", "Phones", 0),
    ("Galaxy S26", "AMOLED display, 128GB", 749.0, 40, "Electronics", "Phones", 0),
    ("iPhone 17", "A19 chip, 256GB", 1099.0, 15, "Electronics", "Phones", 1),
    ("MacBook Air M4", "13-inch, 16GB RAM", 1299.0, 12, "Electronics", "Laptops", 1),
    ("ThinkPad X1 Carbon", "Business ultrabook", 1499.0, 8, "Electronics", "Laptops", 2),
    ("Sony WH-2000", "Noise-cancelling headphones", 349.0, 30, "Electronics", "Audio", 2),
    ("AirPods Pro 3", "Wireless earbuds", 249.0, 60, "Electronics", "Audio", 0),
    ("Classic Denim Jacket", "Unisex vintage wash", 89.0, 50, "Fashion", "Men", 1),
    ("Oxford Shirt", "Slim fit, cotton", 59.0, 80, "Fashion", "Men", 2),
    ("Summer Floral Dress", "Midi, breathable fabric", 74.0, 35, "Fashion", "Women", 1),
    ("Leather Tote Bag", "Handcrafted full-grain leather", 159.0, 20, "Fashion", "Women", 2),
    ("Running Sneakers", "Lightweight, responsive foam", 119.0, 45, "Fashion", "Shoes", 0),
    ("Cast Iron Skillet 12\"", "Pre-seasoned, oven safe", 44.0, 55, "Home & Kitchen", "Cookware", 0),
    ("Chef Knife 8\"", "German steel, ergonomic handle", 99.0, 30, "Home & Kitchen", "Cookware", 1),
    ("Scented Candle Set", "Lavender, vanilla, cedar", 29.0, 100, "Home & Kitchen", "Decor", 2),
    ("Ceramic Vase", "Matte white, 30cm", 39.0, 40, "Home & Kitchen", "Decor", 1),
]

# (buyer_index, [(product_name, qty), ...])
ORDERS = [
    (0, [("Pixel Pro 9", 1), ("AirPods Pro 3", 1)]),
    (1, [("MacBook Air M4", 1)]),
    (2, [("Galaxy S26", 2), ("Running Sneakers", 1)]),
    (3, [("Cast Iron Skillet 12\"", 1), ("Chef Knife 8\"", 1), ("Scented Candle Set", 2)]),
    (4, [("Sony WH-2000", 1)]),
    (0, [("Summer Floral Dress", 1), ("Leather Tote Bag", 1)]),
    (1, [("ThinkPad X1 Carbon", 1), ("Sony WH-2000", 1)]),
    (2, [("Classic Denim Jacket", 2)]),
    (3, [("iPhone 17", 1), ("AirPods Pro 3", 2)]),
    (4, [("Oxford Shirt", 3), ("Running Sneakers", 1)]),
    (0, [("Ceramic Vase", 2), ("Scented Candle Set", 1)]),
    (1, [("Pixel Pro 9", 1)]),
]

# after placement, advance some orders through the fulfillment pipeline
STATUS_UPDATES = {0: "delivered", 1: "shipped", 2: "confirmed", 3: "delivered", 5: "shipped"}


def main() -> int:
    http = httpx.Client(timeout=15)

    def login(email: str) -> dict:
        r = http.post(f"{AUTH}/auth/login", json={"email": email, "password": PASSWORD})
        r.raise_for_status()
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    # ---- accounts ----
    for email in SELLERS:
        r = http.post(
            f"{AUTH}/auth/register",
            json={"email": email, "password": PASSWORD, "full_name": email.split("@")[0].title(), "role": "merchant"},
        )
        print(f"register {email}: {r.status_code}")
    for email in BUYERS:
        r = http.post(
            f"{AUTH}/auth/register",
            json={"email": email, "password": PASSWORD, "full_name": email.split("@")[0].title(), "role": "client"},
        )
        print(f"register {email}: {r.status_code}")

    seller_tokens = [login(e) for e in SELLERS]
    buyer_tokens = [login(e) for e in BUYERS]

    # ---- categories ----
    cat_ids: dict[str, str] = {}
    sub_ids: dict[tuple[str, str], str] = {}
    for i, (cat, subs) in enumerate(CATEGORIES.items()):
        t = seller_tokens[i % len(seller_tokens)]
        r = http.post(f"{MERCHANT}/merchant/categories", headers=t, json={"name": cat})
        r.raise_for_status()
        cat_ids[cat] = r.json()["id"]
        print(f"category {cat}: created")
        for sub in subs:
            r = http.post(
                f"{MERCHANT}/merchant/categories",
                headers=t,
                json={"name": sub, "parent_id": cat_ids[cat]},
            )
            r.raise_for_status()
            sub_ids[(cat, sub)] = r.json()["id"]
            print(f"  subcategory {cat} / {sub}: created")

    # ---- products ----
    product_ids: dict[str, str] = {}
    for name, desc, price, stock, cat, sub, seller_idx in PRODUCTS:
        t = seller_tokens[seller_idx]
        r = http.post(
            f"{MERCHANT}/merchant/products",
            headers=t,
            json={
                "name": name,
                "description": desc,
                "price": price,
                "stock": stock,
                "category_id": cat_ids[cat],
                "subcategory_id": sub_ids[(cat, sub)],
            },
        )
        r.raise_for_status()
        product_ids[name] = r.json()["id"]
        print(f"product {name}: created ({price})")

    # ---- orders ----
    order_ids: list[str] = []
    for buyer_idx, items in ORDERS:
        t = buyer_tokens[buyer_idx]
        payload = {
            "items": [{"product_id": product_ids[name], "quantity": qty} for name, qty in items]
        }
        r = http.post(f"{CLIENT}/client/orders", headers=t, json=payload)
        r.raise_for_status()
        order_ids.append(r.json()["id"])
        print(f"order for {BUYERS[buyer_idx]}: {r.status_code} ({len(items)} line items)")

    # ---- fulfillment statuses ----
    # RBAC: a merchant may only update orders that contain their own products,
    # so try each seller until one owns items in the order.
    for idx, status in STATUS_UPDATES.items():
        if idx >= len(order_ids):
            continue
        for t in seller_tokens:
            r = http.patch(
                f"{MERCHANT}/merchant/orders/{order_ids[idx]}/status",
                headers=t,
                json={"status": status},
            )
            if r.status_code == 200:
                break
        print(f"order {order_ids[idx][:8]} -> {status}: {r.status_code}")

    # ---- let Kafka drain into analytics + notifications ----
    print("waiting 8s for Kafka consumers...")
    time.sleep(8)
    print("done — login with admin@example.com / admin123 or any seeded seller/buyer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
