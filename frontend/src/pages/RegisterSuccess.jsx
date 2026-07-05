import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import './Register.css';
import './RegisterSuccess.css';

function RegisterSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const { orgSlug, orgName } = location.state || {};

  // If someone lands here directly without registering first, send them back
  if (!orgSlug) {
    return <Navigate to="/register" replace />;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(orgSlug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="card success-card">
          <div className="check-badge">✓</div>
          <div className="title">Organization created</div>
          <div className="subtitle">
            {orgName || 'Your organization'} is ready. Log in below to access your dashboard.
          </div>

          <div className="slug-box">
            <div className="slug-info">
              <div className="slug-label">Organization slug</div>
              <div className="slug-value">{orgSlug}</div>
            </div>
            <button className="copy-btn" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="reminder">
            You'll need this slug every time you log in — it's also shown on your Home dashboard afterward.
          </div>

          <button className="btn-primary" onClick={() => navigate('/login')}>
            Continue to log in
          </button>
        </div>
      </div>
    </div>
  );
}

export default RegisterSuccess;