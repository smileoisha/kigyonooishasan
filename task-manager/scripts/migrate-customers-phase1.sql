-- Phase 1: customers テーブルに欠落カラムを追加
-- 既存データへの影響なし（ALTER TABLE ADD COLUMN）

ALTER TABLE customers ADD COLUMN fee TEXT;
ALTER TABLE customers ADD COLUMN contract_start TEXT;
ALTER TABLE customers ADD COLUMN birthday TEXT;
ALTER TABLE customers ADD COLUMN entity_type TEXT;
ALTER TABLE customers ADD COLUMN founding_date TEXT;
ALTER TABLE customers ADD COLUMN admin_staff TEXT;
ALTER TABLE customers ADD COLUMN family_structure TEXT;
ALTER TABLE customers ADD COLUMN family_birthdays TEXT;
ALTER TABLE customers ADD COLUMN years_in_business TEXT;
ALTER TABLE customers ADD COLUMN career_history TEXT;
ALTER TABLE customers ADD COLUMN bank TEXT;
ALTER TABLE customers ADD COLUMN fiscal_year_end_month TEXT;
ALTER TABLE customers ADD COLUMN contract_policy TEXT;
ALTER TABLE customers ADD COLUMN tax_accountant TEXT;
ALTER TABLE customers ADD COLUMN experts TEXT;
ALTER TABLE customers ADD COLUMN communications TEXT;
ALTER TABLE customers ADD COLUMN tags TEXT;
ALTER TABLE customers ADD COLUMN ai_issues TEXT;
ALTER TABLE customers ADD COLUMN ai_issues_updated_at TEXT;
ALTER TABLE customers ADD COLUMN manual_issues TEXT;
