import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import multer from "multer";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "niora-secret-key";

// Database Setup
const db = new Database("niora.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'customer'
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    description TEXT,
    benefits TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    items TEXT,
    total REAL,
    status TEXT DEFAULT 'pending',
    address TEXT,
    contact TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    user_name TEXT,
    rating INTEGER,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed initial settings if empty
const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
if (settingsCount.count === 0) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("hero_image", "https://images.unsplash.com/photo-1604908177522-4028c0f9b0db?auto=format&fit=crop&w=1920&q=80");
}

const isSeeded = db.prepare("SELECT value FROM settings WHERE key = 'seeded'").get() as { value: string } | undefined;

if (!isSeeded) {
  // Seed initial products if empty
  const productCount = db.prepare("SELECT COUNT(*) as count FROM products").get() as { count: number };
  if (productCount.count === 0) {
    const seedProducts = [
      {
        name: "NIORA RED WINE SOAP",
        price: 79,
        description: "Luxury care. Youthful glow. Infused with red wine-inspired antioxidant care, this soap helps support smoother, fresher-looking skin while maintaining a soft and radiant finish.",
        benefits: "🍇 Rich in antioxidant-inspired care,✨ Helps reduce appearance of fine lines,💧 Keeps skin soft & hydrated,🌸 Promotes radiant, youthful glow,🧴 Gentle for daily cleansing",
        image: "https://images.unsplash.com/photo-1606813902914-cb5e3a6a7d26"
      },
      {
        name: "NIORA SHUDDHA GLOW",
        price: 89,
        description: "Sun tan removal. Natural glow restoration. Niora Shuddha Glow Soap is specially crafted to help reduce tanning caused by sun exposure while restoring your skin’s natural brightness.",
        benefits: "☀️ Helps reduce tan appearance,✨ Enhances natural glow,🌿 Removes dirt & impurities,💧 Keeps skin soft & smooth,🧼 Suitable for regular use",
        image: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad"
      },
      {
        name: "NIORA CHARCOAL SOAP",
        price: 89,
        description: "Deep detox. Clear confidence. Infused with charcoal to deeply cleanse pores and remove excess oil for clearer-looking skin.",
        benefits: "🖤 Draws out dirt & impurities,🌫 Helps unclog pores,✨ Reduces excess oil,🧼 Promotes clearer skin look,🌿 Ideal for oily & acne-prone skin",
        image: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad"
      },
      {
        name: "NIORA SIGNATURE SOAP",
        price: 200,
        description: "Intensive care. Visible nourishment. A rich, concentrated formula crafted with premium skin-loving ingredients to deeply cleanse, nourish, and restore skin vitality.",
        benefits: "💎 Deeply nourishes & revitalizes skin,✨ Enhances skin texture & smoothness,💧 Supports healthy moisture balance,🌿 Promotes firmer, radiant-looking skin,🧴 Ideal as a weekly treatment bar (2–3x use)",
        image: "https://images.unsplash.com/photo-1604908177522-4028c0f9b0db"
      }
    ];

    const insert = db.prepare("INSERT INTO products (name, price, description, benefits, image) VALUES (?, ?, ?, ?, ?)");
    seedProducts.forEach(p => insert.run(p.name, p.price, p.description, p.benefits, p.image));
  }

  // Seed initial gallery if empty
  const galleryCount = db.prepare("SELECT COUNT(*) as count FROM gallery").get() as { count: number };
  if (galleryCount.count === 0) {
    const seedGallery = [
      "https://picsum.photos/seed/niora1/400/600",
      "https://picsum.photos/seed/niora2/400/600",
      "https://picsum.photos/seed/niora3/400/600",
      "https://picsum.photos/seed/niora4/400/600"
    ];
    const insertGallery = db.prepare("INSERT INTO gallery (image) VALUES (?)");
    seedGallery.forEach(img => insertGallery.run(img));
  }

  // Mark as seeded so we never do this again, even if they delete all products/gallery
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("seeded", "true");
}

