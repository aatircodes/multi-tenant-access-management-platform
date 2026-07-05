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

  // Resolves the current user's merged permission set from their role names
  const loadPermissions = useCallback(async (roleNames) => {
    if (!roleNames || roleNames.length === 0) {
      setPermissions([]);
      return;
    }
    setPermissionsLoading(true);
    try {
      const rolesResponse = await axiosClient.get('/roles');
      const allRoles = rolesResponse.data;

      const matchedRoleIds = allRoles
        .filter((role) => roleNames.includes(role.name))
        .map((role) => role.id);

      const permissionLists = await Promise.all(
        matchedRoleIds.map((roleId) =>
          axiosClient.get(`/roles/${roleId}/permissions`).then((res) => res.data)
        )
      );

      const mergedCodes = new Set();
      permissionLists.forEach((list) => {
        list.forEach((perm) => mergedCodes.add(perm.code));
      });

      setPermissions(Array.from(mergedCodes));
    } catch (err) {
      console.error('Failed to load permissions', err);
      setPermissions([]);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      const decoded = decodeToken(token);
      setClaims(decoded);
      if (decoded?.roles) {
        loadPermissions(decoded.roles);
      }
    } else {
      localStorage.removeItem('token');
      setClaims(null);
      setPermissions([]);
    }
  }, [token, loadPermissions]);

  const login = (newToken) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  const hasPermission = (code) => permissions.includes(code);

  const value = {
    token,
    claims,
    permissions,
    permissionsLoading,
    isAuthenticated: !!token,
    hasPermission,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}