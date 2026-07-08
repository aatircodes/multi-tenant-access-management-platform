INSERT IGNORE INTO permissions (code, description) VALUES
('RESOURCE_CREATE',    'Can create resources'),
('RESOURCE_READ',      'Can read resources'),
('RESOURCE_UPDATE',    'Can update resources'),
('RESOURCE_DELETE',    'Can delete resources'),
('ROLE_CREATE',        'Can create roles'),
('ROLE_DELETE',        'Can delete roles'),
('ROLE_READ',          'Can read roles'),
('ROLE_MANAGE',        'Can assign and unassign roles to/from users'),
('PERMISSION_MANAGE',  'Can add and remove permissions on a role'),
('ADMIN_TRANSFER',     'Can transfer admin ownership to another user'),
('USER_INVITE',        'Can invite, list, and revoke user invitations'),
('USER_DEACTIVATE',    'Can deactivate a user'),
('AUDIT_VIEW',         'Can view audit logs');