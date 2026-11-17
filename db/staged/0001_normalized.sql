-- STAGED ONLY: apply to a disposable clone first. No app_state changes.
CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL,
  PRIMARY KEY(id)
);

CREATE TABLE IF NOT EXISTS platform_config (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  PRIMARY KEY(id),
  FOREIGN KEY(owner_id) REFERENCES users(id),
  CONSTRAINT platform_config_id CHECK(id = 'main'),
  CONSTRAINT platform_config_json CHECK(json_valid(metadata_json))
);

CREATE TABLE IF NOT EXISTS migration_runs (
  id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  model_version INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  CONSTRAINT migration_verified CHECK(verified IN (0,1))
);

CREATE TABLE IF NOT EXISTS commit_guards (
  id TEXT NOT NULL,
  valid INTEGER NOT NULL,
  PRIMARY KEY(id),
  CONSTRAINT tap2serve_revision_conflict CHECK(valid = 1)
);

CREATE TABLE IF NOT EXISTS restaurants (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 0,
  website_design_json TEXT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  tagline TEXT,
  tagline_ar TEXT,
  category_names_json TEXT,
  logo TEXT,
  currency TEXT NOT NULL,
  tax_bps INTEGER NOT NULL,
  service_bps INTEGER NOT NULL,
  support_status TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT restaurants_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT restaurants_present_json CHECK(json_valid(present_json)),
  UNIQUE(id),
  CONSTRAINT restaurants_identity CHECK(restaurant_id = id),
  CONSTRAINT restaurants_website_design_json_json CHECK(website_design_json IS NULL OR json_valid(website_design_json)),
  CONSTRAINT restaurants_slug_valid CHECK(length(slug) BETWEEN 1 AND 63 AND slug NOT GLOB '*[^a-z0-9-]*' AND substr(slug,1,1) <> '-' AND substr(slug,-1) <> '-' AND slug NOT LIKE 'xn--%' AND slug NOT IN ('admin','www','api','app','auth','static','assets','cdn','mail','smtp','ftp','status','support','help','docs','billing','dashboard','staging','stage','dev','test','localhost')),
  CONSTRAINT restaurants_category_names_json_json CHECK(category_names_json IS NULL OR json_valid(category_names_json)),
  CONSTRAINT restaurants_tax_bps_check CHECK(tax_bps >= 0),
  CONSTRAINT restaurants_tax_bps_integer CHECK(tax_bps IS NULL OR (typeof(tax_bps) = 'integer' AND abs(tax_bps) <= 9007199254740991)),
  CONSTRAINT restaurants_tax_bps_max CHECK(tax_bps <= 10000),
  CONSTRAINT restaurants_service_bps_check CHECK(service_bps >= 0),
  CONSTRAINT restaurants_service_bps_integer CHECK(service_bps IS NULL OR (typeof(service_bps) = 'integer' AND abs(service_bps) <= 9007199254740991)),
  CONSTRAINT restaurants_service_bps_max CHECK(service_bps <= 10000)
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug ON restaurants (slug);

CREATE TABLE IF NOT EXISTS memberships (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  user_id TEXT,
  email TEXT NOT NULL,
  name TEXT,
  active INTEGER NOT NULL,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT memberships_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT memberships_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT memberships_active_check CHECK(active IN (0,1)),
  CONSTRAINT memberships_active_integer CHECK(active IS NULL OR (typeof(active) = 'integer' AND abs(active) <= 9007199254740991)),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_email ON memberships (restaurant_id,email);

CREATE INDEX IF NOT EXISTS memberships_user ON memberships (user_id,active,restaurant_id);

CREATE INDEX IF NOT EXISTS memberships_invitation ON memberships (email,active,user_id);

CREATE TABLE IF NOT EXISTS menus (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT menus_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT menus_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS menu_categories (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  menu_id TEXT NOT NULL,
  name TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT menu_categories_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT menu_categories_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  FOREIGN KEY(restaurant_id,menu_id) REFERENCES menus(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS menu_categories_parent ON menu_categories (restaurant_id,menu_id,position);

CREATE TABLE IF NOT EXISTS menu_items (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  menu_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  description_ar TEXT,
  price INTEGER NOT NULL,
  category TEXT,
  image TEXT,
  available INTEGER NOT NULL,
  visible INTEGER NOT NULL,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT menu_items_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT menu_items_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT menu_items_price_check CHECK(price >= 0),
  CONSTRAINT menu_items_price_integer CHECK(price IS NULL OR (typeof(price) = 'integer' AND abs(price) <= 9007199254740991)),
  CONSTRAINT menu_items_available_check CHECK(available IN (0,1)),
  CONSTRAINT menu_items_available_integer CHECK(available IS NULL OR (typeof(available) = 'integer' AND abs(available) <= 9007199254740991)),
  CONSTRAINT menu_items_visible_check CHECK(visible IN (0,1)),
  CONSTRAINT menu_items_visible_integer CHECK(visible IS NULL OR (typeof(visible) = 'integer' AND abs(visible) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,menu_id) REFERENCES menus(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS menu_items_parent ON menu_items (restaurant_id,menu_id,position);

CREATE TABLE IF NOT EXISTS menu_modifiers (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  price INTEGER NOT NULL,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT menu_modifiers_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT menu_modifiers_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT menu_modifiers_price_check CHECK(price >= 0),
  CONSTRAINT menu_modifiers_price_integer CHECK(price IS NULL OR (typeof(price) = 'integer' AND abs(price) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,item_id) REFERENCES menu_items(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS menu_modifiers_parent ON menu_modifiers (restaurant_id,item_id,position);

CREATE TABLE IF NOT EXISTS dining_tables (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  label TEXT NOT NULL,
  zone TEXT,
  capacity INTEGER,
  token TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  billable INTEGER NOT NULL,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT dining_tables_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT dining_tables_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT dining_tables_capacity_check CHECK(capacity BETWEEN 1 AND 30),
  CONSTRAINT dining_tables_capacity_integer CHECK(capacity IS NULL OR (typeof(capacity) = 'integer' AND abs(capacity) <= 9007199254740991)),
  CONSTRAINT dining_tables_enabled_check CHECK(enabled IN (0,1)),
  CONSTRAINT dining_tables_enabled_integer CHECK(enabled IS NULL OR (typeof(enabled) = 'integer' AND abs(enabled) <= 9007199254740991)),
  CONSTRAINT dining_tables_billable_check CHECK(billable IN (0,1)),
  CONSTRAINT dining_tables_billable_integer CHECK(billable IS NULL OR (typeof(billable) = 'integer' AND abs(billable) <= 9007199254740991))
);

CREATE UNIQUE INDEX IF NOT EXISTS dining_tables_token ON dining_tables (token);

CREATE UNIQUE INDEX IF NOT EXISTS dining_tables_label ON dining_tables (restaurant_id,label);

CREATE TABLE IF NOT EXISTS sessions (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  table_id TEXT NOT NULL,
  guest_name TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  capability TEXT,
  opened_at TEXT NOT NULL,
  opened_by TEXT,
  tax_bps INTEGER NOT NULL,
  service_bps INTEGER NOT NULL,
  bill_requested_at TEXT,
  finalized_at TEXT,
  finalized_by TEXT,
  finalized_from_version INTEGER,
  released_at TEXT,
  released_by TEXT,
  release_reason TEXT,
  closed_at TEXT,
  closed_by TEXT,
  reopened_at TEXT,
  reopened_by TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT sessions_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT sessions_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT sessions_status_check CHECK(status IN ('OPEN','BILL_REQUESTED','FINALIZED')),
  CONSTRAINT sessions_version_check CHECK(version >= 1),
  CONSTRAINT sessions_version_integer CHECK(version IS NULL OR (typeof(version) = 'integer' AND abs(version) <= 9007199254740991)),
  CONSTRAINT sessions_tax_bps_check CHECK(tax_bps >= 0),
  CONSTRAINT sessions_tax_bps_integer CHECK(tax_bps IS NULL OR (typeof(tax_bps) = 'integer' AND abs(tax_bps) <= 9007199254740991)),
  CONSTRAINT sessions_tax_bps_max CHECK(tax_bps <= 10000),
  CONSTRAINT sessions_service_bps_check CHECK(service_bps >= 0),
  CONSTRAINT sessions_service_bps_integer CHECK(service_bps IS NULL OR (typeof(service_bps) = 'integer' AND abs(service_bps) <= 9007199254740991)),
  CONSTRAINT sessions_service_bps_max CHECK(service_bps <= 10000),
  CONSTRAINT sessions_finalized_from_version_integer CHECK(finalized_from_version IS NULL OR (typeof(finalized_from_version) = 'integer' AND abs(finalized_from_version) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS sessions_history_position ON sessions (restaurant_id,position);

CREATE INDEX IF NOT EXISTS sessions_sync_occupied ON sessions (restaurant_id,id) WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_sync_open_bill ON sessions (restaurant_id,id) WHERE status='FINALIZED' AND closed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_occupancy ON sessions (restaurant_id,table_id) WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_status ON sessions (restaurant_id,status,opened_at);

CREATE TABLE IF NOT EXISTS bills (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  service INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT bills_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT bills_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT bills_subtotal_check CHECK(subtotal >= 0),
  CONSTRAINT bills_subtotal_integer CHECK(subtotal IS NULL OR (typeof(subtotal) = 'integer' AND abs(subtotal) <= 9007199254740991)),
  CONSTRAINT bills_service_check CHECK(service >= 0),
  CONSTRAINT bills_service_integer CHECK(service IS NULL OR (typeof(service) = 'integer' AND abs(service) <= 9007199254740991)),
  CONSTRAINT bills_tax_check CHECK(tax >= 0),
  CONSTRAINT bills_tax_integer CHECK(tax IS NULL OR (typeof(tax) = 'integer' AND abs(tax) <= 9007199254740991)),
  CONSTRAINT bills_total_check CHECK(total >= 0),
  CONSTRAINT bills_total_integer CHECK(total IS NULL OR (typeof(total) = 'integer' AND abs(total) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES sessions(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS bills_parent ON bills (restaurant_id,session_id,position);

CREATE TABLE IF NOT EXISTS orders (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  idempotency_key TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT orders_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT orders_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT orders_number_check CHECK(number >= 1),
  CONSTRAINT orders_number_integer CHECK(number IS NULL OR (typeof(number) = 'integer' AND abs(number) <= 9007199254740991)),
  CONSTRAINT orders_status_check CHECK(status IN ('PENDING','ACCEPTED','PREPARING','READY','SERVED')),
  CONSTRAINT orders_version_check CHECK(version >= 1),
  CONSTRAINT orders_version_integer CHECK(version IS NULL OR (typeof(version) = 'integer' AND abs(version) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES sessions(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS orders_session ON orders (restaurant_id,session_id,position);

CREATE UNIQUE INDEX IF NOT EXISTS orders_key ON orders (restaurant_id,session_id,idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS orders_number ON orders (restaurant_id,number);

CREATE INDEX IF NOT EXISTS orders_queue ON orders (restaurant_id,status,created_at);

CREATE TABLE IF NOT EXISTS order_items (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT,
  name_ar TEXT,
  base_price INTEGER,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT order_items_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT order_items_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT order_items_base_price_check CHECK(base_price >= 0),
  CONSTRAINT order_items_base_price_integer CHECK(base_price IS NULL OR (typeof(base_price) = 'integer' AND abs(base_price) <= 9007199254740991)),
  CONSTRAINT order_items_unit_price_check CHECK(unit_price >= 0),
  CONSTRAINT order_items_unit_price_integer CHECK(unit_price IS NULL OR (typeof(unit_price) = 'integer' AND abs(unit_price) <= 9007199254740991)),
  CONSTRAINT order_items_quantity_check CHECK(quantity BETWEEN 1 AND 30),
  CONSTRAINT order_items_quantity_integer CHECK(quantity IS NULL OR (typeof(quantity) = 'integer' AND abs(quantity) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,order_id) REFERENCES orders(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS order_items_parent ON order_items (restaurant_id,order_id,position);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  order_item_id TEXT NOT NULL,
  modifier_id TEXT,
  name TEXT,
  name_ar TEXT,
  price INTEGER,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT order_item_modifiers_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT order_item_modifiers_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT order_item_modifiers_price_check CHECK(price >= 0),
  CONSTRAINT order_item_modifiers_price_integer CHECK(price IS NULL OR (typeof(price) = 'integer' AND abs(price) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,order_item_id) REFERENCES order_items(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS order_item_modifiers_parent ON order_item_modifiers (restaurant_id,order_item_id,position);

CREATE TABLE IF NOT EXISTS payments (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  created_at TEXT,
  recorded_by TEXT,
  idempotency_key TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT payments_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT payments_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT payments_amount_check CHECK(amount >= 0),
  CONSTRAINT payments_amount_integer CHECK(amount IS NULL OR (typeof(amount) = 'integer' AND abs(amount) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES sessions(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS payments_session ON payments (restaurant_id,session_id);

CREATE UNIQUE INDEX IF NOT EXISTS payments_key ON payments (restaurant_id,session_id,idempotency_key);

CREATE TABLE IF NOT EXISTS service_requests (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT service_requests_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT service_requests_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT service_requests_kind_check CHECK(kind IN ('bill','staff')),
  CONSTRAINT service_requests_status_check CHECK(status IN ('pending','acknowledged','resolved')),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES sessions(restaurant_id,id),
  FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS service_requests_history_position ON service_requests (restaurant_id,position);

CREATE INDEX IF NOT EXISTS service_requests_session ON service_requests (restaurant_id,session_id);

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_outstanding ON service_requests (restaurant_id,session_id,kind) WHERE status <> 'resolved';

CREATE INDEX IF NOT EXISTS service_requests_table ON service_requests (restaurant_id,table_id);

CREATE TABLE IF NOT EXISTS feedback (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  idempotency_key TEXT,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT feedback_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT feedback_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT feedback_rating_check CHECK(rating BETWEEN 1 AND 5),
  CONSTRAINT feedback_rating_integer CHECK(rating IS NULL OR (typeof(rating) = 'integer' AND abs(rating) <= 9007199254740991)),
  FOREIGN KEY(restaurant_id,session_id) REFERENCES sessions(restaurant_id,id),
  FOREIGN KEY(restaurant_id,table_id) REFERENCES dining_tables(restaurant_id,id)
);

CREATE INDEX IF NOT EXISTS feedback_history_position ON feedback (restaurant_id,position);

CREATE INDEX IF NOT EXISTS feedback_session ON feedback (restaurant_id,session_id);

CREATE UNIQUE INDEX IF NOT EXISTS feedback_key ON feedback (restaurant_id,session_id,idempotency_key);

CREATE INDEX IF NOT EXISTS feedback_table ON feedback (restaurant_id,table_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  status TEXT,
  monthly_per_table INTEGER,
  setup_fee INTEGER,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT subscriptions_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT subscriptions_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT subscriptions_monthly_per_table_check CHECK(monthly_per_table >= 0),
  CONSTRAINT subscriptions_monthly_per_table_integer CHECK(monthly_per_table IS NULL OR (typeof(monthly_per_table) = 'integer' AND abs(monthly_per_table) <= 9007199254740991)),
  CONSTRAINT subscriptions_setup_fee_check CHECK(setup_fee >= 0),
  CONSTRAINT subscriptions_setup_fee_integer CHECK(setup_fee IS NULL OR (typeof(setup_fee) = 'integer' AND abs(setup_fee) <= 9007199254740991))
);

CREATE TABLE IF NOT EXISTS restaurant_setup (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  menu INTEGER,
  stands INTEGER,
  printer INTEGER,
  training INTEGER,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT restaurant_setup_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT restaurant_setup_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT restaurant_setup_menu_check CHECK(menu IN (0,1)),
  CONSTRAINT restaurant_setup_menu_integer CHECK(menu IS NULL OR (typeof(menu) = 'integer' AND abs(menu) <= 9007199254740991)),
  CONSTRAINT restaurant_setup_stands_check CHECK(stands IN (0,1)),
  CONSTRAINT restaurant_setup_stands_integer CHECK(stands IS NULL OR (typeof(stands) = 'integer' AND abs(stands) <= 9007199254740991)),
  CONSTRAINT restaurant_setup_printer_check CHECK(printer IN (0,1)),
  CONSTRAINT restaurant_setup_printer_integer CHECK(printer IS NULL OR (typeof(printer) = 'integer' AND abs(printer) <= 9007199254740991)),
  CONSTRAINT restaurant_setup_training_check CHECK(training IN (0,1)),
  CONSTRAINT restaurant_setup_training_integer CHECK(training IS NULL OR (typeof(training) = 'integer' AND abs(training) <= 9007199254740991))
);

CREATE TABLE IF NOT EXISTS audit_events (
  restaurant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  extra_json TEXT NOT NULL DEFAULT '{}',
  present_json TEXT NOT NULL DEFAULT '[]',
  occurred_at TEXT,
  actor TEXT,
  action TEXT,
  detail TEXT,
  PRIMARY KEY(restaurant_id,id),
  CONSTRAINT audit_events_extra_json CHECK(json_valid(extra_json)),
  CONSTRAINT audit_events_present_json CHECK(json_valid(present_json)),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id)
);

CREATE INDEX IF NOT EXISTS audit_events_history_position ON audit_events (restaurant_id,position);

CREATE INDEX IF NOT EXISTS audit_events_recent ON audit_events (restaurant_id,actor,occurred_at);

CREATE TABLE IF NOT EXISTS membership_permissions (
  restaurant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY(restaurant_id,membership_id,position),
  FOREIGN KEY(restaurant_id,membership_id) REFERENCES memberships(restaurant_id,id)
);

CREATE TABLE IF NOT EXISTS platform_audit (
  id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY(id),
  FOREIGN KEY(restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT platform_audit_json CHECK(json_valid(event_json))
);

CREATE INDEX IF NOT EXISTS platform_audit_tenant ON platform_audit (restaurant_id,position);
