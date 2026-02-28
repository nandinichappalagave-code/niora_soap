import React, { useState, useEffect, useRef } from "react";
import { 
  ShoppingCart, 
  Search, 
  MessageCircle, 
  Settings, 
  X, 
  Trash2, 
  Edit,
  Plus, 
  ChevronRight, 
  Star,
  Instagram,
  Phone,
  MapPin,
  Send,
  LogOut,
  BarChart3,
  Package,
  ClipboardList
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";
import * as XLSX from "xlsx";

// --- Types ---
interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
  benefits: string;
  image: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface Review {
  id: number;
  user_name: string;
  comment: string;
  rating: number;
  created_at: string;
}

interface Order {
  id: number;
  items: string;
  total: number;
  status: string;
  address: string;
  contact: string;
  created_at: string;
}

// --- Gemini Setup ---
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SYSTEM_INSTRUCTION = `
You are NIORA Skincare's official assistant.
NIORA was born in Hubli, Karnataka.
Our motto: Pure. Honest. Effective.
ONLY talk about NIORA products and skincare.
If asked about unrelated topics, politely say: "I’m here to help with NIORA skincare products only 😊"

PRODUCT LIST:
- NIORA Red Wine Soap (₹79/100g): Luxury care, youthful glow, antioxidants.
- NIORA Shuddha Glow (₹89/100g): Sun tan removal, natural brightness.
- NIORA Charcoal Soap (₹89/100g): Deep detox, clear skin, for oily/acne-prone skin.
- NIORA Signature Soap (₹200/100g): Intensive care, premium treatment bar.

Be friendly, concise, and helpful. Recommend products based on skin concerns.
`;

export default function App() {
  // --- State ---
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "bot"; text: string }[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminCreds, setAdminCreds] = useState({ id: "", pass: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authCreds, setAuthCreds] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null);
  const [adminView, setAdminView] = useState<"dashboard" | "products" | "orders" | "gallery" | "hero">("dashboard");
  const [token, setToken] = useState(localStorage.getItem("niora_token"));
  const [reviews, setReviews] = useState<Review[]>([]);
  const [gallery, setGallery] = useState<{id: number, image: string}[]>([]);
  const [heroImage, setHeroImage] = useState("https://images.unsplash.com/photo-1604908177522-4028c0f9b0db?auto=format&fit=crop&w=1920&q=80");
  const [newReview, setNewReview] = useState({ name: "", comment: "" });
  const [selectedReviewImg, setSelectedReviewImg] = useState<string | null>(null);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", description: "", benefits: "", image: "" });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [footerClicks, setFooterClicks] = useState(0);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("All");

  // --- Dashboard Analytics Calculations ---
  const filteredOrders = React.useMemo(() => {
    if (selectedMonth === "All") return adminOrders;
    return adminOrders.filter(order => {
      const date = new Date(order.created_at);
      const monthStr = date.toLocaleString('default', { month: 'short' });
      return monthStr === selectedMonth;
    });
  }, [adminOrders, selectedMonth]);

  const dashboardStats = React.useMemo(() => {
    let totalRevenue = 0;
    let delivered = 0;
    let pending = 0;
    const monthlySales: Record<string, number> = { Jan: 0, Feb: 0, Mar: 0 };
    const productCount: Record<string, number> = {};

    filteredOrders.forEach(order => {
      totalRevenue += order.total;
      
      if (order.status.toLowerCase() === "delivered") {
        delivered++;
      } else {
        pending++;
      }

      const date = new Date(order.created_at);
      const monthStr = date.toLocaleString('default', { month: 'short' });
      if (monthlySales[monthStr] !== undefined) {
        monthlySales[monthStr] += order.total;
      } else {
        monthlySales[monthStr] = order.total;
      }

      try {
        const items = JSON.parse(order.items);
        items.forEach((item: any) => {
          productCount[item.name] = (productCount[item.name] || 0) + item.quantity;
        });
      } catch (e) {}
    });

    const bestSeller = Object.keys(productCount).length > 0 
      ? Object.keys(productCount).reduce((a, b) => productCount[a] > productCount[b] ? a : b)
      : "Loading...";

    const salesChartData = ["Jan", "Feb", "Mar"].map(month => ({
      month,
      sales: monthlySales[month] || 0
    }));

    const statusChartData = [
      { name: "Delivered", value: delivered, color: "#5C4033" },
      { name: "Pending", value: pending, color: "#c4a484" }
    ];

    return {
      totalOrders: filteredOrders.length,
      totalRevenue,
      delivered,
      pending,
      bestSeller,
      salesChartData,
      statusChartData
    };
  }, [filteredOrders]);

  const exportToExcel = () => {
    const exportData = adminOrders.map(order => {
      const date = new Date(order.created_at);
      const monthStr = date.toLocaleString('default', { month: 'short' });
      
      let productsStr = "";
      try {
        const items = JSON.parse(order.items);
        productsStr = items.map((i: any) => `${i.name} (x${i.quantity})`).join(", ");
      } catch (e) {}

      return {
        OrderID: order.id,
        Products: productsStr,
        Amount: order.total,
        Status: order.status,
        Month: monthStr,
        Address: order.address,
        Contact: order.contact,
        Date: date.toLocaleString()
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, "NIORA_Orders.xlsx");
  };

  // --- Refs for Scrolling ---
  const homeRef = useRef<HTMLElement>(null);
  const productsRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);

  // --- Effects ---
  useEffect(() => {
    fetchProducts();
    fetchReviews();
    fetchGallery();
    fetchSettings();
    const storedUser = localStorage.getItem("niora_user");
    if (storedUser && token) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      if (parsedUser.role === "admin") {
        setIsAdmin(true);
        fetchAdminData();
      }
    }
  }, [token]);

  const fetchProducts = async () => {
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data);
  };

  const fetchReviews = async () => {
    const res = await fetch("/api/reviews");
    const data = await res.json();
    setReviews(data);
  };

  const fetchGallery = async () => {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    setGallery(data);
  };

  const fetchSettings = async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    if (data.hero_image) setHeroImage(data.hero_image);
  };

  const fetchAdminData = async () => {
    const statsRes = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (statsRes.ok) setAdminStats(await statsRes.json());

    const ordersRes = await fetch("/api/admin/orders", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (ordersRes.ok) setAdminOrders(await ordersRes.json());
  };

  // --- Handlers ---
  const scrollTo = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (!token) {
      alert("Please login to place order");
      setIsAuthModalOpen(true);
      setAuthMode("login");
      return;
    }

    const address = prompt("Enter Delivery Address:");
    const contact = prompt("Enter Contact Number:");
    if (!address || !contact) return;

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        items: cart,
        total: cartTotal,
        address,
        contact,
        user_id: user?.id
      })
    });

    if (res.ok) {
      alert("Order placed successfully! We will contact you soon. ✨");
      setCart([]);
      setIsCartOpen(false);
    }
  };

  const handleAdminLogin = async () => {
    // Map "NIORA" to the actual admin email in the database
    const email = adminCreds.id === "NIORA" ? "admin@niora.com" : adminCreds.id;
    
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: adminCreds.pass })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("niora_token", data.token);
      localStorage.setItem("niora_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setIsAdmin(true);
      setAdminView("dashboard");
      setIsAdminModalOpen(false);
    } else {
      alert("Wrong Admin Credentials");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authCreds)
    });

    const data = await res.json();
    if (res.ok) {
      if (authMode === "login") {
        localStorage.setItem("niora_token", data.token);
        localStorage.setItem("niora_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        if (data.user.role === "admin") setIsAdmin(true);
        setIsAuthModalOpen(false);
        alert("Login successful ✨");
      } else {
        alert("Signup successful! Please login.");
        setAuthMode("login");
      }
    } else {
      alert(data.error || data.message || "Authentication failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("niora_token");
    localStorage.removeItem("niora_user");
    setToken(null);
    setUser(null);
    setIsAdmin(false);
    setAdminView("dashboard");
    setShowAdminPanel(false);
    scrollTo(homeRef);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", newProduct.name);
    formData.append("price", newProduct.price);
    formData.append("description", newProduct.description);
    formData.append("benefits", newProduct.benefits);
    if (uploadFile) formData.append("image", uploadFile);
    else formData.append("image", newProduct.image);

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      alert("Product Added! ✨");
      setNewProduct({ name: "", price: "", description: "", benefits: "", image: "" });
      setUploadFile(null);
      fetchProducts();
    } else {
      alert("Failed to add product.");
    }
  };

  const handleDeleteProduct = async (id: number) => {
    const res = await fetch(`/api/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      fetchProducts();
    } else {
      alert("Failed to delete product.");
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const formData = new FormData();
    formData.append("name", editingProduct.name);
    formData.append("price", editingProduct.price.toString());
    formData.append("description", editingProduct.description);
    formData.append("benefits", editingProduct.benefits);
    if (uploadFile) formData.append("image", uploadFile);
    else formData.append("image", editingProduct.image);

    const res = await fetch(`/api/products/${editingProduct.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      alert("Product Updated! ✨");
      setEditingProduct(null);
      setUploadFile(null);
      fetchProducts();
    } else {
      alert("Failed to update product.");
    }
  };

  const handleAddGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("image", uploadFile);

    try {
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setUploadFile(null);
        fetchGallery();
        const fileInput = document.getElementById('gallery-image-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        console.error("Failed to add image.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGallery = async (id: number) => {
    const res = await fetch(`/api/gallery/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      fetchGallery();
    } else {
      alert("Failed to delete image.");
    }
  };

  const handleUpdateHero = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const formData = new FormData();
    formData.append("image", uploadFile);

    try {
      const res = await fetch("/api/settings/hero", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        setUploadFile(null);
        fetchSettings();
        // Reset file input
        const fileInput = document.getElementById('hero-image-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        console.error("Failed to update hero image.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    const msg = userInput;
    setChatMessages(prev => [...prev, { role: "user", text: msg }]);
    setUserInput("");
    setIsTyping(true);

    try {
      const model = genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: msg,
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      const response = await model;
      setChatMessages(prev => [...prev, { role: "bot", text: response.text || "I'm here to help! 🌿" }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      setChatMessages(prev => [...prev, { role: "bot", text: "Sorry, I'm a bit busy right now. Please try again later! 😊" }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReview.name || !newReview.comment) return;
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: newReview.name, comment: newReview.comment })
    });
    if (res.ok) {
      setNewReview({ name: "", comment: "" });
      fetchReviews();
      alert("Thank you for your review! ❤️");
    }
  };

  // --- Render Helpers ---
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-transparent text-[#5C4033] font-sans selection:bg-[#8B5E3C]/30">
      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b border-[#d2b48c]/20 px-6 py-4 flex justify-between items-center">
        <h2 className="logo cursor-pointer" onClick={() => scrollTo(homeRef)}>NIORA</h2>
        <ul className="hidden md:flex gap-8 text-sm font-medium">
          <li className="hover:opacity-80 cursor-pointer transition-colors" onClick={() => scrollTo(homeRef)}>Home</li>
          <li className="hover:opacity-80 cursor-pointer transition-colors" onClick={() => scrollTo(productsRef)}>Products</li>
          <li className="hover:opacity-80 cursor-pointer transition-colors" onClick={() => scrollTo(aboutRef)}>About Us</li>
          <li className="hover:opacity-80 cursor-pointer transition-colors" onClick={() => scrollTo(contactRef)}>Contact</li>
          {isAdmin && (
            <li className="font-bold cursor-pointer flex items-center gap-1" onClick={() => setAdminView("dashboard")}>
              <Settings size={16} /> Dashboard
            </li>
          )}
        </ul>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAdminModalOpen(true)}
            className="hidden md:block bg-white text-[var(--brown)] px-4 py-2 rounded-lg font-bold text-sm hover:bg-opacity-90 transition-all"
          >
            Admin Login
          </button>
          {!user ? (
            <button 
              onClick={() => { setIsAuthModalOpen(true); setAuthMode("login"); }}
              className="text-sm font-medium hover:underline bg-transparent !text-[var(--cream)]"
            >
              Login
            </button>
          ) : (
            <span className="text-sm font-medium">Hi, {user.name}</span>
          )}
          <button onClick={() => setIsCartOpen(true)} className="relative p-2 hover:bg-white/10 rounded-full transition-colors">
            <ShoppingCart size={22} />
            {cart.length > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </button>
          {isAdmin && (
            <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-full text-red-200 transition-colors">
              <LogOut size={22} />
            </button>
          )}
        </div>
      </nav>

      {isAdmin && adminView !== "dashboard" ? null : (
        <div className="home-page">
          {/* --- Hero Section --- */}
          <section ref={homeRef} className="relative h-[90vh] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
              <img 
                src={heroImage} 
                className="w-full h-full object-cover brightness-50"
                alt="NIORA Hero"
              />
            </div>
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="relative z-10 text-center text-white px-4"
            >
              <h1 className="text-5xl md:text-8xl font-black mb-6 tracking-tighter text-white uppercase drop-shadow-2xl">Welcome to NIORA</h1>
              <p className="text-xl md:text-2xl font-light mb-10 opacity-90 text-[var(--brown)] max-w-2xl mx-auto">Luxury handmade soaps crafted for radiant skin.</p>
              <button 
                onClick={() => scrollTo(productsRef)}
                className="bg-[var(--brown)] hover:bg-[var(--dark-brown)] text-[var(--cream)] px-10 py-4 rounded-full text-lg font-medium transition-all transform hover:scale-105 shadow-xl"
              >
                Shop Collection
              </button>
            </motion.div>
          </section>

          {/* --- Search Bar --- */}
          <section className="cream-section py-12 px-6">
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="Search your soap..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 rounded-full border border-gray-200 focus:border-[#8B5E3C] focus:ring-2 focus:ring-[#8B5E3C]/20 outline-none transition-all text-lg shadow-sm"
              />
            </div>
          </section>

          {/* --- Products Section --- */}
          <section ref={productsRef} className="cream-section py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold mb-4">Our Signature Collection</h2>
                <div className="w-24 h-1 bg-[var(--brown)] mx-auto rounded-full"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                {filteredProducts.map((product) => (
                  <motion.div 
                    key={product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group"
                  >
                    <div className="relative h-64 overflow-hidden">
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[var(--brown)] font-bold text-sm">
                        ₹{product.price} / 100g
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-2">{product.name}</h3>
                      <p className="text-sm mb-4 line-clamp-2">{product.description}</p>
                      <ul className="space-y-2 mb-6">
                        {product.benefits.split(',').map((benefit, i) => (
                          <li key={i} className="text-xs opacity-70 flex items-start gap-2">
                            <span className="shrink-0">•</span> {benefit.trim()}
                          </li>
                        ))}
                      </ul>
                      <button 
                        onClick={() => addToCart(product)}
                        className="w-full bg-[var(--brown)] text-[var(--cream)] py-3 rounded-xl font-medium hover:bg-[var(--dark-brown)] transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus size={18} /> Add to Cart
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* --- WhatsApp Reviews --- */}
          <section className="cream-section py-24 px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold mb-4">💬 Real Customer Feedback</h2>
                <p className="opacity-70">Shared by our happy NIORA customers</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {gallery.map((item) => (
                  <motion.div 
                    key={item.id}
                    whileHover={{ scale: 1.05 }}
                    className="cursor-pointer rounded-2xl overflow-hidden shadow-md border border-gray-100 aspect-[2/3]"
                    onClick={() => setSelectedReviewImg(item.image)}
                  >
                    <img src={item.image} alt="Customer Feedback" className="w-full h-full object-cover" />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* --- About Section --- */}
          <section ref={aboutRef} className="cream-section py-24 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold mb-8">Pure. Honest. Effective.</h2>
              <p className="text-lg leading-relaxed mb-10">
                NIORA was born in Hubli, Karnataka, with a simple belief — skincare should be pure, honest, and truly effective. 
                What started as a small passion for creating skin-loving soaps has grown into a brand trusted by customers who see real results. 
                Every NIORA soap is handcrafted in small batches with care, precision, and attention to quality.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-2xl shadow-sm">
                  <div className="w-12 h-12 bg-[var(--brown)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Star className="text-[var(--brown)]" />
                  </div>
                  <h4 className="font-bold mb-2">Handcrafted</h4>
                  <p className="text-sm opacity-70">Made in small batches for peak quality.</p>
                </div>
                <div className="bg-white p-8 rounded-2xl shadow-sm">
                  <div className="w-12 h-12 bg-[var(--brown)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Star className="text-[var(--brown)]" />
                  </div>
                  <h4 className="font-bold mb-2">Natural</h4>
                  <p className="text-sm opacity-70">Potato, Rice, Aloe, and Vitamin E.</p>
                </div>
                <div className="bg-white p-8 rounded-2xl shadow-sm">
                  <div className="w-12 h-12 bg-[var(--brown)]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Star className="text-[var(--brown)]" />
                  </div>
                  <h4 className="font-bold mb-2">Effective</h4>
                  <p className="text-sm opacity-70">Real results you can see and feel.</p>
                </div>
              </div>
            </div>
          </section>

          {/* --- Reviews Section --- */}
          <section className="cream-section py-24 px-6">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">Customer Testimonials</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex gap-1 text-yellow-500 mb-3">
                      {[...Array(review.rating)].map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
                    </div>
                    <p className="italic mb-4">"{review.comment}"</p>
                    <p className="text-sm font-bold text-[var(--brown)]">— {review.user_name}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSubmitReview} className="bg-white p-8 rounded-3xl shadow-lg border border-[var(--brown)]/10 max-w-xl mx-auto">
                <h3 className="text-xl font-bold mb-6 text-center">Share Your Experience</h3>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Your Name" 
                    value={newReview.name}
                    onChange={(e) => setNewReview({ ...newReview, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--brown)] outline-none"
                    required
                  />
                  <textarea 
                    placeholder="Your Review" 
                    value={newReview.comment}
                    onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[var(--brown)] outline-none h-32"
                    required
                  ></textarea>
                  <button className="w-full bg-[var(--brown)] text-[var(--cream)] py-3 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-colors">
                    Submit Review
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* --- Contact Section --- */}
          <section ref={contactRef} className="brown-section py-24 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-4xl font-bold mb-12">Get in Touch</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                <div className="flex flex-col items-center">
                  <Phone className="mb-4" size={32} />
                  <p className="text-xl font-medium">7892196183</p>
                  <p className="text-sm opacity-70">Call or WhatsApp</p>
                </div>
                <div className="flex flex-col items-center">
                  <MapPin className="mb-4" size={32} />
                  <p className="text-xl font-medium">Hubli, Karnataka</p>
                  <p className="text-sm opacity-70">Handcrafted with Love</p>
                </div>
                <div className="flex flex-col items-center">
                  <Instagram className="mb-4" size={32} />
                  <a 
                    href="https://www.instagram.com/niora_handmadesoap" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xl font-medium hover:underline"
                  >
                    @niora_handmadesoap
                  </a>
                  <p className="text-sm opacity-70">Follow our journey</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* --- Admin Dashboard --- */}
      {isAdmin && (
        <AnimatePresence>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] bg-[var(--cream)] overflow-y-auto p-6"
          >
            <div className="max-w-7xl mx-auto">
              <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-bold">👑 NIORA Admin</h1>
                  <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-200">
                    <button 
                      onClick={() => setAdminView("dashboard")}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${adminView === "dashboard" ? "bg-[var(--brown)] text-[var(--cream)] shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Analytics
                    </button>
                    <button 
                      onClick={() => setAdminView("products")}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${adminView === "products" ? "bg-[var(--brown)] text-[var(--cream)] shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Products
                    </button>
                    <button 
                      onClick={() => setAdminView("orders")}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${adminView === "orders" ? "bg-[var(--brown)] text-[var(--cream)] shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Orders
                    </button>
                    <button 
                      onClick={() => setAdminView("gallery")}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${adminView === "gallery" ? "bg-[var(--brown)] text-[var(--cream)] shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Gallery
                    </button>
                    <button 
                      onClick={() => setAdminView("hero")}
                      className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${adminView === "hero" ? "bg-[var(--brown)] text-[var(--cream)] shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                    >
                      Hero
                    </button>
                  </div>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-2 rounded-full font-bold hover:bg-red-100 transition-all">
                  <LogOut size={18} /> Logout
                </button>
              </div>

              {adminView === "dashboard" && (
                <div className="space-y-10">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-[var(--brown)]">Analytics Dashboard</h2>
                    <div className="flex items-center gap-4">
                      <label className="font-bold text-[var(--brown)]">Filter by Month:</label>
                      <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-200 outline-none focus:border-[var(--brown)]"
                      >
                        <option value="All">All</option>
                        <option value="Jan">Jan</option>
                        <option value="Feb">Feb</option>
                        <option value="Mar">Mar</option>
                        <option value="Apr">Apr</option>
                        <option value="May">May</option>
                        <option value="Jun">Jun</option>
                        <option value="Jul">Jul</option>
                        <option value="Aug">Aug</option>
                        <option value="Sep">Sep</option>
                        <option value="Oct">Oct</option>
                        <option value="Nov">Nov</option>
                        <option value="Dec">Dec</option>
                      </select>
                      <button 
                        onClick={exportToExcel}
                        className="bg-[var(--brown)] text-[var(--cream)] px-4 py-2 rounded-lg font-bold hover:bg-[var(--dark-brown)] transition-all"
                      >
                        Export Orders to Excel
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[var(--cream)] text-[var(--brown)] p-6 rounded-2xl shadow-sm border border-[var(--brown)]/10 text-center">
                      <h3 className="text-sm font-medium opacity-80 mb-2">Total Orders</h3>
                      <p className="text-4xl font-bold">{dashboardStats.totalOrders}</p>
                    </div>
                    <div className="bg-[var(--cream)] text-[var(--brown)] p-6 rounded-2xl shadow-sm border border-[var(--brown)]/10 text-center">
                      <h3 className="text-sm font-medium opacity-80 mb-2">Total Revenue</h3>
                      <p className="text-4xl font-bold">₹{dashboardStats.totalRevenue}</p>
                    </div>
                    <div className="bg-[var(--cream)] text-[var(--brown)] p-6 rounded-2xl shadow-sm border border-[var(--brown)]/10 text-center">
                      <h3 className="text-sm font-medium opacity-80 mb-2">Delivered</h3>
                      <p className="text-4xl font-bold">{dashboardStats.delivered}</p>
                    </div>
                    <div className="bg-[var(--cream)] text-[var(--brown)] p-6 rounded-2xl shadow-sm border border-[var(--brown)]/10 text-center">
                      <h3 className="text-sm font-medium opacity-80 mb-2">Pending</h3>
                      <p className="text-4xl font-bold">{dashboardStats.pending}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                      <h3 className="text-xl font-bold mb-8 text-[var(--brown)]">📈 Monthly Sales</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dashboardStats.salesChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#666' }} />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              cursor={{ fill: '#f9f7f4' }}
                            />
                            <Bar dataKey="sales" fill="#5C4033" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="bg-[var(--brown)] text-[var(--cream)] p-8 rounded-3xl shadow-sm">
                        <h3 className="text-lg font-bold mb-2 opacity-90">🏆 Best Selling Product</h3>
                        <p className="text-2xl font-black">{dashboardStats.bestSeller}</p>
                      </div>

                      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-xl font-bold mb-8 text-[var(--brown)]">📦 Order Status</h3>
                        <div className="h-[200px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={dashboardStats.statusChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {dashboardStats.statusChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                          {dashboardStats.statusChartData.map((entry, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-sm font-medium text-gray-600">{entry.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {adminView === "products" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-1">
                    <form onSubmit={handleAddProduct} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 sticky top-24">
                      <h3 className="text-xl font-bold mb-6">Add New Product</h3>
                      <div className="space-y-4">
                        <input 
                          type="text" placeholder="Product Name" 
                          value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                        />
                        <input 
                          type="number" placeholder="Price (₹)" 
                          value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                        />
                        <textarea 
                          placeholder="Description" 
                          value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)] h-24" required
                        />
                        <input 
                          type="text" placeholder="Benefits (comma separated)" 
                          value={newProduct.benefits} onChange={e => setNewProduct({...newProduct, benefits: e.target.value})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                        />
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Image</label>
                          <input 
                            type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--brown)]/10 file:text-[var(--brown)] hover:file:bg-[var(--brown)]/20"
                            required={!newProduct.image}
                          />
                        </div>
                        <button className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all shadow-lg">
                          Save Product
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="lg:col-span-2 space-y-6">
                    {products.map(p => (
                      <div key={p.id} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex gap-6 items-center">
                        <img src={p.image} className="w-24 h-24 rounded-2xl object-cover" alt={p.name} />
                        <div className="flex-1">
                          <h4 className="font-bold text-lg">{p.name}</h4>
                          <p className="text-[var(--brown)] font-bold">₹{p.price}</p>
                          <p className="text-sm opacity-70 line-clamp-1">{p.description}</p>
                        </div>
                        <button onClick={() => { setEditingProduct(p); setUploadFile(null); }} className="p-4 text-blue-500 hover:bg-blue-50 rounded-2xl transition-colors bg-transparent">
                          <Edit size={20} />
                        </button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="p-4 text-red-500 hover:bg-red-50 rounded-2xl transition-colors bg-transparent">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminView === "orders" && (
                <div className="space-y-6">
                  {adminOrders.map(order => (
                    <div key={order.id} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase mb-1">Order #{order.id}</p>
                          <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString()}</p>
                        </div>
                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div>
                          <h4 className="font-bold mb-4 flex items-center gap-2"><Package size={18} /> Items</h4>
                          <div className="space-y-2">
                            {JSON.parse(order.items).map((item: any, i: number) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span>{item.name} x {item.quantity}</span>
                                <span className="font-medium">₹{item.price * item.quantity}</span>
                              </div>
                            ))}
                            <div className="pt-2 border-t mt-2 flex justify-between font-bold text-lg">
                              <span>Total</span>
                              <span className="text-[var(--brown)]">₹{order.total}</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold mb-4 flex items-center gap-2"><MapPin size={18} /> Delivery Details</h4>
                          <p className="text-sm text-gray-600 mb-2"><strong>Address:</strong> {order.address}</p>
                          <p className="text-sm text-gray-600"><strong>Contact:</strong> {order.contact}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminView === "gallery" && (
                <div className="space-y-10">
                  <form onSubmit={handleAddGallery} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-xl">
                    <h3 className="text-xl font-bold mb-6">Add Customer Picture</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Image</label>
                        <input 
                          id="gallery-image-upload"
                          type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--brown)]/10 file:text-[var(--brown)] hover:file:bg-[var(--brown)]/20"
                          required
                        />
                      </div>
                      <button className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all shadow-lg">
                        Upload Picture
                      </button>
                    </div>
                  </form>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {gallery.map(item => (
                      <div key={item.id} className="relative rounded-2xl overflow-hidden shadow-sm border border-gray-100 aspect-[2/3]">
                        <img src={item.image} alt="Gallery" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => handleDeleteGallery(item.id)}
                          className="absolute top-3 right-3 bg-red-500 text-white p-2.5 rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminView === "hero" && (
                <div className="space-y-10">
                  <form onSubmit={handleUpdateHero} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-xl">
                    <h3 className="text-xl font-bold mb-6">Update Hero Image</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">New Hero Image</label>
                        <input 
                          id="hero-image-upload"
                          type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--brown)]/10 file:text-[var(--brown)] hover:file:bg-[var(--brown)]/20"
                          required
                        />
                      </div>
                      <button className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all shadow-lg">
                        Update Hero Image
                      </button>
                    </div>
                  </form>
                  <div>
                    <h3 className="text-xl font-bold mb-6">Current Hero Image</h3>
                    <div className="rounded-3xl overflow-hidden shadow-sm border border-gray-100 aspect-video max-w-3xl">
                      <img src={heroImage} alt="Current Hero" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* --- Footer --- */}
      <footer 
        className="py-16 px-6 border-t border-gray-100 cursor-pointer"
        onClick={() => {
          const newClicks = footerClicks + 1;
          setFooterClicks(newClicks);

          if (newClicks === 3) {
            setIsAdminModalOpen(true);
            setFooterClicks(0);
          }

          setTimeout(() => setFooterClicks(0), 2000);
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="text-center md:text-left">
            <h2 className="logo" onClick={(e) => {
              e.stopPropagation(); // Prevent double trigger if clicking logo specifically
              scrollTo(homeRef);
            }}>NIORA</h2>
            <p>Pure. Honest. Effective Skincare from Hubli.</p>
          </div>
          <div className="flex gap-8 text-sm font-medium">
            <button onClick={(e) => { e.stopPropagation(); scrollTo(homeRef); }} className="hover:opacity-80 bg-transparent p-0 !text-[var(--cream)]">Home</button>
            <button onClick={(e) => { e.stopPropagation(); scrollTo(productsRef); }} className="hover:opacity-80 bg-transparent p-0 !text-[var(--cream)]">Products</button>
            <button onClick={(e) => { e.stopPropagation(); scrollTo(aboutRef); }} className="hover:opacity-80 bg-transparent p-0 !text-[var(--cream)]">About Us</button>
            <button onClick={(e) => { e.stopPropagation(); scrollTo(contactRef); }} className="hover:opacity-80 bg-transparent p-0 !text-[var(--cream)]">Contact</button>
          </div>
          <div className="flex gap-4">
            <button onClick={(e) => { e.stopPropagation(); setIsAdminModalOpen(true); }} className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </div>
        <p className="text-center text-xs opacity-50 mt-12">© 2026 NIORA Handmade Soap | Hubli, Karnataka</p>
      </footer>

      {/* --- Cart Sidebar --- */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="fixed right-0 top-0 h-full w-full max-w-md z-[101] bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2"><ShoppingCart size={20} /> Your Cart</h3>
                <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {cart.length === 0 ? (
                  <div className="text-center py-20">
                    <ShoppingCart size={48} className="mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-400">Your cart is empty</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex gap-4 items-center">
                      <img src={item.image} className="w-16 h-16 rounded-xl object-cover" alt={item.name} />
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">{item.name}</h4>
                        <p className="text-xs text-gray-500">₹{item.price} x {item.quantity}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <div className="p-6 border-t bg-gray-50">
                  <div className="flex justify-between items-center mb-6">
                    <span className="opacity-70">Total Amount</span>
                    <span className="text-2xl font-bold text-[var(--brown)]">₹{cartTotal}</span>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-2xl font-bold text-lg hover:bg-[var(--dark-brown)] transition-all shadow-lg"
                  >
                    Checkout Now
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- Chat Widget --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[350px] h-[500px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
            >
              <div className="bg-[var(--brown)] p-4 text-[var(--cream)] flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">NIORA Assistant</h4>
                    <p className="text-[10px] opacity-80">Online | Pure & Honest</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-[var(--cream)]"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--cream)]/50">
                <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm text-sm border border-gray-100 max-w-[85%]">
                  Hi 😊 I'm the NIORA assistant. How can I help you with our soaps today?
                </div>
                {chatMessages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-[var(--brown)] text-[var(--cream)] rounded-tr-none' 
                        : 'bg-white text-[var(--brown)] rounded-tl-none border border-gray-100'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm text-xs text-gray-400 italic border border-gray-100">
                      NIORA is typing...
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-white flex gap-2">
                <input 
                  type="text" 
                  placeholder="Ask about our soaps..." 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 px-4 py-2 rounded-full bg-gray-100 text-sm outline-none focus:ring-2 focus:ring-[var(--brown)]/20"
                />
                <button 
                  onClick={handleSendMessage}
                  className="bg-[var(--brown)] text-[var(--cream)] p-2 rounded-full hover:bg-[var(--dark-brown)] transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-16 h-16 bg-[var(--brown)] text-[var(--cream)] rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform"
        >
          {isChatOpen ? <X size={28} /> : <MessageCircle size={28} />}
        </button>
      </div>

      {/* --- Auth Modal --- */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm p-10 rounded-3xl shadow-2xl text-center"
            >
              <h2 className="text-2xl font-bold mb-2">{authMode === "login" ? "Welcome Back" : "Join NIORA"}</h2>
              <p className="opacity-70 text-sm mb-8">
                {authMode === "login" ? "Login to your account" : "Create a new account"}
              </p>
              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === "signup" && (
                  <input 
                    type="text" placeholder="Full Name" 
                    value={authCreds.name} onChange={e => setAuthCreds({...authCreds, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]"
                    required
                  />
                )}
                <input 
                  type="email" placeholder="Email" 
                  value={authCreds.email} onChange={e => setAuthCreds({...authCreds, email: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]"
                  required
                />
                <input 
                  type="password" placeholder="Password" 
                  value={authCreds.password} onChange={e => setAuthCreds({...authCreds, password: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]"
                  required
                />
                <button 
                  type="submit"
                  className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all"
                >
                  {authMode === "login" ? "Login" : "Sign Up"}
                </button>
                <p className="text-sm opacity-70 mt-4">
                  {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
                  <button 
                    type="button"
                    onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
                    className="ml-2 text-[var(--brown)] font-bold hover:underline bg-transparent p-0"
                  >
                    {authMode === "login" ? "Sign Up" : "Login"}
                  </button>
                </p>
                <button type="button" onClick={() => setIsAuthModalOpen(false)} className="text-gray-400 hover:text-red-500 text-sm mt-4 bg-transparent">Cancel</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Admin Login Modal --- */}
      <AnimatePresence>
        {isAdminModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm p-10 rounded-3xl shadow-2xl text-center"
            >
              <h2 className="text-2xl font-bold mb-2 text-[var(--brown)]">Admin Login</h2>
              <p className="opacity-70 text-sm mb-8">Enter your credentials to manage NIORA</p>
              <div className="space-y-4">
                <input 
                  type="text" placeholder="Admin ID / Email" 
                  value={adminCreds.id} onChange={e => setAdminCreds({...adminCreds, id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]"
                />
                <input 
                  type="password" placeholder="Password" 
                  value={adminCreds.pass} onChange={e => setAdminCreds({...adminCreds, pass: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]"
                />
                <button 
                  onClick={handleAdminLogin}
                  className="w-full bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all"
                >
                  Login
                </button>
                <button onClick={() => setIsAdminModalOpen(false)} className="text-gray-400 hover:text-red-500 text-sm mt-4 bg-transparent">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Admin Panel Modal (Success Popup) --- */}
      <AnimatePresence>
        {showAdminPanel && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-sm w-full border-4 border-[var(--brown)]"
            >
              <h2 className="text-2xl font-bold text-[var(--brown)] mb-4">NIORA Admin Panel</h2>
              <p className="text-gray-600 mb-8">You are logged in successfully.</p>
              <button 
                onClick={() => setShowAdminPanel(false)}
                className="bg-[var(--brown)] text-white px-8 py-3 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Edit Product Modal --- */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setEditingProduct(null); setUploadFile(null); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-lg p-10 rounded-3xl shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-6">Edit Product</h2>
              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <input 
                  type="text" placeholder="Product Name" 
                  value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                />
                <input 
                  type="number" placeholder="Price (₹)" 
                  value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                />
                <textarea 
                  placeholder="Description" 
                  value={editingProduct.description} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)] h-24" required
                />
                <input 
                  type="text" placeholder="Benefits (comma separated)" 
                  value={editingProduct.benefits} onChange={e => setEditingProduct({...editingProduct, benefits: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[var(--brown)]" required
                />
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase">Image</label>
                  <div className="flex items-center gap-4 mb-2">
                    {uploadFile ? (
                      <img src={URL.createObjectURL(uploadFile)} alt="New Upload" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    ) : editingProduct.image ? (
                      <img src={editingProduct.image} alt="Current" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    ) : null}
                  </div>
                  <input 
                    type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[var(--brown)]/10 file:text-[var(--brown)] hover:file:bg-[var(--brown)]/20"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="submit" className="flex-1 bg-[var(--brown)] text-[var(--cream)] py-4 rounded-xl font-bold hover:bg-[var(--dark-brown)] transition-all shadow-lg">
                    Save Changes
                  </button>
                  <button type="button" onClick={() => { setEditingProduct(null); setUploadFile(null); }} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-xl font-bold hover:bg-gray-200 transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Image Popup --- */}
      <AnimatePresence>
        {selectedReviewImg && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReviewImg(null)}
              className="absolute inset-0 bg-black/90"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-full"
            >
              <img src={selectedReviewImg} alt="Review Full" className="rounded-2xl shadow-2xl max-h-[85vh] object-contain" />
              <button 
                onClick={() => setSelectedReviewImg(null)}
                className="absolute -top-12 right-0 text-white hover:text-[#8a6f4d] transition-colors"
              >
                <X size={32} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
