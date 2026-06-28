INSERT IGNORE INTO permissions (code, description) VALUES
('RESOURCE_CREATE', 'Can create resources'),
('RESOURCE_READ',   'Can read resources'),
('RESOURCE_UPDATE', 'Can update resources'),
('RESOURCE_DELETE', 'Can delete resources'),
('ROLE_CREATE',     'Can create roles'),
('ROLE_READ',       'Can read roles'),
('ROLE_ASSIGN',     'Can assign roles and permissions'),
('USER_INVITE',     'Can invite users'),
('AUDIT_VIEW',      'Can view audit logs');