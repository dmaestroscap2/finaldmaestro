import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authAPI } from "../../../api/client";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { getHomeRouteForRole, normaliseUserRole } from "../../../../shared/authRole";

export function SignupPage() {
  const navigate = useNavigate();
  const { setAuthenticatedUser, signOut } = useAuthSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const user = await authAPI.signup(email, password, name, "instructor") as any;
      const role = normaliseUserRole((user as any)?.role);
      if (role !== "instructor") {
        await signOut();
        setError("Account created, but it is not an instructor account. Please sign up as a member instead.");
        return;
      }
      setAuthenticatedUser(user);
      navigate(getHomeRouteForRole((user as any)?.role));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authCard">
      <div className="capIcon" aria-hidden="true">
        🎓
      </div>
      <div className="authTitle">Join DMAESTRO</div>
      <div className="authSub">Create your instructor account</div>

      {error && <div style={{ color: "red", marginBottom: 10 }}>{error}</div>}

      <div className="field">
        <div className="label">Full Name</div>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <div className="label">Email</div>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <div className="label">Password</div>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <div className="label">Confirm Password</div>
        <input
          className="input"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      <button
        className="primaryBtn"
        type="button"
        onClick={handleSignup}
        disabled={loading}
      >
        {loading ? "Creating Account..." : "Create Account"}
      </button>

      <div className="authLinks">
        <div style={{ marginTop: 10 }}>
          <span>Switch to </span>
          <Link to="/student/signup">Members</Link>
        </div>
        <div style={{ marginTop: 8 }}>
          <span>Already have an account? </span>
          <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}