// Seed admin user if empty
const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
if (adminCount.count === 0) {
  const hashedPassword = bcrypt.hashSync("BEANIORA", 10);
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run("NIORA Admin", "admin@niora.com", hashedPassword, "admin");
}

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// Multer Setup
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
};

// API Routes
app.post("/api/auth/signup", (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)").run(name, email, hashedPassword);
    res.json({ message: "Signup successful" });
  } catch (err) {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "1d" });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products").all();
  res.json(products);
});

app.post("/api/products", authenticateToken, isAdmin, upload.single("image"), (req, res) => {
  const { name, price, description, benefits } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  const result = db.prepare("INSERT INTO products (name, price, description, benefits, image) VALUES (?, ?, ?, ?, ?)")
    .run(name, price, description, benefits, image);
  res.json({ id: result.lastInsertRowid });
});

app.delete("/api/products/:id", authenticateToken, isAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.put("/api/products/:id", authenticateToken, isAdmin, upload.single("image"), (req, res) => {
  const { name, price, description, benefits } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : req.body.image;
  
  db.prepare("UPDATE products SET name = ?, price = ?, description = ?, benefits = ?, image = ? WHERE id = ?")
    .run(name, price, description, benefits, image, req.params.id);
  
  res.json({ success: true });
});

app.post("/api/orders", (req, res) => {
  const { items, total, address, contact, user_id } = req.body;
  const result = db.prepare("INSERT INTO orders (user_id, items, total, address, contact) VALUES (?, ?, ?, ?, ?)")
    .run(user_id || null, JSON.stringify(items), total, address, contact);
  res.json({ id: result.lastInsertRowid });
});

app.get("/api/admin/orders", authenticateToken, isAdmin, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  res.json(orders);
});

app.get("/api/admin/stats", authenticateToken, isAdmin, (req, res) => {
  const totalRevenue = db.prepare("SELECT SUM(total) as total FROM orders").get() as any;
  const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").get() as any;
  const productSales = db.prepare("SELECT items FROM orders").all() as any[];
  
  const salesMap: Record<string, number> = {};
  productSales.forEach(o => {
    const items = JSON.parse(o.items);
    items.forEach((item: any) => {
      salesMap[item.name] = (salesMap[item.name] || 0) + 1;
    });
  });

  const chartData = Object.entries(salesMap).map(([name, value]) => ({ name, value }));

  res.json({
    revenue: totalRevenue.total || 0,
    orders: totalOrders.count || 0,
    chartData
  });
});

app.get("/api/reviews", (req, res) => {
  const reviews = db.prepare("SELECT * FROM reviews ORDER BY created_at DESC").all();
  res.json(reviews);
});

app.post("/api/reviews", (req, res) => {
  const { user_name, comment, rating } = req.body;
  db.prepare("INSERT INTO reviews (user_name, comment, rating) VALUES (?, ?, ?)")
    .run(user_name, comment, rating || 5);
  res.json({ success: true });
});

app.get("/api/gallery", (req, res) => {
  const gallery = db.prepare("SELECT * FROM gallery ORDER BY created_at DESC").all();
  res.json(gallery);
});

app.post("/api/gallery", authenticateToken, isAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const image = `/uploads/${req.file.filename}`;
  const result = db.prepare("INSERT INTO gallery (image) VALUES (?)").run(image);
  res.json({ id: result.lastInsertRowid, image });
});

app.delete("/api/gallery/:id", authenticateToken, isAdmin, (req, res) => {
  db.prepare("DELETE FROM gallery WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.get("/api/settings", (req, res) => {
  const settings = db.prepare("SELECT * FROM settings").all();
  const settingsMap = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  res.json(settingsMap);
});

app.post("/api/settings/hero", authenticateToken, isAdmin, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const image = `/uploads/${req.file.filename}`;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("hero_image", image);
  res.json({ success: true, image });
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => res.sendFile(path.resolve("dist/index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
