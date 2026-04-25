import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { INSTRUMENTS } from "../../data/instruments";
import { authAPI } from "../../../api/client";
import { useAuthSession } from "../../auth/AuthSessionContext";
import { getHomeRouteForRole, normaliseUserRole } from "../../../../shared/authRole";

export function StudentSignupPage() {
  const navigate = useNavigate();
  const { setAuthenticatedUser, signOut } = useAuthSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [instrument, setInstrument] = useState("piano");
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
      const user = await authAPI.signup(email, password, name, "student", instrument) as any;
      const role = normaliseUserRole((user as any)?.role);
      if (role !== "student") {
        await signOut();
        setError("Account created, but it is not a member account. Please sign up as an instructor instead.");
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
        ♪
      </div>
      <div className="authTitle">Join DMAESTRO</div>
      <div className="authSub">Create your member account</div>

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
      <div className="field">
        <div className="label">Instrument</div>
        <select
          className="select"
          style={{ width: "100%" }}
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst} value={inst}>
              {inst.charAt(0).toUpperCase() + inst.slice(1)}
            </option>
          ))}
        </select>
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
          <Link to="/login">Instructor</Link>
        </div>
        <div style={{ marginTop: 8 }}>
          <span>Already have an account? </span>
          <Link to="/student/login">Login</Link>
        </div>
      </div>
    </div>
  );
}

