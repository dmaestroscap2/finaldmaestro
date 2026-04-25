import React from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../../shared/BrandLogo";

export function WelcomePage() {
  return (
    <div className="welcomeHero">
      <BrandLogo
        variant="full"
        alt="D’MAESTROS"
        style={{
          width: "min(520px, 92vw)",
          height: "auto",
          margin: "0 auto 6px",
          display: "block",
          objectFit: "contain",
        }}
      />
      <h1 className="welcomeTitle">
        Master Your <span className="welcomeAccent">Maestro</span>
      </h1>
      <p className="welcomeSubtitle">
        An intelligent system designed to help musicians and learners convert and transpose music across different band instruments with ease.
        Practice your pieces, receive real-time feedback, and track your progress to improve your performance efficiently.
      </p>

      <div className="welcomeCtaRow">
        <Link className="welcomeCta" to="/login">
          Let&apos;s Start <span aria-hidden="true" className="welcomeArrow">-&gt;</span>
        </Link>
      </div>
    </div>
  );
}
