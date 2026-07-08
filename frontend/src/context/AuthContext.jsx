import { createContext, useState, useEffect, useCallback } from 'react';
import axiosClient from '../api/axiosClient';

export const AuthContext = createContext(null);

// Decodes the payload of a JWT without verifying the signature
// (verification happens server-side on every request; this is just for reading claims client-side)
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [claims, setClaims] = useState(() => {
    const existing = localStorage.getItem('token');
    return existing ? decodeToken(existing) : null;
  });
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationError, setOrganizationError] = useState(false);

  // Resolves the current user's merged permission set directly from the backend.
  // This calls GET /users/me-permissions, which has no permission gate of its own
  // (self-lookup only) — it exists specifically so that permission resolution
  // itself never depends on already having a specific permission. The previous
  // approach (GET /roles + per-role GET /roles/{id}/permissions) required
  // ROLE_READ just to find out what permissions you had, which meant any user
  // without ROLE_READ got a 403, and this catch block silently zeroed out
  // their entire permission set — including permissions they DID have.
  const loadPermissions = useCallback(async () => {
    setPermissionsLoading(true);
    try {
      const response = await axiosClient.get('/users/me-permissions');
      setPermissions(response.data);
    } catch (err) {
      console.error('Failed to load permissions', err);
      setPermissions([]);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  // Resolves the current org's display info once per session. Loaded here rather than
  // per-page so every screen (via Topbar) shows the org name consistently, instead of
  // each page needing its own fetch and prop-drilling it down to Topbar individually.
  const loadOrganization = useCallback(async () => {
    setOrganizationLoading(true);
    setOrganizationError(false);
    try {
      const response = await axiosClient.get('/organizations/me');
      setOrganization(response.data);
    } catch (err) {
      console.error('Failed to load organization', err);
      setOrganization(null);
      setOrganizationError(true);
    } finally {
      setOrganizationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      const decoded = decodeToken(token);
      setClaims(decoded);
      loadPermissions();
      loadOrganization();
    } else {
      localStorage.removeItem('token');
      setClaims(null);
      setPermissions([]);
      setOrganization(null);
    }
  }, [token, loadPermissions, loadOrganization]);

  const login = (newToken) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  const hasPermission = (code) => permissions.includes(code);

  const hasAnyPermission = (codes) => codes.some((code) => permissions.includes(code));

  const value = {
    token,
    claims,
    permissions,
    permissionsLoading,
    organization,
    organizationLoading,
    organizationError,
    isAuthenticated: !!token,
    hasPermission,
    hasAnyPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}