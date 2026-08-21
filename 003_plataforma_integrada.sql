
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
