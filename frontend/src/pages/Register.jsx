import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import './Register.css';

function Register() {
  const [orgName, setOrgName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const response = await axiosClient.post('/auth/register-org', {
        orgName,
        adminEmail,
        password,
      });
      navigate('/register-success', {
        state: { orgSlug: response.data.orgSlug, orgName },
      });
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setError('An organization or account with these details already exists.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="card">
          <div className="title">Create your organization</div>
          <div className="subtitle">You'll be set up as the Admin with full access.</div>

          <form onSubmit={handleSubmit}>
            <div className="section-label">Organization</div>

            <div className="field" style={{ marginBottom: '8px' }}>
              <label>Organization name</label>
              <input
                type="text"
                placeholder="Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div className="field-hint" style={{ marginBottom: '16px' }}>
              A unique slug will be generated for your organization.
            </div>

            <div className="section-label">Admin account</div>

            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Password</label>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="field" style={{ marginBottom: error ? '6px' : '0' }}>
              <label>Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && <div className="field-error">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create organization'}
            </button>
          </form>

          <div className="footer-text">
            Already have an account? <Link to="/login">Log in →</Link>
          </div>
        </div>

        <div className="legal-text">By continuing, you agree this is a demo project for portfolio purposes.</div>
      </div>
    </div>
  );
}

export default Register;