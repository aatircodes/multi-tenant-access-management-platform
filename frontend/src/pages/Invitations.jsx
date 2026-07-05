import { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import './Invitations.css';

function Invitations() {
  const [roles, setRoles] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [visibleLinkId, setVisibleLinkId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, invitesRes] = await Promise.all([
        axiosClient.get('/roles'),
        axiosClient.get('/invitations'),
      ]);
      const invitableRoles = rolesRes.data.filter((r) => r.name !== 'Admin');
      setRoles(invitableRoles);
      setInvitations(invitesRes.data);
      if (invitableRoles.length > 0 && !roleId) {
        setRoleId(String(invitableRoles[0].id));
      }
    } catch (err) {
      setError('Failed to load invitations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setSendError('');
    setSending(true);
    try {
      const response = await axiosClient.post('/invitations', {
        email,
        roleId,
      });
      // Backend only returns id/token/email/expiresAt, not roleName — so we
      // resolve it locally from the selected role for immediate display,
      // then refresh from the server to stay in sync with source of truth.
      const selectedRole = roles.find((r) => String(r.id) === String(roleId));
      setInvitations((prev) => [
        {
          id: response.data.id,
          email: response.data.email,
          roleName: selectedRole?.name || '—',
          status: 'PENDING',
          expiresAt: response.data.expiresAt,
        },
        ...prev,
      ]);
      setEmail('');
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setSendError('This email has already been invited or is already a member.');
      } else {
        setSendError('Failed to send invitation. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invitationId) => {
    setRevokingId(invitationId);
    try {
      await axiosClient.delete(`/invitations/${invitationId}`);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      setError('Failed to revoke invitation. It may have already been used or removed.');
    } finally {
      setRevokingId(null);
    }
  };

  const toggleLink = (invitationId) => {
    setVisibleLinkId((prev) => (prev === invitationId ? null : invitationId));
  };

  const copyLink = (invitationId, token) => {
    const link = `${window.location.origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(invitationId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const formatExpiry = (isoString) => {
    const expires = new Date(isoString);
    const now = new Date();
    const diffMs = expires - now;
    if (diffMs <= 0) return 'expired';
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    return `expires in ${diffHours}h`;
  };

  return (
    <div className="app">
      <Topbar />
      <div className="layout">
        <Sidebar active="invitations" />
        <div className="content">
          <div className="content-inner">
            <div className="page-title">Invitations</div>
            <div className="page-subtitle">
              Invite new members to your organization and assign their starting role.
            </div>

            {error && <div className="invitations-error">{error}</div>}

            <div className="card invite-card">
              <form className="invite-row" onSubmit={handleSendInvite}>
                <div className="field">
                  <label>Email address</label>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="field field-role">
                  <label>Role</label>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-primary" disabled={sending || !roleId}>
                  {sending ? 'Sending…' : 'Send invite'}
                </button>
              </form>
              {sendError && <div className="send-error">{sendError}</div>}
            </div>

            <h2>Pending invitations</h2>
            {loading ? (
              <div className="loading-state">Loading invitations…</div>
            ) : invitations.length === 0 ? (
              <div className="card">
                <div className="empty-state">No pending invitations.</div>
              </div>
            ) : (
              <div className="card invite-list">
                {invitations.map((inv) => (
                  <div className="invite-list-row" key={inv.id}>
                    <div className="invite-list-top">
                      <div className="invite-left">
                        <div className="invite-email">{inv.email}</div>
                        <div className="invite-meta">
                          Invited as <span className="role-tag">{inv.roleName}</span> ·{' '}
                          {formatExpiry(inv.expiresAt)}
                        </div>
                      </div>
                      <div className="invite-right">
                        <span className="status-badge">Pending</span>
                        <button
                          className="copy-link-btn"
                          onClick={() => toggleLink(inv.id)}
                        >
                          Copy invite link
                        </button>
                        <button
                          className="revoke-btn"
                          onClick={() => handleRevoke(inv.id)}
                          disabled={revokingId === inv.id}
                        >
                          {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                    {visibleLinkId === inv.id && (
                      inv.token ? (
                        <div className="link-row">
                          <span className="link-text">
                            {window.location.origin}/accept-invitation?token={inv.token}
                          </span>
                          <button
                            className={`copy-link-btn ${copiedId === inv.id ? 'copied' : ''}`}
                            onClick={() => copyLink(inv.id, inv.token)}
                          >
                            {copiedId === inv.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : (
                        <div className="link-row link-row-notice">
                          <span className="link-text-notice">
                            Link no longer available for security reasons. Revoke and resend to generate a new one.
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Invitations;