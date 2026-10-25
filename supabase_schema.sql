-- ==========================================================================
-- R&R Water Refilling Station - Supabase Database Schema
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==========================================================================

-- 1. Enable UUID Extension (standard in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Station Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    order_no TEXT UNIQUE NOT NULL,
    timestamp BIGINT NOT NULL,
    date_str TEXT,
    channel TEXT NOT NULL DEFAULT 'walkin', -- 'walkin' or 'delivery'
    prod_key TEXT NOT NULL DEFAULT 'refill',
    prod_name TEXT NOT NULL DEFAULT '5-Gallon Purified Refill',
    gallons INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 35.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 35.00,
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 35.00,
    unpaid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'paid', -- 'paid', 'pending', 'voided'
    payment_method TEXT NOT NULL DEFAULT 'cash', -- 'cash', 'gcash'
    cashier_name TEXT NOT NULL DEFAULT 'Neil',
    cashier_role TEXT NOT NULL DEFAULT 'manager',
    driver_name TEXT,
    customer_name TEXT,
    customer_id TEXT,
    address TEXT,
    note TEXT,
    carboys_loaned INTEGER NOT NULL DEFAULT 0,
    carboys_returned INTEGER NOT NULL DEFAULT 0,
    tendered NUMERIC(10, 2) DEFAULT 0.00,
    change_amount NUMERIC(10, 2) DEFAULT 0.00,
    items JSONB DEFAULT '[]'::jsonb,
    is_voided BOOLEAN NOT NULL DEFAULT false,
    void_reason TEXT,
    voided_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Customers & Empties Ledger Table
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    address TEXT,
    carboys_held INTEGER NOT NULL DEFAULT 0,
    deposit_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Station Audit Trail Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    time_str TEXT NOT NULL,
    action TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    manager_name TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Station Configuration & Settings Table
CREATE TABLE IF NOT EXISTS public.station_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Indexes for Instant Reporting & High-Speed POS Queries
CREATE INDEX IF NOT EXISTS idx_supabase_orders_timestamp ON public.orders(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_supabase_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_supabase_orders_channel ON public.orders(channel);
CREATE INDEX IF NOT EXISTS idx_supabase_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_supabase_audit_timestamp ON public.audit_logs(timestamp DESC);

-- 7. Row Level Security (RLS) Configuration
-- We enable RLS on all tables and provide permissive policies so the client terminal
-- can securely interact with Supabase using the public Anon Key.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_settings ENABLE ROW LEVEL SECURITY;

-- Clean existing policies if re-running
DROP POLICY IF EXISTS "Public Station POS access for orders" ON public.orders;
DROP POLICY IF EXISTS "Public Station POS access for customers" ON public.customers;
DROP POLICY IF EXISTS "Public Station POS access for audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Public Station POS access for station_settings" ON public.station_settings;

-- Create policies allowing station operations
CREATE POLICY "Public Station POS access for orders"
    ON public.orders FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public Station POS access for customers"
    ON public.customers FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public Station POS access for audit_logs"
    ON public.audit_logs FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Public Station POS access for station_settings"
    ON public.station_settings FOR ALL
    USING (true)
    WITH CHECK (true);

-- 8. Enable Supabase Realtime for instant multi-device syncing
-- (Order created on phone appears instantly on laptop and tablet)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    EXCEPTION WHEN duplicate_object THEN
        -- already added
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
    EXCEPTION WHEN duplicate_object THEN
        -- already added
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    EXCEPTION WHEN duplicate_object THEN
        -- already added
    END;
END $$;
