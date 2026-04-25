import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authAPI } from "../../../api/client";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { getHomeRouteForRole, normaliseUserRole } from "../../../../shared/authRole";

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuthenticatedUser, signOut } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await authAPI.login(email, password, "instructor") as any;
      const role = normaliseUserRole((user as any)?.role);
      if (role !== "instructor") {
        await signOut();
        setError("Invalid credentials");
        return;
      }
      setAuthenticatedUser(user);
      navigate(getHomeRouteForRole((user as any)?.role));
    } catch (err: any) {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authCard">
      <div className="capIcon" aria-hidden="true">
        🎓
      </div>
      <div className="authTitle">Welcome Back</div>
      <div className="authSub">Sign in to your instructor account</div>

      {error && <div style={{ color: "red", marginBottom: 10 }}>{error}</div>}

      <div className="field">
        <div className="label">Email</div>
        <input
          className="input"
          name="dmaestro_instructor_email"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <div className="label">Password</div>
        <input
          className="input"
          type="password"
          name="dmaestro_instructor_password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button
        className="primaryBtn"
        type="button"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>

      <div className="authLinks">
        <div style={{ marginTop: 10 }}>
          <span>Switch to </span>
          <Link to="/student/login">Members</Link>
        </div>
        <div style={{ marginTop: 8 }}>
          <span>Don't have an account? </span>
          <Link to="/signup">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}

