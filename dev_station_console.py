"""
R&R Water Refilling Station - Independent Developer Console & Telemetry Hub
A completely separate, standalone desktop application for station owners and developers.
Runs independently outside the browser. Monitors real-time cashier inputs,
inspects station functions, and performs database maintenance.
"""

import sys
import os
import json
import time
import sqlite3
import threading
import urllib.request
import urllib.error
from datetime import datetime
import tkinter as tk
from tkinter import ttk, messagebox, filedialog

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rr_water.db')
API_URL = 'http://localhost:3000'

class DeveloperConsoleApp(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("R&R Water POS — Independent Developer Console & Telemetry Hub")
        self.geometry("1180x760")
        self.minsize(980, 620)
        self.configure(bg="#0b0f19")

        # Telemetry storage
        self.telemetry_events = []
        self.is_stream_paused = False
        self.active_stream_filter = 'all'
        self.active_register_state = {}
        self.last_sync_time = "None"

        # Setup custom dark ttk styling
        self.setup_theme()

        # Build UI layout
        self.build_header()
        self.build_kpi_ribbon()
        self.build_tabs()
        self.build_status_bar()

        # Start background polling thread
        self.running = True
        self.poll_thread = threading.Thread(target=self.background_polling_loop, daemon=True)
        self.poll_thread.start()

        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def setup_theme(self):
        self.style = ttk.Style(self)
        self.style.theme_use('clam')

        # Colors
        bg_dark = "#0b0f19"
        card_bg = "#182235"
        text_white = "#f8fafc"
        accent_blue = "#0284c7"

        self.style.configure(".", background=bg_dark, foreground=text_white, font=("Segoe UI", 9))
        self.style.configure("TNotebook", background=bg_dark, borderwidth=0)
        self.style.configure("TNotebook.Tab", background="#111827", foreground="#94a3b8",
                             padding=[14, 8], font=("Segoe UI", 9, "bold"), borderwidth=0)
        self.style.map("TNotebook.Tab",
                       background=[("selected", card_bg), ("active", "#1e293b")],
                       foreground=[("selected", "#38bdf8"), ("active", text_white)])

        self.style.configure("Treeview",
                             background="#0d1424",
                             foreground=text_white,
                             fieldbackground="#0d1424",
                             rowheight=26,
                             font=("Consolas", 9),
                             borderwidth=0)
        self.style.configure("Treeview.Heading",
                             background="#111827",
                             foreground="#94a3b8",
                             font=("Segoe UI", 8, "bold"),
                             padding=[6, 4])
        self.style.map("Treeview", background=[("selected", accent_blue)])

    def build_header(self):
        header_frame = tk.Frame(self, bg="#111827", height=54, padx=16, pady=8)
        header_frame.pack(side="top", fill="x")

        # Left title
        title_box = tk.Frame(header_frame, bg="#111827")
        title_box.pack(side="left")

        title_lbl = tk.Label(title_box, text="R&R Water POS", font=("Segoe UI", 12, "bold"), bg="#111827", fg="#f8fafc")
        title_lbl.pack(side="left")

        badge_lbl = tk.Label(title_box, text="STANDALONE DEV CONSOLE", font=("Consolas", 8, "bold"),
                             bg="#0284c7", fg="#ffffff", padx=6, pady=2)
        badge_lbl.pack(side="left", padx=8)

        sub_lbl = tk.Label(title_box, text="• Independent System Diagnostics & Live Telemetry",
                           font=("Segoe UI", 8), bg="#111827", fg="#94a3b8")
        sub_lbl.pack(side="left")

        # Right status pills
        status_box = tk.Frame(header_frame, bg="#111827")
        status_box.pack(side="right")

        self.lbl_db_status = tk.Label(status_box, text="● SQLite: Checking...", font=("Consolas", 8, "bold"),
                                      bg="#0d1424", fg="#f59e0b", padx=8, pady=3, relief="solid", bd=1)
        self.lbl_db_status.pack(side="left", padx=4)

        self.lbl_server_status = tk.Label(status_box, text="● Server: Checking...", font=("Consolas", 8, "bold"),
                                          bg="#0d1424", fg="#f59e0b", padx=8, pady=3, relief="solid", bd=1)
        self.lbl_server_status.pack(side="left", padx=4)

        self.lbl_stream_status = tk.Label(status_box, text="● Telemetry: Active", font=("Consolas", 8, "bold"),
                                          bg="#0d1424", fg="#10b981", padx=8, pady=3, relief="solid", bd=1)
        self.lbl_stream_status.pack(side="left", padx=4)

    def build_kpi_ribbon(self):
        ribbon_frame = tk.Frame(self, bg="#0b0f19", padx=16, pady=10)
        ribbon_frame.pack(side="top", fill="x")

        self.kpi_cards = {}
        metrics = [
            ("Today Gross Revenue", "kpi_gross", "₱0.00", "#38bdf8"),
            ("Operating Expenses", "kpi_expenses", "₱0.00", "#ef4444"),
            ("Real Daily Net Profit", "kpi_net", "₱0.00", "#10b981"),
            ("Unpaid Utang (Debt)", "kpi_debt", "₱0.00", "#f59e0b"),
            ("Carboys Ready / Clean", "kpi_ready", "150 Gal", "#cbd5e1"),
        ]

        for i, (title, key, default_val, color) in enumerate(metrics):
            card = tk.Frame(ribbon_frame, bg="#182235", padx=12, pady=8, relief="solid", bd=1, highlightbackground="#24344d")
            card.pack(side="left", fill="both", expand=True, padx=4)

            lbl_title = tk.Label(card, text=title.upper(), font=("Segoe UI", 7, "bold"), bg="#182235", fg="#94a3b8")
            lbl_title.pack(anchor="w")

            lbl_val = tk.Label(card, text=default_val, font=("Consolas", 14, "bold"), bg="#182235", fg=color)
            lbl_val.pack(anchor="w", pady=(2, 0))

            self.kpi_cards[key] = lbl_val

    def build_tabs(self):
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(side="top", fill="both", expand=True, padx=16, pady=(0, 6))

        # Tab 1: Live Monitor & Telemetry
        self.tab_monitor = tk.Frame(self.notebook, bg="#0b0f19")
        self.notebook.add(self.tab_monitor, text="  Live Monitor & Inputs  ")
        self.build_monitor_tab(self.tab_monitor)

        # Tab 2: Function Directory & Simulators
        self.tab_features = tk.Frame(self.notebook, bg="#0b0f19")
        self.notebook.add(self.tab_features, text="  Function Directory & Simulators  ")
        self.build_features_tab(self.tab_features)

        # Tab 3: Database & Maintenance
        self.tab_maint = tk.Frame(self.notebook, bg="#0b0f19")
        self.notebook.add(self.tab_maint, text="  Database & System Maintenance  ")
        self.build_maintenance_tab(self.tab_maint)

        # Tab 4: Raw SQLite Tables Explorer
        self.tab_explorer = tk.Frame(self.notebook, bg="#0b0f19")
        self.notebook.add(self.tab_explorer, text="  Raw SQLite Explorer  ")
        self.build_explorer_tab(self.tab_explorer)

    def build_monitor_tab(self, parent):
        grid_frame = tk.Frame(parent, bg="#0b0f19")
        grid_frame.pack(fill="both", expand=True, pady=8)

        # Left Column: Terminal Register Live Mirror (360px)
        left_col = tk.Frame(grid_frame, bg="#182235", width=360, padx=14, pady=12, relief="solid", bd=1)
        left_col.pack(side="left", fill="y", padx=(0, 10))
        left_col.pack_propagate(False)

        # Title
        mirror_head = tk.Frame(left_col, bg="#182235")
        mirror_head.pack(fill="x", pady=(0, 10))

        tk.Label(mirror_head, text="CASHIER REGISTER MIRROR", font=("Segoe UI", 9, "bold"), bg="#182235", fg="#f8fafc").pack(side="left")
        self.lbl_live_badge = tk.Label(mirror_head, text="● LIVE", font=("Consolas", 8, "bold"), bg="#064e3b", fg="#34d399", padx=6, pady=2)
        self.lbl_live_badge.pack(side="right")

        # Operator row
        op_box = tk.Frame(left_col, bg="#0f172a", padx=10, pady=8, relief="solid", bd=1)
        op_box.pack(fill="x", pady=(0, 8))

        self.lbl_mirror_cashier = tk.Label(op_box, text="Operator: Neil (Manager)", font=("Segoe UI", 9, "bold"), bg="#0f172a", fg="#f8fafc")
        self.lbl_mirror_cashier.pack(anchor="w")

        self.lbl_mirror_order = tk.Label(op_box, text="Active Order: #000000", font=("Consolas", 8), bg="#0f172a", fg="#94a3b8")
        self.lbl_mirror_order.pack(anchor="w")

        # Data fields box
        fields_box = tk.Frame(left_col, bg="#0f172a", padx=10, pady=10, relief="solid", bd=1)
        fields_box.pack(fill="x", pady=(0, 8))

        self.mirror_labels = {}
        rows = [
            ("Channel:", "channel", "Walk-in"),
            ("Item:", "prod", "1 Gallon Purified • ₱35"),
            ("Quantity:", "qty", "1 Gallon"),
            ("Total:", "total", "₱ 35.00"),
            ("Payment Mode:", "pay_mode", "Cash Drawer"),
            ("Status Mode:", "status_mode", "PAID"),
            ("Cash Received:", "tendered", "₱ 0.00"),
            ("Change Due:", "change", "₱ 0.00"),
        ]

        for lbl_text, key, def_val in rows:
            r_frame = tk.Frame(fields_box, bg="#0f172a")
            r_frame.pack(fill="x", pady=2)

            tk.Label(r_frame, text=lbl_text, font=("Segoe UI", 8), bg="#0f172a", fg="#94a3b8").pack(side="left")
            val_lbl = tk.Label(r_frame, text=def_val, font=("Consolas", 8, "bold"), bg="#0f172a", fg="#f8fafc")
            val_lbl.pack(side="right")
            self.mirror_labels[key] = val_lbl

        # Highlight total
        self.mirror_labels["total"].config(font=("Consolas", 10, "bold"), fg="#10b981")
        self.mirror_labels["qty"].config(font=("Consolas", 9, "bold"), fg="#38bdf8")

        # Note display
        tk.Label(left_col, text="CUSTOMER / ROUTE NOTE:", font=("Segoe UI", 7, "bold"), bg="#182235", fg="#94a3b8").pack(anchor="w", pady=(4, 2))
        self.txt_mirror_note = tk.Text(left_col, height=3, bg="#0d1424", fg="#f8fafc", font=("Consolas", 8),
                                       relief="solid", bd=1, wrap="word")
        self.txt_mirror_note.pack(fill="x", pady=(0, 6))
        self.txt_mirror_note.insert("1.0", "(No active note entered)")
        self.txt_mirror_note.config(state="disabled")

        self.lbl_mirror_sync = tk.Label(left_col, text="Last Sync: Waiting...", font=("Segoe UI", 7), bg="#182235", fg="#64748b")
        self.lbl_mirror_sync.pack(anchor="w")

        # Right Column: Telemetry Event Stream
        right_col = tk.Frame(grid_frame, bg="#182235", padx=12, pady=12, relief="solid", bd=1)
        right_col.pack(side="left", fill="both", expand=True)

        # Stream Toolbar
        toolbar = tk.Frame(right_col, bg="#182235")
        toolbar.pack(fill="x", pady=(0, 8))

        tk.Label(toolbar, text="STREAMING TELEMETRY FEED", font=("Segoe UI", 9, "bold"), bg="#182235", fg="#f8fafc").pack(side="left")

        btn_pause = tk.Button(toolbar, text="Pause Stream", font=("Segoe UI", 8, "bold"), bg="#1e293b", fg="#f8fafc",
                              activebackground="#334155", relief="flat", command=self.toggle_stream_pause, padx=8, pady=2)
        btn_pause.pack(side="right", padx=4)
        self.btn_pause = btn_pause

        btn_clear = tk.Button(toolbar, text="Clear Feed", font=("Segoe UI", 8), bg="#7f1d1d", fg="#ffffff",
                              activebackground="#991b1b", relief="flat", command=self.clear_stream, padx=8, pady=2)
        btn_clear.pack(side="right", padx=4)

        # Filter buttons
        filter_bar = tk.Frame(right_col, bg="#182235")
        filter_bar.pack(fill="x", pady=(0, 8))

        filters = [("All", "all"), ("Orders", "order"), ("Payments", "pay"), ("Debt", "debt"),
                   ("Driver", "driver"), ("Expenses", "expense"), ("Hardware", "hardware")]
        self.filter_buttons = {}
        for text, key in filters:
            b = tk.Button(filter_bar, text=text, font=("Segoe UI", 7, "bold"), bg="#0284c7" if key == "all" else "#0f172a",
                          fg="#ffffff" if key == "all" else "#94a3b8", relief="flat", padx=8, pady=2,
                          command=lambda k=key: self.set_stream_filter(k))
            b.pack(side="left", padx=2)
            self.filter_buttons[key] = b

        # Telemetry Treeview Table
        tree_frame = tk.Frame(right_col, bg="#0d1424")
        tree_frame.pack(fill="both", expand=True)

        cols = ("time", "type", "operator", "details")
        self.stream_tree = ttk.Treeview(tree_frame, columns=cols, show="headings", selectmode="browse")
        self.stream_tree.heading("time", text="TIME")
        self.stream_tree.heading("type", text="EVENT TYPE")
        self.stream_tree.heading("operator", text="OPERATOR")
        self.stream_tree.heading("details", text="EVENT DETAILS & SUMMARY")

        self.stream_tree.column("time", width=80, anchor="center")
        self.stream_tree.column("type", width=140, anchor="center")
        self.stream_tree.column("operator", width=110, anchor="w")
        self.stream_tree.column("details", width=420, anchor="w")

        v_scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.stream_tree.yview)
        self.stream_tree.configure(yscrollcommand=v_scroll.set)

        self.stream_tree.pack(side="left", fill="both", expand=True)
        v_scroll.pack(side="right", fill="y")

        self.stream_tree.bind("<Double-1>", self.on_stream_item_double_click)

    def build_features_tab(self, parent):
        container = tk.Frame(parent, bg="#0b0f19", padx=16, pady=16)
        container.pack(fill="both", expand=True)

        tk.Label(container, text="STATION FUNCTIONS & INTERACTIVE SIMULATORS", font=("Segoe UI", 11, "bold"),
                 bg="#0b0f19", fg="#f8fafc").pack(anchor="w", pady=(0, 4))
        tk.Label(container, text="Test and trigger station capabilities directly from this console without touching the cashier screen.",
                 font=("Segoe UI", 8), bg="#0b0f19", fg="#94a3b8").pack(anchor="w", pady=(0, 14))

        grid = tk.Frame(container, bg="#0b0f19")
        grid.pack(fill="both", expand=True)

        features = [
            ("1. Order & Refill Simulator",
             "Simulate ringing up customer orders, gallon pricing, and automatic change calculation.",
             [("Simulate Walk-in (3 Gal • ₱105)", self.sim_walkin),
              ("Simulate Delivery (10 Gal • Unpaid)", self.sim_delivery)]),

            ("2. Bayad Utang (Debt Subsystem)",
             "Test accounts receivable collection, partial repayment, and live balance clearing.",
             [("Simulate Bayad Utang Payment (₱105)", self.sim_bayad_utang)]),

            ("3. GCash QR E-Wallet Checkout",
             "Test station QR transaction recording, reference numbers, and payment verification.",
             [("Simulate GCash Order (2 Gal • ₱70)", self.sim_gcash)]),

            ("4. Multicab Driver Settlement",
             "Simulate driver delivery reconciliation: Loaded = Sold + Empties + Unsold.",
             [("Simulate Driver Remittance (56 Sold • ₱1,960)", self.sim_driver_settle)]),

            ("5. Quick Operational Expenses",
             "Log operational costs across 7 categories and verify daily net profit deduction.",
             [("Log Gasoline Expense (₱150)", lambda: self.sim_expense('fuel', 150, 'Gasoline 2L')),
              ("Log Cap Seals (₱85)", lambda: self.sim_expense('seals', 85, '100 pcs Heat Shrink Seals'))]),

            ("6. POS Hardware & Peripherals",
             "Trigger ESC/POS cash drawer kick solenoid (Pin 2) and preview formatted 80mm thermal receipt.",
             [("Trigger Cash Drawer Kick", self.sim_drawer_kick),
              ("Preview 80mm Thermal Receipt", self.sim_receipt_preview)])
        ]

        row, col = 0, 0
        for title, desc, btns in features:
            card = tk.Frame(grid, bg="#182235", padx=14, pady=12, relief="solid", bd=1, highlightbackground="#24344d")
            card.grid(row=row, column=col, padx=8, pady=8, sticky="nsew")

            tk.Label(card, text=title, font=("Segoe UI", 9, "bold"), bg="#182235", fg="#38bdf8").pack(anchor="w")
            tk.Label(card, text=desc, font=("Segoe UI", 8), bg="#182235", fg="#94a3b8", wraplength=280, justify="left").pack(anchor="w", pady=(2, 10))

            btn_box = tk.Frame(card, bg="#182235")
            btn_box.pack(fill="x", side="bottom")
            for b_text, b_cmd in btns:
                b = tk.Button(btn_box, text=b_text, font=("Segoe UI", 8, "bold"), bg="#0284c7", fg="#ffffff",
                              relief="flat", activebackground="#0369a1", command=b_cmd, pady=4)
                b.pack(fill="x", pady=2)

            col += 1
            if col > 2:
                col = 0
                row += 1

        for c in range(3):
            grid.columnconfigure(c, weight=1)

    def build_maintenance_tab(self, parent):
        container = tk.Frame(parent, bg="#0b0f19", padx=16, pady=16)
        container.pack(fill="both", expand=True)

        tk.Label(container, text="DATABASE & SYSTEM MAINTENANCE", font=("Segoe UI", 11, "bold"),
                 bg="#0b0f19", fg="#f8fafc").pack(anchor="w", pady=(0, 4))
        tk.Label(container, text="Perform SQLite backups, database health checks, sample data seeding, and system recovery.",
                 font=("Segoe UI", 8), bg="#0b0f19", fg="#94a3b8").pack(anchor="w", pady=(0, 14))

        maint_grid = tk.Frame(container, bg="#0b0f19")
        maint_grid.pack(fill="both", expand=True)

        # Left: DB Stats
        left_box = tk.Frame(maint_grid, bg="#182235", padx=16, pady=14, relief="solid", bd=1)
        left_box.pack(side="left", fill="both", expand=True, padx=(0, 10))

        tk.Label(left_box, text="SQLITE DATABASE VITALS", font=("Segoe UI", 9, "bold"), bg="#182235", fg="#38bdf8").pack(anchor="w", pady=(0, 8))

        self.db_stats_box = tk.Frame(left_box, bg="#0f172a", padx=12, pady=10, relief="solid", bd=1)
        self.db_stats_box.pack(fill="both", expand=True)

        self.lbl_maint_db_path = tk.Label(self.db_stats_box, text=f"Path: {DB_PATH}", font=("Consolas", 8), bg="#0f172a", fg="#94a3b8", wraplength=400, justify="left")
        self.lbl_maint_db_path.pack(anchor="w", pady=2)

        self.lbl_maint_db_size = tk.Label(self.db_stats_box, text="Size: Calculating...", font=("Consolas", 8, "bold"), bg="#0f172a", fg="#f8fafc")
        self.lbl_maint_db_size.pack(anchor="w", pady=2)

        self.lbl_maint_orders_count = tk.Label(self.db_stats_box, text="Orders in DB: 0", font=("Consolas", 8), bg="#0f172a", fg="#38bdf8")
        self.lbl_maint_orders_count.pack(anchor="w", pady=2)

        self.lbl_maint_cust_count = tk.Label(self.db_stats_box, text="Customers in DB: 0", font=("Consolas", 8), bg="#0f172a", fg="#f8fafc")
        self.lbl_maint_cust_count.pack(anchor="w", pady=2)

        self.lbl_maint_audit_count = tk.Label(self.db_stats_box, text="Audit Logs: 0", font=("Consolas", 8), bg="#0f172a", fg="#f8fafc")
        self.lbl_maint_audit_count.pack(anchor="w", pady=2)

        # Right: Maintenance Buttons
        right_box = tk.Frame(maint_grid, bg="#182235", padx=16, pady=14, relief="solid", bd=1)
        right_box.pack(side="left", fill="both", expand=True)

        tk.Label(right_box, text="MAINTENANCE OPERATIONS", font=("Segoe UI", 9, "bold"), bg="#182235", fg="#38bdf8").pack(anchor="w", pady=(0, 8))

        actions = [
            ("Backup SQLite Database (.db)", "Create an instant timestamped copy of rr_water.db", self.backup_sqlite_db, "#0284c7"),
            ("Export Full Database to JSON", "Download all orders, inventory, and staff in readable JSON format", self.export_json_db, "#0284c7"),
            ("Seed 8 Realistic Test Orders", "Populate sample transactions across routes to test analytics", self.seed_test_data, "#10b981"),
            ("PRAGMA Integrity Check & Vacuum", "Verify SQLite B-tree integrity and reclaim unused space", self.run_sqlite_integrity_check, "#6366f1"),
            ("Clear Orders Table (Keep Settings)", "Wipe transaction test data while keeping station configuration", self.clear_test_orders, "#ef4444")
        ]

        for b_title, b_sub, b_cmd, b_col in actions:
            row_f = tk.Frame(right_box, bg="#0f172a", padx=10, pady=8, relief="solid", bd=1)
            row_f.pack(fill="x", pady=3)

            t_box = tk.Frame(row_f, bg="#0f172a")
            t_box.pack(side="left", fill="both", expand=True)

            tk.Label(t_box, text=b_title, font=("Segoe UI", 8, "bold"), bg="#0f172a", fg="#f8fafc").pack(anchor="w")
            tk.Label(t_box, text=b_sub, font=("Segoe UI", 7), bg="#0f172a", fg="#94a3b8").pack(anchor="w")

            btn = tk.Button(row_f, text="Execute", font=("Segoe UI", 8, "bold"), bg=b_col, fg="#ffffff",
                            relief="flat", command=b_cmd, padx=10, pady=2)
            btn.pack(side="right")

    def build_explorer_tab(self, parent):
        container = tk.Frame(parent, bg="#0b0f19", padx=16, pady=16)
        container.pack(fill="both", expand=True)

        toolbar = tk.Frame(container, bg="#0b0f19")
        toolbar.pack(fill="x", pady=(0, 10))

        tk.Label(toolbar, text="Table:", font=("Segoe UI", 9, "bold"), bg="#0b0f19", fg="#f8fafc").pack(side="left", padx=(0, 6))

        self.cmb_table = ttk.Combobox(toolbar, values=["orders", "staff", "settings", "inventory", "customers", "shifts", "audit_logs"], state="readonly", width=18)
        self.cmb_table.set("orders")
        self.cmb_table.pack(side="left", padx=(0, 14))
        self.cmb_table.bind("<<ComboboxSelected>>", lambda e: self.load_table_data())

        tk.Label(toolbar, text="Filter:", font=("Segoe UI", 9), bg="#0b0f19", fg="#94a3b8").pack(side="left", padx=(0, 4))
        self.ent_search = tk.Entry(toolbar, font=("Segoe UI", 9), bg="#0d1424", fg="#f8fafc", relief="solid", bd=1, width=24)
        self.ent_search.pack(side="left", padx=(0, 10))
        self.ent_search.bind("<KeyRelease>", lambda e: self.filter_table_data())

        btn_refresh = tk.Button(toolbar, text="Refresh", font=("Segoe UI", 8, "bold"), bg="#1e293b", fg="#f8fafc",
                                relief="flat", command=self.load_table_data, padx=10, pady=2)
        btn_refresh.pack(side="right", padx=4)

        # Explorer Treeview
        tree_frame = tk.Frame(container, bg="#0d1424", relief="solid", bd=1)
        tree_frame.pack(fill="both", expand=True)

        self.explorer_tree = ttk.Treeview(tree_frame, show="headings", selectmode="browse")
        v_scroll = ttk.Scrollbar(tree_frame, orient="vertical", command=self.explorer_tree.yview)
        h_scroll = ttk.Scrollbar(tree_frame, orient="horizontal", command=self.explorer_tree.xview)
        self.explorer_tree.configure(yscrollcommand=v_scroll.set, xscrollcommand=h_scroll.set)

        self.explorer_tree.pack(side="left", fill="both", expand=True)
        v_scroll.pack(side="right", fill="y")
        h_scroll.pack(side="bottom", fill="x")

        self.load_table_data()

    def build_status_bar(self):
        status_frame = tk.Frame(self, bg="#111827", height=24, padx=16, pady=4)
        status_frame.pack(side="bottom", fill="x")

        self.lbl_status_msg = tk.Label(status_frame, text="Independent Developer Console Ready • Monitoring Localhost & SQLite Database",
                                       font=("Segoe UI", 8), bg="#111827", fg="#94a3b8")
        self.lbl_status_msg.pack(side="left")

        self.lbl_status_time = tk.Label(status_frame, text="", font=("Consolas", 8), bg="#111827", fg="#64748b")
        self.lbl_status_time.pack(side="right")

    # --- POLLING & SYNC LOGIC ---
    def background_polling_loop(self):
        while self.running:
            try:
                # 1. Poll active register state from server if running
                self.poll_active_register()

                # 2. Poll telemetry events from server
                self.poll_telemetry_events()

                # 3. Read SQLite metrics directly
                self.poll_sqlite_vitals()

            except Exception:
                pass

            time.sleep(1.0)

    def poll_active_register(self):
        try:
            req = urllib.request.Request(f"{API_URL}/api/telemetry/active", headers={'User-Agent': 'PythonDevConsole'})
            with urllib.request.urlopen(req, timeout=1.0) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode('utf-8'))
                    if data.get('success') and data.get('state'):
                        self.after(0, lambda: self.update_register_mirror_ui(data['state']))
        except Exception:
            pass

    def poll_telemetry_events(self):
        try:
            req = urllib.request.Request(f"{API_URL}/api/telemetry", headers={'User-Agent': 'PythonDevConsole'})
            with urllib.request.urlopen(req, timeout=1.0) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode('utf-8'))
                    if data.get('success') and data.get('events'):
                        events = data['events']
                        self.after(0, lambda: self.sync_telemetry_events(events))
                        self.after(0, lambda: self.lbl_server_status.config(text="● Server: Online (Port 3000)", fg="#10b981"))
                        return
        except Exception:
            self.after(0, lambda: self.lbl_server_status.config(text="● Server: Standby (Offline)", fg="#f59e0b"))

    def sync_telemetry_events(self, events):
        if self.is_stream_paused:
            return

        existing_ids = {e.get('id') for e in self.telemetry_events}
        new_items = []
        for e in events:
            if e.get('id') and e.get('id') not in existing_ids:
                new_items.append(e)

        if new_items:
            for item in reversed(new_items):
                self.telemetry_events.insert(0, item)
            if len(self.telemetry_events) > 150:
                self.telemetry_events = self.telemetry_events[:150]
            self.refresh_stream_tree()

    def update_register_mirror_ui(self, state):
        if not state:
            return

        cashier = state.get('cashier', 'Neil')
        order_no = state.get('orderNo', '#000000')
        channel = (state.get('channel') or 'walkin').upper()
        prod = state.get('prodName', '1 Gallon Purified')
        qty = state.get('qty', 1)
        total = state.get('total', 35)
        method = "GCash QR" if state.get('paymentMethod') == 'gcash' else "Cash Drawer"
        status_mode = (state.get('orderPayMode') or 'paid').upper()
        tendered = state.get('tenderAmount', 0)
        change = state.get('changeAmount', 0)
        note = state.get('note') or state.get('deliveryAddress') or '(No note or address)'

        self.lbl_mirror_cashier.config(text=f"Operator: {cashier}")
        self.lbl_mirror_order.config(text=f"Active Order: {order_no}")

        self.mirror_labels["channel"].config(text=channel)
        self.mirror_labels["prod"].config(text=prod)
        self.mirror_labels["qty"].config(text=f"{qty} Gallon{'s' if qty > 1 else ''}")
        self.mirror_labels["total"].config(text=f"₱ {total:,.2f}")
        self.mirror_labels["pay_mode"].config(text=method)
        self.mirror_labels["status_mode"].config(text=status_mode, fg="#10b981" if status_mode == "PAID" else "#f59e0b")
        self.mirror_labels["tendered"].config(text=f"₱ {tendered:,.2f}")
        self.mirror_labels["change"].config(text=f"₱ {change:,.2f}")

        self.txt_mirror_note.config(state="normal")
        self.txt_mirror_note.delete("1.0", "end")
        self.txt_mirror_note.insert("1.0", note)
        self.txt_mirror_note.config(state="disabled")

        self.lbl_mirror_sync.config(text=f"Last Input Sync: {datetime.now().strftime('%I:%M:%S %p')}")

    def poll_sqlite_vitals(self):
        if not os.path.exists(DB_PATH):
            self.after(0, lambda: self.lbl_db_status.config(text="● SQLite: Missing", fg="#ef4444"))
            return

        try:
            conn = sqlite3.connect(DB_PATH, timeout=1.0)
            cur = conn.cursor()

            # Orders & Revenue
            cur.execute("SELECT COUNT(*), COALESCE(SUM(total), 0), COALESCE(SUM(CASE WHEN status='pending' THEN total - paid_amount ELSE 0 END), 0) FROM orders;")
            row = cur.fetchone()
            order_count, gross, debt = row if row else (0, 0, 0)

            # Customer Count
            cur.execute("SELECT COUNT(*) FROM customers;")
            cust_count = cur.fetchone()[0]

            # Audit Count
            cur.execute("SELECT COUNT(*) FROM audit_logs;")
            audit_count = cur.fetchone()[0]

            conn.close()

            db_size_kb = os.path.getsize(DB_PATH) / 1024

            self.after(0, lambda: self.lbl_db_status.config(text="● SQLite: Connected", fg="#10b981"))
            self.after(0, lambda: self.kpi_cards["kpi_gross"].config(text=f"₱ {gross:,.2f}"))
            self.after(0, lambda: self.kpi_cards["kpi_debt"].config(text=f"₱ {debt:,.2f}"))
            self.after(0, lambda: self.lbl_maint_db_size.config(text=f"Size: {db_size_kb:.1f} KB"))
            self.after(0, lambda: self.lbl_maint_orders_count.config(text=f"Orders in DB: {order_count}"))
            self.after(0, lambda: self.lbl_maint_cust_count.config(text=f"Customers in DB: {cust_count}"))
            self.after(0, lambda: self.lbl_maint_audit_count.config(text=f"Audit Logs: {audit_count}"))
            self.after(0, lambda: self.lbl_status_time.config(text=datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")))

        except Exception:
            pass

    # --- TELEMETRY ACTIONS ---
    def toggle_stream_pause(self):
        self.is_stream_paused = not self.is_stream_paused
        self.btn_pause.config(text="Resume Stream" if self.is_stream_paused else "Pause Stream",
                              bg="#f59e0b" if self.is_stream_paused else "#1e293b")

    def clear_stream(self):
        self.telemetry_events = []
        for item in self.stream_tree.get_children():
            self.stream_tree.delete(item)

    def set_stream_filter(self, key):
        self.active_stream_filter = key
        for k, b in self.filter_buttons.items():
            b.config(bg="#0284c7" if k == key else "#0f172a",
                     fg="#ffffff" if k == key else "#94a3b8")
        self.refresh_stream_tree()

    def refresh_stream_tree(self):
        for item in self.stream_tree.get_children():
            self.stream_tree.delete(item)

        for evt in self.telemetry_events:
            e_type = (evt.get('type') or 'EVENT').upper()
            if self.active_stream_filter != 'all':
                f = self.active_stream_filter.upper()
                if f not in e_type:
                    continue

            time_str = evt.get('timeStr') or datetime.fromtimestamp(evt.get('timestamp', time.time()*1000)/1000).strftime('%I:%M:%S %p')
            operator = evt.get('user', 'Neil')
            details = evt.get('details', 'Station event')

            self.stream_tree.insert("", "end", values=(time_str, e_type, operator, details), tags=(e_type,))

    def on_stream_item_double_click(self, event):
        sel = self.stream_tree.selection()
        if not sel:
            return
        item = self.stream_tree.item(sel[0])
        vals = item['values']
        # Find matching event
        matching = next((e for e in self.telemetry_events if e.get('type') == vals[1] and vals[3] in str(e.get('details'))), None)
        payload = matching.get('payload') if matching else vals
        self.show_json_dialog(f"Telemetry Payload: {vals[1]}", payload or matching)

    def show_json_dialog(self, title, data):
        dlg = tk.Toplevel(self)
        dlg.title(title)
        dlg.geometry("580x420")
        dlg.configure(bg="#111827")
        dlg.transient(self)

        txt = tk.Text(dlg, bg="#0d1424", fg="#38bdf8", font=("Consolas", 9), padx=10, pady=10)
        txt.pack(fill="both", expand=True, padx=12, pady=12)
        txt.insert("1.0", json.dumps(data, indent=2))
        txt.config(state="disabled")

        btn_box = tk.Frame(dlg, bg="#111827", pady=8)
        btn_box.pack(fill="x")
        tk.Button(btn_box, text="Close", font=("Segoe UI", 8, "bold"), bg="#0284c7", fg="#ffffff",
                  command=dlg.destroy, padx=14, pady=3, relief="flat").pack(side="right", padx=12)

    # --- SIMULATORS ---
    def record_simulated_event(self, e_type, details, payload):
        evt = {
            "id": f"sim_{int(time.time()*1000)}",
            "timestamp": int(time.time()*1000),
            "timeStr": datetime.now().strftime("%I:%M:%S %p"),
            "type": e_type,
            "details": details,
            "user": "Developer Console (Standalone)",
            "role": "owner",
            "payload": payload
        }
        self.telemetry_events.insert(0, evt)
        self.refresh_stream_tree()
        self.lbl_status_msg.config(text=f"Simulated: {details}")

        # Post to server if online
        try:
            req = urllib.request.Request(f"{API_URL}/api/telemetry",
                                         data=json.dumps(evt).encode('utf-8'),
                                         headers={'Content-Type': 'application/json'})
            urllib.request.urlopen(req, timeout=0.8)
        except Exception:
            pass

    def sim_walkin(self):
        order_no = f"#{int(time.time()) % 1000000}"
        total = 3 * 35.0
        order = {"order_no": order_no, "channel": "walkin", "gallons": 3, "total": total, "status": "paid", "cashier": "Neil"}
        self.insert_order_to_sqlite(order_no, "walkin", 3, total, "paid")
        self.record_simulated_event("ORDER_SUBMITTED", f"Walk-in order {order_no} simulated (3 Gal • ₱{total:.2f})", order)

    def sim_delivery(self):
        order_no = f"#{int(time.time()) % 1000000}"
        total = 10 * 35.0
        order = {"order_no": order_no, "channel": "delivery", "gallons": 10, "total": total, "status": "pending", "note": "Purok 2 Riverside Subd"}
        self.insert_order_to_sqlite(order_no, "delivery", 10, total, "pending")
        self.record_simulated_event("ORDER_SUBMITTED", f"Delivery dispatch {order_no} simulated (10 Gal • Unpaid ₱{total:.2f})", order)

    def sim_bayad_utang(self):
        self.record_simulated_event("DEBT_PAYMENT", "Bayad Utang collected: ₱105.00 debt settled for order #492810", {"payment": 105, "status": "settled"})

    def sim_gcash(self):
        order_no = f"#{int(time.time()) % 1000000}"
        total = 2 * 35.0
        order = {"order_no": order_no, "channel": "walkin", "gallons": 2, "total": total, "method": "gcash", "ref": f"GC-{int(time.time()*1000)%100000000}"}
        self.record_simulated_event("ORDER_SUBMITTED", f"GCash QR transaction {order_no} (2 Gal • ₱{total:.2f} • Ref {order['ref']})", order)

    def sim_driver_settle(self):
        settle = {"driver": "Kuya Jun", "loaded": 100, "sold": 56, "empties": 56, "unsold": 44, "remitted": 1810, "fuel": 150}
        self.record_simulated_event("DRIVER_SETTLEMENT", "Driver Settlement: Kuya Jun remitted ₱1,810.00 (56 Sold, ₱150 Fuel Deduction)", settle)

    def sim_expense(self, cat, amt, note):
        exp = {"category": cat, "amount": amt, "note": note, "time": datetime.now().strftime("%I:%M %p")}
        self.record_simulated_event("EXPENSE_LOGGED", f"Operational Expense: ₱{amt:.2f} logged for {cat.upper()} ({note})", exp)

    def sim_drawer_kick(self):
        self.record_simulated_event("CASH_DRAWER_KICK", "ESC/POS Solenoid trigger pulse fired to cash drawer kick pin (Pin 2 RJ11)", {"pin": 2, "pulseMs": 120})
        messagebox.showinfo("Hardware Solenoid", "Cash drawer solenoid pulse signal dispatched!\n(Pin 2 RJ11 fired)")

    def sim_receipt_preview(self):
        receipt_text = f"""
================================
     R&R WATER REFILLING STATION
     Counter #1 (Main Terminal)
      Purok 1, Main Road Station
        Tel: 0917-829-4102
================================
Order: #582910     Date: {datetime.now().strftime('%Y-%m-%d')}
Time:  {datetime.now().strftime('%I:%M:%S %p')}     Cashier: Neil
--------------------------------
ITEM               QTY    AMOUNT
1 Gal Purified      3     ₱105.00
--------------------------------
Subtotal:                 ₱105.00
Grand Total:              ₱105.00
CASH TENDERED:            ₱500.00
CHANGE DUE:               ₱395.00
--------------------------------
PAYMENT STATUS: PAID (Cash Drawer)
================================
  Clean, Pure & Crystal Refreshing
      Maraming Salamat Po!
================================
"""
        self.show_json_dialog("ESC/POS 80mm Thermal Receipt", receipt_text)

    def insert_order_to_sqlite(self, order_no, channel, gallons, total, status):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=2.0)
            cur = conn.cursor()
            now_ts = int(time.time() * 1000)
            cur.execute("""
                INSERT OR REPLACE INTO orders 
                (id, order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, cashier_name, cashier_role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (f"ord_{now_ts}", order_no, now_ts, datetime.now().strftime("%Y-%m-%d"), channel, "purified", "1 Gallon Purified", gallons, 35.0, total, total if status == "paid" else 0.0, status, "Neil", "manager"))
            conn.commit()
            conn.close()
            self.load_table_data()
        except Exception:
            pass

    # --- MAINTENANCE ACTIONS ---
    def backup_sqlite_db(self):
        if not os.path.exists(DB_PATH):
            messagebox.showerror("Error", "Database file rr_water.db does not exist yet.")
            return

        dest = filedialog.asksaveasfilename(defaultextension=".db",
                                            initialfile=f"rr_water_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db",
                                            filetypes=[("SQLite Database", "*.db"), ("All Files", "*.*")])
        if dest:
            try:
                import shutil
                shutil.copy2(DB_PATH, dest)
                messagebox.showinfo("Backup Success", f"Database backed up successfully to:\n{dest}")
                self.record_simulated_event("BACKUP_SUCCESS", f"SQLite database backup saved to {os.path.basename(dest)}", {"path": dest})
            except Exception as e:
                messagebox.showerror("Backup Failed", str(e))

    def export_json_db(self):
        dest = filedialog.asksaveasfilename(defaultextension=".json",
                                            initialfile=f"rr_water_snapshot_{datetime.now().strftime('%Y%m%d')}.json",
                                            filetypes=[("JSON Files", "*.json")])
        if not dest:
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            snapshot = {"exportedAt": datetime.now().isoformat(), "tables": {}}
            for tbl in ["orders", "staff", "settings", "inventory", "customers", "shifts", "audit_logs"]:
                cur.execute(f"SELECT * FROM {tbl};")
                snapshot["tables"][tbl] = [dict(r) for r in cur.fetchall()]
            conn.close()

            with open(dest, 'w', encoding='utf-8') as f:
                json.dump(snapshot, f, indent=2)

            messagebox.showinfo("Export Done", f"Database exported to JSON:\n{dest}")
        except Exception as e:
            messagebox.showerror("Export Failed", str(e))

    def seed_test_data(self):
        if not messagebox.askyesno("Seed Data", "Insert 8 realistic transactions and test records into SQLite?"):
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            now = int(time.time() * 1000)

            sample_orders = [
                (f"ord_{now+1}", "#102931", now - 14000000, "walkin", "purified", "1 Gallon Purified", 2, 35.0, 70.0, 70.0, "paid", "Neil", "Walk-in Counter"),
                (f"ord_{now+2}", "#102932", now - 12000000, "delivery", "purified", "1 Gallon Purified", 15, 35.0, 525.0, 0.0, "pending", "Neil", "Purok 1 Centro (Kagawad Santos)"),
                (f"ord_{now+3}", "#102933", now - 10000000, "walkin", "new_container", "New Gallon Jug + Water", 1, 250.0, 250.0, 250.0, "paid", "Sarah", "Bought new blue slim jug"),
                (f"ord_{now+4}", "#102934", now - 8000000, "delivery", "purified", "1 Gallon Purified", 20, 35.0, 700.0, 700.0, "paid", "Neil", "Riverside Carwash"),
                (f"ord_{now+5}", "#102935", now - 6000000, "walkin", "purified", "1 Gallon Purified", 4, 35.0, 140.0, 140.0, "paid", "Sarah", "4 round carboys"),
                (f"ord_{now+6}", "#102936", now - 4000000, "delivery", "purified", "1 Gallon Purified", 8, 35.0, 280.0, 0.0, "pending", "Neil", "Aling Maring Store"),
                (f"ord_{now+7}", "#102937", now - 2000000, "walkin", "purified", "1 Gallon Purified", 1, 35.0, 35.0, 35.0, "paid", "Neil", "Single refill")
            ]

            for o in sample_orders:
                cur.execute("""
                    INSERT OR REPLACE INTO orders 
                    (id, order_no, timestamp, date_str, channel, prod_key, prod_name, gallons, unit_price, total, paid_amount, status, cashier_name, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (o[0], o[1], o[2], datetime.now().strftime("%Y-%m-%d"), o[3], o[4], o[5], o[6], o[7], o[8], o[9], o[10], o[11], o[12]))

            conn.commit()
            conn.close()
            messagebox.showinfo("Seeding Complete", "Successfully seeded sample orders into rr_water.db!")
            self.load_table_data()
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def run_sqlite_integrity_check(self):
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("PRAGMA integrity_check;")
            res = cur.fetchone()[0]
            cur.execute("VACUUM;")
            conn.close()
            messagebox.showinfo("SQLite Health", f"Integrity Check: {res}\nDatabase VACUUM completed successfully.")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def clear_test_orders(self):
        if not messagebox.askyesno("Confirm", "Clear all transactions in the orders table? Station settings and staff PINs will be preserved."):
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("DELETE FROM orders;")
            conn.commit()
            conn.close()
            messagebox.showinfo("Cleared", "Orders table reset successfully.")
            self.load_table_data()
        except Exception as e:
            messagebox.showerror("Error", str(e))

    # --- RAW TABLE EXPLORER ---
    def load_table_data(self):
        tbl = self.cmb_table.get()
        if not tbl or not os.path.exists(DB_PATH):
            return

        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute(f"PRAGMA table_info({tbl});")
            cols = [r[1] for r in cur.fetchall()]

            self.explorer_tree.delete(*self.explorer_tree.get_children())
            self.explorer_tree["columns"] = cols

            for c in cols:
                self.explorer_tree.heading(c, text=c.upper())
                self.explorer_tree.column(c, width=120, anchor="w")

            cur.execute(f"SELECT * FROM {tbl} ORDER BY rowid DESC LIMIT 200;")
            self.raw_table_rows = cur.fetchall()

            self.filter_table_data()
            conn.close()
        except Exception:
            pass

    def filter_table_data(self):
        search = self.ent_search.get().lower().strip()
        self.explorer_tree.delete(*self.explorer_tree.get_children())

        if not hasattr(self, 'raw_table_rows'):
            return

        for r in self.raw_table_rows:
            if search:
                row_str = " ".join(str(val).lower() for val in r)
                if search not in row_str:
                    continue
            self.explorer_tree.insert("", "end", values=r)

    def on_close(self):
        self.running = False
        self.destroy()

if __name__ == '__main__':
    app = DeveloperConsoleApp()
    app.mainloop()
