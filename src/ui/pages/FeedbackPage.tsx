import React from "react";
import { PageHeader } from "../shared/PageHeader";
import { useAuthSession } from "../auth/AuthSessionContext";
import { feedbackAPI } from "../../api/client";

export function FeedbackPage() {
  const { user } = useAuthSession();
  const displayName = user?.name?.trim() || "User";
  const displayRole = user?.role === "student" ? "Member" : "Instructor";

  const STAR_EMPTY = "\u2606";
  const STAR_FILLED = "\u2605";

  const [category, setCategory] = React.useState<string>("");
  const [subject, setSubject] = React.useState<string>("");
  const [message, setMessage] = React.useState<string>("");
  const [rating, setRating] = React.useState<number>(0);
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const effectiveRating = hoverRating ?? rating;

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [didSubmit, setDidSubmit] = React.useState(false);

  const canSubmit = category.trim() !== "" && subject.trim() !== "" && message.trim() !== "" && !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDidSubmit(false);
    setSubmitError(null);

    if (!category.trim() || !subject.trim() || !message.trim()) {
      setSubmitError("Please fill out Category, Subject, and Message.");
      return;
    }

    setIsSubmitting(true);
    try {
      await feedbackAPI.submit({
        category: category.trim(),
        subject: subject.trim(),
        message: message.trim(),
        rating: rating > 0 ? rating : null,
      });

      setDidSubmit(true);
      setCategory("");
      setSubject("");
      setMessage("");
      setRating(0);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle="Share your thoughts, suggestions, or report issues to help us improve."
      />

      <div className="contentGrid">
        <div className="card">
          <div className="sectionTitle">Submit Feedback</div>
          <div className="sectionSub">
            Tell us what you think about the system, suggest new features, or
            report problems.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <div className="label">
                Category <span style={{ color: "rgba(241,194,75,.92)" }}>*</span>
              </div>
              <select
                className="select"
                style={{ width: "100%" }}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select a category</option>
                <option value="Feature Request">Feature Request</option>
                <option value="Bug Report">Bug Report</option>
                <option value="Practice Feedback">Practice Feedback</option>
              </select>
            </div>

            <div className="field">
              <div className="label">
                Subject <span style={{ color: "rgba(241,194,75,.92)" }}>*</span>
              </div>
              <input
                className="input"
                placeholder="Brief summary of your feedback"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="field">
              <div className="label">
                Message <span style={{ color: "rgba(241,194,75,.92)" }}>*</span>
              </div>
              <textarea
                className="textarea"
                placeholder="Please describe in detail..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="field">
              <div className="label">Rate Your Experience (Optional)</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", opacity: 0.9 }}>
                {Array.from({ length: 5 }, (_, idx) => {
                  const value = idx + 1;
                  const isFilled = value <= effectiveRating;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Rate ${value} out of 5`}
                      onMouseEnter={() => setHoverRating(value)}
                      onMouseLeave={() => setHoverRating(null)}
                      onFocus={() => setHoverRating(value)}
                      onBlur={() => setHoverRating(null)}
                      onClick={() => setRating(value)}
                      style={{
                        appearance: "none",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        lineHeight: 1,
                        fontSize: 22,
                        color: isFilled ? "rgba(241,194,75,.95)" : "rgba(255,255,255,.55)",
                        textShadow: isFilled ? "0 0 16px rgba(241,194,75,.25)" : "none",
                      }}
                    >
                      {isFilled ? STAR_FILLED : STAR_EMPTY}
                    </button>
                  );
                })}
                {rating > 0 ? (
                  <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>{rating}/5</span>
                ) : null}
              </div>
            </div>

            <button
              className="primaryBtn"
              type="submit"
              disabled={!canSubmit}
              style={
                !canSubmit
                  ? { opacity: 0.6, cursor: "not-allowed" }
                  : undefined
              }
            >
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </button>

            {submitError ? (
              <div style={{ marginTop: 10, color: "rgba(255, 120, 120, .95)", fontSize: 13 }}>
                {submitError}
              </div>
            ) : null}

            {didSubmit ? (
              <div style={{ marginTop: 10, color: "rgba(95,214,156,.92)", fontSize: 13 }}>
                Feedback submitted. Thank you!
              </div>
            ) : null}
          </form>
        </div>

        <div className="rightRail">
          <div className="tipBox">
            <div className="tipTitle">Quick Tips</div>
            <div className="tipItem">
              <div className="tipHead" style={{ color: "rgba(126,168,255,.92)" }}>
                Feature Requests
              </div>
              <div className="tipBody">
                Describe the feature you'd like and how it would help your
                learning.
              </div>
            </div>
            <div className="tipItem">
              <div className="tipHead" style={{ color: "rgba(241,194,75,.92)" }}>
                Bug Reports
              </div>
              <div className="tipBody">
                Include what you were doing when the issue occurred and what you
                expected to happen.
              </div>
            </div>
            <div className="tipItem">
              <div className="tipHead" style={{ color: "rgba(95,214,156,.92)" }}>
                Practice Feedback
              </div>
              <div className="tipBody">
                Share your experience with the practice tools, microphone
                detection, and note accuracy.
              </div>
            </div>
          </div>

          <div className="tipBox">
            <div className="tipBody">
              Logged in as{" "}
              <span style={{ color: "rgba(241,194,75,.92)", fontWeight: 900 }}>{displayName}</span>
              <div style={{ marginTop: 4 }}>{displayRole}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

