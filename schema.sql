PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cliente',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  document_ref TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE INDEX IF NOT EXISTS idx_people_email ON people(email);
CREATE INDEX IF NOT EXISTS idx_people_kind ON people(kind);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_id INTEGER,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  property_type TEXT NOT NULL DEFAULT '',
  access_notes TEXT NOT NULL DEFAULT '',
  infrastructure_notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES people(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name);
CREATE INDEX IF NOT EXISTS idx_sites_customer ON sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_sites_city ON sites(city);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planejamento',
  priority TEXT NOT NULL DEFAULT 'normal',
  type TEXT NOT NULL DEFAULT '',
  site_id INTEGER,
  location TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  completed_date TEXT NOT NULL DEFAULT '',
  customer_request TEXT NOT NULL DEFAULT '',
  scope_summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  quoted_value REAL NOT NULL DEFAULT 0,
  approved_value REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'nao_informado',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(code);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_site ON projects(site_id);

CREATE TABLE IF NOT EXISTS project_people (
  project_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, person_id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planejamento',
  description TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_systems_project ON project_systems(project_id);
CREATE INDEX IF NOT EXISTS idx_systems_kind ON project_systems(kind);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  system_id INTEGER,
  category TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  serial_number TEXT NOT NULL DEFAULT '',
  mac_address TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  vlan TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  firmware TEXT NOT NULL DEFAULT '',
  power_source TEXT NOT NULL DEFAULT '',
  installed_at TEXT NOT NULL DEFAULT '',
  warranty_until TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planejado',
  credential_ref TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(system_id) REFERENCES project_systems(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_system ON assets(system_id);
CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_assets_mac ON assets(mac_address);
CREATE INDEX IF NOT EXISTS idx_assets_ip ON assets(ip_address);

CREATE TABLE IF NOT EXISTS project_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  record_date TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  reference_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_records_project ON project_records(project_id);
CREATE INDEX IF NOT EXISTS idx_records_category ON project_records(category);
CREATE INDEX IF NOT EXISTS idx_records_date ON project_records(record_date);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'un',
  current_stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  supplier_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(supplier_id) REFERENCES people(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);
CREATE INDEX IF NOT EXISTS idx_materials_sku ON materials(sku);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);

CREATE TABLE IF NOT EXISTS project_materials (
  project_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  planned_qty REAL NOT NULL DEFAULT 0,
  used_qty REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(project_id, material_id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  site_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'instalacao',
  status TEXT NOT NULL DEFAULT 'aberta',
  scheduled_at TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT '',
  finished_at TEXT NOT NULL DEFAULT '',
  next_maintenance_at TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  technician_notes TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_service_project ON service_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_service_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_next ON service_orders(next_maintenance_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- =========================================================
-- G-HOST PLATFORM — CONTAS, PORTAL, SEGURANÇA E OPERAÇÃO
-- Migração aditiva. Não remove tabelas existentes.
-- =========================================================

CREATE TABLE IF NOT EXISTS user_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 310000,
  role TEXT NOT NULL DEFAULT 'visitante',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  email_verified INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  camera_device_limit INTEGER NOT NULL DEFAULT 2,
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_accounts_person ON user_accounts(person_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);
CREATE INDEX IF NOT EXISTS idx_user_accounts_role ON user_accounts(role);
CREATE INDEX IF NOT EXISTS idx_user_accounts_active ON user_accounts(active);

CREATE TABLE IF NOT EXISTS user_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  device_secret_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'portal',
  status TEXT NOT NULL DEFAULT 'trusted',
  first_ip_hash TEXT NOT NULL DEFAULT '',
  last_ip_hash TEXT NOT NULL DEFAULT '',
  user_agent_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT NOT NULL DEFAULT '',
  UNIQUE(account_id, device_id),
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_devices_account ON user_devices(account_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_status ON user_devices(status);
CREATE INDEX IF NOT EXISTS idx_user_devices_purpose ON user_devices(purpose);

CREATE TABLE IF NOT EXISTS saved_configurations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Meu projeto G-Host',
  plan_id TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '{}',
  totals_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_saved_config_account ON saved_configurations(account_id);
CREATE INDEX IF NOT EXISTS idx_saved_config_status ON saved_configurations(status);

CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  configuration_id INTEGER,
  status TEXT NOT NULL DEFAULT 'novo',
  contact_preference TEXT NOT NULL DEFAULT 'whatsapp',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(configuration_id) REFERENCES saved_configurations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_account ON quote_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_quote_status ON quote_requests(status);

CREATE TABLE IF NOT EXISTS legal_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'platform',
  mandatory INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code, version)
);
CREATE INDEX IF NOT EXISTS idx_legal_documents_code ON legal_documents(code);
CREATE INDEX IF NOT EXISTS idx_legal_documents_active ON legal_documents(active);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  document_code TEXT NOT NULL,
  document_version TEXT NOT NULL,
  document_hash TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_legal_accept_account ON legal_acceptances(account_id);
CREATE INDEX IF NOT EXISTS idx_legal_accept_doc ON legal_acceptances(document_code, document_version);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  person_id INTEGER NOT NULL,
  project_id INTEGER,
  plan_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho',
  version TEXT NOT NULL DEFAULT '1',
  title TEXT NOT NULL DEFAULT 'Contrato de Prestação de Serviços G-Host',
  summary TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  document_hash TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  signed_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_person ON contracts(person_id);
CREATE INDEX IF NOT EXISTS idx_contract_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contract_status ON contracts(status);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  ip_hash TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_account ON security_events(account_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_hash TEXT NOT NULL DEFAULT '',
  account_id INTEGER,
  event_type TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  device_class TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_account ON analytics_events(account_id);

CREATE TABLE IF NOT EXISTS camera_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'pending',
  gateway_ref TEXT NOT NULL DEFAULT '',
  monitoring_enabled INTEGER NOT NULL DEFAULT 0,
  health_status TEXT NOT NULL DEFAULT 'not_configured',
  last_seen_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_camera_integrations_asset ON camera_integrations(asset_id);
CREATE INDEX IF NOT EXISTS idx_camera_integrations_enabled ON camera_integrations(monitoring_enabled);

CREATE TABLE IF NOT EXISTS user_camera_permissions (
  account_id INTEGER NOT NULL,
  camera_integration_id INTEGER NOT NULL,
  can_view_live INTEGER NOT NULL DEFAULT 1,
  can_view_history INTEGER NOT NULL DEFAULT 0,
  can_download INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(account_id, camera_integration_id),
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(camera_integration_id) REFERENCES camera_integrations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guardian_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  node_uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Guardião Hub',
  status TEXT NOT NULL DEFAULT 'provisioning',
  software_version TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_guardian_nodes_site ON guardian_nodes(site_id);
CREATE INDEX IF NOT EXISTS idx_guardian_nodes_status ON guardian_nodes(status);

CREATE TABLE IF NOT EXISTS guardian_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER,
  project_id INTEGER,
  source TEXT NOT NULL DEFAULT 'guardiao',
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  summary TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(node_id) REFERENCES guardian_nodes(id) ON DELETE SET NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_guardian_events_node ON guardian_events(node_id);
CREATE INDEX IF NOT EXISTS idx_guardian_events_source ON guardian_events(source);
CREATE INDEX IF NOT EXISTS idx_guardian_events_occurred ON guardian_events(occurred_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  project_id INTEGER,
  category TEXT NOT NULL DEFAULT 'suporte',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'aberto',
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_support_account ON support_tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(account_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_account ON emergency_contacts(account_id);

INSERT OR IGNORE INTO legal_documents(code,version,title,content_hash,scope,mandatory,active,effective_at)
VALUES
('terms','2026-08-20.1','Termos de Uso G-Host','pending-review','platform',1,1,'2026-08-20T00:00:00-03:00'),
('privacy','2026-08-20.1','Aviso de Privacidade G-Host','pending-review','platform',1,1,'2026-08-20T00:00:00-03:00');
